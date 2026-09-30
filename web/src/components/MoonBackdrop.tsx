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
  const [ready, setReady] = useState(false)
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
        const mv = mod.createMoonViewer(container.current, { interactive: false, showBodies: false })
        mv.viewer.cesiumWidget.creditContainer.setAttribute('style', 'display:none') // credited in the page footer
        api.current = { mod, mv }
        if (import.meta.env.DEV) (window as unknown as { __moon: unknown }).__moon = { viewer: mv.viewer, Cesium: mod.Cesium }
        // South pole toward the camera, the Sun's side partly in view
        ephemeris.sample(timeMs, v.current)
        const sunLon = (Math.atan2(v.current[1], v.current[0]) * 180) / Math.PI
        mod.viewFrom(mv.viewer, -48, sunLon - 55, 8.2e6)
        light(timeMs)
        setReady(true)
        if (!prefersReducedMotion()) {
          let last = performance.now()
          const spin = (now: number) => {
            const dt = (now - last) / 1000
            last = now
            if (!document.hidden && !mv.viewer.isDestroyed()) {
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
        if (!a || prefersReducedMotion()) return resolve()
        const { Cesium } = a.mod
        a.mv.viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(-137.17, -89.44, 260_000),
          orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
          duration: 2.4,
          complete: resolve,
          cancel: resolve,
        })
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
        className={`absolute left-[58%] top-1/2 aspect-square h-[74vh] -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-1000 max-md:left-1/2 ${ready ? 'opacity-0' : 'opacity-100'}`}
        style={{ background: 'radial-gradient(circle at 35% 70%, #5e5950 0%, #262420 45%, #0b0b0a 72%)' }}
      />
      <div
        ref={container}
        className={`absolute inset-y-0 left-[8vw] w-screen transition-opacity duration-1000 max-md:left-0 ${ready ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  )
}
