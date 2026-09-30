/**
 * Power and battery for a vertical, Sun-tracking panel (PLAN.md §4.6):
 *   P = 1361 W/m² × (1 AU / r)² × efficiency × area × visible fraction × cos(elevation)
 */

import { DEG, SOLAR_CONSTANT_W_M2 } from './astro.ts'
import type { Series } from './series.ts'
import { DAY_MS } from './time.ts'

export interface PowerInputs {
  areaM2: number
  efficiency: number
  loadW: number
  /** Usable share of the battery's nameplate capacity, 0–1 */
  depthOfDischarge: number
}

export interface PowerResult {
  peakW: number
  meanW: number
  meanDailyWh: number
  minDailyWh: number
  fullDays: number
  /** Smallest usable capacity that never runs empty, starting full (energy-balance simulation) */
  requiredWh: number
  requiredNameplateWh: number
  /** Load × longest darkness, for comparison */
  simpleWh: number
  /** Mean output is below the load, so the requirement grows with the length of the range */
  deficitGrows: boolean
}

export function powerAt(s: Series, i: number, p: PowerInputs): number {
  const r = s.sunDistAu[i]
  return (
    ((SOLAR_CONSTANT_W_M2 / (r * r)) * p.efficiency * p.areaM2 * s.fSun[i] * Math.cos(s.sunEl[i] * DEG)) || 0
  )
}

export function analyzePower(s: Series, p: PowerInputs, longestDarkH: number): PowerResult {
  const stepH = s.stepMs / 3_600_000
  let peak = 0
  let total = 0
  // Lindley recursion: deficit below a full battery, clipped at zero when the battery refills
  let deficit = 0
  let maxDeficit = 0
  const firstDay = Math.ceil(s.startMs / DAY_MS) * DAY_MS
  const perDay = new Map<number, number>()
  for (let i = 0; i < s.n; i++) {
    const w = powerAt(s, i, p)
    if (w > peak) peak = w
    total += w
    deficit = Math.max(0, deficit + (p.loadW - w) * stepH)
    if (deficit > maxDeficit) maxDeficit = deficit
    const t = s.startMs + i * s.stepMs
    if (t >= firstDay) {
      const day = Math.floor((t - firstDay) / DAY_MS)
      perDay.set(day, (perDay.get(day) ?? 0) + w * stepH)
    }
  }
  // Only complete UTC days count toward daily energy
  const samplesPerDay = Math.round(DAY_MS / s.stepMs)
  const lastComplete = Math.floor((s.startMs + s.n * s.stepMs - firstDay) / DAY_MS)
  const days = [...perDay.entries()].filter(([d]) => d < lastComplete).map(([, wh]) => wh)
  const meanW = s.n ? total / s.n : 0
  return {
    peakW: peak,
    meanW,
    meanDailyWh: days.length ? days.reduce((a, b) => a + b, 0) / days.length : meanW * 24,
    minDailyWh: days.length ? Math.min(...days) : meanW * 24,
    fullDays: samplesPerDay > 0 ? days.length : 0,
    requiredWh: maxDeficit,
    requiredNameplateWh: p.depthOfDischarge > 0 ? maxDeficit / p.depthOfDischarge : Infinity,
    simpleWh: p.loadW * longestDarkH,
    deficitGrows: meanW < p.loadW,
  }
}
