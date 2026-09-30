import { Ephemeris, type EphemerisMeta } from '../lib/astro.ts'
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
  horizons: HorizonSet
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
    horizons: new HorizonSet(hBin, hMeta),
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
