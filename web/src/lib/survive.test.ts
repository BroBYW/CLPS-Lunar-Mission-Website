import { describe, expect, it } from 'vitest'
import type { Series } from './series.ts'
import { BASE_LOAD_W, BUDGET, DEPTH_OF_DISCHARGE, SCIENCE_LOAD_W, STORE_H, designCost, startState, step, type LanderDesign } from './survive.ts'

/** Hourly samples: the Sun at 0° with `sun` of it visible, Earth in view where `earth` says. */
function series(n: number, sun: (i: number) => number, earth: (i: number) => boolean): Series {
  const s: Series = { startMs: 0, stepMs: 3_600_000, n, fSun: new Float32Array(n), earthClear: new Float32Array(n), sunEl: new Float32Array(n), sunDistAu: new Float32Array(n).fill(1) }
  for (let i = 0; i < n; i++) {
    s.fSun[i] = sun(i)
    s.earthClear[i] = earth(i) ? 1 : -1
  }
  return s
}

const design: LanderDesign = { panelM2: 1, batteryWh: 2000, mastM: 2 }

describe('survive the lunar night', () => {
  it('prices a design within the budget', () => {
    expect(designCost(design)).toBe(8 + 8)
    expect(designCost({ panelM2: 4, batteryWh: 12000, mastM: 20 })).toBeGreaterThan(BUDGET)
  })

  it('freezes when the battery runs flat in the dark, after usable charge / load hours', () => {
    const s = series(100, () => 0, () => true)
    let st = startState(design)
    while (!st.frozen && !st.done) st = step(st, s, design, false)
    const hours = (design.batteryWh * DEPTH_OF_DISCHARGE) / BASE_LOAD_W
    expect(st.frozen).toBe(true)
    expect(st.i).toBe(Math.ceil(hours))
  })

  it('survives in full sunlight, and science reaches Earth only when Earth is in view', () => {
    // 1 m² at 30% gives 408 W, more than the load; Earth in view for the last 10 hours only
    const s = series(60, () => 1, (i) => i >= 50)
    let st = startState(design)
    while (!st.done) st = step(st, s, design, true)
    expect(st.frozen).toBe(false)
    expect(st.loadW).toBe(BASE_LOAD_W + SCIENCE_LOAD_W)
    // 50 hours of science before Earth rises: the store holds 48, two are lost; then 10 more go straight home
    expect(st.lost).toBeCloseTo(2, 9)
    expect(st.sent).toBeCloseTo(STORE_H + 10, 9)
    expect(st.stored).toBe(0)
  })
})
