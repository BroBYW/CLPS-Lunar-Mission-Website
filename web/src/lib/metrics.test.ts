import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Ephemeris, siteFrame, type EphemerisMeta } from './astro.ts'
import { analyzePower } from './battery.ts'
import { HorizonSet, type HorizonMeta } from './horizon.ts'
import { computeMetrics, runs } from './metrics.ts'
import { computeSeries, type Series } from './series.ts'
import fixtures from './__fixtures__/metrics.json'

const dataDir = new URL('../../public/data/', import.meta.url)
const read = (name: string) => readFileSync(new URL(name, dataDir))
const buf = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

describe('metrics vs Python (browser recomputes the series itself)', () => {
  const eph = new Ephemeris(buf(read('ephemeris.bin')), JSON.parse(read('ephemeris.json').toString()) as EphemerisMeta)
  const hs = new HorizonSet(buf(read('horizons.bin')), JSON.parse(read('horizons.json').toString()) as HorizonMeta)
  const sites = JSON.parse(read('sites.json').toString()).sites as { id: string; lat: number; lon: number; height_m: number; mask_index: number }[]

  for (const c of fixtures.cases) {
    it(`${c.site} at ${hs.heightsM[c.height_index]} m, Q1 2027`, () => {
      const site = sites.find((s) => s.id === c.site)!
      const frame = siteFrame(site.lat, site.lon, site.height_m + hs.heightsM[c.height_index])
      const s = computeSeries(eph, frame, hs.mask(site.mask_index, c.height_index), c.start_ms, c.end_ms, c.step_ms)
      expect(s.n).toBe(c.samples)
      const m = computeMetrics(s, { darkThreshold: 0, earthMarginDeg: 0 })
      const p = c.metrics
      const onePct = 100 / s.n
      expect(m.sunMeanPct).toBeCloseTo(p.sun_mean_pct, 4)
      expect(Math.abs(m.sunAnyPct - p.sun_any_pct)).toBeLessThanOrEqual(onePct)
      expect(Math.abs(m.sunFullPct - p.sun_full_pct)).toBeLessThanOrEqual(onePct)
      expect(Math.abs(m.earthPct - p.earth_pct)).toBeLessThanOrEqual(onePct)
      expect(Math.abs(m.bothPct - p.both_pct)).toBeLessThanOrEqual(onePct)
      expect(Math.abs(m.longestDark.hours - p.longest_dark_h)).toBeLessThanOrEqual(1 / 6 + 1e-9)
      expect(Math.abs(m.longestBlackout.hours - p.longest_blackout_h)).toBeLessThanOrEqual(1 / 6 + 1e-9)
      expect(m.longestDark.atEdge).toBe(p.longest_dark_at_edge)
      expect(m.windows.length).toBe(p.windows)
      expect(Math.abs(m.longestWindowH - p.longest_window_h)).toBeLessThanOrEqual(1 / 6 + 1e-9)
    })
  }
})

describe('runs', () => {
  it('finds maximal runs, including one that reaches the end', () => {
    const f = [1, 1, 0, 0, 0, 1, 0, 1, 1]
    expect(runs(f.length, (i) => f[i] === 1)).toEqual([
      { start: 0, end: 2 },
      { start: 5, end: 6 },
      { start: 7, end: 9 },
    ])
  })
})

describe('CSV export', () => {
  it('lists sunlit, Earth-visible and overlap windows with UTC times', async () => {
    const { windowsCsv } = await import('./csv.ts')
    const n = 6
    const s: Series = {
      startMs: Date.UTC(2027, 0, 1),
      stepMs: 3_600_000,
      n,
      fSun: Float32Array.from([1, 1, 0, 0, 1, 1]),
      earthClear: Float32Array.from([-1, 2, 2, 2, -1, -1]),
      sunEl: new Float32Array(n),
      sunDistAu: new Float32Array(n).fill(1),
    }
    const lines = windowsCsv([{ siteId: 'test-site', series: s }], { darkThreshold: 0, earthMarginDeg: 0 }, 2).trim().split('\n')
    expect(lines[0]).toBe('site,observer_height_m,type,start_utc,end_utc,duration_h')
    expect(lines).toContain('test-site,2,sunlit,2027-01-01T00:00Z,2027-01-01T02:00Z,2.00')
    expect(lines).toContain('test-site,2,sunlit,2027-01-01T04:00Z,2027-01-01T06:00Z,2.00')
    expect(lines).toContain('test-site,2,earth_visible,2027-01-01T01:00Z,2027-01-01T04:00Z,3.00')
    expect(lines).toContain('test-site,2,both,2027-01-01T01:00Z,2027-01-01T02:00Z,1.00')
    expect(lines).toHaveLength(5)
  })
})

describe('battery sizing', () => {
  // 1 h steps: 12 h of full Sun at 1 AU overhead-free, then 12 h dark, twice
  const n = 48
  const s: Series = {
    startMs: Date.UTC(2027, 0, 1),
    stepMs: 3_600_000,
    n,
    fSun: Float32Array.from({ length: n }, (_, i) => (i % 24 < 12 ? 1 : 0)),
    earthClear: new Float32Array(n),
    sunEl: new Float32Array(n),
    sunDistAu: new Float32Array(n).fill(1),
  }
  it('needs exactly load × dark hours when the panel covers the load in daylight', () => {
    const r = analyzePower(s, { areaM2: 1, efficiency: 0.3, loadW: 100, depthOfDischarge: 0.8 }, 12)
    expect(r.peakW).toBeCloseTo(408.3, 1)
    expect(r.requiredWh).toBeCloseTo(1200, 6)
    expect(r.requiredNameplateWh).toBeCloseTo(1500, 6)
    expect(r.simpleWh).toBe(1200)
    expect(r.meanDailyWh).toBeCloseTo(408.3 * 12, 0)
    expect(r.deficitGrows).toBe(false)
  })
  it('flags a panel too small for the load', () => {
    const r = analyzePower(s, { areaM2: 0.2, efficiency: 0.3, loadW: 100, depthOfDischarge: 0.8 }, 12)
    expect(r.deficitGrows).toBe(true)
  })
})
