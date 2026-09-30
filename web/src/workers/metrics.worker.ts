/** Heavy per-sample math off the main thread (PLAN.md §3). */

import * as Comlink from 'comlink'
import { Ephemeris, siteFrame, type EphemerisMeta } from '../lib/astro.ts'
import { HorizonSet, type HorizonMeta } from '../lib/horizon.ts'
import { computeSeries, type Series } from '../lib/series.ts'

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
}

export type TimedSeries = Series & { computeMs: number }

let eph: Ephemeris | null = null
let horizons: HorizonSet | null = null

const api = {
  init(ephBuffer: ArrayBuffer, ephMeta: EphemerisMeta, hzBuffer: ArrayBuffer, hzMeta: HorizonMeta): void {
    eph = new Ephemeris(ephBuffer, ephMeta)
    horizons = new HorizonSet(hzBuffer, hzMeta)
  },
  series(r: SeriesRequest): TimedSeries {
    if (!eph || !horizons) throw new Error('worker not initialised')
    const t0 = performance.now()
    const s = computeSeries(eph, siteFrame(r.lat, r.lon, r.heightM), horizons.mask(r.maskIndex, r.heightIndex), r.startMs, r.endMs, r.stepMs)
    const out: TimedSeries = { ...s, computeMs: performance.now() - t0 }
    return Comlink.transfer(out, [s.fSun.buffer, s.earthClear.buffer, s.sunEl.buffer, s.sunDistAu.buffer])
  },
}

export type MetricsWorkerApi = typeof api
Comlink.expose(api)
