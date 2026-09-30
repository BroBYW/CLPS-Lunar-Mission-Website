import { describe, expect, it } from 'vitest'
import { decodeGrid, diskAbove, R_M, stereoToMoonFixed, sunlight, type Patch } from './terrain.ts'

const D2R = Math.PI / 180

describe('decodeGrid', () => {
  it('undoes the planar predictor', () => {
    const n = 5
    const q = Int32Array.from({ length: n * n }, (_, k) => ((k * 37) % 23) - 11 + Math.floor(k / n) * 3)
    const res = new Int16Array(n * n)
    const at = (i: number, j: number) => (i < 0 || j < 0 ? 0 : q[j * n + i])
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) res[j * n + i] = at(i, j) - (at(i - 1, j) + at(i, j - 1) - at(i - 1, j - 1))
    const h = decodeGrid(res, 0, n, 0.5)
    expect(Array.from(h)).toEqual(Array.from(q, (v) => v * 0.5))
  })
})

describe('stereoToMoonFixed', () => {
  it('inverts the south polar stereographic projection', () => {
    for (const [lat, lon, h] of [
      [-89, 0, 0],
      [-85.4, 31.7, 1200],
      [-83.6, -68.5, -300],
    ]) {
      const rho = 2 * R_M * Math.tan(Math.PI / 4 + (lat * D2R) / 2)
      const out = new Float64Array(3)
      stereoToMoonFixed(rho * Math.sin(lon * D2R), rho * Math.cos(lon * D2R), h, out)
      const r = R_M + h
      expect(out[0]).toBeCloseTo(r * Math.cos(lat * D2R) * Math.cos(lon * D2R), 4)
      expect(out[1]).toBeCloseTo(r * Math.cos(lat * D2R) * Math.sin(lon * D2R), 4)
      expect(out[2]).toBeCloseTo(r * Math.sin(lat * D2R), 4)
    }
  })
})

describe('diskAbove', () => {
  it('runs from hidden to fully visible', () => {
    expect(diskAbove(-1)).toBe(0)
    expect(diskAbove(0)).toBeCloseTo(0.5, 12)
    expect(diskAbove(1)).toBe(1)
    expect(diskAbove(0.5)).toBeGreaterThan(diskAbove(0.2))
  })
})

// A synthetic site at 88° S with the same three nested grids as the real patches, but smaller
const n = 201
const site: [number, number] = (() => {
  const rho = 2 * R_M * Math.tan(Math.PI / 4 + (-88 * D2R) / 2)
  return [rho * Math.sin(30 * D2R), rho * Math.cos(30 * D2R)]
})()
const SPACINGS = [30, 240, 1500]

/** Sun vector at a given elevation (deg) above the site's horizon, toward stereographic +x. */
function sunAt(elDeg: number): number[] {
  const p = new Float64Array(3)
  const q = new Float64Array(3)
  const c = new Float64Array(3)
  stereoToMoonFixed(site[0] + 1, site[1], 0, p)
  stereoToMoonFixed(site[0] - 1, site[1], 0, q)
  stereoToMoonFixed(site[0], site[1], 0, c)
  const t = [p[0] - q[0], p[1] - q[1], p[2] - q[2]]
  const tl = Math.hypot(...t)
  const e = elDeg * D2R
  return [0, 1, 2].map((k) => (Math.cos(e) * t[k]) / tl + (Math.sin(e) * c[k]) / R_M)
}

/** Terrain as a function of the offset from the site along the Sun's stereographic direction (m). */
function patch(height: (along: number) => number, sun: number[]): Patch {
  const ul = Math.hypot(sun[1], sun[0])
  const [ux, uy] = [sun[1] / ul, sun[0] / ul]
  return {
    n,
    center: site,
    grids: SPACINGS.map((spacing, k) => {
      const half = ((n - 1) / 2) * spacing
      const heights = new Float32Array(n * n)
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) heights[j * n + i] = height((-half + i * spacing) * ux + (half - j * spacing) * uy)
      return { name: ['fine', 'coarse', 'far'][k], spacing_m: spacing, half_m: half, unit_m: 1, heights }
    }),
  }
}

function alongOf(p: Patch, g: number, sun: number[]): Float64Array {
  const ul = Math.hypot(sun[1], sun[0])
  const [ux, uy] = [sun[1] / ul, sun[0] / ul]
  const { spacing_m: s, half_m: half } = p.grids[g]
  return Float64Array.from({ length: n * n }, (_, k) => (-half + (k % n) * s) * ux + (half - Math.floor(k / n) * s) * uy)
}

const TINY_SUN = 1e-9

describe('sunlight', () => {
  it('puts the terminator where the Sun meets the local horizon on a smooth Moon', () => {
    const sun = sunAt(1)
    const p = patch(() => 0, sun)
    const lit = sunlight(p, sun, TINY_SUN)
    // Sun at 1° here sets 1° of arc (30.3 km) further away from it
    const along = alongOf(p, 2, sun)
    for (let k = 0; k < n * n; k++) {
      if (along[k] > -28_000) expect(lit[2][k]).toBe(1)
      if (along[k] < -33_000) expect(lit[2][k]).toBe(0)
    }
    expect(lit[0][(n * n - 1) / 2]).toBe(1)
  })

  it('casts a ridge shadow of the expected length', () => {
    const sun = sunAt(2)
    // 500 m high, 1 km wide ridge 1.5–2.5 km sunward of the site
    const p = patch((a) => (a > 1500 && a < 2500 ? 500 : 0), sun)
    const lit = sunlight(p, sun, TINY_SUN)
    const fine = alongOf(p, 0, sun)
    const coarse = alongOf(p, 1, sun)
    const lat = (g: number) => {
      const ul = Math.hypot(sun[1], sun[0])
      const [vx, vy] = [-sun[0] / ul, sun[1] / ul]
      const { spacing_m: s, half_m: half } = p.grids[g]
      return (k: number) => Math.abs((-half + (k % n) * s) * vx + (half - Math.floor(k / n) * s) * vy)
    }
    const latFine = lat(0)
    const latCoarse = lat(1)
    for (let k = 0; k < n * n; k++) {
      // In the shadow just behind the ridge, lit in front of it
      if (fine[k] > -1000 && fine[k] < 1300 && latFine(k) < 1000) expect(lit[0][k]).toBe(0)
      if (fine[k] > 2700 && latFine(k) < 1000) expect(lit[0][k]).toBe(1)
      // 500 m at 2° with curvature: the shadow ends about 16.4 km behind the ridge's sunward edge
      if (coarse[k] < 1300 && coarse[k] > -12_000 && latCoarse(k) < 2000) expect(lit[1][k]).toBe(0)
      if (coarse[k] < -17_000 && latCoarse(k) < 2000) expect(lit[1][k]).toBe(1)
    }
  })

  it('lets a massif 100 km away shade the site when the Sun is low', () => {
    const sun = sunAt(0.3)
    const centre = (n * n - 1) / 2
    const flat = sunlight(patch(() => 0, sun), sun, 0.2665 * D2R)
    expect(flat[0][centre]).toBe(1)
    const massif = sunlight(patch((a) => (a > 90_000 && a < 110_000 ? 4000 : 0), sun), sun, 0.2665 * D2R)
    expect(massif[0][centre]).toBe(0)
  })

  it('gives a partial Sun when the disk straddles the horizon', () => {
    const sun = sunAt(0.3)
    // A far ridge whose top sits almost exactly on the line to the Sun's centre
    const dist = 100_000
    const rise = dist * Math.tan(0.3 * D2R) + (dist * dist) / (2 * R_M)
    const lit = sunlight(patch((a) => (a > dist - 1500 && a < dist + 1500 ? rise : 0), sun), sun, 0.2665 * D2R)
    const f = lit[0][(n * n - 1) / 2]
    expect(f).toBeGreaterThan(0.1)
    expect(f).toBeLessThan(0.9)
  })
})
