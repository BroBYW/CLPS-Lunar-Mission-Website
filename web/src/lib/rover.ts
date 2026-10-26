/**
 * Rover drive in the light: a route across a site's terrain patch (lib/terrain.ts), driven at a steady speed from a
 * start time. At each step, two rays over the patch's grids, toward the Sun and toward the Earth, give the skyline in
 * those directions at the rover's position, so we know whether it is in sunlight and can see Earth.
 */

import { angularRadiusDeg, azElTo, Ephemeris, newAzEl, R_SUN_KM, siteFrame } from './astro.ts'
import { fromStereo } from './pinHorizon.ts'
import { diskAbove, R_M, type Patch } from './terrain.ts'

/** Stereographic metres (x, y), as the patch and the LOLA maps */
export type XY = [number, number]

export interface DriveSample {
  tMs: number
  x: number
  y: number
  distKm: number
  groundM: number
  /** Visible fraction of the Sun's disk at the rover (0–1) */
  sun: number
  sunEl: number
  earth: boolean
  earthEl: number
}

/** Height (m) at stereographic x, y from the finest patch grid that covers it; NaN outside the patch. */
export function patchHeight(p: Patch, x: number, y: number): number {
  const dx = x - p.center[0]
  const dy = y - p.center[1]
  for (const g of p.grids) {
    const lim = g.half_m - g.spacing_m
    if (Math.abs(dx) > lim || Math.abs(dy) > lim) continue
    const fi = (dx + g.half_m) / g.spacing_m
    const fj = (g.half_m - dy) / g.spacing_m
    const i = Math.floor(fi)
    const j = Math.floor(fj)
    const ti = fi - i
    const tj = fj - j
    const k = j * p.n + i
    const h = g.heights
    const top = h[k] + (h[k + 1] - h[k]) * ti
    return top + (h[k + p.n] + (h[k + p.n + 1] - h[k + p.n]) * ti - top) * tj
  }
  return NaN
}

/**
 * The skyline elevation (deg) seen from (x, y), eyeM above the ground there, toward azimuth azDeg (clockwise from
 * north, which near the south pole points away from it). Samples get sparser with distance, out to the patch's edge.
 */
export function rayHorizon(p: Patch, x: number, y: number, groundM: number, eyeM: number, azDeg: number): number {
  const rho = Math.hypot(x, y) || 1
  // North is straight away from the pole in the stereographic plane, east is 90° clockwise from it
  const nx = x / rho
  const ny = y / rho
  const a = (azDeg * Math.PI) / 180
  const ux = Math.cos(a) * nx + Math.sin(a) * ny
  const uy = Math.cos(a) * ny - Math.sin(a) * nx
  const rObs = R_M + groundM + eyeM
  let best = -Infinity
  for (let d = 5; d < 300_000; d += Math.min(1500, Math.max(5, d * 0.01))) {
    const h = patchHeight(p, x + ux * d, y + uy * d)
    if (Number.isNaN(h)) break
    const rt = R_M + h
    const t = (rt * Math.cos(d / R_M) - rObs) / (rt * Math.sin(d / R_M))
    if (t > best) best = t
  }
  return Number.isFinite(best) ? (Math.atan(best) * 180) / Math.PI : -90
}

/** Total length of a route, metres. */
export function routeLength(points: XY[]): number {
  let s = 0
  for (let i = 1; i < points.length; i++) s += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
  return s
}

/** The point a given distance along the route. */
export function along(points: XY[], dist: number): XY {
  let left = dist
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]
    const [bx, by] = points[i]
    const seg = Math.hypot(bx - ax, by - ay)
    if (left <= seg || i === points.length - 1) {
      const t = seg > 0 ? Math.min(1, left / seg) : 0
      return [ax + (bx - ax) * t, ay + (by - ay) * t]
    }
    left -= seg
  }
  return points[points.length - 1]
}

/** Sun and Earth at every step of a drive at speedKmh from startMs (the rover's eye eyeM above the ground). */
export function simulateDrive(p: Patch, eph: Ephemeris, points: XY[], speedKmh: number, startMs: number, stepMs: number, eyeM = 2): DriveSample[] {
  const total = routeLength(points)
  const speed = (speedKmh * 1000) / 3_600_000
  const steps = Math.max(1, Math.ceil(total / speed / stepMs))
  const v = new Float64Array(6)
  const sun = newAzEl()
  const earth = newAzEl()
  const out: DriveSample[] = []
  for (let k = 0; k <= steps; k++) {
    const tMs = startMs + k * stepMs
    const dist = Math.min(total, k * stepMs * speed)
    const [x, y] = along(points, dist)
    const groundM = patchHeight(p, x, y)
    if (Number.isNaN(groundM)) break
    const [lat, lon] = fromStereo(x, y)
    const frame = siteFrame(lat, lon, groundM + eyeM)
    eph.sample(tMs, v)
    azElTo(frame, v[0], v[1], v[2], sun)
    azElTo(frame, v[3], v[4], v[5], earth)
    const sunSky = rayHorizon(p, x, y, groundM, eyeM, sun.az)
    const earthSky = rayHorizon(p, x, y, groundM, eyeM, earth.az)
    out.push({
      tMs,
      x,
      y,
      distKm: dist / 1000,
      groundM,
      sun: diskAbove((sun.el - sunSky) / angularRadiusDeg(R_SUN_KM, sun.dist)),
      sunEl: sun.el,
      earth: earth.el > earthSky,
      earthEl: earth.el,
    })
  }
  return out
}

export interface DriveSummary {
  hours: number
  km: number
  /** Mean visible share of the Sun over the drive, % */
  sunPct: number
  earthPct: number
  /** Longest stretch fully in shadow, hours, and where it starts (km along the route) */
  longestShadowH: number
  shadowAtKm: number
}

export function summarize(s: DriveSample[], stepMs: number): DriveSummary {
  let sun = 0
  let earth = 0
  let run = 0
  let best = 0
  let bestStart = 0
  let runStart = 0
  s.forEach((d, i) => {
    sun += d.sun
    if (d.earth) earth++
    if (d.sun <= 0) {
      if (run === 0) runStart = i
      run++
      if (run > best) {
        best = run
        bestStart = runStart
      }
    } else run = 0
  })
  const n = s.length || 1
  return {
    hours: s.length > 1 ? (s[s.length - 1].tMs - s[0].tMs) / 3_600_000 : 0,
    km: s.length ? s[s.length - 1].distKm : 0,
    sunPct: (100 * sun) / n,
    earthPct: (100 * earth) / n,
    longestShadowH: (best * stepMs) / 3_600_000,
    shadowAtKm: s[bestStart]?.distKm ?? 0,
  }
}
