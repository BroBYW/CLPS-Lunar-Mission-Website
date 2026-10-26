/**
 * "Drop a pin": any point near the south pole becomes a temporary site, with rough horizons cast in the worker from
 * a 480 m grid (lib/pinHorizon.ts). The pin's site has mask_index -1, which routes its series to those masks.
 */

import { create } from 'zustand'
import { loadPinGrid, type Site } from '../data/load.ts'
import { fmtLatLon } from '../lib/format.ts'
import { initPinWorker, requestPinMasks } from '../workers/client.ts'
import { DEFAULT_SITE, useApp } from './store.ts'

export const PIN_ID = 'pin'
/** Pins must be close enough to the pole for 300 km rays to stay on the grid */
export const PIN_MAX_LAT = -82

export interface Pin {
  lat: number
  lon: number
  groundM: number
  /** One horizon mask per observer height, like the sites' */
  masks: Float32Array[]
}

interface PinState {
  pin: Pin | null
  /** The next map click drops a pin */
  armed: boolean
  status: 'idle' | 'loading' | 'failed'
  error: string | null
  arm: (armed: boolean) => void
  drop: (lat: number, lon: number, heightsM: number[]) => Promise<void>
  clear: () => void
}

export const usePin = create<PinState>()((set) => ({
  pin: null,
  armed: false,
  status: 'idle',
  error: null,
  arm: (armed) => set({ armed, error: null }),
  drop: async (lat, lon, heightsM) => {
    if (lat > PIN_MAX_LAT) {
      set({ status: 'failed', error: `Pins must be south of ${-PIN_MAX_LAT}°S, so the 300 km horizon rays stay on the map.` })
      return
    }
    set({ status: 'loading', error: null })
    try {
      await initPinWorker(await loadPinGrid())
      const { groundM, masks } = await requestPinMasks(lat, lon, heightsM)
      set({ pin: { lat, lon, groundM, masks }, status: 'idle', armed: false })
      useApp.getState().setSite(PIN_ID)
    } catch {
      set({ status: 'failed', error: "The pin's horizon couldn't be computed. Check your connection and try again." })
    }
  },
  clear: () => {
    set({ pin: null, armed: false, error: null })
    if (useApp.getState().siteId === PIN_ID) useApp.getState().setSite(DEFAULT_SITE)
  },
}))

/** The pin as a site, so the Plan view's panels can use it like any other. */
export function pinSite(p: Pin): Site {
  return {
    id: PIN_ID,
    name: 'Dropped pin',
    group: 'pin',
    lat: p.lat,
    lon: p.lon,
    kind: 'approx',
    point: `A point you picked at ${fmtLatLon(p.lat, p.lon, 2)}`,
    source: 'Rough horizon from a 480 m LOLA grid, computed in your browser (the listed sites use 10 m maps)',
    url: 'https://pgda.gsfc.nasa.gov/products/90',
    notes:
      'Close terrain is smoothed at this scale, so treat its numbers as a first look. Pins dropped on the listed sites come within about 5 points of their sunlight, but 15 points high on the sharp summit of Malapert Massif.',
    anchor: { lat: p.lat, lon: p.lon },
    height_m: p.groundM,
    dem_10m_radius_km: 0,
    mask_index: -1,
  }
}
