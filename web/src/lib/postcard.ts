/**
 * Earth postcard: the best moment to photograph Earth from a site. Earth's whole disk should sit just above the
 * skyline, as full as possible (lit by the Sun behind the camera) and with the Sun up, so the ground is lit too.
 */

import { angularRadiusDeg, azElTo, Ephemeris, newAzEl, R_EARTH_KM, R_SUN_KM, type SiteFrame } from './astro.ts'
import { horizonAt } from './horizon.ts'
import { sunFraction } from './visibility.ts'

/** Earth's lowest point at least this far above the skyline, and its centre at most this high (deg) */
const CLEAR_DEG = 0.1
const MAX_ABOVE_DEG = 4

export interface EarthMoment {
  tMs: number
  earthAz: number
  earthEl: number
  /** Earth's centre above the skyline, deg */
  aboveDeg: number
  /** Share of Earth's disk lit by the Sun, as seen from the site (1 = full Earth) */
  lit: number
  /** Visible fraction of the Sun at the site, and its elevation above the level horizon (deg) */
  sun: number
  sunEl: number
}

/** Share of Earth's disk that is sunlit, seen from the Moon: (1 − cos θ) / 2, θ between the Sun and Earth. */
export function earthLit(sun: ArrayLike<number>, earth: ArrayLike<number>): number {
  const s = Math.hypot(sun[0], sun[1], sun[2])
  const e = Math.hypot(earth[0], earth[1], earth[2])
  const cos = (sun[0] * earth[0] + sun[1] * earth[1] + sun[2] * earth[2]) / (s * e)
  return (1 - cos) / 2
}

/** The best moment in [fromMs, toMs), sampled every stepMs; null if Earth never sits low over the skyline. */
export function bestEarthMoment(eph: Ephemeris, frame: SiteFrame, mask: Float32Array, fromMs: number, toMs: number, stepMs: number): EarthMoment | null {
  const v = new Float64Array(6)
  const sun = newAzEl()
  const earth = newAzEl()
  let best: EarthMoment | null = null
  let bestScore = -1
  for (let t = fromMs; t < toMs; t += stepMs) {
    eph.sample(t, v)
    azElTo(frame, v[3], v[4], v[5], earth)
    const above = earth.el - horizonAt(mask, earth.az)
    const r = angularRadiusDeg(R_EARTH_KM, earth.dist)
    if (above < r + CLEAR_DEG || above > MAX_ABOVE_DEG) continue
    azElTo(frame, v[0], v[1], v[2], sun)
    const f = sunFraction(mask, sun.az, sun.el, angularRadiusDeg(R_SUN_KM, sun.dist))
    const lit = earthLit(v, [v[3], v[4], v[5]])
    // The ground is lit only with the Sun visible and above the level horizon: from a peak the Sun can be seen
    // below it, but then it barely lights the ground
    const groundLight = f * Math.min(1, Math.max(0, (sun.el + 0.5) / 2.5))
    // A full Earth over a sunlit landscape is best, the lower over the skyline the better; a crescent in the dark
    // still counts
    const score = lit * (0.4 + 0.6 * groundLight) * (1.1 - (0.1 * above) / MAX_ABOVE_DEG)
    if (score > bestScore) {
      bestScore = score
      best = { tMs: t, earthAz: earth.az, earthEl: earth.el, aboveDeg: above, lit, sun: f, sunEl: sun.el }
    }
  }
  return best
}
