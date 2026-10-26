import { describe, expect, it } from 'vitest'
import { comparePhoto, modelBrightness, type CropGeometry } from './lroCompare.ts'
import { toStereo } from './pinHorizon.ts'
import type { Patch } from './terrain.ts'

/** A flat one-grid patch around 89° S, 0° E: 101 × 101 nodes at 100 m. */
function flatPatch(): Patch {
  const n = 101
  return { n, center: toStereo(-89, 0) as [number, number], grids: [{ name: 'mid', spacing_m: 100, half_m: 5000, unit_m: 1, heights: new Float32Array(n * n) }] }
}

describe('LRO photo comparison', () => {
  it('lights flat ground by the Lommel–Seeliger law and samples it on the photo grid', () => {
    const p = flatPatch()
    const lit = new Float32Array(p.n * p.n).fill(1)
    // The Sun 30° above the horizon toward 0° E, from a site at 89° S, 0° E: up is (cos 89°, 0, −sin 89°)
    const el = (30 * Math.PI) / 180
    const lat = (-89 * Math.PI) / 180
    const up = [Math.cos(lat), 0, Math.sin(lat)]
    const north = [-Math.sin(lat), 0, Math.cos(lat)]
    const sun = up.map((u, i) => u * Math.sin(el) + north[i] * Math.cos(el))
    const crop: CropGeometry = { size: 11, pixelM: 1000, x0: p.center[0] - 5000, y0: p.center[1] + 5000 }
    const b = modelBrightness(p, 0, lit, sun, crop)
    const mu0 = Math.sin(el)
    // The ground's normal is the local vertical only at the site; elsewhere it tilts by up to 0.2 mrad
    expect(b[5 * 11 + 5]).toBeCloseTo(mu0 / (mu0 + 1), 4)
    // A pixel just past the grid's edge has no model
    const off = modelBrightness(p, 0, lit, sun, { ...crop, x0: crop.x0 - 1 })
    expect(off[5 * 11]).toBeNaN()
    // Ground in shadow is dark
    expect(modelBrightness(p, 0, new Float32Array(p.n * p.n), sun, crop)[60]).toBe(0)
  })

  it('fits one brightness scale and counts where photo and model differ', () => {
    const n = 100
    const model = new Float32Array(n * n)
    const photo = new Float32Array(n * n)
    for (let k = 0; k < n * n; k++) {
      model[k] = k % n < 60 ? 0.2 + 0.3 * ((k * 7) % 10) / 10 : 0
      photo[k] = model[k] ? 0.08 * model[k] : 0.0003
    }
    let a = comparePhoto(photo, model, 0.003)
    expect(a.scale).toBeCloseTo(0.08, 6)
    expect(a.agreePct).toBe(100)
    // Put ten columns of the lit part in shadow in the photo, and mark one row as missing
    for (let k = 0; k < n * n; k++) if (k % n >= 50 && k % n < 60) photo[k] = 0.0003
    for (let i = 0; i < n; i++) photo[i] = Number.NaN
    a = comparePhoto(photo, model, 0.003)
    expect(a.pixels).toBe(n * n - n)
    expect(a.modelOnlyPct).toBeCloseTo(10, 9)
    expect(a.photoOnlyPct).toBe(0)
    expect(a.agreePct).toBeCloseTo(90, 9)
    // Sunlit in the model: 60 columns; in the photo: 50 of them
    expect(a.litOverlapPct).toBeCloseTo((100 * 50) / 60, 9)
  })
})
