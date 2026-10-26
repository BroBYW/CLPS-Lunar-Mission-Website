/**
 * The app's terrain lit for the moment of an LRO photo, drawn the way the camera saw it, and how well the two agree
 * on what is sunlit (pipeline/scripts/lro_photos.py prepares the photos).
 *
 * Ground brightness follows the Lommel–Seeliger law, μ0 / (μ0 + μ), for a camera looking straight down: μ0 is the
 * cosine of the Sun's angle from the ground's normal and μ the camera's. It is multiplied by the fraction of the Sun
 * the ground sees past the terrain (lib/terrain.ts). One scale factor, fitted where both pictures show sunlit ground,
 * turns it into the photo's I/F; it stands for the ground's albedo and the camera's calibration. Shadows are not
 * fitted: they come from the terrain and the Sun's position alone.
 */

import { gridNormals, gridPositions, type Patch } from './terrain.ts'

/** A square photo in polar stereographic metres: pixel (i, j) is centred at x0 + i·pixelM, y0 − j·pixelM. */
export interface CropGeometry {
  size: number
  pixelM: number
  x0: number
  y0: number
}

/**
 * Model brightness at each photo pixel, before scaling: Lommel–Seeliger times the visible fraction of the Sun,
 * sampled bilinearly from one grid of the patch. NaN where the grid doesn't reach.
 *
 * lit: the visible fraction of the Sun (0–1) at every node of that grid; sun: toward the Sun, Moon-fixed.
 */
export function modelBrightness(patch: Patch, gridIndex: number, lit: ArrayLike<number>, sun: ArrayLike<number>, crop: CropGeometry): Float32Array {
  const g = patch.grids[gridIndex]
  const { n } = patch
  const pos = gridPositions(patch, g)
  const nor = gridNormals(pos, n)
  const sl = Math.hypot(sun[0], sun[1], sun[2])
  const sx = sun[0] / sl
  const sy = sun[1] / sl
  const sz = sun[2] / sl
  const node = new Float32Array(n * n)
  for (let k = 0; k < n * n; k++) {
    const nx = nor[3 * k]
    const ny = nor[3 * k + 1]
    const nz = nor[3 * k + 2]
    const mu0 = nx * sx + ny * sy + nz * sz
    if (mu0 <= 0 || lit[k] <= 0) continue
    const r = Math.hypot(pos[3 * k], pos[3 * k + 1], pos[3 * k + 2])
    const mu = Math.max(0, (nx * pos[3 * k] + ny * pos[3 * k + 1] + nz * pos[3 * k + 2]) / r)
    node[k] = (mu0 / (mu0 + mu)) * lit[k]
  }

  const { size, pixelM } = crop
  const out = new Float32Array(size * size)
  const left = patch.center[0] - g.half_m
  const top = patch.center[1] + g.half_m
  for (let j = 0; j < size; j++) {
    const v = (top - (crop.y0 - j * pixelM)) / g.spacing_m
    for (let i = 0; i < size; i++) {
      const u = (crop.x0 + i * pixelM - left) / g.spacing_m
      if (!(u >= 0 && v >= 0 && u <= n - 1 && v <= n - 1)) {
        out[j * size + i] = Number.NaN
        continue
      }
      const i0 = Math.min(n - 2, Math.floor(u))
      const j0 = Math.min(n - 2, Math.floor(v))
      const tu = u - i0
      const tv = v - j0
      const k = j0 * n + i0
      const a = node[k] + (node[k + 1] - node[k]) * tu
      const b = node[k + n] + (node[k + n + 1] - node[k + n]) * tu
      out[j * size + i] = a + (b - a) * tv
    }
  }
  return out
}

export interface Agreement {
  /** Pixels where both the photo and the model have data */
  pixels: number
  /** Share of those where both call the ground sunlit, or both call it in shadow */
  agreePct: number
  /** Sunlit in both; model sunlit but the photo dark; and the other way round: shares of the pixels */
  bothLitPct: number
  modelOnlyPct: number
  photoOnlyPct: number
  /** Of the ground sunlit in either picture, the share sunlit in both: stricter, since shadow is easy to match */
  litOverlapPct: number
  /** I/F per unit of model brightness, fitted to the photo */
  scale: number
  /** The model in the photo's units (NaN where it has no data) */
  predicted: Float32Array
}

/** Brightness below which a lit surface is too dim to tell from shadow is left to the threshold, like the photo. */
const FIT_MIN_BRIGHTNESS = 0.1

/**
 * Compare a photo (I/F per pixel, NaN where the frame has no data) with the model brightness. A pixel counts as
 * sunlit where its I/F is above iofLit, in the photo and in the scaled model alike, so dim grazing light is judged
 * the same way in both.
 */
export function comparePhoto(photo: Float32Array, model: Float32Array, iofLit: number, fallbackScale = 0.12): Agreement {
  const ratios: number[] = []
  for (let k = 0; k < photo.length; k++) {
    const p = photo[k]
    const m = model[k]
    if (p > iofLit && m >= FIT_MIN_BRIGHTNESS) ratios.push(p / m)
  }
  ratios.sort((a, b) => a - b)
  const scale = ratios.length >= 50 ? ratios[ratios.length >> 1] : fallbackScale

  const predicted = new Float32Array(model.length)
  let pixels = 0
  let agree = 0
  let bothLit = 0
  let modelOnly = 0
  let photoOnly = 0
  for (let k = 0; k < photo.length; k++) {
    const m = model[k]
    predicted[k] = m * scale
    const p = photo[k]
    if (Number.isNaN(p) || Number.isNaN(m)) continue
    pixels++
    const pl = p > iofLit
    const ml = predicted[k] > iofLit
    if (pl === ml) {
      agree++
      if (pl) bothLit++
    } else if (ml) modelOnly++
    else photoOnly++
  }
  const pct = (v: number) => (pixels ? (100 * v) / pixels : 0)
  const anyLit = bothLit + modelOnly + photoOnly
  return {
    pixels,
    agreePct: pct(agree),
    bothLitPct: pct(bothLit),
    modelOnlyPct: pct(modelOnly),
    photoOnlyPct: pct(photoOnly),
    litOverlapPct: anyLit ? (100 * bothLit) / anyLit : 0,
    scale,
    predicted,
  }
}
