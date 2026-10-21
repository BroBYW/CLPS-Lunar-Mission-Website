import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import type { Ephemeris } from '../lib/astro.ts'
import { DAY_MS } from '../lib/time.ts'
import { prefersReducedMotion } from '../state/playback.ts'

export interface MoonBackdropHandle {
  /** Fly down to the south pole; resolves when the flight ends (at once with reduced motion). */
  flyToPole: () => Promise<void>
  /** Sweep the sunlight through one lunar day in about ten seconds. */
  playMonth: () => void
}

type Loaded = typeof import('../globe/moonViewer.ts')

/** The home page backdrop: a slowly turning 3D Moon lit by the Sun at `timeMs`. Loads Cesium lazily. */
export function MoonBackdrop({ ephemeris, timeMs, ref }: { ephemeris: Ephemeris; timeMs: number; ref?: Ref<MoonBackdropHandle> }) {
  const container = useRef<HTMLDivElement>(null)
  const api = useRef<{ mod: Loaded; mv: ReturnType<Loaded['createMoonViewer']> } | null>(null)
  const sweep = useRef<number | null>(null)
  const flight = useRef<number | null>(null)
  const [ready, setReady] = useState(false)
  /** The "Let's start" flight: the Moon recentres while the camera pushes in, then fades out. */
  const [leaving, setLeaving] = useState<'no' | 'flying' | 'fading'>('no')
  const v = useRef(new Float64Array(6))

  const light = (t: number) => {
    const a = api.current
    if (!a) return
    ephemeris.sample(t, v.current)
    a.mv.setSun(v.current)
  }

  useEffect(() => {
    let cancelled = false
    let raf = 0
    import('../globe/moonViewer.ts')
      .then((mod) => {
        if (cancelled || !container.current) return
        const mv = mod.createMoonViewer(container.current, { interactive: false, showBodies: false, model: true })
        mv.viewer.cesiumWidget.creditContainer.setAttribute('style', 'display:none') // credited in the page footer
        api.current = { mod, mv }
        if (import.meta.env.DEV) (window as unknown as { __moon: unknown }).__moon = { viewer: mv.viewer, Cesium: mod.Cesium }
        // South pole toward the camera, the Sun's side partly in view
        ephemeris.sample(timeMs, v.current)
        const sunLon = (Math.atan2(v.current[1], v.current[0]) * 180) / Math.PI
        mod.viewFrom(mv.viewer, -48, sunLon - 55, 8.2e6)
        light(timeMs)
        mv.ready.then(() => !cancelled && setReady(true)).catch(() => {
          /* the model failed to load: the static backdrop stays */
        })
        if (!prefersReducedMotion()) {
          let last = performance.now()
          const spin = (now: number) => {
            const dt = (now - last) / 1000
            last = now
            if (!document.hidden && !mv.viewer.isDestroyed() && flight.current === null) {
              mv.viewer.camera.rotate(mod.Cesium.Cartesian3.UNIT_Z, -0.02 * dt)
              mv.viewer.scene.requestRender()
            }
            raf = requestAnimationFrame(spin)
          }
          raf = requestAnimationFrame(spin)
        }
      })
      .catch(() => {
        /* WebGL or network unavailable: the static backdrop stays */
      })
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      if (sweep.current) cancelAnimationFrame(sweep.current)
      if (flight.current) cancelAnimationFrame(flight.current)
      api.current?.mv.destroy()
      api.current = null
    }
    // The viewer is created once; later time changes go through light()
  }, [])

  useEffect(() => {
    if (sweep.current === null) light(timeMs)
  }, [timeMs])

  useImperativeHandle(ref, () => ({
    flyToPole: () =>
      new Promise<void>((resolve) => {
        const a = api.current
        if (!a || prefersReducedMotion() || flight.current !== null) return resolve()
        const { Cartesian3 } = a.mod.Cesium
        const viewer = a.mv.viewer
        const cam = viewer.camera
        // Push in along the line to the pole, so it never leaves the view, turning to face it on the way. The
        // distance shrinks exponentially (a steady zoom rate) to a tenth, where the polar region fills the view,
        // and the backdrop fades out over the last part instead of ending on a dark close-up.
        const pole = new Cartesian3(0, 0, -a.mod.Cesium.Ellipsoid.MOON.radii.z)
        const start = cam.position.clone()
        const offset = Cartesian3.subtract(start, pole, new Cartesian3())
        const toPole = Cartesian3.normalize(Cartesian3.negate(offset, new Cartesian3()), new Cartesian3())
        const dir0 = cam.direction.clone()
        const up0 = cam.up.clone()
        const DURATION_MS = 1800
        const FADE_AT = 0.6
        const END = 0.1
        const t0 = performance.now()
        setLeaving('flying')
        // Quadratic ease, short on the way in (a click gets a visible response at once) and long on the way out.
        // The two halves meet at f = A with the same value and slope.
        const A = 0.35
        const ease = (f: number) => (f < A ? (f * f) / A : 1 - (1 - f) ** 2 / (1 - A))
        const step = (now: number) => {
          if (viewer.isDestroyed()) return resolve()
          const f = Math.min(1, (now - t0) / DURATION_MS)
          const e = ease(f)
          Cartesian3.add(pole, Cartesian3.multiplyByScalar(offset, END ** e, new Cartesian3()), cam.position)
          const k = Math.min(1, e / 0.6)
          const direction = Cartesian3.normalize(Cartesian3.lerp(dir0, toPole, k * k * (3 - 2 * k), new Cartesian3()), new Cartesian3())
          const up = Cartesian3.subtract(up0, Cartesian3.multiplyByScalar(direction, Cartesian3.dot(up0, direction), new Cartesian3()), new Cartesian3())
          cam.setView({ destination: cam.position, orientation: { direction, up: Cartesian3.normalize(up, up) } })
          viewer.scene.requestRender()
          if (f >= FADE_AT) setLeaving('fading')
          if (f < 1) flight.current = requestAnimationFrame(step)
          else {
            flight.current = null
            resolve()
          }
        }
        flight.current = requestAnimationFrame(step)
      }),
    playMonth: () => {
      if (!api.current || sweep.current !== null) return
      const start = performance.now()
      const span = 29.53 * DAY_MS
      const reduced = prefersReducedMotion()
      const step = (now: number) => {
        const f = Math.min(1, (now - start) / 10_000)
        light(timeMs + (reduced ? Math.floor(f * 8) / 8 : f) * span)
        if (f < 1) sweep.current = requestAnimationFrame(step)
        else {
          sweep.current = null
          light(timeMs)
        }
      }
      sweep.current = requestAnimationFrame(step)
    },
  }))

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Placeholder while Cesium loads, and the fallback without WebGL */}
      <div
        className={`absolute left-[58%] top-1/2 aspect-square h-[74vh] -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-1000 max-md:left-1/2 max-md:top-[84%] max-md:h-[52vh] ${ready ? 'opacity-0' : 'opacity-100'}`}
        style={{ background: 'radial-gradient(circle at 35% 70%, #5e5950 0%, #262420 45%, #0b0b0a 72%)' }}
      />
      {/* Off-centre beside the headline (below it on phones); the "Let's start" flight slides it to the centre */}
      <div
        ref={container}
        className={`absolute inset-y-0 w-screen ${leaving === 'no' ? 'left-[8vw] max-md:left-0 max-md:translate-y-[34vh]' : 'left-0 translate-y-0'} ${ready && leaving !== 'fading' ? 'opacity-100' : 'opacity-0'}`}
        style={{
          transition:
            leaving === 'no'
              ? 'opacity 1000ms'
              : 'left 1100ms cubic-bezier(0.65, 0, 0.35, 1), translate 1100ms cubic-bezier(0.65, 0, 0.35, 1), opacity 500ms ease-in',
        }}
      />
    </div>
  )
}
