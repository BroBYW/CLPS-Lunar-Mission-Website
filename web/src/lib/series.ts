/**
 * Visibility time series for one site (PLAN.md §4.5). Mirrors pipeline/clps/series.py site_series:
 * samples at start + i * step for i in [0, n), n = floor((end - start) / step); each covers [t, t + step).
 */

import { angularRadiusDeg, AU_KM, azElTo, Ephemeris, newAzEl, R_EARTH_KM, R_SUN_KM, type SiteFrame } from './astro.ts'
import { horizonAt } from './horizon.ts'
import { sunFraction } from './visibility.ts'

export interface Series {
  startMs: number
  stepMs: number
  n: number
  /** Visible fraction of the solar disk, 0–1 (terrain and Earth) */
  fSun: Float32Array
  /** Earth's center elevation minus the terrain horizon at its azimuth, degrees */
  earthClear: Float32Array
  sunEl: Float32Array
  sunDistAu: Float32Array
}

export function computeSeries(
  eph: Ephemeris,
  frame: SiteFrame,
  mask: Float32Array,
  startMs: number,
  endMs: number,
  stepMs: number,
): Series {
  const n = Math.max(0, Math.floor((endMs - startMs) / stepMs))
  const s: Series = {
    startMs,
    stepMs,
    n,
    fSun: new Float32Array(n),
    earthClear: new Float32Array(n),
    sunEl: new Float32Array(n),
    sunDistAu: new Float32Array(n),
  }
  const v = new Float64Array(6)
  const sun = newAzEl()
  const earth = newAzEl()
  const disk = { az: 0, el: 0, radius: 0 }
  for (let i = 0; i < n; i++) {
    eph.sample(startMs + i * stepMs, v)
    azElTo(frame, v[0], v[1], v[2], sun)
    azElTo(frame, v[3], v[4], v[5], earth)
    disk.az = earth.az
    disk.el = earth.el
    disk.radius = angularRadiusDeg(R_EARTH_KM, earth.dist)
    s.fSun[i] = sunFraction(mask, sun.az, sun.el, angularRadiusDeg(R_SUN_KM, sun.dist), disk)
    s.earthClear[i] = earth.el - horizonAt(mask, earth.az)
    s.sunEl[i] = sun.el
    s.sunDistAu[i] = sun.dist / AU_KM
  }
  return s
}
