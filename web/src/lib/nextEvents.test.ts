import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Ephemeris, siteFrame, type EphemerisMeta } from './astro.ts'
import { HorizonSet, type HorizonMeta } from './horizon.ts'
import { fmtDuration, stateAt, stateChanges } from './nextEvents.ts'
import { computeSeries } from './series.ts'
import { DAY_MS, MINUTE_MS } from './time.ts'

const dataDir = new URL('../../public/data/', import.meta.url)
const buf = (name: string) => {
  const b = readFileSync(new URL(name, dataDir))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.length)
}
const json = (name: string) => JSON.parse(readFileSync(new URL(name, dataDir), 'utf8'))
const eph = new Ephemeris(buf('ephemeris.bin'), json('ephemeris.json') as EphemerisMeta)
const hz = new HorizonSet(buf('horizons.bin'), json('horizons.json') as HorizonMeta)
const sites: { id: string; lat: number; lon: number; height_m: number; mask_index: number }[] = json('sites.json').sites
const at = (id: string) => {
  const s = sites.find((x) => x.id === id)!
  return { frame: siteFrame(s.lat, s.lon, s.height_m + 2), mask: hz.mask(s.mask_index, 0) }
}
const criteria = { darkThreshold: 0, earthMarginDeg: 0 }

describe('sunset and Earthset', () => {
  it('finds the changes a minute-by-minute series has, at the same minute, missing only flickers under 10 minutes', () => {
    const { frame, mask } = at('haworth')
    const from = Date.UTC(2027, 0, 1)
    const to = from + 30 * DAY_MS
    const c = stateChanges(eph, frame, mask, criteria, from, to)
    const s = computeSeries(eph, frame, mask, from, to, MINUTE_MS)
    const sun: number[] = []
    const earth: number[] = []
    for (let i = 1; i < s.n; i++) {
      if (s.fSun[i] > 0 !== s.fSun[i - 1] > 0) sun.push(s.startMs + i * MINUTE_MS)
      if (s.earthClear[i] > 0 !== s.earthClear[i - 1] > 0) earth.push(s.startMs + i * MINUTE_MS)
    }
    expect(sun.length).toBeGreaterThanOrEqual(2)
    expect(earth.length).toBeGreaterThanOrEqual(2)
    for (const [found, all] of [
      [c.sun.map((x) => x.atMs), sun],
      [c.earth.map((x) => x.atMs), earth],
    ]) {
      // Everything found is real, to the minute
      expect(found.every((t) => all.includes(t))).toBe(true)
      // What sampling every 10 minutes misses comes in pairs less than 10 minutes apart (here a 2-minute flicker of
      // the Sun on Haworth's skyline on 9 January)
      const missed = all.filter((t) => !found.includes(t))
      expect(missed.length % 2).toBe(0)
      for (let k = 0; k < missed.length; k += 2) expect(missed[k + 1] - missed[k]).toBeLessThan(10 * MINUTE_MS)
    }
    expect(c.sun.length).toBe(sun.length - 2)
    expect(c.sunUp0).toBe(s.fSun[0] > 0)
    // The state and countdown at any moment follow from the list
    const t = (sun[0] + sun[1]) / 2
    const now = stateAt(c.sun, c.sunUp0, t)
    expect(now.next?.atMs).toBe(sun[1])
    expect(now.up).toBe(!now.next!.up)
  })

  it('calls the Sun hidden by Earth an eclipse: Malapert Massif, 3 March 2026, 10:55 to 12:06 UT', () => {
    const { frame, mask } = at('malapert-massif')
    const c = stateChanges(eph, frame, mask, criteria, Date.UTC(2026, 2, 3, 6), Date.UTC(2026, 2, 3, 18))
    const eclipse = c.sun.filter((x) => x.eclipse)
    expect(eclipse.map((x) => [new Date(x.atMs).toISOString().slice(11, 16), x.up])).toEqual([
      ['10:55', false],
      ['12:06', true],
    ])
  })

  it('writes durations plainly', () => {
    expect(fmtDuration(25 * MINUTE_MS)).toBe('25 min')
    expect(fmtDuration(11 * 60 * MINUTE_MS + 20 * MINUTE_MS)).toBe('11 h 20 min')
    expect(fmtDuration(3 * DAY_MS + 4 * 60 * MINUTE_MS)).toBe('3 d 4 h')
  })
})
