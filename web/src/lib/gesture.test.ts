import { describe, expect, it } from 'vitest'
import { classifyPose, HandDrag, OneEuro, palmX, type HandPoint } from './gesture.ts'

/** A hand facing the camera, fingers up; curled fingers fold their tips back below the middle joint. */
function hand(curled: number[] = [], cx = 0.5): HandPoint[] {
  const p = (x: number, y: number): HandPoint => ({ x: cx + x, y, z: 0 })
  const lm = [p(0, 0.8), p(-0.08, 0.75), p(-0.12, 0.68), p(-0.15, 0.62), p(-0.17, 0.57)]
  for (let f = 0; f < 4; f++) {
    const x = -0.06 + 0.04 * f
    const tipY = curled.includes(f) ? 0.62 : 0.38
    lm.push(p(x, 0.6), p(x, 0.5), p(x, curled.includes(f) ? 0.56 : 0.44), p(x, tipY))
  }
  return lm
}

describe('hand pose', () => {
  it('tells an open hand from a fist', () => {
    expect(classifyPose(hand(), 4 / 3)).toBe('open')
    expect(classifyPose(hand([0, 1, 2, 3]), 4 / 3)).toBe('fist')
    // A bent little finger still reads as open; two curled fingers are neither
    expect(classifyPose(hand([3]), 4 / 3)).toBe('open')
    expect(classifyPose(hand([0, 1]), 4 / 3)).toBe('other')
  })

  it('places the palm as in a mirror', () => {
    expect(palmX(hand([], 0.2))).toBeCloseTo(0.8, 9)
    expect(palmX(hand([], 0.7))).toBeCloseTo(0.3, 9)
  })
})

describe('One Euro filter', () => {
  it('holds a steady value and damps jitter at rest', () => {
    const f = new OneEuro()
    let worst = 0
    for (let i = 0; i < 90; i++) {
      const y = f.filter(0.5 + (i % 2 ? 0.01 : -0.01), i / 30)
      if (i > 30) worst = Math.max(worst, Math.abs(y - 0.5))
    }
    expect(worst).toBeLessThan(0.004)
  })

  it('catches up with a moving hand', () => {
    const f = new OneEuro()
    let y = 0
    for (let i = 0; i <= 30; i++) y = f.filter(i / 30, i / 30)
    expect(y).toBeGreaterThan(0.9)
  })
})

describe('hand drag', () => {
  it('grabs after three open frames and drags with the palm', () => {
    const d = new HandDrag()
    expect(d.step('open', 0.5)).toBe(0)
    expect(d.step('open', 0.5)).toBe(0)
    expect(d.grip).toBe('none')
    expect(d.step('open', 0.5)).toBe(0)
    expect(d.grip).toBe('open')
    expect(d.step('open', 0.6)).toBeCloseTo(0.1, 9)
    expect(d.step('open', 0.55)).toBeCloseTo(-0.05, 9)
  })

  it('keeps dragging through unclear frames and lets go on a held fist', () => {
    const d = new HandDrag()
    for (let i = 0; i < 3; i++) d.step('open', 0.5)
    expect(d.step('other', 0.6)).toBeCloseTo(0.1, 9)
    // One fist frame is not enough to let go
    expect(d.step('fist', 0.7)).toBeCloseTo(0.1, 9)
    d.step('fist', 0.7)
    expect(d.step('fist', 0.8)).toBe(0)
    expect(d.grip).toBe('fist')
    expect(d.step('fist', 0.9)).toBe(0)
  })

  it('starts fresh when the hand comes back, without a jump', () => {
    const d = new HandDrag()
    for (let i = 0; i < 3; i++) d.step('open', 0.2)
    d.step(null, 0)
    expect(d.grip).toBe('none')
    for (let i = 0; i < 3; i++) expect(d.step('open', 0.8)).toBe(0)
    expect(d.step('open', 0.85)).toBeCloseTo(0.05, 9)
  })

  it('lets small moves add up instead of creeping', () => {
    const d = new HandDrag()
    for (let i = 0; i < 3; i++) d.step('open', 0.5)
    expect(d.step('open', 0.502)).toBe(0)
    expect(d.step('open', 0.505)).toBeCloseTo(0.005, 9)
  })
})
