/** Heavy per-sample math off the main thread (PLAN.md §3). */

import * as Comlink from 'comlink'
import { Ephemeris, siteFrame, type EphemerisMeta } from '../lib/astro.ts'
import { scanWindows, type WindowScores } from '../lib/finder.ts'
import { HorizonSet, type HorizonMeta } from '../lib/horizon.ts'
import type { Criteria } from '../lib/metrics.ts'
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
  /** Use the mast planner's masks (2–50 m) instead of the app's 2 m and 10 m ones */
  maskSet?: 'mast'
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

const api = {
  init(ephBuffer: ArrayBuffer, ephMeta: EphemerisMeta, hzBuffer: ArrayBuffer, hzMeta: HorizonMeta): void {
    eph = new Ephemeris(ephBuffer, ephMeta)
    horizons = new HorizonSet(hzBuffer, hzMeta)
  },
  initMast(hzBuffer: ArrayBuffer, hzMeta: HorizonMeta): void {
    mastHorizons = new HorizonSet(hzBuffer, hzMeta)
  },
  series(r: SeriesRequest): TimedSeries {
    const set = r.maskSet === 'mast' ? mastHorizons : horizons
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
