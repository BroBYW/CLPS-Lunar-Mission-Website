import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { EarthGlyph, SunGlyph } from '../components/Glyphs.tsx'
import { TimeControls } from '../components/TimeControls.tsx'
import type { AppData, Site } from '../data/load.ts'
import { R_MOON_KM, siteFrame } from '../lib/astro.ts'
import { fmtDeg, fmtPct } from '../lib/format.ts'
import { horizonAt } from '../lib/horizon.ts'
import { bodiesAt } from '../lib/track.ts'
import { earthVisible, sunFraction } from '../lib/visibility.ts'
import { prefersReducedMotion } from '../state/playback.ts'
import { useApp } from '../state/store.ts'

type Loaded = typeof import('../globe/moonViewer.ts')
type Mode = 'globe' | 'flying' | 'ground'

const WALL_KM = 4

/** Great-circle destination (deg) from a site, azimuth clockwise from north. */
function dest(lat: number, lon: number, azDeg: number, distKm: number): [number, number] {
  const r = Math.PI / 180
  const d = distKm / R_MOON_KM
  const la = lat * r
  const az = azDeg * r
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(az))
  const lo2 = lon * r + Math.atan2(Math.sin(az) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2))
  return [la2 / r, lo2 / r]
}

export default function Globe3D({ data }: { data: AppData }) {
  const container = useRef<HTMLDivElement>(null)
  const api = useRef<{ mod: Loaded; mv: ReturnType<Loaded['createMoonViewer']> } | null>(null)
  const ground = useRef<{ entities: import('cesium').Entity[] }>({ entities: [] })
  const look = useRef<{ x: number; y: number; heading: number; pitch: number } | null>(null)
  const [mode, setMode] = useState<Mode>('globe')
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const siteId = useApp((s) => s.siteId)
  const setSite = useApp((s) => s.setSite)
  const timeMs = useApp((s) => s.timeMs)
  const heightIndex = useApp((s) => s.heightIndex)
  const site = data.sites.find((s) => s.id === siteId) ?? data.sites[0]
  const heightM = data.horizons.heightsM[heightIndex]
  const v6 = useRef(new Float64Array(6))

  const layer = useRef<{ select: (id: string) => void; destroy: () => void } | null>(null)

  // Create the viewer once
  useEffect(() => {
    let cancelled = false
    Promise.all([import('../globe/moonViewer.ts'), import('../globe/siteLayer.ts')])
      .then(([mod, sl]) => {
        if (cancelled || !container.current) return
        const mv = mod.createMoonViewer(container.current, { interactive: true, showBodies: true })
        api.current = { mod, mv }
        void mod.addPolarCap(mv.viewer)
        layer.current = sl.addSiteLayer(mv.viewer, data.sites, { onSelect: setSite, labelsWithinM: 1_200_000, selected: useApp.getState().siteId })
        mod.viewSouthPole(mv.viewer, 1_100_000, 35)
        setReady(true)
      })
      .catch(() => setFailed(true))
    return () => {
      cancelled = true
      layer.current?.destroy()
      layer.current = null
      api.current?.mv.destroy()
      api.current = null
    }
  }, [data, setSite])

  useEffect(() => {
    layer.current?.select(siteId)
  }, [siteId, ready])

  // Sun and Earth follow the app's time
  useEffect(() => {
    if (!api.current) return
    data.ephemeris.sample(timeMs, v6.current)
    api.current.mv.setSun(v6.current)
    api.current.mv.setEarth([v6.current[3], v6.current[4], v6.current[5]])
  }, [timeMs, ready, data])

  const clearGround = () => {
    const a = api.current
    if (!a) return
    for (const e of ground.current.entities) a.mv.viewer.entities.remove(e)
    ground.current.entities = []
    a.mv.viewer.scene.globe.show = true
    a.mv.viewer.scene.screenSpaceCameraController.enableInputs = true
  }

  const showGlobe = () => {
    const a = api.current
    if (!a) return
    clearGround()
    a.mod.viewSouthPole(a.mv.viewer, 1_100_000, 35)
    setMode('globe')
  }

  const flyToSite = (s: Site = site) => {
    const a = api.current
    if (!a) return
    clearGround()
    const { Cesium } = a.mod
    setMode('flying')
    a.mv.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(s.lon, s.lat, 90_000),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
      duration: prefersReducedMotion() ? 0 : 2.5,
      complete: () => setMode('globe'),
      cancel: () => setMode('globe'),
    })
  }

  /** Stand at the site: the computed skyline as a wall 4 km away, on a ground disk; the globe is hidden. */
  const standAtSite = () => {
    const a = api.current
    if (!a) return
    clearGround()
    const { Cesium } = a.mod
    const viewer = a.mv.viewer
    const mask = data.horizons.mask(site.mask_index, heightIndex)
    const eye = site.height_m + heightM
    const R = R_MOON_KM * 1000
    const d = WALL_KM / R_MOON_KM
    const lonlat: number[] = []
    const tops: number[] = []
    const bottoms: number[] = []
    for (let az = 0; az <= 360; az += 0.5) {
      const [la, lo] = dest(site.lat, site.lon, az, WALL_KM)
      lonlat.push(lo, la)
      // The height that appears at the horizon's elevation angle from the eye, 4 km away on the sphere
      const t = Math.tan((horizonAt(mask, az) * Math.PI) / 180)
      tops.push((R + eye) / (Math.cos(d) - Math.sin(d) * t) - R)
      // Deep enough to fill the view down to about 37° below eye level, like the panorama's silhouette
      bottoms.push(site.height_m - 3000)
    }
    const regolith = Cesium.Color.fromCssColorString('#5e5950')
    ground.current.entities.push(
      viewer.entities.add({
        wall: { positions: Cesium.Cartesian3.fromDegreesArray(lonlat), maximumHeights: tops, minimumHeights: bottoms, material: regolith },
      }),
      ...[0, 90, 180, 270].map((az, i) => {
        const [la, lo] = dest(site.lat, site.lon, az, WALL_KM - 0.2)
        return viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lo, la, tops[az * 2] + 60),
          label: { text: 'NESW'[i], font: '16px "Jost Variable", sans-serif', fillColor: Cesium.Color.fromCssColorString('#b8b2a7') },
        })
      }),
    )
    viewer.scene.globe.show = false
    viewer.scene.screenSpaceCameraController.enableInputs = false
    const b = bodiesAt(data.ephemeris, siteFrame(site.lat, site.lon, eye), timeMs)
    viewer.camera.frustum = new Cesium.PerspectiveFrustum({ fov: Cesium.Math.toRadians(75), aspectRatio: viewer.canvas.clientWidth / viewer.canvas.clientHeight, near: 1, far: 1e10 })
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(site.lon, site.lat, eye),
      orientation: { heading: Cesium.Math.toRadians(b.sunAz), pitch: Cesium.Math.toRadians(4), roll: 0 },
    })
    viewer.scene.requestRender()
    setMode('ground')
  }

  // Drag to look around while standing
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const a = api.current
    if (mode !== 'ground' || !a) return
    look.current = { x: e.clientX, y: e.clientY, heading: a.mv.viewer.camera.heading, pitch: a.mv.viewer.camera.pitch }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const a = api.current
    if (!look.current || !a) return
    const k = 0.25 * (Math.PI / 180)
    const { Cesium } = a.mod
    const cam = a.mv.viewer.camera
    cam.setView({
      destination: cam.positionWC.clone(),
      orientation: {
        heading: look.current.heading - (e.clientX - look.current.x) * k,
        pitch: Cesium.Math.clamp(look.current.pitch + (e.clientY - look.current.y) * k, Cesium.Math.toRadians(-30), Cesium.Math.toRadians(60)),
        roll: 0,
      },
    })
    a.mv.viewer.scene.requestRender()
  }
  const onPointerUp = () => {
    look.current = null
  }

  // Re-stand when the site or observer height changes while standing
  useEffect(() => {
    if (mode === 'ground') standAtSite()
  }, [siteId, heightIndex])

  const frame = siteFrame(site.lat, site.lon, site.height_m + heightM)
  const mask = data.horizons.mask(site.mask_index, heightIndex)
  const b = bodiesAt(data.ephemeris, frame, timeMs)
  const f = sunFraction(mask, b.sunAz, b.sunEl, b.sunRadius, { az: b.earthAz, el: b.earthEl, radius: b.earthRadius })
  const earthUp = earthVisible(mask, b.earthAz, b.earthEl)
  const btn = 'rounded-sm border px-3 py-1.5 text-sm backdrop-blur-sm'
  const on = 'border-bright bg-sky/60 text-bright'
  const off = 'border-regolith bg-sky/60 text-dust hover:border-dust hover:text-bright'

  return (
    <main className="px-4 py-4 lg:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-medium">3D view</h2>
          <p className="mt-1 max-w-prose text-sm text-dust">
            Fly to a site, then stand on it. The skyline around you is the computed horizon for a {heightM} m observer, so
            the Sun and Earth sink behind it exactly when the panorama and metrics say.
          </p>
        </div>
        <label className="text-sm">
          <span className="block text-xs text-dust">Site</span>
          <select value={site.id} onChange={(e) => setSite(e.target.value)} className="mt-1 rounded-sm border border-regolith bg-sky px-2 py-1">
            {data.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="relative mt-4 h-[62vh] min-h-[420px] w-full overflow-hidden rounded-sm bg-sky">
        <div
          ref={container}
          className={`absolute inset-0 ${mode === 'ground' ? 'cursor-grab active:cursor-grabbing' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-describedby="globe-desc"
        />
        <p id="globe-desc" className="sr-only">
          {`3D view of the Moon. ${mode === 'ground' ? `Standing at ${site.name}, looking around the computed skyline.` : `Globe view, ${site.name} selected.`} The status line below gives the Sun and Earth positions in words.`}
        </p>
        {!ready && !failed && <p className="absolute inset-0 flex items-center justify-center text-dust">Loading the 3D Moon…</p>}
        {failed && (
          <p role="alert" className="absolute inset-0 flex items-center justify-center p-6 text-center text-alert">
            The 3D view needs WebGL, which this browser didn't provide. The panorama in the Plan view shows the same skyline.
          </p>
        )}
        {ready && (
          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            <button type="button" className={`${btn} ${mode === 'globe' ? on : off}`} onClick={showGlobe}>
              Globe
            </button>
            <button type="button" className={`${btn} ${mode === 'flying' ? on : off}`} onClick={() => flyToSite()}>
              Fly to {site.name}
            </button>
            <button type="button" className={`${btn} ${mode === 'ground' ? on : off}`} onClick={standAtSite}>
              Stand at the site
            </button>
          </div>
        )}
        {ready && mode === 'ground' && (
          <p className="absolute bottom-3 left-3 rounded-sm bg-sky/70 px-3 py-2 text-sm text-dust backdrop-blur-sm">
            Drag to look around. The grey silhouette is the computed skyline, drawn {WALL_KM} km away.
          </p>
        )}
      </div>

      <p className="mt-3 text-sm text-dust" aria-live="polite">
        <SunGlyph className="mr-1 inline text-sun" />
        Sun {f <= 0 ? 'hidden' : f >= 1 ? 'fully visible' : `${fmtPct(f)} visible`}, azimuth {fmtDeg(b.sunAz)}, elevation {fmtDeg(b.sunEl, 2)}.
        <EarthGlyph className="ml-3 mr-1 inline text-earth" />
        Earth {earthUp ? 'in view' : 'hidden'}, azimuth {fmtDeg(b.earthAz)}, elevation {fmtDeg(b.earthEl, 2)}.
      </p>
      <TimeControls />
    </main>
  )
}
