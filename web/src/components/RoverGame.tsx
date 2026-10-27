import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Site } from '../data/load.ts'
import type { Ephemeris } from '../lib/astro.ts'
import { fmtPct } from '../lib/format.ts'
import { toStereo } from '../lib/pinHorizon.ts'
import type { XY } from '../lib/rover.ts'
import { BATTERY_WH, LUNAR_DAY_MS, SPEED_KMH, roverTick, startRover, type RoverState } from '../lib/roverGame.ts'
import { stereoToMoonFixed, type Patch } from '../lib/terrain.ts'
import { DAY_MS, HOUR_MS, MINUTE_MS, formatUtc } from '../lib/time.ts'
import { MAX_MS, useApp } from '../state/store.ts'
import { EarthGlyph, SunGlyph } from './Glyphs.tsx'

type CesiumMod = typeof import('cesium')
type Viewer = import('cesium').Viewer

const RATES = [1, 2, 4]
/** Arrow keys send the rover this far in a map direction */
const KEY_STEP_M = 2000
/** Markers float this far above the ground so the terrain doesn't hide them */
const LIFT_M = 30

/**
 * Outrun the shadows (lib/roverGame.ts), on the 3D view's terrain: time races, the rover drives where you click (or
 * where the arrow keys send it), and it needs sunlight to keep its battery up.
 */
export function RoverGame({ Cesium, viewer, site, patch, ephemeris, inTerrain, onFly, overlay }: {
  Cesium: CesiumMod
  viewer: Viewer
  site: Site
  patch: Patch | null
  ephemeris: Ephemeris
  inTerrain: boolean
  onFly: () => void
  overlay: HTMLElement | null
}) {
  const [game, setGame] = useState<RoverState | null>(null)
  const [running, setRunning] = useState(false)
  const [rate, setRate] = useState(2)
  const [best, setBest] = useState(0)
  const pending = useApp((s) => s.roverGamePending)
  const gameRef = useRef(game)
  gameRef.current = game
  const target = useRef<XY | null>(null)
  const trail = useRef<XY[]>([])
  const wantStart = useRef(false)
  const rateId = useId()

  const start = () => {
    if (!patch || !inTerrain) {
      wantStart.current = true
      onFly()
      return
    }
    const s = useApp.getState()
    const t0 = s.timeMs
    s.setPlaying(false)
    s.setRange(t0, Math.min(MAX_MS, t0 + LUNAR_DAY_MS + DAY_MS))
    s.setTime(t0)
    target.current = null
    trail.current = [patch.center]
    setGame(startRover(patch, ephemeris, t0))
    setRunning(true)
  }
  const startRef = useRef(start)
  startRef.current = start

  // Started from the Play view, or before the terrain was ready: go once it is
  useEffect(() => {
    // Read the store itself: an effect can run twice for one request
    if (!pending || !useApp.getState().roverGamePending) return
    useApp.setState({ roverGamePending: false })
    startRef.current()
  }, [pending])
  useEffect(() => {
    if (wantStart.current && patch && inTerrain) {
      wantStart.current = false
      startRef.current()
    }
  }, [patch, inTerrain])

  // A new site or leaving the terrain view ends the game
  useEffect(() => {
    setRunning(false)
    setGame(null)
  }, [site.id])
  useEffect(() => {
    if (!inTerrain) setRunning(false)
  }, [inTerrain])

  // The clock: mission time races at `rate` hours per second, in steps of at most 10 minutes
  useEffect(() => {
    if (!running || !patch) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(1, (now - last) / 1000)
      last = now
      let s = gameRef.current
      if (!s) return
      let ms = dt * rate * HOUR_MS
      while (ms > 0 && !s.frozen && !s.done) {
        const d = Math.min(ms, 10 * MINUTE_MS)
        s = roverTick(patch, ephemeris, s, target.current, d)
        ms -= d
      }
      const lastPt = trail.current[trail.current.length - 1]
      if (!lastPt || Math.hypot(s.x - lastPt[0], s.y - lastPt[1]) > 100) trail.current.push([s.x, s.y])
      gameRef.current = s
      setGame(s)
      useApp.getState().setTime(s.tMs)
      viewer.scene.requestRender()
      if (s.frozen || s.done) {
        setRunning(false)
        setBest((b) => Math.max(b, s.points))
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [running, patch, rate, ephemeris, viewer])

  // Rover, target, trail and a line toward the Sun, drawn from refs every frame
  const active = game !== null
  useEffect(() => {
    if (!active || !patch) return
    const pos = (x: number, y: number, h: number) => {
      const v = new Float64Array(3)
      stereoToMoonFixed(x, y, h + LIFT_M, v)
      return new Cesium.Cartesian3(v[0], v[1], v[2])
    }
    const roverPos = () => {
      const s = gameRef.current
      return s ? pos(s.x, s.y, s.groundM) : Cesium.Cartesian3.ZERO
    }
    const sunVec = new Float64Array(6)
    const added = [
      viewer.entities.add({
        polyline: {
          positions: new Cesium.CallbackProperty(() => {
            const s = gameRef.current
            return s ? trail.current.map(([x, y]) => pos(x, y, s.groundM)).concat(roverPos()) : []
          }, false),
          width: 3,
          material: Cesium.Color.fromCssColorString('#ede9e1').withAlpha(0.7),
          clampToGround: false,
        },
      }),
      viewer.entities.add({
        polyline: {
          positions: new Cesium.CallbackProperty(() => {
            const s = gameRef.current
            if (!s) return []
            ephemeris.sample(s.tMs, sunVec)
            // Toward the Sun in the stereographic plane: x follows Moon-fixed y, y follows x
            const len = Math.hypot(sunVec[0], sunVec[1]) || 1
            return [pos(s.x, s.y, s.groundM), pos(s.x + (sunVec[1] / len) * 4000, s.y + (sunVec[0] / len) * 4000, s.groundM)]
          }, false),
          width: 2,
          material: Cesium.Color.fromCssColorString('#ffc53d'),
        },
      }),
      viewer.entities.add({
        position: new Cesium.CallbackProperty(() => {
          const t = target.current
          const s = gameRef.current
          return t && s ? pos(t[0], t[1], s.groundM) : Cesium.Cartesian3.ZERO
        }, false) as unknown as import('cesium').PositionProperty,
        point: { pixelSize: 10, color: Cesium.Color.TRANSPARENT, outlineColor: Cesium.Color.fromCssColorString('#5ab4ff'), outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      }),
      viewer.entities.add({
        position: new Cesium.CallbackProperty(roverPos, false) as unknown as import('cesium').PositionProperty,
        point: { pixelSize: 14, color: Cesium.Color.fromCssColorString('#5ab4ff'), outlineColor: Cesium.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      }),
    ]
    viewer.scene.requestRender()
    return () => {
      if (viewer.isDestroyed()) return
      for (const e of added) viewer.entities.remove(e)
      viewer.scene.requestRender()
    }
  }, [active, patch, Cesium, viewer, ephemeris])

  // Click or tap the terrain to drive there
  useEffect(() => {
    if (!running) return
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
    handler.setInputAction((e: { position: InstanceType<CesiumMod['Cartesian2']> }) => {
      if (!viewer.scene.pickPositionSupported) return
      const p = viewer.scene.pickPosition(e.position)
      if (!p) return
      const c = Cesium.Cartographic.fromCartesian(p, Cesium.Ellipsoid.MOON)
      target.current = toStereo(Cesium.Math.toDegrees(c.latitude), Cesium.Math.toDegrees(c.longitude))
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
    // Arrow keys: north is away from the pole, east 90° clockwise from it
    const onKey = (e: KeyboardEvent) => {
      const s = gameRef.current
      const el = e.target as HTMLElement | null
      if (!s || (el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName))) return
      const rho = Math.hypot(s.x, s.y) || 1
      const n: XY = [s.x / rho, s.y / rho]
      const dirs: Record<string, XY> = { ArrowUp: n, ArrowDown: [-n[0], -n[1]], ArrowRight: [n[1], -n[0]], ArrowLeft: [-n[1], n[0]] }
      const d = dirs[e.key]
      if (!d) return
      e.preventDefault()
      target.current = [s.x + d[0] * KEY_STEP_M, s.y + d[1] * KEY_STEP_M]
    }
    window.addEventListener('keydown', onKey)
    return () => {
      handler.destroy()
      window.removeEventListener('keydown', onKey)
    }
  }, [running, Cesium, viewer])

  const over = game && (game.frozen || game.done)
  const days = game ? game.elapsedMs / DAY_MS : 0
  const btn = 'rounded-sm border border-regolith bg-sky/70 px-2 py-1 text-sm text-dust hover:border-dust hover:text-bright'
  const hud = game && overlay
    ? createPortal(
        <div className="pointer-events-auto w-60 rounded-sm border border-shadow-2 bg-sky/80 px-3 py-2 text-sm backdrop-blur-sm" aria-live="polite">
          <p className="flex justify-between">
            <span>Day {days.toFixed(1)}</span>
            <span className="tabular text-bright">{game.points.toFixed(1)} pts</span>
          </p>
          <div className="mt-1 h-2 bg-shadow-2" role="meter" aria-label="Rover battery" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((game.chargeWh / BATTERY_WH) * 100)}>
            <div className={`h-full ${game.chargeWh / BATTERY_WH < 0.2 ? 'bg-alert' : 'bg-sun'}`} style={{ width: `${(game.chargeWh / BATTERY_WH) * 100}%` }} />
          </div>
          <p className="mt-1 text-xs">
            <SunGlyph className="mr-1 inline text-sun" />
            {game.sun <= 0 ? 'In shadow' : game.sun >= 1 ? 'In sunlight' : `${fmtPct(game.sun)} of the Sun`}
            <EarthGlyph className="ml-2 mr-1 inline text-earth" />
            {game.earth ? 'Earth in view' : 'Earth hidden'}
          </p>
          {over ? (
            <p className="mt-1 font-display text-bright">{game.frozen ? 'Battery flat: the rover froze.' : 'You made it through a whole lunar day!'}</p>
          ) : (
            <div className="mt-2 flex gap-2">
              <button type="button" className={btn} onClick={() => setRunning(!running)}>
                {running ? 'Pause' : 'Resume'}
              </button>
              <button
                type="button"
                className={btn}
                onClick={() => {
                  setRunning(false)
                  setGame(null)
                }}
              >
                Quit
              </button>
            </div>
          )}
        </div>,
        overlay,
      )
    : null

  return (
    <section aria-label="Outrun the shadows" className="mt-8">
      {hud}
      <h3 className="font-display text-lg font-medium">Outrun the shadows</h3>
      <p className="mt-1 max-w-prose text-xs text-dust">
        A game on this terrain: time races at {rate} hours per second and the low Sun drags shadows across the ground. Click or tap
        the terrain to drive your rover there ({SPEED_KMH} km/h), or use the arrow keys (up is away from the pole). Its panel needs
        sunlight to keep the battery up; every hour in sunlight with Earth in sight scores a point. The yellow line points to the
        Sun.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="rounded-sm border border-sun px-4 py-1.5 text-sm text-sun hover:bg-sun hover:text-sky" onClick={start}>
          {game ? 'Start again' : inTerrain ? 'Start' : `Fly to ${site.name} and start`}
        </button>
        <label htmlFor={rateId} className="ml-2 text-sm text-dust">
          Time
        </label>
        <select id={rateId} value={rate} onChange={(e) => setRate(Number(e.target.value))} className="rounded-sm border border-regolith bg-sky px-2 py-1 text-sm">
          {RATES.map((r) => (
            <option key={r} value={r}>
              {r} h per second
            </option>
          ))}
        </select>
      </div>
      {over && game && (
        <p className="mt-3 text-sm" aria-live="polite">
          {game.frozen ? `Your rover froze after ${days.toFixed(1)} days` : 'Your rover survived a whole lunar day'}, drove {game.km.toFixed(1)} km and
          scored <span className="text-bright tabular">{game.points.toFixed(1)}</span> points (best this visit: {Math.max(best, game.points).toFixed(1)}).
          It left at {formatUtc(game.tMs - game.elapsedMs)}.
        </p>
      )}
    </section>
  )
}
