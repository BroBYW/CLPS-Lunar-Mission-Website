import * as Comlink from 'comlink'
import { useEffect, useRef, useState } from 'react'
import type { AppData, MastHorizons, Site } from '../data/load.ts'
import type { WindowScores } from '../lib/finder.ts'
import type { HeightGrid } from '../lib/pinHorizon.ts'
import { STEP_MS } from '../state/store.ts'
import type { MetricsWorkerApi, ScanRequest, SeriesRequest, TimedSeries } from './metrics.worker.ts'

let remote: Comlink.Remote<MetricsWorkerApi> | null = null
let ready: Promise<void> | null = null

export function initWorker(data: AppData): void {
  if (remote) return
  const worker = new Worker(new URL('./metrics.worker.ts', import.meta.url), { type: 'module' })
  remote = Comlink.wrap<MetricsWorkerApi>(worker)
  // Copies, so the main thread keeps its own buffers for per-frame drawing
  const eph = data.ephemeris.data.slice().buffer
  const hz = data.horizons.data.slice().buffer
  ready = remote.init(Comlink.transfer(eph, [eph]), data.ephemerisMeta, Comlink.transfer(hz, [hz]), data.horizonsMeta)
}

let mastReady: Promise<void> | null = null

/** Hands the mast planner's masks to the worker, once. */
export function initMastWorker(m: MastHorizons): Promise<void> {
  if (!remote || !ready) return Promise.reject(new Error('worker not started'))
  const r = remote
  mastReady ??= ready.then(() => {
    const buf = m.set.data.slice().buffer
    return r.initMast(Comlink.transfer(buf, [buf]), m.meta)
  })
  return mastReady
}

let pinReady: Promise<void> | null = null

/** Hands the pin height grid to the worker, once (its buffer moves there). */
export function initPinWorker(g: HeightGrid): Promise<void> {
  if (!remote || !ready) return Promise.reject(new Error('worker not started'))
  const r = remote
  pinReady ??= ready.then(() => r.initPin(Comlink.transfer(g.heights, [g.heights.buffer]), g.n, g.spacing, g.half))
  pinReady.catch(() => (pinReady = null))
  return pinReady
}

/** Rough horizons at a dropped pin, computed in the worker, which keeps them for that pin's series. */
export function requestPinMasks(lat: number, lon: number, heightsM: number[]): Promise<{ groundM: number; masks: Float32Array[]; computeMs: number }> {
  if (!remote || !pinReady) return Promise.reject(new Error('pin grid not loaded'))
  const r = remote
  return pinReady.then(() => r.pinMasks(lat, lon, heightsM))
}

const cache = new Map<string, Promise<TimedSeries>>()
const CACHE_SIZE = 16

export function requestSeries(req: SeriesRequest): Promise<TimedSeries> {
  const key = JSON.stringify(req)
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const wait = req.maskSet === 'mast' ? mastReady : ready
  if (!remote || !wait) return Promise.reject(new Error('worker not started'))
  const r = remote
  const p = wait.then(() => r.series(req))
  cache.set(key, p)
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!)
  p.catch(() => cache.delete(key))
  return p
}

/** Window finder scores for every site (lib/finder.ts), computed in the worker. */
export function requestScan(req: ScanRequest): Promise<WindowScores[]> {
  if (!remote || !ready) return Promise.reject(new Error('worker not started'))
  const r = remote
  return ready.then(() => r.scan(req))
}

export function seriesRequest(site: Site, heightIndex: number, heightsM: number[], startMs: number, endMs: number): SeriesRequest {
  return {
    lat: site.lat,
    lon: site.lon,
    heightM: site.height_m + heightsM[heightIndex],
    // A dropped pin (mask_index -1) uses the masks the worker cast for it
    maskIndex: Math.max(0, site.mask_index),
    heightIndex,
    startMs,
    endMs,
    stepMs: STEP_MS,
    ...(site.mask_index < 0 ? { maskSet: 'pin' as const } : {}),
  }
}

/** Several series at once (a fixed or changing list); null entries until each arrives. */
export function useManySeries(reqs: SeriesRequest[]): (TimedSeries | null)[] {
  const key = JSON.stringify(reqs)
  const [state, setState] = useState<{ key: string; list: (TimedSeries | null)[] }>({ key: '', list: [] })
  const reqRef = useRef(reqs)
  reqRef.current = reqs
  useEffect(() => {
    let live = true
    const list: (TimedSeries | null)[] = reqRef.current.map(() => null)
    reqRef.current.forEach((r, i) =>
      requestSeries(r).then((s) => {
        if (!live) return
        list[i] = s
        setState({ key, list: [...list] })
      }),
    )
    return () => {
      live = false
    }
  }, [key])
  return state.key === key ? state.list : reqs.map(() => null)
}

/** The series for a request; keeps showing the previous result while a new one computes. */
export function useSeries(req: SeriesRequest | null): { series: TimedSeries | null; pending: boolean } {
  const key = req ? JSON.stringify(req) : ''
  const [state, setState] = useState<{ key: string; series: TimedSeries | null }>({ key: '', series: null })
  const reqRef = useRef(req)
  reqRef.current = req
  useEffect(() => {
    const r = reqRef.current
    if (!r) return
    let live = true
    requestSeries(r).then(
      (series) => live && setState({ key, series }),
      () => live && setState({ key, series: null }),
    )
    return () => {
      live = false
    }
  }, [key])
  return { series: state.series, pending: state.key !== key }
}
