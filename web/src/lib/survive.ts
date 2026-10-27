/**
 * "Survive the lunar night": a lander at a real site and date, on the app's own sunlight and Earth series. Power
 * follows the power panel's model (lib/battery.ts): a vertical panel tracking the Sun. The player buys the panel,
 * battery and mast from a fixed budget, then switches science on and off as the days go by. Science fills a store
 * that empties toward Earth whenever Earth is above the skyline; if the battery runs flat, the lander freezes.
 */

import { powerAt } from './battery.ts'
import type { Series } from './series.ts'

export interface LanderDesign {
  panelM2: number
  batteryWh: number
  mastM: number
}

export const BUDGET = 100
export const PANEL_STEPS = [0.5, 1, 1.5, 2, 2.5, 3, 4]
export const BATTERY_STEPS = [1000, 2000, 3000, 4000, 6000, 8000, 12000]
export const MASTS: { m: number; cost: number }[] = [
  { m: 2, cost: 0 },
  { m: 10, cost: 15 },
  { m: 20, cost: 30 },
]
const COST_PER_M2 = 8
const COST_PER_KWH = 4

/** Heaters, computer and radio */
export const BASE_LOAD_W = 60
export const SCIENCE_LOAD_W = 60
export const EFFICIENCY = 0.3
/** Usable share of the battery */
export const DEPTH_OF_DISCHARGE = 0.8
/** Hours of science the lander can hold before Earth comes back into view */
export const STORE_H = 48

export function designCost(d: LanderDesign): number {
  return d.panelM2 * COST_PER_M2 + (d.batteryWh / 1000) * COST_PER_KWH + (MASTS.find((m) => m.m === d.mastM)?.cost ?? 0)
}

export interface LanderState {
  /** Next sample of the series to play */
  i: number
  chargeWh: number
  /** Science hours waiting for Earth, and sent home */
  stored: number
  sent: number
  /** Science hours lost because the store was full */
  lost: number
  frozen: boolean
  /** The whole series has played */
  done: boolean
  /** Power from the panel and the load during the last step, W */
  solarW: number
  loadW: number
}

export function startState(d: LanderDesign): LanderState {
  return { i: 0, chargeWh: d.batteryWh * DEPTH_OF_DISCHARGE, stored: 0, sent: 0, lost: 0, frozen: false, done: false, solarW: 0, loadW: BASE_LOAD_W }
}

/** Play one sample of the series. */
export function step(s: LanderState, series: Series, d: LanderDesign, science: boolean): LanderState {
  if (s.frozen || s.done) return s
  const h = series.stepMs / 3_600_000
  const solarW = powerAt(series, s.i, { areaM2: d.panelM2, efficiency: EFFICIENCY, loadW: 0, depthOfDischarge: DEPTH_OF_DISCHARGE })
  const loadW = BASE_LOAD_W + (science ? SCIENCE_LOAD_W : 0)
  const charge = Math.min(d.batteryWh * DEPTH_OF_DISCHARGE, s.chargeWh + (solarW - loadW) * h)
  let { stored, sent, lost } = s
  const earth = series.earthClear[s.i] > 0
  if (earth) {
    // Everything stored goes home, and so does this step's science
    sent += stored + (science ? h : 0)
    stored = 0
  } else if (science) {
    const room = Math.max(0, STORE_H - stored)
    stored += Math.min(h, room)
    lost += Math.max(0, h - room)
  }
  const i = s.i + 1
  return { i, chargeWh: Math.max(0, charge), stored, sent, lost, frozen: charge <= 0, done: i >= series.n, solarW, loadW }
}
