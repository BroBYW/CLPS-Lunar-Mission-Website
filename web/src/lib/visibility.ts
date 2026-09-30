/**
 * Visible fraction of the Sun's disk above the terrain, minus any part covered by Earth (PLAN.md §4.4).
 * Same strip algorithm as pipeline/clps/visibility.py sun_fraction; the early exits return exactly what
 * the strips would, so both implementations agree.
 */

import { azDiff, DEG } from './astro.ts'
import { horizonAt, horizonRange } from './horizon.ts'

export const N_STRIPS = 32
const STRIP_X = new Float64Array(N_STRIPS)
const STRIP_HALF = new Float64Array(N_STRIPS)
for (let i = 0; i < N_STRIPS; i++) {
  const m = ((i + 0.5) / N_STRIPS) * 2 - 1
  STRIP_X[i] = m
  STRIP_HALF[i] = Math.sqrt(1 - m * m)
}

const range = { min: 0, max: 0 }

export interface EarthDisk {
  az: number
  el: number
  radius: number
}

export function sunFraction(
  mask: Float32Array,
  az: number,
  el: number,
  radius: number,
  earth?: EarthDisk,
): number {
  const cosEl = Math.cos(el * DEG)
  const span = radius / cosEl
  let ex = 0
  let ey = 0
  let er = 0
  let eclipse = false
  if (earth) {
    ex = azDiff(earth.az, az) * cosEl
    ey = earth.el - el
    er = earth.radius
    eclipse = Math.sqrt(ex * ex + ey * ey) < radius + er
  }
  if (!eclipse) {
    horizonRange(mask, az - span, az + span, range)
    if (el - radius >= range.max) return 1
    if (el + radius <= range.min) return 0
  }
  let visible = 0
  let total = 0
  for (let i = 0; i < N_STRIPS; i++) {
    const x = STRIP_X[i] * radius
    const half = STRIP_HALF[i] * radius
    const h = horizonAt(mask, az + x / cosEl)
    const top = el + half
    const lo = Math.max(el - half, h)
    let v = top - lo
    if (v < 0) v = 0
    if (eclipse && v > 0) {
      const dx = x - ex
      if (Math.abs(dx) < er) {
        const ce = Math.sqrt(er * er - dx * dx)
        const covered = Math.min(top, el + ey + ce) - Math.max(lo, el + ey - ce)
        if (covered > 0) v -= Math.min(covered, v)
      }
    }
    visible += v
    total += 2 * half
  }
  return visible / total
}

export function earthVisible(mask: Float32Array, az: number, el: number, marginDeg = 0): boolean {
  return el > horizonAt(mask, az) + marginDeg
}
