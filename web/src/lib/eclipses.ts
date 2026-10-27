/**
 * Eclipses seen from the Moon: Earth passing in front of the Sun (from Earth, a lunar eclipse). They are found in the
 * ephemeris as the times the two disks overlap seen from the Moon's centre; then, for a site, when and how much Earth
 * covers the Sun there, with the same visibility code as every other number in the app (lib/visibility.ts), so the
 * terrain counts too: a site whose Sun is behind a ridge sees none of it.
 */

import { angularRadiusDeg, azElTo, Ephemeris, newAzEl, R_EARTH_KM, R_SUN_KM, RAD, type SiteFrame } from './astro.ts'
import { HOUR_MS, MINUTE_MS } from './time.ts'
import { sunFraction } from './visibility.ts'

export interface Eclipse {
  /** Disks overlap, seen from the Moon's centre */
  startMs: number
  endMs: number
  /** Greatest overlap */
  peakMs: number
  /** Earth covers the whole Sun at greatest, seen from the Moon's centre */
  total: boolean
}

const v = new Float64Array(6)

/** Separation of the Sun's and Earth's centres and the sum of their radii (deg), seen from the Moon's centre at t. */
function overlapAt(eph: Ephemeris, t: number): { sep: number; sum: number; diff: number } {
  eph.sample(t, v)
  const s = Math.hypot(v[0], v[1], v[2])
  const e = Math.hypot(v[3], v[4], v[5])
  const cos = (v[0] * v[3] + v[1] * v[4] + v[2] * v[5]) / (s * e)
  const sep = Math.acos(Math.min(1, Math.max(-1, cos))) * RAD
  const rs = angularRadiusDeg(R_SUN_KM, s)
  const re = angularRadiusDeg(R_EARTH_KM, e)
  return { sep, sum: rs + re, diff: re - rs }
}

/** Every eclipse in [fromMs, toMs), to the minute. */
export function findEclipses(eph: Ephemeris, fromMs: number, toMs: number): Eclipse[] {
  const out: Eclipse[] = []
  // Earth moves across the Sun at about 0.5° an hour, so hourly samples with a 1° margin miss nothing
  for (let t = fromMs; t < toMs; t += HOUR_MS) {
    const o = overlapAt(eph, t)
    if (o.sep > o.sum + 1) continue
    let start = NaN
    let end = NaN
    let peak = t
    let best = Infinity
    let total = false
    for (let m = t; m < Math.min(toMs, t + 12 * HOUR_MS); m += MINUTE_MS) {
      const q = overlapAt(eph, m)
      if (q.sep < q.sum) {
        if (Number.isNaN(start)) start = m
        end = m + MINUTE_MS
        if (q.sep < best) {
          best = q.sep
          peak = m
          total = q.sep <= q.diff
        }
      } else if (!Number.isNaN(start)) break
    }
    if (!Number.isNaN(start)) out.push({ startMs: start, endMs: end, peakMs: peak, total })
    // Skip past this one
    t = Number.isNaN(end) ? t + 12 * HOUR_MS : end
  }
  return out
}

export interface SiteEclipse {
  /** The Sun is above the terrain at some point while Earth crosses it */
  visible: boolean
  /** Earth starts and stops covering part of the visible Sun */
  dimMs: number
  undimMs: number
  /** Earth hides all of the Sun that the terrain leaves (NaN if it never does) */
  hiddenMs: number
  backMs: number
  /** Least of the Sun visible, 0–1 */
  minFraction: number
}

/** When and how much Earth covers the Sun at a site, minute by minute through the eclipse. */
export function siteEclipse(eph: Ephemeris, frame: SiteFrame, mask: Float32Array, e: Eclipse): SiteEclipse {
  const sun = newAzEl()
  const earth = newAzEl()
  const disk = { az: 0, el: 0, radius: 0 }
  const out: SiteEclipse = { visible: false, dimMs: NaN, undimMs: NaN, hiddenMs: NaN, backMs: NaN, minFraction: 1 }
  // A site's view shifts Earth by up to a quarter of a degree, so look a little either side of the centre's times
  for (let t = e.startMs - HOUR_MS; t <= e.endMs + HOUR_MS; t += MINUTE_MS) {
    eph.sample(t, v)
    azElTo(frame, v[0], v[1], v[2], sun)
    azElTo(frame, v[3], v[4], v[5], earth)
    const r = angularRadiusDeg(R_SUN_KM, sun.dist)
    const terrain = sunFraction(mask, sun.az, sun.el, r)
    if (terrain <= 0) continue
    out.visible = true
    disk.az = earth.az
    disk.el = earth.el
    disk.radius = angularRadiusDeg(R_EARTH_KM, earth.dist)
    const both = sunFraction(mask, sun.az, sun.el, r, disk)
    out.minFraction = Math.min(out.minFraction, both)
    if (both < terrain - 1e-6) {
      if (Number.isNaN(out.dimMs)) out.dimMs = t
      out.undimMs = t + MINUTE_MS
    }
    if (both <= 0) {
      if (Number.isNaN(out.hiddenMs)) out.hiddenMs = t
      out.backMs = t + MINUTE_MS
    }
  }
  return out
}
