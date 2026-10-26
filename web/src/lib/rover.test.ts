import { describe, expect, it } from 'vitest'
import { toStereo } from './pinHorizon.ts'
import { along, patchHeight, rayHorizon, routeLength, summarize, type DriveSample } from './rover.ts'
import { R_M, type Patch } from './terrain.ts'

/** A two-grid patch around 88° S, 0° E, heights from a function of stereographic x, y. */
function patch(height: (x: number, y: number) => number): Patch {
  const n = 201
  const center = toStereo(-88, 0) as [number, number]
  const grids = [30, 600].map((spacing, k) => {
    const half = ((n - 1) / 2) * spacing
    const heights = new Float32Array(n * n)
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) heights[j * n + i] = height(center[0] - half + i * spacing, center[1] + half - j * spacing)
    return { name: ['fine', 'far'][k], spacing_m: spacing, half_m: half, unit_m: 1, heights }
  })
  return { n, center, grids }
}

describe('rover drive', () => {
  it('walks along a route', () => {
    const pts: [number, number][] = [
      [0, 0],
      [300, 0],
      [300, 400],
    ]
    expect(routeLength(pts)).toBe(700)
    expect(along(pts, 150)).toEqual([150, 0])
    expect(along(pts, 500)).toEqual([300, 200])
    expect(along(pts, 9999)).toEqual([300, 400])
  })

  it('reads heights from the finest grid that covers a point', () => {
    const p = patch((x) => x / 10)
    const [cx, cy] = p.center
    expect(patchHeight(p, cx + 1234, cy)).toBeCloseTo((cx + 1234) / 10, 2)
    // Beyond the fine grid (±3 km) the far one answers
    expect(patchHeight(p, cx + 20_000, cy)).toBeCloseTo((cx + 20_000) / 10, 0)
    expect(patchHeight(p, cx + 1e7, cy)).toBeNaN()
  })

  it('sees the dip of a smooth sphere, and a wall at the right angle', () => {
    const flat = patch(() => 0)
    const [cx, cy] = flat.center
    const dip = -(Math.acos(R_M / (R_M + 2)) * 180) / Math.PI
    expect(rayHorizon(flat, cx, cy, 0, 2, 37)).toBeCloseTo(dip, 2)
    // A 500 m wall 10 km away from the pole (north, azimuth 0). It lies on the 600 m grid, which spreads its edge over
    // one spacing, so the skyline is between the angles of a wall at 10.0 and at 10.6 km.
    const wall = patch((_, y) => (y > cy + 10_000 ? 500 : 0))
    const at = (d: number) => (Math.atan((500 - 2 - d ** 2 / (2 * R_M)) / d) * 180) / Math.PI
    const el = rayHorizon(wall, cx, cy, 0, 2, 0)
    expect(el).toBeLessThanOrEqual(at(10_000) + 0.01)
    expect(el).toBeGreaterThanOrEqual(at(10_600) - 0.01)
    expect(rayHorizon(wall, cx, cy, 0, 2, 180)).toBeLessThan(0)
  })

  it('summarizes sunlight, Earth and the longest shadow', () => {
    const s = [1, 1, 0, 0, 0, 1].map((sun, i) => ({ tMs: i * 600_000, x: 0, y: 0, distKm: i * 0.1, groundM: 0, sun, sunEl: 1, earth: i < 3, earthEl: 1 }) as DriveSample)
    const m = summarize(s, 600_000)
    expect(m.sunPct).toBeCloseTo(50, 9)
    expect(m.earthPct).toBeCloseTo(50, 9)
    expect(m.longestShadowH).toBeCloseTo(0.5, 9)
    expect(m.shadowAtKm).toBeCloseTo(0.2, 9)
    expect(m.km).toBeCloseTo(0.5, 9)
  })
})
