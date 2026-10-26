import { describe, expect, it } from 'vitest'
import { bestWindows, scanWindows } from './finder.ts'
import { computeMetrics } from './metrics.ts'
import type { Series } from './series.ts'
import { HOUR_MS } from './time.ts'

/** An hourly series with pseudo-random sunlight and Earth clearance. */
function fakeSeries(days: number, seed: number): Series {
  const n = days * 24
  let x = seed
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const fSun = new Float32Array(n)
  const earthClear = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    // Slow swings, so runs of darkness and blackout last hours to days
    fSun[i] = Math.max(0, Math.min(1, 0.5 + Math.sin(i / 30 + seed) + 0.4 * (rnd() - 0.5)))
    earthClear[i] = 2 * Math.sin(i / 50 + 2 * seed) + rnd() - 0.5
  }
  return { startMs: 0, stepMs: HOUR_MS, n, fSun, earthClear, sunEl: new Float32Array(n), sunDistAu: new Float32Array(n).fill(1) }
}

function slice(s: Series, a: number, b: number): Series {
  return { ...s, startMs: s.startMs + a * s.stepMs, n: b - a, fSun: s.fSun.subarray(a, b), earthClear: s.earthClear.subarray(a, b) }
}

describe('scanWindows', () => {
  it('matches computeMetrics on every window', () => {
    const c = { darkThreshold: 0.1, earthMarginDeg: 0.5 }
    const s = fakeSeries(60, 3)
    const len = 7
    const w = scanWindows(s, 60, len, c)
    for (let d = 0; d < 60; d++) {
      if (d + len > 60) {
        expect(w.sunPct[d]).toBeNaN()
        continue
      }
      const m = computeMetrics(slice(s, d * 24, (d + len) * 24), c)
      expect(w.sunPct[d]).toBeCloseTo(m.sunMeanPct, 3)
      expect(w.earthPct[d]).toBeCloseTo(m.earthPct, 3)
      expect(w.bothPct[d]).toBeCloseTo(m.bothPct, 3)
      expect(w.darkH[d]).toBe(m.longestDark.hours)
      expect(w.blackoutH[d]).toBe(m.longestBlackout.hours)
    }
  })

  it('picks the best passing windows without overlaps', () => {
    const c = { darkThreshold: 0, earthMarginDeg: 0 }
    const scans = [fakeSeries(90, 1), fakeSeries(90, 2)].map((s) => scanWindows(s, 90, 14, c))
    const picks = bestWindows(scans, { minSunPct: 0, maxDarkH: Infinity, minEarthPct: 0 }, 'sun', 14, 6)
    expect(picks.length).toBe(6)
    for (let i = 1; i < picks.length; i++) expect(picks[i].score).toBeLessThanOrEqual(picks[i - 1].score)
    for (const p of picks) {
      for (const q of picks) if (p !== q && p.site === q.site) expect(Math.abs(p.day - q.day)).toBeGreaterThanOrEqual(14)
    }
  })
})
