import { Ephemeris, type EphemerisMeta } from '../lib/astro.ts'
import type { Dsn } from '../lib/dsn.ts'
import { HorizonSet, type HorizonMeta } from '../lib/horizon.ts'

export type SiteGroup = 'artemis' | 'illumination' | 'clps' | 'contrast'

export interface Site {
  id: string
  name: string
  group: SiteGroup
  lat: number
  lon: number
  kind: 'exact' | 'approx'
  point: string
  source: string
  url: string
  notes?: string
  anchor: { lat: number; lon: number }
  footprint?: string
  footprint_lonlat?: [number, number][]
  height_m: number
  dem_10m_radius_km: number
  mask_index: number
}

export interface BasemapMeta {
  extent_m: [number, number, number, number]
  width: number
  height: number
  proj: string
}

export interface AppData {
  ephemeris: Ephemeris
  ephemerisMeta: EphemerisMeta
  horizons: HorizonSet
  horizonsMeta: HorizonMeta
  sites: Site[]
  basemap: BasemapMeta
  basemapUrl: string
}

const base = `${import.meta.env.BASE_URL}data/`

async function getJson<T>(name: string): Promise<T> {
  const r = await fetch(base + name)
  if (!r.ok) throw new Error(`Could not load ${name} (HTTP ${r.status})`)
  return (await r.json()) as T
}

async function getBinary(name: string): Promise<ArrayBuffer> {
  const r = await fetch(base + name)
  if (!r.ok) throw new Error(`Could not load ${name} (HTTP ${r.status})`)
  return r.arrayBuffer()
}

async function load(): Promise<AppData> {
  const [ephMeta, ephBin, hMeta, hBin, sites, basemap] = await Promise.all([
    getJson<EphemerisMeta>('ephemeris.json'),
    getBinary('ephemeris.bin'),
    getJson<HorizonMeta>('horizons.json'),
    getBinary('horizons.bin'),
    getJson<{ sites: Site[] }>('sites.json'),
    getJson<BasemapMeta>('basemap-south.json'),
  ])
  return {
    ephemeris: new Ephemeris(ephBin, ephMeta),
    ephemerisMeta: ephMeta,
    horizons: new HorizonSet(hBin, hMeta),
    horizonsMeta: hMeta,
    sites: sites.sites,
    basemap,
    basemapUrl: `${base}basemap-south.webp`,
  }
}

let cache: Promise<AppData> | null = null

export function loadAppData(): Promise<AppData> {
  cache ??= load()
  return cache
}

let dsnCache: Promise<Dsn> | null = null

/** Moon elevation at the three Deep Space Network complexes (scripts/dsn.py), for the contact planner. */
export function loadDsn(): Promise<Dsn> {
  dsnCache ??= (async () => {
    const [meta, bin] = await Promise.all([
      getJson<{ complexes: { name: string }[]; limit_deg: number; t0_utc: string; step_s: number; count: number }>('dsn.json'),
      getBinary('dsn.bin'),
    ])
    return { names: meta.complexes.map((c) => c.name), limitDeg: meta.limit_deg, t0Ms: Date.parse(meta.t0_utc), stepMs: meta.step_s * 1000, count: meta.count, el: new Int8Array(bin) }
  })()
  dsnCache.catch(() => (dsnCache = null))
  return dsnCache
}

/** Horizon masks for observers from 2 m to 50 m (scripts/mast_horizons.py), for the mast planner only. */
export interface MastHorizons {
  heightsM: number[]
  set: HorizonSet
  meta: HorizonMeta
}

let mastCache: Promise<MastHorizons> | null = null

export function loadMastHorizons(): Promise<MastHorizons> {
  mastCache ??= (async () => {
    const [meta, bin] = await Promise.all([getJson<HorizonMeta & { unit_deg: number }>('horizons-mast.json'), getBinary('horizons-mast.bin')])
    // Stored as int16 hundredths of a degree
    const q = new Int16Array(bin)
    const deg = new Float32Array(q.length)
    for (let i = 0; i < q.length; i++) deg[i] = q[i] * meta.unit_deg
    return { heightsM: meta.heights_m, set: new HorizonSet(deg.buffer, meta), meta }
  })()
  mastCache.catch(() => (mastCache = null))
  return mastCache
}
