/** Sunlight on the 3D terrain (lib/terrain.ts) off the main thread, so playback stays smooth. */

import * as Comlink from 'comlink'
import { TerrainSun, type Patch } from '../lib/terrain.ts'

let current: { id: string; sun: TerrainSun; lit: Float32Array[] } | null = null

const api = {
  setPatch(id: string, patch: Patch): void {
    current = { id, sun: new TerrainSun(patch), lit: patch.grids.map(() => new Float32Array(patch.n * patch.n)) }
  },
  /** One RGBA image per grid with the visible fraction of the Sun in every channel, or null for a stale patch. */
  shade(id: string, sun: number[], sunRadiusRad: number): Uint8ClampedArray[] | null {
    if (!current || current.id !== id) return null
    const images = current.sun.compute(sun, sunRadiusRad, current.lit).map((f) => {
      const rgba = new Uint8ClampedArray(f.length * 4)
      for (let k = 0; k < f.length; k++) {
        const v = Math.round(f[k] * 255)
        rgba[4 * k] = v
        rgba[4 * k + 1] = v
        rgba[4 * k + 2] = v
        rgba[4 * k + 3] = 255
      }
      return rgba
    })
    return Comlink.transfer(
      images,
      images.map((a) => a.buffer),
    )
  },
  /** The visible fraction of the Sun at every node of one grid only (finer grids are skipped), or null for a stale patch. */
  shadeGrid(id: string, sun: number[], sunRadiusRad: number, gridIndex: number): Float32Array | null {
    if (!current || current.id !== id) return null
    const lit = current.sun.compute(sun, sunRadiusRad, current.lit, gridIndex)[gridIndex].slice()
    return Comlink.transfer(lit, [lit.buffer])
  },
}

export type TerrainWorkerApi = typeof api
Comlink.expose(api)
