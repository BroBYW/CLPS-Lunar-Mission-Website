/**
 * Time left before sunset or Earthset (or until sunrise and Earthrise): every change of the Sun's and Earth's state at
 * a site over a span, to the minute, by the same rules as the metrics (lib/metrics.ts). The Sun is down when at most
 * the darkness threshold of its disk is visible, Earth included, so an eclipse is a sunset too (and marked as one);
 * Earth is up when its centre clears the skyline by more than the margin.
 */

import { angularRadiusDeg, azElTo, Ephemeris, newAzEl, R_EARTH_KM, R_SUN_KM, type SiteFrame } from './astro.ts'
import { horizonAt } from './horizon.ts'
import type { Criteria } from './metrics.ts'
import { MINUTE_MS } from './time.ts'
import { sunFraction } from './visibility.ts'

export interface Change {
  atMs: number
  /** The state from atMs on */
  up: boolean
  /** A sunset caused by Earth covering the Sun, or the sunrise that ends one */
  eclipse: boolean
}

export interface StateChanges {
  fromMs: number
  toMs: number
  sunUp0: boolean
  earthUp0: boolean
  sun: Change[]
  earth: Change[]
}

const STEP_MS = 10 * MINUTE_MS

interface Sample {
  sunUp: boolean
  earthUp: boolean
  /** The Sun would be up without Earth in front of it */
  sunUpTerrain: boolean
}

function sampler(eph: Ephemeris, frame: SiteFrame, mask: Float32Array, c: Criteria): (t: number) => Sample {
  const v = new Float64Array(6)
  const sun = newAzEl()
  const earth = newAzEl()
  const disk = { az: 0, el: 0, radius: 0 }
  return (t) => {
    eph.sample(t, v)
    azElTo(frame, v[0], v[1], v[2], sun)
    azElTo(frame, v[3], v[4], v[5], earth)
    disk.az = earth.az
    disk.el = earth.el
    disk.radius = angularRadiusDeg(R_EARTH_KM, earth.dist)
    const r = angularRadiusDeg(R_SUN_KM, sun.dist)
    return {
      sunUp: sunFraction(mask, sun.az, sun.el, r, disk) > c.darkThreshold,
      earthUp: earth.el - horizonAt(mask, earth.az) > c.earthMarginDeg,
      sunUpTerrain: sunFraction(mask, sun.az, sun.el, r) > c.darkThreshold,
    }
  }
}

/** Every change in [fromMs, toMs): sampled every 10 minutes, then narrowed to the minute. */
export function stateChanges(eph: Ephemeris, frame: SiteFrame, mask: Float32Array, c: Criteria, fromMs: number, toMs: number): StateChanges {
  const at = sampler(eph, frame, mask, c)
  const first = at(fromMs)
  const out: StateChanges = { fromMs, toMs, sunUp0: first.sunUp, earthUp0: first.earthUp, sun: [], earth: [] }
  let prev = first
  for (let t = fromMs + STEP_MS; t < toMs + STEP_MS; t += STEP_MS) {
    const cur = at(t)
    for (const key of ['sunUp', 'earthUp'] as const) {
      if (cur[key] === prev[key]) continue
      // The first minute with the new state
      let lo = t - STEP_MS
      let hi = t
      while (hi - lo > MINUTE_MS) {
        const mid = lo + Math.round((hi - lo) / 2 / MINUTE_MS) * MINUTE_MS
        if (at(mid)[key] === cur[key]) hi = mid
        else lo = mid
      }
      if (hi >= toMs) continue
      if (key === 'sunUp') {
        // Earth is the cause when the terrain alone would leave the Sun up on the dark side of the change
        const darkSide = cur.sunUp ? at(hi - MINUTE_MS) : at(hi)
        out.sun.push({ atMs: hi, up: cur.sunUp, eclipse: darkSide.sunUpTerrain })
      } else out.earth.push({ atMs: hi, up: cur.earthUp, eclipse: false })
    }
    prev = cur
  }
  return out
}

export interface Now {
  up: boolean
  /** The next change after the moment asked, or null if none before the end of the span */
  next: Change | null
}

/** The state at tMs and the next change after it, from a list of changes that covers tMs. */
export function stateAt(changes: Change[], up0: boolean, tMs: number): Now {
  // Changes are sorted; find the first one after tMs
  let lo = 0
  let hi = changes.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (changes[mid].atMs <= tMs) lo = mid + 1
    else hi = mid
  }
  return { up: lo > 0 ? changes[lo - 1].up : up0, next: changes[lo] ?? null }
}

/** "3 d 4 h", "11 h 20 min", "25 min" */
export function fmtDuration(ms: number): string {
  const min = Math.max(0, Math.round(ms / MINUTE_MS))
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  if (d > 0) return `${d} d ${h} h`
  if (h > 0) return `${h} h ${m} min`
  return `${m} min`
}
