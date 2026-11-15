import { useMemo } from 'react'
import type { AppData, Site } from '../data/load.ts'
import { siteFrame, type SiteFrame } from '../lib/astro.ts'
import { horizonAt } from '../lib/horizon.ts'
import { stateAt, stateChanges, type Now } from '../lib/nextEvents.ts'
import { bodiesAt, type Bodies } from '../lib/track.ts'
import { DAY_MS } from '../lib/time.ts'
import { sunFraction } from '../lib/visibility.ts'
import { useApp } from './store.ts'

/** Changes are worked out for 70 days from a 10-day boundary, so at least 60 days ahead of the time shown are known. */
const STRIDE_MS = 10 * DAY_MS
const SPAN_MS = 70 * DAY_MS

export interface SkyNow {
  sun: Now
  earth: Now
  /** Changes are known up to here */
  untilMs: number
}

/** The Sun's and Earth's state at the time shown, and the next change of each (lib/nextEvents.ts). */
export function useSkyNow(data: AppData, frame: SiteFrame | null, mask: Float32Array | null): SkyNow | null {
  const timeMs = useApp((s) => s.timeMs)
  const darkThreshold = useApp((s) => s.darkThreshold)
  const earthMarginDeg = useApp((s) => s.earthMarginDeg)
  const eph = data.ephemeris
  const from = Math.max(eph.startMs, Math.floor(timeMs / STRIDE_MS) * STRIDE_MS)
  const changes = useMemo(
    () => (frame && mask ? stateChanges(eph, frame, mask, { darkThreshold, earthMarginDeg }, from, Math.min(eph.endMs, from + SPAN_MS)) : null),
    [eph, frame, mask, darkThreshold, earthMarginDeg, from],
  )
  if (!changes) return null
  return { sun: stateAt(changes.sun, changes.sunUp0, timeMs), earth: stateAt(changes.earth, changes.earthUp0, timeMs), untilMs: changes.toMs }
}

export interface SiteNow {
  bodies: Bodies
  /** Visible share of the Sun with Earth in front of it, and with the terrain alone */
  sunFrac: number
  terrainFrac: number
  /** Earth's centre above the skyline, degrees */
  earthClear: number
  /** The Sun's centre above the skyline at its azimuth, degrees */
  sunClear: number
  sky: SkyNow
}

/** Everything "at the time shown" needs for a listed site (by its mask in horizons.bin), or null for none. */
export function useSiteNow(data: AppData, site: Site | null, heightIndex: number): SiteNow | null {
  const timeMs = useApp((s) => s.timeMs)
  const heightM = data.horizons.heightsM[heightIndex]
  const frame = useMemo(() => (site ? siteFrame(site.lat, site.lon, site.height_m + heightM) : null), [site, heightM])
  const mask = useMemo(() => (site && site.mask_index >= 0 ? data.horizons.mask(site.mask_index, heightIndex) : null), [data, site, heightIndex])
  const sky = useSkyNow(data, frame, mask)
  if (!frame || !mask || !sky) return null
  return { ...describeNow(data, frame, mask, timeMs), sky }
}

/** The Sun and Earth at tMs seen from a site: positions, visible shares and clearance over the skyline. */
export function describeNow(data: AppData, frame: SiteFrame, mask: Float32Array, tMs: number): Omit<SiteNow, 'sky'> {
  const b = bodiesAt(data.ephemeris, frame, tMs)
  const sunFrac = sunFraction(mask, b.sunAz, b.sunEl, b.sunRadius, { az: b.earthAz, el: b.earthEl, radius: b.earthRadius })
  const terrainFrac = sunFraction(mask, b.sunAz, b.sunEl, b.sunRadius)
  return { bodies: b, sunFrac, terrainFrac, earthClear: b.earthEl - horizonAt(mask, b.earthAz), sunClear: b.sunEl - horizonAt(mask, b.sunAz) }
}
