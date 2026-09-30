import { angularRadiusDeg, azElTo, Ephemeris, newAzEl, R_EARTH_KM, R_SUN_KM, type SiteFrame } from './astro.ts'
import { MINUTE_MS } from './time.ts'

/** Sun and Earth positions sampled over a time range, for drawing paths. */
export interface Track {
  t: Float64Array
  sunAz: Float32Array
  sunEl: Float32Array
  earthAz: Float32Array
  earthEl: Float32Array
}

export function trackStep(startMs: number, endMs: number, maxPoints: number): number {
  const raw = (endMs - startMs) / maxPoints
  return Math.max(10 * MINUTE_MS, Math.ceil(raw / MINUTE_MS) * MINUTE_MS)
}

export function computeTrack(
  eph: Ephemeris,
  frame: SiteFrame,
  startMs: number,
  endMs: number,
  maxPoints = 3000,
): Track {
  const step = trackStep(startMs, endMs, maxPoints)
  const n = Math.floor((endMs - startMs) / step) + 1
  const tr: Track = {
    t: new Float64Array(n),
    sunAz: new Float32Array(n),
    sunEl: new Float32Array(n),
    earthAz: new Float32Array(n),
    earthEl: new Float32Array(n),
  }
  const v = new Float64Array(6)
  const p = newAzEl()
  for (let i = 0; i < n; i++) {
    const t = startMs + i * step
    tr.t[i] = t
    eph.sample(t, v)
    azElTo(frame, v[0], v[1], v[2], p)
    tr.sunAz[i] = p.az
    tr.sunEl[i] = p.el
    azElTo(frame, v[3], v[4], v[5], p)
    tr.earthAz[i] = p.az
    tr.earthEl[i] = p.el
  }
  return tr
}

/** Sun and Earth at one instant. */
export interface Bodies {
  sunAz: number
  sunEl: number
  sunRadius: number
  sunDistKm: number
  earthAz: number
  earthEl: number
  earthRadius: number
}

const scratch = new Float64Array(6)
const pos = newAzEl()

export function bodiesAt(eph: Ephemeris, frame: SiteFrame, tMs: number): Bodies {
  eph.sample(tMs, scratch)
  azElTo(frame, scratch[0], scratch[1], scratch[2], pos)
  const sunAz = pos.az
  const sunEl = pos.el
  const sunDistKm = pos.dist
  const sunRadius = angularRadiusDeg(R_SUN_KM, pos.dist)
  azElTo(frame, scratch[3], scratch[4], scratch[5], pos)
  return {
    sunAz,
    sunEl,
    sunRadius,
    sunDistKm,
    earthAz: pos.az,
    earthEl: pos.el,
    earthRadius: angularRadiusDeg(R_EARTH_KM, pos.dist),
  }
}
