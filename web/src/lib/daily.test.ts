import { describe, expect, it } from 'vitest'
import { FIRST_DAY_MS, best, dailyMission, dailyNumber, feasible, grade, squares } from './daily.ts'
import type { WindowScores } from './finder.ts'
import { DAY_MS } from './time.ts'

/** Windows for one site: sunlight rising by a point a day, darkness and Earth constant. */
function windows(days: number, sun0: number, darkH: number, earthPct: number): WindowScores {
  const w: WindowScores = { sunPct: new Float32Array(days), darkH: new Float32Array(days), earthPct: new Float32Array(days), blackoutH: new Float32Array(days), bothPct: new Float32Array(days) }
  for (let d = 0; d < days; d++) {
    w.sunPct[d] = sun0 + d
    w.darkH[d] = darkH
    w.earthPct[d] = earthPct
    w.bothPct[d] = Math.min(w.sunPct[d], earthPct)
  }
  return w
}

describe('daily landing challenge', () => {
  it('draws the same mission for everyone on a day, and a different one the next day', () => {
    expect(dailyNumber(FIRST_DAY_MS + 5 * 3_600_000)).toBe(1)
    expect(dailyNumber(FIRST_DAY_MS + DAY_MS)).toBe(2)
    expect(dailyMission(7)).toEqual(dailyMission(7))
    const days = Array.from({ length: 10 }, (_, i) => JSON.stringify(dailyMission(i + 1)))
    expect(new Set(days).size).toBeGreaterThan(5)
  })

  it('eases the limits until enough windows pass, and grades a guess against the best', () => {
    const m = { ...dailyMission(1), rankBy: 'sun' as const, lengthDays: 7, limits: { minSunPct: 95, maxDarkH: 24, minEarthPct: 50 } }
    // Sunlight reaches 70% at most; darkness 30 h; Earth 60%
    const all = [windows(10, 50, 30, 60), windows(10, 61, 30, 60)]
    const f = feasible(m, all)
    expect(f.limits.minSunPct).toBeLessThanOrEqual(65)
    expect(f.limits.maxDarkH).toBeGreaterThanOrEqual(30)
    const top = best(f, all)!
    expect(top).toEqual({ site: 1, day: 9, score: 0.7 })
    const g = grade(f, all, top, 1, 4)
    expect(g.pass).toBe(true)
    expect(g.pct).toBeCloseTo((100 * 65) / 70, 3)
    const miss = grade(f, all, top, 0, 0)
    expect(miss.checks.sun).toBe(false)
    expect(miss.pct).toBe(0)
    expect(squares([miss, g, grade(f, all, top, 1, 9)])).toBe('⬛🟨🟩')
  })
})
