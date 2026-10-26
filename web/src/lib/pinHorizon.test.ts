import { describe, expect, it } from 'vitest'
import { castHorizon, fromStereo, heightAt, toStereo, type HeightGrid } from './pinHorizon.ts'
import { R_M } from './terrain.ts'

/** A grid covering ±400 km at 480 m, heights from a function of stereographic x, y. */
function grid(height: (x: number, y: number) => number): HeightGrid {
  const spacing = 480
  const n = 1667
  const half = ((n - 1) / 2) * spacing
  const heights = new Float32Array(n * n)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) heights[j * n + i] = height(-half + i * spacing, half - j * spacing)
  return { n, spacing, half, heights }
}

describe('pin horizons', () => {
  it('round-trips the projection', () => {
    const [x, y] = toStereo(-87.3, 45.1)
    const [lat, lon] = fromStereo(x, y)
    expect(lat).toBeCloseTo(-87.3, 9)
    expect(lon).toBeCloseTo(45.1, 9)
  })

  it('reads heights bilinearly', () => {
    const g = grid((x) => x / 100)
    expect(heightAt(g, 1234, 0)).toBeCloseTo(12.34, 3)
    expect(heightAt(g, 1e9, 0)).toBeNaN()
  })

  it('gives the dip of a smooth sphere', () => {
    const { masks } = castHorizon(grid(() => 0), -88, 30, [2, 10])
    const dip = (h: number) => -(Math.acos(R_M / (R_M + h)) * 180) / Math.PI
    // Samples every 480 m, so the true horizon (2.6 km away for 2 m) is found to within a few thousandths of a degree
    for (const v of masks[0]) expect(v).toBeCloseTo(dip(2), 2)
    for (const v of masks[1]) expect(v).toBeCloseTo(dip(10), 2)
  })

  it('sees a wall 20 km away at the right angle', () => {
    // 1 km high everywhere more than 20 km further from the pole along the 0° meridian (stereographic +y)
    const [px, py] = toStereo(-88, 0)
    const { masks } = castHorizon(grid((_, y) => (y > py + 20_000 ? 1000 : 0)), -88, 0, [2])
    // North (azimuth 0°) points away from the south pole, at the wall
    const expected = (Math.atan((1000 - 2 - 20_000 ** 2 / (2 * R_M)) / 20_000) * 180) / Math.PI
    expect(masks[0][0]).toBeGreaterThan(expected - 0.15)
    expect(masks[0][0]).toBeLessThan(expected + 0.01)
    // Looking toward the pole (azimuth 180°) there is no wall
    expect(masks[0][1800]).toBeLessThan(0)
    expect(px).toBeCloseTo(0, 6)
  })
})
