/**
 * Rough horizons for any point near the south pole ("drop a pin"), cast in the browser from a 480 m height grid
 * (pipeline/scripts/pin_dem.py). Same geometry as the pipeline's masks (clps/horizon.py): great-circle rays every 0.1°
 * of azimuth out to 300 km, the elevation angle of each terrain sample over the sphere, and the highest one.
 */

import { R_M } from './terrain.ts'

/** n × n heights (m above the 1737.4 km sphere) on the south polar stereographic grid, row 0 at +Y, centred on the pole. */
export interface HeightGrid {
  n: number
  spacing: number
  half: number
  heights: Float32Array
}

export const PIN_AZ_COUNT = 3600
const STEP_M = 480
const MAX_M = 300_000

/** South polar stereographic metres, as the LOLA maps (x toward 90°E, y toward 0°). */
export function toStereo(latDeg: number, lonDeg: number): [number, number] {
  const la = (latDeg * Math.PI) / 180
  const lo = (lonDeg * Math.PI) / 180
  const rho = 2 * R_M * Math.tan(Math.PI / 4 + la / 2)
  return [rho * Math.sin(lo), rho * Math.cos(lo)]
}

export function fromStereo(x: number, y: number): [number, number] {
  const lat = (2 * Math.atan(Math.hypot(x, y) / (2 * R_M)) - Math.PI / 2) * (180 / Math.PI)
  return [lat, Math.atan2(x, y) * (180 / Math.PI)]
}

/** Height at stereographic x, y, bilinear; NaN off the grid. */
export function heightAt(g: HeightGrid, x: number, y: number): number {
  const fi = (x + g.half) / g.spacing
  const fj = (g.half - y) / g.spacing
  if (!(fi >= 0 && fj >= 0 && fi <= g.n - 1 && fj <= g.n - 1)) return NaN
  const i = Math.min(g.n - 2, Math.floor(fi))
  const j = Math.min(g.n - 2, Math.floor(fj))
  const ti = fi - i
  const tj = fj - j
  const k = j * g.n + i
  const h = g.heights
  const top = h[k] + (h[k + 1] - h[k]) * ti
  return top + (h[k + g.n] + (h[k + g.n + 1] - h[k + g.n]) * ti - top) * tj
}

/**
 * Horizon elevation (deg) per 0.1° azimuth bin for observers the given heights above the ground at a point, and the
 * ground height there. Rays stop where they leave the grid.
 */
export function castHorizon(g: HeightGrid, latDeg: number, lonDeg: number, observerHeightsM: number[]): { groundM: number; masks: Float32Array[] } {
  const [x0, y0] = toStereo(latDeg, lonDeg)
  const groundM = heightAt(g, x0, y0)
  if (Number.isNaN(groundM)) throw new Error('the point is outside the height grid')
  const rObs = observerHeightsM.map((h) => R_M + groundM + h)
  const masks = observerHeightsM.map(() => new Float32Array(PIN_AZ_COUNT))

  const steps = Math.floor(MAX_M / STEP_M)
  const sinD = new Float64Array(steps)
  const cosD = new Float64Array(steps)
  for (let s = 0; s < steps; s++) {
    const d = ((s + 1) * STEP_M) / R_M
    sinD[s] = Math.sin(d)
    cosD[s] = Math.cos(d)
  }
  const la = (latDeg * Math.PI) / 180
  const lo = (lonDeg * Math.PI) / 180
  const sinLa = Math.sin(la)
  const cosLa = Math.cos(la)
  const sinLo = Math.sin(lo)
  const cosLo = Math.cos(lo)
  const best = new Float64Array(observerHeightsM.length)

  for (let a = 0; a < PIN_AZ_COUNT; a++) {
    const az = (a * 2 * Math.PI) / PIN_AZ_COUNT
    const sinAz = Math.sin(az)
    const cosAz = Math.cos(az)
    best.fill(-Infinity)
    for (let s = 0; s < steps; s++) {
      // Destination on the sphere, then straight into the stereographic plane (no inverse trig per sample)
      const sinLat2 = sinLa * cosD[s] + cosLa * sinD[s] * cosAz
      const cosLat2 = Math.sqrt(Math.max(0, 1 - sinLat2 * sinLat2))
      const e = sinAz * sinD[s] * cosLa
      const f = cosD[s] - sinLa * sinLat2
      const l = Math.hypot(e, f) || 1
      const sinLon2 = sinLo * (f / l) + cosLo * (e / l)
      const cosLon2 = cosLo * (f / l) - sinLo * (e / l)
      const rho = (2 * R_M * (1 + sinLat2)) / (cosLat2 || 1e-12)
      const h = heightAt(g, rho * sinLon2, rho * cosLon2)
      if (Number.isNaN(h)) break
      const rt = R_M + h
      // tan(elevation), compared directly; the angle is taken once per ray
      for (let k = 0; k < rObs.length; k++) {
        const t = (rt * cosD[s] - rObs[k]) / (rt * sinD[s])
        if (t > best[k]) best[k] = t
      }
    }
    for (let k = 0; k < rObs.length; k++) masks[k][a] = Number.isFinite(best[k]) ? (Math.atan(best[k]) * 180) / Math.PI : -90
  }
  return { groundM, masks }
}
