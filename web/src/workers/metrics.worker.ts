/** Heavy per-sample math off the main thread (PLAN.md §3). */

import * as Comlink from 'comlink'
import { Ephemeris, siteFrame, type EphemerisMeta } from '../lib/astro.ts'
import { scanWindows, type WindowScores } from '../lib/finder.ts'
import { HorizonSet, type HorizonMeta } from '../lib/horizon.ts'
import type { Criteria } from '../lib/metrics.ts'
import { castHorizon, PIN_AZ_COUNT, type HeightGrid } from '../lib/pinHorizon.ts'
import { computeSeries, type Series } from '../lib/series.ts'
import { DAY_MS } from '../lib/time.ts'

export interface SeriesRequest {
  lat: number
  lon: number
  /** Terrain height plus observer height, metres above the 1737.4 km sphere */
  heightM: number
  maskIndex: number
  heightIndex: number
  startMs: number
  endMs: number
  stepMs: number
  /** Use the mast planner's masks (2–50 m), or a dropped pin's, instead of the app's 2 m and 10 m ones */
  maskSet?: 'mast' | 'pin'
}

export type TimedSeries = Series & { computeMs: number }

/** Window finder: missions of lengthDays starting on each of `days` days from startMs, at every site. */
export interface ScanRequest {
  sites: { lat: number; lon: number; heightM: number; maskIndex: number }[]
  heightIndex: number
  startMs: number
  days: number
  lengthDays: number
  stepMs: number
  /** No sample at or after this (the end of the ephemeris) */
  limitMs: number
  criteria: Criteria
}

let eph: Ephemeris | null = null
let horizons: HorizonSet | null = null
let mastHorizons: HorizonSet | null = null
let pinGrid: HeightGrid | null = null
/** Masks for the latest dropped pin, keyed by its position so a series request can't use another pin's */
let pin: { key: string; set: HorizonSet } | null = null
const pinKey = (lat: number, lon: number) => `${lat.toFixed(6)},${lon.toFixed(6)}`

const api = {
  init(ephBuffer: ArrayBuffer, ephMeta: EphemerisMeta, hzBuffer: ArrayBuffer, hzMeta: HorizonMeta): void {
    eph = new Ephemeris(ephBuffer, ephMeta)
    horizons = new HorizonSet(hzBuffer, hzMeta)
  },
  initMast(hzBuffer: ArrayBuffer, hzMeta: HorizonMeta): void {
    mastHorizons = new HorizonSet(hzBuffer, hzMeta)
  },
  initPin(heights: Float32Array, n: number, spacing: number, half: number): void {
    pinGrid = { n, spacing, half, heights }
  },
  /** Rough horizons at a point (lib/pinHorizon.ts), kept for that pin's series; returns the ground height and masks. */
  pinMasks(lat: number, lon: number, observerHeightsM: number[]): { groundM: number; masks: Float32Array[]; computeMs: number } {
    if (!pinGrid) throw new Error('pin grid not loaded')
    const t0 = performance.now()
    const { groundM, masks } = castHorizon(pinGrid, lat, lon, observerHeightsM)
    const all = new Float32Array(masks.length * PIN_AZ_COUNT)
    masks.forEach((m, k) => all.set(m, k * PIN_AZ_COUNT))
    pin = { key: pinKey(lat, lon), set: new HorizonSet(all.buffer, { az_step_deg: 360 / PIN_AZ_COUNT, az_count: PIN_AZ_COUNT, heights_m: observerHeightsM, sites: ['pin'] }) }
    return { groundM, masks, computeMs: performance.now() - t0 }
  },
  series(r: SeriesRequest): TimedSeries {
    const set = r.maskSet === 'mast' ? mastHorizons : r.maskSet === 'pin' ? (pin?.key === pinKey(r.lat, r.lon) ? pin.set : null) : horizons
    if (!eph || !set) throw new Error('worker not initialised')
    const t0 = performance.now()
    const s = computeSeries(eph, siteFrame(r.lat, r.lon, r.heightM), set.mask(r.maskIndex, r.heightIndex), r.startMs, r.endMs, r.stepMs)
    const out: TimedSeries = { ...s, computeMs: performance.now() - t0 }
    return Comlink.transfer(out, [s.fSun.buffer, s.earthClear.buffer, s.sunEl.buffer, s.sunDistAu.buffer])
  },
  scan(r: ScanRequest): WindowScores[] {
    if (!eph || !horizons) throw new Error('worker not initialised')
    const endMs = Math.min(r.limitMs, r.startMs + (r.days - 1 + r.lengthDays) * DAY_MS)
    const out = r.sites.map((site) => {
      const s = computeSeries(eph!, siteFrame(site.lat, site.lon, site.heightM), horizons!.mask(site.maskIndex, r.heightIndex), r.startMs, endMs, r.stepMs)
      return scanWindows(s, r.days, r.lengthDays, r.criteria)
    })
    return Comlink.transfer(
      out,
      out.flatMap((w) => Object.values(w).map((a: Float32Array) => a.buffer)),
    )
  },
}

export type MetricsWorkerApi = typeof api
Comlink.expose(api)
