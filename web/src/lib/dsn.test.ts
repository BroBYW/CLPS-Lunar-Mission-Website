import { describe, expect, it } from 'vitest'
import { contactOf, dsnElevation, type Dsn } from './dsn.ts'
import type { Series } from './series.ts'
import { HOUR_MS, MINUTE_MS } from './time.ts'

// Two complexes over 6 hours: A rises through the limit, B sets through it
const dsn: Dsn = {
  names: ['A', 'B'],
  limitDeg: 10,
  t0Ms: 0,
  stepMs: HOUR_MS,
  count: 7,
  el: Int8Array.from([0, 30, 5, 25, 10, 20, 15, 15, 20, 10, 25, 5, 30, 0]),
}

describe('DSN contact', () => {
  it('interpolates elevations between hours', () => {
    expect(dsnElevation(dsn, 0, 0)).toBe(0)
    expect(dsnElevation(dsn, 0, HOUR_MS * 1.5)).toBeCloseTo(7.5, 9)
    expect(dsnElevation(dsn, 1, HOUR_MS * 6)).toBe(0)
    // Clamped at the ends of the table
    expect(dsnElevation(dsn, 0, HOUR_MS * 99)).toBe(30)
  })

  it('needs Earth above the skyline and a complex in reach', () => {
    const n = 36
    const s: Series = {
      startMs: 0,
      stepMs: 10 * MINUTE_MS,
      n,
      fSun: new Float32Array(n),
      // Earth below the skyline for the first hour
      earthClear: Float32Array.from({ length: n }, (_, i) => (i < 6 ? -1 : 2)),
      sunEl: new Float32Array(n),
      sunDistAu: new Float32Array(n).fill(1),
    }
    const c = contactOf(s, dsn, 0)
    // At 0 h only B (30°) is up; A crosses 10° at 2 h; B drops below 10° at 4 h
    expect(c.stations[0]).toBe(0b10)
    expect(c.stations[12]).toBe(0b11)
    expect(c.stations[30]).toBe(0b01)
    expect(c.contact[0]).toBe(0)
    expect(c.contact[6]).toBe(1)
    expect(c.contactPct).toBeCloseTo((100 * 30) / 36, 9)
    expect(c.longestGapH).toBe(1)
    expect(c.gapAtEdge).toBe(true)
  })
})
