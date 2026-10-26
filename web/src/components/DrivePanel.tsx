import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Site } from '../data/load.ts'
import type { Ephemeris } from '../lib/astro.ts'
import { fmtHours } from '../lib/format.ts'
import { fromStereo, toStereo } from '../lib/pinHorizon.ts'
import { routeLength, simulateDrive, summarize, type XY } from '../lib/rover.ts'
import { stereoToMoonFixed, type Patch } from '../lib/terrain.ts'
import { MINUTE_MS, formatUtc } from '../lib/time.ts'
import { useApp } from '../state/store.ts'

type CesiumMod = typeof import('cesium')
type Viewer = import('cesium').Viewer

const SPEEDS = [0.2, 0.5, 1, 2]
const STEP_MS = 10 * MINUTE_MS
/** The drawn route floats this far above the terrain so it isn't hidden in it */
const LIFT_M = 4

/**
 * Rover drive in the light (lib/rover.ts): click waypoints on the 3D terrain, and see where a rover leaving at the
 * time shown would be in sunlight and in sight of Earth along the way.
 */
export function DrivePanel({ Cesium, viewer, site, patch, ephemeris }: { Cesium: CesiumMod; viewer: Viewer; site: Site; patch: Patch | null; ephemeris: Ephemeris }) {
  const timeMs = useApp((s) => s.timeMs)
  const setTime = useApp((s) => s.setTime)
  const [adding, setAdding] = useState(false)
  const [points, setPoints] = useState<XY[]>([])
  const [speed, setSpeed] = useState(0.5)
  const [departMs, setDepartMs] = useState<number | null>(null)
  const speedId = useId()

  // A new site starts a new route
  useEffect(() => {
    setPoints([])
    setAdding(false)
    setDepartMs(null)
  }, [site.id])

  const route = useMemo<XY[]>(() => (patch && points.length ? [patch.center, ...points] : []), [patch, points])
  const start = departMs ?? timeMs
  const samples = useMemo(() => (patch && route.length > 1 ? simulateDrive(patch, ephemeris, route, speed, start, STEP_MS) : []), [patch, route, speed, start, ephemeris])
  const summary = useMemo(() => (samples.length ? summarize(samples, STEP_MS) : null), [samples])

  // Clicks on the terrain add waypoints while adding is on
  const addingRef = useRef(adding)
  addingRef.current = adding
  useEffect(() => {
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
    handler.setInputAction((e: { position: InstanceType<CesiumMod['Cartesian2']> }) => {
      if (!addingRef.current || !viewer.scene.pickPositionSupported) return
      const p = viewer.scene.pickPosition(e.position)
      if (!p) return
      const c = Cesium.Cartographic.fromCartesian(p, Cesium.Ellipsoid.MOON)
      setDepartMs((d) => d ?? useApp.getState().timeMs)
      setPoints((pts) => [...pts, toStereo(Cesium.Math.toDegrees(c.latitude), Cesium.Math.toDegrees(c.longitude))])
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
    return () => handler.destroy()
  }, [Cesium, viewer])

  // The route, coloured by sunlight at each step, and the waypoints
  useEffect(() => {
    if (!samples.length) return
    const sun = Cesium.Color.fromCssColorString('#ffc53d')
    const dark = Cesium.Color.fromCssColorString('#5e5950')
    const at = (x: number, y: number, h: number) => {
      const v = new Float64Array(3)
      stereoToMoonFixed(x, y, h + LIFT_M, v)
      return new Cesium.Cartesian3(v[0], v[1], v[2])
    }
    const added: import('cesium').Entity[] = []
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1]
      const b = samples[i]
      added.push(
        viewer.entities.add({
          polyline: { positions: [at(a.x, a.y, a.groundM), at(b.x, b.y, b.groundM)], width: 4, material: a.sun > 0.5 ? sun : dark },
        }),
      )
    }
    for (const [x, y] of route) {
      added.push(viewer.entities.add({ position: at(x, y, samples[0].groundM), point: { pixelSize: 7, color: Cesium.Color.WHITE, disableDepthTestDistance: Number.POSITIVE_INFINITY } }))
    }
    viewer.scene.requestRender()
    return () => {
      if (viewer.isDestroyed()) return
      for (const e of added) viewer.entities.remove(e)
      viewer.scene.requestRender()
    }
  }, [samples, route, Cesium, viewer])

  // The rover where it is at the time shown
  const now = samples.length && timeMs >= samples[0].tMs && timeMs <= samples[samples.length - 1].tMs ? samples[Math.min(samples.length - 1, Math.round((timeMs - samples[0].tMs) / STEP_MS))] : null
  useEffect(() => {
    if (!now) return
    const v = new Float64Array(3)
    stereoToMoonFixed(now.x, now.y, now.groundM + LIFT_M, v)
    const rover = viewer.entities.add({
      position: new Cesium.Cartesian3(v[0], v[1], v[2]),
      point: { pixelSize: 12, color: Cesium.Color.fromCssColorString('#5ab4ff'), outlineColor: Cesium.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    })
    viewer.scene.requestRender()
    return () => {
      if (viewer.isDestroyed()) return
      viewer.entities.remove(rover)
      viewer.scene.requestRender()
    }
  }, [now, Cesium, viewer])

  const length = routeLength(route)
  const btn = 'rounded-sm border border-regolith px-2 py-1 text-sm text-dust hover:border-dust hover:text-bright aria-pressed:border-sun aria-pressed:text-sun disabled:opacity-40'

  return (
    <section aria-label="Rover drive" className="mt-8">
      <h3 className="font-display text-lg font-medium">Rover drive in the light</h3>
      <p className="mt-1 max-w-prose text-xs text-dust">
        Plan a drive from {site.name}: fly to the site, press Add waypoints and click the terrain. The rover leaves at the time
        shown and keeps a steady speed; every 10 minutes the app looks along the terrain toward the Sun and the Earth from
        where the rover is (its camera 2 m up). The route turns yellow where it is in sunlight.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={btn} aria-pressed={adding} disabled={!patch} onClick={() => setAdding(!adding)}>
          {adding ? 'Done adding' : 'Add waypoints'}
        </button>
        <button type="button" className={btn} disabled={!points.length} onClick={() => setPoints((p) => p.slice(0, -1))}>
          Undo
        </button>
        <button
          type="button"
          className={btn}
          disabled={!points.length}
          onClick={() => {
            setPoints([])
            setDepartMs(null)
          }}
        >
          Clear
        </button>
        <label htmlFor={speedId} className="ml-2 text-sm text-dust">
          Speed
        </label>
        <select id={speedId} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="rounded-sm border border-regolith bg-sky px-2 py-1 text-sm text-bright">
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s} km/h
            </option>
          ))}
        </select>
        {departMs !== null && (
          <button type="button" className={btn} onClick={() => setDepartMs(timeMs)}>
            Leave at the time shown
          </button>
        )}
      </div>
      {!patch && <p className="mt-2 text-xs text-dust">Fly to the site first, so its terrain is loaded.</p>}
      {adding && patch && <p className="mt-2 text-xs text-sun">Click the terrain to add waypoints; the route starts at the site.</p>}
      {summary && (
        <div className="mt-3 text-sm" aria-live="polite">
          <p>
            {(length / 1000).toFixed(1)} km in {fmtHours(summary.hours)}, leaving {formatUtc(start)}. In sunlight{' '}
            <span className="text-bright tabular">{summary.sunPct.toFixed(0)}%</span> of the drive, Earth in view{' '}
            <span className="text-bright tabular">{summary.earthPct.toFixed(0)}%</span>.{' '}
            {summary.longestShadowH > 0
              ? `Longest time in shadow: ${fmtHours(summary.longestShadowH)}, from ${summary.shadowAtKm.toFixed(1)} km along.`
              : 'It never loses the Sun.'}
          </p>
          <DriveStrip samples={samples} timeMs={timeMs} onSeek={setTime} />
          <p className="mt-1 text-xs text-dust">
            Ends at {fromStereo(...route[route.length - 1]).map((v, i) => `${Math.abs(v).toFixed(2)}°${i ? (v < 0 ? 'W' : 'E') : v < 0 ? 'S' : 'N'}`).join(', ')}. Play
            the time controls to watch the rover (blue) drive.
          </p>
        </div>
      )}
    </section>
  )
}

/** Sunlight and Earth along the drive, one column per step; click to jump to that moment. */
function DriveStrip({ samples, timeMs, onSeek }: { samples: { tMs: number; sun: number; earth: boolean }[]; timeMs: number; onSeek: (t: number) => void }) {
  const t0 = samples[0].tMs
  const t1 = samples[samples.length - 1].tMs
  const frac = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * 100
  return (
    <div
      className="relative mt-2 h-8 w-full cursor-crosshair"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        onSeek(t0 + ((e.clientX - r.left) / r.width) * (t1 - t0))
      }}
      aria-hidden="true"
    >
      <div className="absolute inset-x-0 top-0 flex h-3.5 bg-shadow">
        {samples.map((s, i) => (
          <span key={i} className="h-full flex-1" style={{ background: 'var(--color-sun)', opacity: s.sun }} />
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex h-3.5 bg-shadow">
        {samples.map((s, i) => (
          <span key={i} className="h-full flex-1" style={{ background: s.earth ? 'var(--color-earth)' : 'transparent' }} />
        ))}
      </div>
      {timeMs >= t0 && timeMs <= t1 && <span className="pointer-events-none absolute top-0 h-full w-px bg-bright" style={{ left: `${frac(timeMs)}%` }} />}
    </div>
  )
}
