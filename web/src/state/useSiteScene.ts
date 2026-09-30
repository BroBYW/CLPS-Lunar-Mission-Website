import { useMemo } from 'react'
import type { AppData, Site } from '../data/load.ts'
import { siteFrame } from '../lib/astro.ts'
import { bodiesAt, computeTrack } from '../lib/track.ts'
import { earthVisible, sunFraction } from '../lib/visibility.ts'
import { useApp } from './store.ts'

/** Everything the panorama needs for one site: mask, paths over the range, and bodies at the current time. */
export function useSiteScene(data: AppData, site: Site) {
  const startMs = useApp((s) => s.startMs)
  const endMs = useApp((s) => s.endMs)
  const timeMs = useApp((s) => s.timeMs)
  const heightIndex = useApp((s) => s.heightIndex)
  const earthMarginDeg = useApp((s) => s.earthMarginDeg)
  const heightM = data.horizons.heightsM[heightIndex]
  const frame = useMemo(() => siteFrame(site.lat, site.lon, site.height_m + heightM), [site, heightM])
  const mask = useMemo(() => data.horizons.mask(site.mask_index, heightIndex), [data, site, heightIndex])
  const track = useMemo(() => computeTrack(data.ephemeris, frame, startMs, endMs), [data, frame, startMs, endMs])
  const bodies = bodiesAt(data.ephemeris, frame, timeMs)
  const sunFrac = sunFraction(mask, bodies.sunAz, bodies.sunEl, bodies.sunRadius, {
    az: bodies.earthAz,
    el: bodies.earthEl,
    radius: bodies.earthRadius,
  })
  const earthVis = earthVisible(mask, bodies.earthAz, bodies.earthEl, earthMarginDeg)
  return { heightIndex, heightM, frame, mask, track, bodies, sunFrac, earthVis }
}
