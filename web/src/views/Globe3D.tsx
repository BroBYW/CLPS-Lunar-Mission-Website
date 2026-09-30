import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { EarthGlyph, SunGlyph } from '../components/Glyphs.tsx'
import { TimeControls } from '../components/TimeControls.tsx'
import type { AppData, Site } from '../data/load.ts'
import type { MoonViewer } from '../globe/moonViewer.ts'
import type { SiteLayer } from '../globe/siteLayer.ts'
import type { TerrainScene } from '../globe/terrainPatch.ts'
import { R_MOON_KM, siteFrame } from '../lib/astro.ts'
import { fmtDeg, fmtPct } from '../lib/format.ts'
import { horizonAt } from '../lib/horizon.ts'
import { bodiesAt } from '../lib/track.ts'
import { earthVisible, sunFraction } from '../lib/visibility.ts'
import { prefersReducedMotion } from '../state/playback.ts'
import { useApp } from '../state/store.ts'
import { TerrainShading } from '../workers/terrainClient.ts'

type ViewerMod = typeof import('../globe/moonViewer.ts')
type TerrainMod = typeof import('../globe/terrainPatch.ts')
type Mode = 'globe' | 'flying' | 'terrain' | 'ground'

/** The computed skyline is drawn this far out, beyond the rendered terrain's finer grids. */
const SKYLINE_KM = 250
const R_SUN_KM = 695_700
const FLY_ALTITUDE_M = 90_000
/** Earthshine at full Earth, as a share of full sunlight on a surface facing it. */
const EARTHSHINE = 0.07

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

interface Api {
  mod: ViewerMod
  terrainMod: TerrainMod
  mv: MoonViewer
  layer: SiteLayer
  shading: TerrainShading
}

export default function Globe3D({ data }: { data: AppData }) {
  const container = useRef<HTMLDivElement>(null)
  const api = useRef<Api | null>(null)
  const terrain = useRef<TerrainScene | null>(null)
  const loadToken = useRef(0)
  const extras = useRef<import('cesium').Entity[]>([])
  const look = useRef<{ x: number; y: number; heading: number; pitch: number } | null>(null)
  const fov = useRef(75)
  const [mode, setModeState] = useState<Mode>('globe')
  const modeRef = useRef<Mode>('globe')
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [terrainState, setTerrainState] = useState<'idle' | 'loading' | 'failed'>('idle')
  const siteId = useApp((s) => s.siteId)
  const setSite = useApp((s) => s.setSite)
  const timeMs = useApp((s) => s.timeMs)
  const heightIndex = useApp((s) => s.heightIndex)
  const site = data.sites.find((s) => s.id === siteId) ?? data.sites[0]
  const heightM = data.horizons.heightsM[heightIndex]
  const v6 = useRef(new Float64Array(6))

  const setMode = (m: Mode) => {
    modeRef.current = m
    setModeState(m)
  }

  // Create the viewer once
  useEffect(() => {
    let cancelled = false
    Promise.all([import('../globe/moonViewer.ts'), import('../globe/siteLayer.ts'), import('../globe/terrainPatch.ts')])
      .then(([mod, sl, terrainMod]) => {
        if (cancelled || !container.current) return
        const mv = mod.createMoonViewer(container.current, { interactive: true, showBodies: true })
        void mod.addPolarCap(mv.viewer)
        const layer = sl.addSiteLayer(mv.viewer, data.sites, { onSelect: setSite, labelsWithinM: 1_200_000, selected: useApp.getState().siteId })
        const shading = new TerrainShading((id, images) => {
          if (terrain.current?.siteId === id) terrain.current.setShading(images)
        })
        api.current = { mod, terrainMod, mv, layer, shading }
        if (import.meta.env.DEV) Object.assign(window, { __globe3d: api.current })
        mod.viewSouthPole(mv.viewer, 1_100_000, 35)
        setReady(true)
      })
      .catch(() => setFailed(true))
    return () => {
      cancelled = true
      const a = api.current
      api.current = null
      terrain.current?.destroy()
      terrain.current = null
      if (a) {
        a.shading.destroy()
        a.layer.destroy()
        a.mv.destroy()
      }
    }
  }, [data, setSite])

  useEffect(() => {
    api.current?.layer.select(siteId)
  }, [siteId, ready])

  /** Sunlight on the terrain for the app's current time (computed in a worker), and earthshine. */
  const shadeTerrain = () => {
    const a = api.current
    const t = terrain.current
    if (!a || !t) return
    const v = v6.current
    data.ephemeris.sample(useApp.getState().timeMs, v)
    const sunDist = Math.hypot(v[0], v[1], v[2])
    a.shading.request(v, Math.asin(R_SUN_KM / sunDist))
    // The Earth is full, seen from the Moon, when it is opposite the Sun
    const earthDist = Math.hypot(v[3], v[4], v[5])
    const cosPhase = (v[0] * v[3] + v[1] * v[4] + v[2] * v[5]) / (sunDist * earthDist)
    t.setEarthshine([v[3], v[4], v[5]], (EARTHSHINE * (1 - cosPhase)) / 2)
  }

  // Sun, Earth and terrain light follow the app's time
  useEffect(() => {
    const a = api.current
    if (!a) return
    data.ephemeris.sample(timeMs, v6.current)
    a.mv.setSun(v6.current)
    a.mv.setEarth([v6.current[3], v6.current[4], v6.current[5]], timeMs)
    if (modeRef.current === 'terrain' || modeRef.current === 'ground') shadeTerrain()
  }, [timeMs, ready, data])

  /** The terrain meshes for a site (loaded once per site), or null if a newer request replaced this one. */
  const ensureTerrain = async (s: Site): Promise<TerrainScene | null> => {
    const a = api.current
    if (!a) return null
    if (terrain.current?.siteId === s.id) return terrain.current
    const token = ++loadToken.current
    setTerrainState('loading')
    try {
      const patch = await a.terrainMod.loadPatch(s.id)
      // Let the loading note paint before the meshes are built
      await new Promise((r) => setTimeout(r, 30))
      if (token !== loadToken.current || api.current !== a) return null
      terrain.current?.destroy()
      terrain.current = a.terrainMod.addTerrain(a.mv.viewer, s.id, patch)
      a.shading.setPatch(s.id, patch)
      setTerrainState('idle')
      return terrain.current
    } catch {
      if (token === loadToken.current) setTerrainState('failed')
      return null
    }
  }

  const clearExtras = () => {
    const a = api.current
    if (!a) return
    for (const e of extras.current) a.mv.viewer.entities.remove(e)
    extras.current = []
  }

  const defaultFrustum = () => {
    const a = api.current!
    const { Cesium } = a.mod
    const canvas = a.mv.viewer.canvas
    a.mv.viewer.camera.frustum = new Cesium.PerspectiveFrustum({ fov: Math.PI / 3, aspectRatio: canvas.clientWidth / canvas.clientHeight, near: 1, far: 5e8 })
  }

  /** Back to the textured globe with every site on it. */
  const restoreGlobe = () => {
    const a = api.current
    if (!a) return
    clearExtras()
    terrain.current?.show(false)
    a.layer.show(true)
    const scene = a.mv.viewer.scene
    scene.globe.show = true
    const c = scene.screenSpaceCameraController
    c.enableInputs = true
    c.minimumZoomDistance = 1
    c.maximumZoomDistance = Number.POSITIVE_INFINITY
    defaultFrustum()
    scene.requestRender()
  }

  const showGlobe = () => {
    const a = api.current
    if (!a) return
    loadToken.current++
    restoreGlobe()
    a.mod.viewSouthPole(a.mv.viewer, 1_100_000, 35)
    setMode('globe')
  }

  /** The terrain around a site seen from above, lit and shadowed, with the camera free to move. */
  const enterTerrain = (s: Site, t: TerrainScene) => {
    const a = api.current
    if (!a) return
    const { Cesium } = a.mod
    const viewer = a.mv.viewer
    clearExtras()
    viewer.scene.globe.show = false
    a.layer.show(false)
    t.show(true)
    const c = viewer.scene.screenSpaceCameraController
    c.enableInputs = true
    c.minimumZoomDistance = Math.max(0, t.maxNearHeight) + 1500
    c.maximumZoomDistance = 600_000
    defaultFrustum()
    const bright = Cesium.Color.fromCssColorString('#ede9e1')
    extras.current.push(
      viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat, s.height_m + 20),
        point: { pixelSize: 11, color: bright, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: {
          text: s.name,
          font: '14px "Atkinson Hyperlegible Next Variable", sans-serif',
          fillColor: bright,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 4,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
          pixelOffset: new Cesium.Cartesian2(12, 0),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }),
    )
    shadeTerrain()
    viewer.scene.requestRender()
    setMode('terrain')
  }

  const flyToSite = (s: Site = site) => {
    const a = api.current
    if (!a) return
    const { Cesium } = a.mod
    restoreGlobe()
    setMode('flying')
    const load = ensureTerrain(s)
    const land = () =>
      void load.then((t) => {
        if (modeRef.current !== 'flying') return
        if (t) enterTerrain(s, t)
        else setMode('globe')
      })
    a.mv.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(s.lon, s.lat, FLY_ALTITUDE_M),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
      duration: prefersReducedMotion() ? 0 : 2.5,
      complete: land,
      cancel: () => setMode('globe'),
    })
  }

  /**
   * Stand at the site: the terrain all around, lit by the Sun at the app's time, and the computed horizon as a
   * thin line. The globe is hidden; the Sun and Earth are drawn in their true directions.
   */
  const standAtSite = async (s: Site = site) => {
    const t = await ensureTerrain(s)
    const a = api.current
    if (!t || !a) return
    const { Cesium } = a.mod
    const viewer = a.mv.viewer
    clearExtras()
    viewer.scene.globe.show = false
    a.layer.show(false)
    t.show(true)
    viewer.scene.screenSpaceCameraController.enableInputs = false

    const hIndex = useApp.getState().heightIndex
    const obs = data.horizons.heightsM[hIndex]
    const mask = data.horizons.mask(s.mask_index, hIndex)
    const eye = Math.max(s.height_m, t.centreHeight) + obs
    const R = R_MOON_KM * 1000
    const d = SKYLINE_KM / R_MOON_KM
    // The height that appears at an elevation angle from the eye, SKYLINE_KM away on the sphere
    const heightAt = (elDeg: number) => (R + eye) / (Math.cos(d) - Math.sin(d) * Math.tan((elDeg * Math.PI) / 180)) - R
    const line: number[] = []
    for (let az = 0; az <= 360; az += 0.5) {
      const [la, lo] = dest(s.lat, s.lon, az, SKYLINE_KM)
      line.push(lo, la, heightAt(horizonAt(mask, az)))
    }
    const skyline = Cesium.Color.fromCssColorString('#ede9e1')
    extras.current.push(
      viewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(line),
          width: 1.5,
          arcType: Cesium.ArcType.NONE,
          material: skyline.withAlpha(0.6),
          depthFailMaterial: skyline.withAlpha(0.6),
        },
      }),
      ...[0, 90, 180, 270].map((az, i) => {
        const [la, lo] = dest(s.lat, s.lon, az, SKYLINE_KM)
        return viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lo, la, heightAt(horizonAt(mask, az) + 1.2)),
          label: {
            text: 'NESW'[i],
            font: '16px "Jost Variable", sans-serif',
            fillColor: Cesium.Color.fromCssColorString('#b8b2a7'),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        })
      }),
    )

    const cam = viewer.camera
    const facing = modeRef.current === 'ground' ? { heading: cam.heading, pitch: cam.pitch } : null
    const b = bodiesAt(data.ephemeris, siteFrame(s.lat, s.lon, eye), useApp.getState().timeMs)
    cam.frustum = new Cesium.PerspectiveFrustum({
      fov: Cesium.Math.toRadians(fov.current),
      aspectRatio: viewer.canvas.clientWidth / viewer.canvas.clientHeight,
      near: 0.5,
      far: 1e10,
    })
    cam.setView({
      destination: Cesium.Cartesian3.fromDegrees(s.lon, s.lat, eye),
      orientation: { heading: facing?.heading ?? Cesium.Math.toRadians(b.sunAz), pitch: facing?.pitch ?? Cesium.Math.toRadians(3), roll: 0 },
    })
    shadeTerrain()
    viewer.scene.requestRender()
    setMode('ground')
  }

  /** Turn the standing view by (dHeading, dPitch) radians from a starting orientation. */
  const turn = (heading: number, pitch: number) => {
    const a = api.current
    if (!a) return
    const { Cesium } = a.mod
    const cam = a.mv.viewer.camera
    cam.setView({
      destination: cam.positionWC.clone(),
      orientation: { heading, pitch: Cesium.Math.clamp(pitch, Cesium.Math.toRadians(-40), Cesium.Math.toRadians(70)), roll: 0 },
    })
    a.mv.viewer.scene.requestRender()
  }

  const zoom = (factor: number) => {
    const a = api.current
    if (!a) return
    fov.current = Math.min(100, Math.max(6, fov.current * factor))
    const f = a.mv.viewer.camera.frustum as import('cesium').PerspectiveFrustum
    f.fov = a.mod.Cesium.Math.toRadians(fov.current)
    a.mv.viewer.scene.requestRender()
  }

  // Drag to look around while standing
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const a = api.current
    if (mode !== 'ground' || !a) return
    look.current = { x: e.clientX, y: e.clientY, heading: a.mv.viewer.camera.heading, pitch: a.mv.viewer.camera.pitch }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!look.current) return
    // Scale with the zoom so the ground follows the pointer
    const k = ((0.25 * fov.current) / 75) * (Math.PI / 180)
    turn(look.current.heading - (e.clientX - look.current.x) * k, look.current.pitch + (e.clientY - look.current.y) * k)
  }
  const onPointerUp = () => {
    look.current = null
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const a = api.current
    if (mode !== 'ground' || !a) return
    const cam = a.mv.viewer.camera
    const step = (Math.PI / 180) * Math.max(1, fov.current / 15)
    const keys: Record<string, () => void> = {
      ArrowLeft: () => turn(cam.heading - step, cam.pitch),
      ArrowRight: () => turn(cam.heading + step, cam.pitch),
      ArrowUp: () => turn(cam.heading, cam.pitch + step),
      ArrowDown: () => turn(cam.heading, cam.pitch - step),
      '+': () => zoom(0.8),
      '=': () => zoom(0.8),
      '-': () => zoom(1.25),
    }
    const action = keys[e.key]
    if (action) {
      e.preventDefault()
      action()
    }
  }

  // Scroll to zoom while standing (the page must not scroll, so the listener cannot be passive)
  useEffect(() => {
    const el = container.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (modeRef.current !== 'ground') return
      e.preventDefault()
      zoom(Math.exp(e.deltaY * 0.001))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ready])

  // Follow the site and observer height: stand again, or move over the new site's terrain
  useEffect(() => {
    const a = api.current
    if (!a) return
    if (modeRef.current === 'ground') void standAtSite(site)
    else if (modeRef.current === 'terrain') {
      void ensureTerrain(site).then((t) => {
        if (!t || modeRef.current !== 'terrain' || !api.current) return
        const { Cesium } = api.current.mod
        api.current.mv.viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(site.lon, site.lat, FLY_ALTITUDE_M),
          orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
        })
        enterTerrain(site, t)
      })
    }
  }, [siteId, heightIndex])

  const frame = siteFrame(site.lat, site.lon, site.height_m + heightM)
  const mask = data.horizons.mask(site.mask_index, heightIndex)
  const b = bodiesAt(data.ephemeris, frame, timeMs)
  const f = sunFraction(mask, b.sunAz, b.sunEl, b.sunRadius, { az: b.earthAz, el: b.earthEl, radius: b.earthRadius })
  const earthUp = earthVisible(mask, b.earthAz, b.earthEl)
  const btn = 'rounded-sm border px-3 py-1.5 text-sm backdrop-blur-sm'
  const on = 'border-bright bg-sky/60 text-bright'
  const off = 'border-regolith bg-sky/60 text-dust hover:border-dust hover:text-bright'
  const description =
    mode === 'ground'
      ? `Standing at ${site.name} on LOLA terrain, lit by the Sun at the time shown. A thin line marks the computed horizon.`
      : mode === 'terrain'
        ? `LOLA terrain within 300 km of ${site.name}, seen from above, lit by the Sun at the time shown, with shadows.`
        : `Globe view, ${site.name} selected.`

  return (
    <main className="px-4 py-4 lg:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-medium">3D view</h2>
          <p className="mt-1 max-w-prose text-sm text-dust">
            Fly to a site to see the LOLA terrain around it, lit and shadowed by the Sun at the time below, then stand
            on it. The thin line around you is the computed horizon for a {heightM} m observer. Every number in the app
            uses it, and the Sun and Earth cross it exactly when the panorama says.
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
          onKeyDown={onKeyDown}
          tabIndex={mode === 'ground' ? 0 : -1}
          aria-describedby="globe-desc"
        />
        <p id="globe-desc" className="sr-only">
          {`3D view of the Moon. ${description} ${mode === 'ground' ? 'Arrow keys look around; plus and minus zoom.' : ''} The status line below gives the Sun and Earth positions in words.`}
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
            <button type="button" className={`${btn} ${mode === 'flying' || mode === 'terrain' ? on : off}`} onClick={() => flyToSite()}>
              Fly to {site.name}
            </button>
            <button type="button" className={`${btn} ${mode === 'ground' ? on : off}`} onClick={() => void standAtSite()}>
              Stand at the site
            </button>
          </div>
        )}
        {terrainState === 'loading' && (
          <p className="absolute inset-x-0 top-1/2 mx-auto w-fit rounded-sm bg-sky/70 px-3 py-1.5 text-sm text-dust backdrop-blur-sm" role="status">
            Loading LOLA terrain…
          </p>
        )}
        {terrainState === 'failed' && (
          <p className="absolute inset-x-3 top-1/2 mx-auto w-fit rounded-sm bg-sky/70 px-3 py-1.5 text-sm text-alert backdrop-blur-sm" role="alert">
            The terrain for this site didn't load. Try again.
          </p>
        )}
      </div>
      {ready && (mode === 'terrain' || mode === 'ground') && (
        <p className="mt-2 text-xs text-dust">
          {mode === 'terrain'
            ? 'LOLA terrain to 300 km, lit by the Sun at the time below. Drag to move, scroll to zoom, Ctrl+drag to tilt.'
            : 'Drag or use the arrow keys to look around; scroll to zoom. The thin line is the computed horizon.'}
        </p>
      )}

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
