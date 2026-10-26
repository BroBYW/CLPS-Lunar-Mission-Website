import { Ephemeris, type EphemerisMeta } from '../lib/astro.ts'
import type { Dsn } from '../lib/dsn.ts'
import { gunzip } from '../lib/gunzip.ts'
import type { HeightGrid } from '../lib/pinHorizon.ts'
import { decodeGrid } from '../lib/terrain.ts'
import { HorizonSet, type HorizonMeta } from '../lib/horizon.ts'

export type SiteGroup = 'artemis' | 'illumination' | 'clps' | 'contrast' | 'pin'

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

let pinCache: Promise<HeightGrid> | null = null

/** The 480 m height grid that dropped pins cast their horizons from (scripts/pin_dem.py), 4.6 MB, on demand. */
export function loadPinGrid(): Promise<HeightGrid> {
  pinCache ??= (async () => {
    const meta = await getJson<{ n: number; spacing_m: number; half_m: number; unit_m: number; base_m: number }>('pin-dem.json')
    const r = await fetch(`${base}pin-dem.bin.gz`)
    if (!r.ok) throw new Error(`Could not load pin-dem.bin.gz (HTTP ${r.status})`)
    const raw = new Int16Array(await gunzip(r))
    return { n: meta.n, spacing: meta.spacing_m, half: meta.half_m, heights: decodeGrid(raw, 0, meta.n, meta.unit_m, meta.base_m) }
  })()
  pinCache.catch(() => (pinCache = null))
  return pinCache
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

/** How often the photos and the 2 m horizon masks agreed on whether a site was sunlit (scripts/lro_photos.py). */
export interface LroTally {
  photos: number
  /** Photos that can't tell: part of the Sun visible, or light too grazing to tell sunlit ground from shadow */
  not_called: number
  lit_lit: number
  lit_dark: number
  dark_dark: number
  dark_lit: number
  agree_pct: number | null
}

export interface LroPhoto {
  frame: string
  file: string
  utc: string
  /** Toward the Sun from the Moon's centre, Moon-fixed, km */
  sun_km: [number, number, number]
  sun_el: number
  sun_az: number
  /** Visible fraction of the Sun at the site from its 2 m horizon mask, and whether the photo shows it sunlit */
  f: number
  photo_lit: boolean
  url: string
}

/** LROC Wide Angle Camera photos around each site (scripts/lro_photos.py), for the photo comparison. */
export interface LroPhotos {
  credit: string
  size: number
  pixel_m: number
  /** Photos store DN = 255·sqrt(I/F / stretch_iof) */
  stretch_iof: number
  iof_lit: number
  check: { frames: number; first: string; last: string; pixel_m: number; all: LroTally; near_skyline: LroTally }
  sites: Record<string, { origin_m: [number, number]; photos: LroPhoto[]; check: LroTally }>
}

let lroCache: Promise<LroPhotos> | null = null

export function loadLroPhotos(): Promise<LroPhotos> {
  lroCache ??= getJson<LroPhotos>('lro/photos.json')
  lroCache.catch(() => (lroCache = null))
  return lroCache
}

export const lroPhotoUrl = (file: string) => `${base}lro/${file}`

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
