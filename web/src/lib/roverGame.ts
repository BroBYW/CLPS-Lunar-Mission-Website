/**
 * "Outrun the shadows": a rover on a site's terrain patch (lib/terrain.ts) while time races. Each tick moves it toward
 * the point the player chose, at its top speed, and two rays over the terrain (lib/rover.ts) say whether it is in
 * sunlight and in sight of Earth. Sunlight charges the battery; staying awake and driving drain it. Every hour with
 * the Sun on the panel and Earth in sight scores a point. The game ends when the battery runs flat or after a
 * whole lunar day.
 */

import { angularRadiusDeg, azElTo, DEG, Ephemeris, newAzEl, R_SUN_KM, siteFrame } from './astro.ts'
import { fromStereo } from './pinHorizon.ts'
import { patchHeight, rayHorizon, type XY } from './rover.ts'
import { diskAbove, type Patch } from './terrain.ts'

/** A VIPER-like rover: top speed, panel height, battery and power */
export const SPEED_KMH = 0.5
export const EYE_M = 1.5
export const BATTERY_WH = 1500
export const PANEL_W = 250
export const IDLE_W = 40
export const DRIVE_W = 60
/** One synodic month: the Sun goes once around the sky */
export const LUNAR_DAY_MS = 29.53 * 86_400_000

export interface RoverState {
  tMs: number
  x: number
  y: number
  groundM: number
  chargeWh: number
  /** Visible fraction of the Sun at the panel, and Earth above the skyline */
  sun: number
  earth: boolean
  /** Hours with the Sun on the panel (at least half of it) and Earth in sight */
  points: number
  km: number
  elapsedMs: number
  frozen: boolean
  done: boolean
}

const v = new Float64Array(6)
const sunP = newAzEl()
const earthP = newAzEl()

/** Sun and Earth seen from (x, y) at tMs. */
export function skyAt(p: Patch, eph: Ephemeris, x: number, y: number, groundM: number, tMs: number): { sun: number; sunEl: number; earth: boolean } {
  const [lat, lon] = fromStereo(x, y)
  const frame = siteFrame(lat, lon, groundM + EYE_M)
  eph.sample(tMs, v)
  azElTo(frame, v[0], v[1], v[2], sunP)
  azElTo(frame, v[3], v[4], v[5], earthP)
  const sun = diskAbove((sunP.el - rayHorizon(p, x, y, groundM, EYE_M, sunP.az)) / angularRadiusDeg(R_SUN_KM, sunP.dist))
  return { sun, sunEl: sunP.el, earth: earthP.el > rayHorizon(p, x, y, groundM, EYE_M, earthP.az) }
}

export function startRover(p: Patch, eph: Ephemeris, tMs: number): RoverState {
  const [x, y] = p.center
  const groundM = patchHeight(p, x, y)
  const sky = skyAt(p, eph, x, y, groundM, tMs)
  return { tMs, x, y, groundM, chargeWh: BATTERY_WH, sun: sky.sun, earth: sky.earth, points: 0, km: 0, elapsedMs: 0, frozen: false, done: false }
}

/**
 * Advance the game by dtMs of mission time: drive toward the target (if any), then light and charge. The rover stays
 * on the terrain the patch covers.
 */
export function roverTick(p: Patch, eph: Ephemeris, s: RoverState, target: XY | null, dtMs: number): RoverState {
  if (s.frozen || s.done) return s
  const h = dtMs / 3_600_000
  let { x, y, groundM } = s
  let moved = 0
  if (target) {
    const dx = target[0] - x
    const dy = target[1] - y
    const d = Math.hypot(dx, dy)
    const reach = Math.min(d, SPEED_KMH * 1000 * h)
    if (reach > 0.5) {
      const nx = x + (dx / d) * reach
      const ny = y + (dy / d) * reach
      const g = patchHeight(p, nx, ny)
      if (!Number.isNaN(g)) {
        x = nx
        y = ny
        groundM = g
        moved = reach
      }
    }
  }
  const tMs = s.tMs + dtMs
  const sky = skyAt(p, eph, x, y, groundM, tMs)
  // The panel tracks the Sun, like the power panel's model (lib/battery.ts)
  const inW = PANEL_W * sky.sun * Math.max(0, Math.cos(sky.sunEl * DEG))
  const outW = IDLE_W + (moved > 0 ? DRIVE_W : 0)
  const chargeWh = Math.min(BATTERY_WH, s.chargeWh + (inW - outW) * h)
  const elapsedMs = s.elapsedMs + dtMs
  return {
    tMs,
    x,
    y,
    groundM,
    chargeWh: Math.max(0, chargeWh),
    sun: sky.sun,
    earth: sky.earth,
    points: s.points + (sky.sun >= 0.5 && sky.earth ? h : 0),
    km: s.km + moved / 1000,
    elapsedMs,
    frozen: chargeWh <= 0,
    done: elapsedMs >= LUNAR_DAY_MS,
  }
}
