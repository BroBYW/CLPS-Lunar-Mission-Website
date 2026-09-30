/** Terrain horizon masks (PLAN.md §4.3). Mirrors pipeline/clps/visibility.py horizon_at. */

export interface HorizonMeta {
  az_step_deg: number
  az_count: number
  heights_m: number[]
  sites: string[]
}

export class HorizonSet {
  readonly data: Float32Array
  readonly azStep: number
  readonly azCount: number
  readonly heightsM: number[]
  readonly siteIds: string[]

  constructor(buffer: ArrayBuffer, meta: HorizonMeta) {
    const expected = meta.sites.length * meta.heights_m.length * meta.az_count * 4
    if (buffer.byteLength !== expected) {
      throw new Error(`horizons.bin has ${buffer.byteLength} bytes, expected ${expected}`)
    }
    this.data = new Float32Array(buffer)
    this.azStep = meta.az_step_deg
    this.azCount = meta.az_count
    this.heightsM = meta.heights_m
    this.siteIds = meta.sites
  }

  /** A view of one mask: horizon elevation (deg) for azimuth bins k * azStep. */
  mask(siteIndex: number, heightIndex: number): Float32Array {
    const n = this.azCount
    const o = (siteIndex * this.heightsM.length + heightIndex) * n
    return this.data.subarray(o, o + n)
  }
}

/** Horizon elevation at any azimuth, linear between bins (bin k is centered on k * 0.1°). */
export function horizonAt(mask: Float32Array, azDeg: number): number {
  const n = mask.length
  let x = (azDeg * n) / 360
  x = ((x % n) + n) % n
  const k = Math.floor(x)
  const w = x - k
  const i0 = k % n
  const i1 = i0 + 1 === n ? 0 : i0 + 1
  return mask[i0] * (1 - w) + mask[i1] * w
}

/** Lowest and highest horizon over an azimuth interval (lo may exceed 360 or be negative). */
export function horizonRange(mask: Float32Array, azLo: number, azHi: number, out = { min: 0, max: 0 }) {
  const n = mask.length
  const a = Math.floor((azLo * n) / 360)
  const b = Math.ceil((azHi * n) / 360)
  let min = Infinity
  let max = -Infinity
  for (let k = a; k <= b; k++) {
    const v = mask[((k % n) + n) % n]
    if (v < min) min = v
    if (v > max) max = v
  }
  out.min = min
  out.max = max
  return out
}

export function maskExtremes(mask: Float32Array): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (const v of mask) {
    if (v < min) min = v
    if (v > max) max = v
  }
  return { min, max }
}
