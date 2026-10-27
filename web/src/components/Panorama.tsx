import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { azDiff, DEG } from '../lib/astro.ts'
import { compassHeading } from '../lib/compass.ts'
import { azLabel, fmtDeg, fmtPct } from '../lib/format.ts'
import { horizonAt, maskExtremes } from '../lib/horizon.ts'
import { sunFraction } from '../lib/visibility.ts'
import type { Bodies, Track } from '../lib/track.ts'
import { useElementWidth } from '../lib/useElementWidth.ts'
import { EarthGlyph, SunGlyph } from './Glyphs.tsx'

export type Follow = 'none' | 'sun' | 'earth'

interface Props {
  mask: Float32Array
  track: Track
  bodies: Bodies
  sunFrac: number
  earthVis: boolean
  /** Starting view; remount the component (change its key) to apply a new one */
  initialWidth?: number
  initialFollow?: Follow
}
interface View {
  center: number
  width: number
}

const MARGIN = { l: 40, r: 12, t: 12, b: 26 }
const MIN_WIDTH = 20
/** Length of the "Listen" sound sweep, seconds */
const SWEEP_S = 8
const Y_MIN = -5
/** Degrees of horizon a phone shows while looking around, about its camera's field of view */
const LOOK_WIDTH = 60

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const norm = (a: number) => ((a % 360) + 360) % 360

function azTickStep(w: number): number {
  if (w > 180) return 45
  if (w > 90) return 15
  if (w > 45) return 10
  return 5
}

export function Panorama({ mask, track, bodies, sunFrac, earthVis, initialWidth = 360, initialFollow = 'none' }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(wrapRef)
  const height = width < 640 ? 240 : width < 1000 ? 320 : 360
  const plotW = Math.max(50, width - MARGIN.l - MARGIN.r)
  const plotH = height - MARGIN.t - MARGIN.b
  const [view, setView] = useState<View>(() => {
    const az = initialFollow === 'sun' ? bodies.sunAz : initialFollow === 'earth' ? bodies.earthAz : 180
    return { center: initialWidth >= 360 ? 180 : norm(az), width: initialWidth }
  })
  const [follow, setFollow] = useState<Follow>(initialFollow)
  const clipId = useId()
  const terrainClipId = useId()
  const descId = useId()
  const listenId = useId()
  const lookId = useId()

  const extremes = useMemo(() => maskExtremes(mask), [mask])
  const yMax = Math.max(15, Math.ceil(extremes.max + 2))
  const pxX = plotW / view.width
  const pxY = plotH / (yMax - Y_MIN)
  const xOf = (off: number) => MARGIN.l + ((off + view.width / 2) / view.width) * plotW
  const yOf = (el: number) => MARGIN.t + ((yMax - clamp(el, Y_MIN - 2, yMax + 2)) / (yMax - Y_MIN)) * plotH

  // Keep the followed body in view without recentring on every frame
  const followAz = follow === 'sun' ? bodies.sunAz : follow === 'earth' ? bodies.earthAz : null
  useEffect(() => {
    if (followAz === null) return
    setView((v) => (Math.abs(azDiff(followAz, v.center)) > v.width * 0.3 ? { ...v, center: norm(followAz) } : v))
  }, [followAz])

  const terrainD = useMemo(() => {
    const step = Math.max(0.1, view.width / plotW)
    const base = yOf(Y_MIN - 2).toFixed(1)
    let d = `M${MARGIN.l},${base}`
    for (let off = -view.width / 2; off <= view.width / 2 + 1e-9; off += step) {
      d += `L${xOf(off).toFixed(1)},${yOf(horizonAt(mask, view.center + off)).toFixed(1)}`
    }
    return `${d}L${MARGIN.l + plotW},${base}Z`
  }, [mask, view, plotW, plotH, yMax])

  const paths = useMemo(() => {
    const build = (azs: Float32Array, els: Float32Array) => {
      let d = ''
      let prev = NaN
      let pen = false
      for (let i = 0; i < azs.length; i++) {
        const off = azDiff(azs[i], view.center)
        if (Math.abs(off) > view.width / 2) {
          pen = false
          continue
        }
        const p = `${xOf(off).toFixed(1)},${yOf(els[i]).toFixed(1)}`
        d += !pen || Math.abs(off - prev) > view.width / 2 ? `M${p}` : `L${p}`
        pen = true
        prev = off
      }
      return d
    }
    return { sun: build(track.sunAz, track.sunEl), earth: build(track.earthAz, track.earthEl) }
  }, [track, view, plotW, plotH, yMax])

  const azTicks = useMemo(() => {
    const s = azTickStep(view.width)
    const lo = Math.ceil((view.center - view.width / 2) / s) * s
    const out: number[] = []
    for (let a = lo; a <= view.center + view.width / 2 + 1e-9; a += s) out.push(a)
    return out
  }, [view])

  const elTicks: number[] = []
  for (let e = Y_MIN; e <= yMax; e += 5) elTicks.push(e)

  const disk = (az: number, el: number, r: number) => {
    const off = azDiff(az, view.center)
    if (Math.abs(off) > view.width / 2 + 3) return null
    return {
      cx: xOf(off),
      cy: yOf(el),
      rx: Math.max(1.5, (r / Math.cos(el * DEG)) * pxX),
      ry: Math.max(1.5, r * pxY),
    }
  }
  const sunDisk = disk(bodies.sunAz, bodies.sunEl, bodies.sunRadius)
  const earthDisk = disk(bodies.earthAz, bodies.earthEl, bodies.earthRadius)
  const exaggeration = pxY / pxX

  // Interaction: drag to pan, ctrl+wheel (or pinch) to zoom, keys, buttons
  const drag = useRef<{ x: number; center: number } | null>(null)
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    drag.current = { x: e.clientX, center: view.center }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return
    const center = norm(drag.current.center - (e.clientX - drag.current.x) / pxX)
    setFollow('none')
    setView((v) => ({ ...v, center }))
  }
  const onPointerUp = () => {
    drag.current = null
  }
  const svgRef = useRef<SVGSVGElement>(null)
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const frac = clamp((e.clientX - rect.left - MARGIN.l) / plotW, 0, 1) - 0.5
      setView((v) => {
        const w = clamp(v.width * Math.exp(e.deltaY * 0.004), MIN_WIDTH, 360)
        const azAt = v.center + frac * v.width
        return { width: w, center: w >= 360 ? 180 : norm(azAt - frac * w) }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [plotW])

  const zoom = (factor: number) =>
    setView((v) => {
      const w = clamp(v.width * factor, MIN_WIDTH, 360)
      return { width: w, center: w >= 360 && follow === 'none' ? 180 : v.center }
    })
  const pan = (deg: number) => {
    setFollow('none')
    setView((v) => ({ ...v, center: norm(v.center + deg) }))
  }
  const startFollow = (f: Follow) => {
    if (follow === f) {
      setFollow('none')
      return
    }
    setFollow(f)
    const az = f === 'sun' ? bodies.sunAz : bodies.earthAz
    setView((v) => ({ width: Math.min(v.width, 120), center: norm(az) }))
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') pan(-view.width / 12)
    else if (e.key === 'ArrowRight') pan(view.width / 12)
    else if (e.key === '+' || e.key === '=') zoom(1 / 1.5)
    else if (e.key === '-') zoom(1.5)
    else if (e.key === '0') {
      setFollow('none')
      setView({ center: 180, width: 360 })
    } else return
    e.preventDefault()
  }

  // Hear the horizon (lib/sonify.ts): one sweep, with a marker following it across the full panorama
  const audio = useRef<{ ctx: AudioContext; stop: () => void; raf: number } | null>(null)
  const [sweepAz, setSweepAz] = useState<number | null>(null)
  const stopListening = () => {
    const a = audio.current
    if (!a) return
    a.stop()
    cancelAnimationFrame(a.raf)
    audio.current = null
    setSweepAz(null)
  }
  const listen = async () => {
    if (audio.current) return stopListening()
    const ctx = new AudioContext()
    await ctx.resume()
    const { playSweep } = await import('../lib/sonify.ts')
    const sweep = playSweep(ctx, { mask, sunAz: bodies.sunAz, sunVisible: sunFrac > 0, earthAz: bodies.earthAz, earthVisible: earthVis, durationS: SWEEP_S })
    setFollow('none')
    setView({ center: 180, width: 360 })
    const tick = () => {
      const t = (ctx.currentTime - sweep.start) / (sweep.end - sweep.start)
      if (t >= 1) {
        stopListening()
        return
      }
      setSweepAz(Math.max(0, t) * 360)
      if (audio.current) audio.current.raf = requestAnimationFrame(tick)
    }
    audio.current = {
      ctx,
      stop: () => {
        sweep.stop()
        window.setTimeout(() => ctx.state !== 'closed' && void ctx.close(), 200)
      },
      raf: requestAnimationFrame(tick),
    }
  }
  useEffect(() => () => stopListening(), [])

  // Look around with a phone: the panorama turns with the way it faces (lib/compass.ts)
  const [compass, setCompass] = useState<'off' | 'on' | 'nodata' | 'denied'>('off')
  const compassOff = useRef<(() => void) | null>(null)
  const canCompass = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window && navigator.maxTouchPoints > 0
  const stopCompass = () => {
    compassOff.current?.()
    compassOff.current = null
    setCompass('off')
  }
  const startCompass = async () => {
    const request = (window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission
    if (typeof request === 'function') {
      try {
        if ((await request()) !== 'granted') return setCompass('denied')
      } catch {
        return setCompass('denied')
      }
    }
    let got = false
    let last = 0
    const onOrient = (e: DeviceOrientationEvent) => {
      const ios = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading
      let heading: number
      if (typeof ios === 'number' && !Number.isNaN(ios)) heading = ios
      else if ((e.absolute || e.type === 'deviceorientationabsolute') && e.alpha !== null && e.beta !== null && e.gamma !== null) heading = compassHeading(e.alpha, e.beta, e.gamma)
      else return
      got = true
      // Sensors report about 60 times a second; redraw at most 20
      const now = performance.now()
      if (now - last < 50) return
      last = now
      setFollow('none')
      setView({ center: norm(heading), width: LOOK_WIDTH })
    }
    window.addEventListener('deviceorientationabsolute', onOrient as EventListener)
    window.addEventListener('deviceorientation', onOrient)
    const timer = window.setTimeout(() => !got && setCompass('nodata'), 2000)
    compassOff.current = () => {
      window.removeEventListener('deviceorientationabsolute', onOrient as EventListener)
      window.removeEventListener('deviceorientation', onOrient)
      clearTimeout(timer)
    }
    setCompass('on')
  }
  useEffect(() => () => compassOff.current?.(), [])

  // sunFrac counts Earth too: during an eclipse, Earth rather than the terrain is what hides the Sun
  const eclipsed = sunFraction(mask, bodies.sunAz, bodies.sunEl, bodies.sunRadius) > sunFrac + 1e-6
  const sunState =
    sunFrac <= 0 ? (eclipsed ? 'hidden by Earth (an eclipse)' : 'hidden by terrain') : sunFrac >= 1 ? 'fully visible' : `${fmtPct(sunFrac)} visible${eclipsed ? ', Earth covering part of it' : ''}`
  const sunText = `Sun ${sunState}, azimuth ${fmtDeg(bodies.sunAz)}, elevation ${fmtDeg(bodies.sunEl, 2)}.`
  const earthText = `Earth ${earthVis ? 'in view' : 'hidden'}, azimuth ${fmtDeg(bodies.earthAz)}, elevation ${fmtDeg(bodies.earthEl, 2)}.`

  const btn =
    'rounded-sm border border-regolith px-2 py-1 text-sm text-dust hover:border-dust hover:text-bright aria-pressed:border-bright aria-pressed:text-bright'

  return (
    <section aria-label="Horizon panorama" className="select-none">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => zoom(1.5)} aria-label="Zoom out">
          −
        </button>
        <button type="button" className={btn} onClick={() => zoom(1 / 1.5)} aria-label="Zoom in">
          +
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => {
            setFollow('none')
            setView({ center: 180, width: 360 })
          }}
        >
          Full 360°
        </button>
        <button type="button" className={btn} aria-pressed={follow === 'sun'} onClick={() => startFollow('sun')}>
          <SunGlyph className="mr-1 inline text-sun" /> Follow Sun
        </button>
        <button type="button" className={btn} aria-pressed={follow === 'earth'} onClick={() => startFollow('earth')}>
          <EarthGlyph className="mr-1 inline text-earth" /> Follow Earth
        </button>
        <button
          type="button"
          className={btn}
          aria-pressed={sweepAz !== null}
          aria-describedby={listenId}
          onClick={() => void listen()}
        >
          {sweepAz !== null ? '■ Stop' : '♪ Listen'}
        </button>
        {canCompass && (
          <button type="button" className={btn} aria-pressed={compass === 'on'} aria-describedby={lookId} onClick={() => (compass === 'on' ? stopCompass() : void startCompass())}>
            Look around
          </button>
        )}
        <span id={lookId} className="sr-only">
          Hold your phone up and turn around: the panorama turns with it, using the phone's compass.
        </span>
        <span id={listenId} className="sr-only">
          Plays an {SWEEP_S}-second sound sweep around the horizon, clockwise from north: the pitch rises with the terrain, east
          sounds to the right. A bright chime marks the Sun and a two-note chime the Earth when they are visible; a low, muffled
          one when the terrain hides them.
        </span>
        <span className="ml-auto text-xs text-dust tabular">
          {exaggeration > 1.1 ? `Vertical scale ×${exaggeration.toFixed(1)}` : 'True proportions'}
        </span>
      </div>

      {compass === 'nodata' && <p className="mb-2 text-xs text-alert">This device didn't report a compass heading, so the panorama can't turn with it.</p>}
      {compass === 'denied' && <p className="mb-2 text-xs text-alert">Motion and orientation access wasn't allowed, so the panorama can't turn with the phone.</p>}
      {compass === 'on' && <p className="mb-2 text-xs text-dust">Hold the phone up and turn around: the panorama follows it. North is toward the lunar north, away from the pole.</p>}
      <div ref={wrapRef} className="w-full">
        <svg
          ref={svgRef}
          width={width}
          height={height}
          role="img"
          aria-describedby={descId}
          aria-label={`Horizon panorama. ${sunText} ${earthText}`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="block cursor-grab touch-pan-y active:cursor-grabbing"
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={MARGIN.l} y={MARGIN.t} width={plotW} height={plotH} />
            </clipPath>
            <clipPath id={terrainClipId}>
              <path d={terrainD} />
            </clipPath>
          </defs>
          <rect x={MARGIN.l} y={MARGIN.t} width={plotW} height={plotH} fill="var(--color-sky)" />

          <g clipPath={`url(#${clipId})`}>
            {elTicks.map((e) => (
              <line
                key={e}
                x1={MARGIN.l}
                x2={MARGIN.l + plotW}
                y1={yOf(e)}
                y2={yOf(e)}
                stroke="var(--color-regolith)"
                strokeOpacity={e === 0 ? 0.9 : 0.35}
                strokeDasharray={e === 0 ? '4 4' : undefined}
              />
            ))}
            {azTicks.map((a) => (
              <line
                key={a}
                x1={xOf(azDiff(a, view.center))}
                x2={xOf(azDiff(a, view.center))}
                y1={MARGIN.t}
                y2={MARGIN.t + plotH}
                stroke="var(--color-regolith)"
                strokeOpacity={0.25}
              />
            ))}

            {/* Paths above the terrain: the terrain fill hides the parts below the horizon */}
            <path d={paths.earth} fill="none" stroke="var(--color-earth)" strokeWidth={1.5} strokeOpacity={0.75} />
            <path d={paths.sun} fill="none" stroke="var(--color-sun)" strokeWidth={1.5} strokeOpacity={0.85} />
            {earthDisk && <ellipse {...earthDisk} fill="var(--color-earth)" />}
            {sunDisk && <ellipse {...sunDisk} fill="var(--color-sun)" />}

            <path d={terrainD} fill="var(--color-regolith)" stroke="var(--color-dust)" strokeWidth={1} />

            {/* Where the terrain blocks them: dashed, drawn only over the terrain */}
            <g clipPath={`url(#${terrainClipId})`} strokeDasharray="3 4" fill="none" strokeWidth={1.2}>
              <path d={paths.earth} stroke="var(--color-earth)" strokeOpacity={0.55} />
              <path d={paths.sun} stroke="var(--color-sun)" strokeOpacity={0.6} />
            </g>
            {sweepAz !== null && (
              <line
                x1={xOf(azDiff(sweepAz, view.center))}
                x2={xOf(azDiff(sweepAz, view.center))}
                y1={MARGIN.t}
                y2={MARGIN.t + plotH}
                stroke="var(--color-bright)"
                strokeWidth={1.5}
              />
            )}
          </g>

          {sunDisk && (
            <g transform={`translate(${clamp(sunDisk.cx, MARGIN.l + 30, MARGIN.l + plotW - 60)} ${clamp(sunDisk.cy - sunDisk.ry - 10, MARGIN.t + 10, MARGIN.t + plotH - 4)})`}>
              <text textAnchor="middle" className="fill-sun text-xs" aria-hidden="true">
                Sun {sunFrac <= 0 ? 'hidden' : sunFrac >= 1 ? '' : fmtPct(sunFrac)}
              </text>
            </g>
          )}
          {earthDisk && (
            <g transform={`translate(${clamp(earthDisk.cx, MARGIN.l + 30, MARGIN.l + plotW - 60)} ${clamp(earthDisk.cy - earthDisk.ry - 10, MARGIN.t + 10, MARGIN.t + plotH - 4)})`}>
              <text textAnchor="middle" className="fill-earth text-xs" aria-hidden="true">
                Earth{earthVis ? '' : ' hidden'}
              </text>
            </g>
          )}

          {elTicks.map((e) => (
            <text key={e} x={MARGIN.l - 6} y={yOf(e) + 4} textAnchor="end" className="fill-dust text-xs tabular">
              {e}°
            </text>
          ))}
          {azTicks.map((a) => (
            <text
              key={a}
              x={xOf(azDiff(a, view.center))}
              y={height - 8}
              textAnchor="middle"
              className={`text-xs tabular ${norm(a) % 90 === 0 ? 'fill-bright' : 'fill-dust'}`}
            >
              {azLabel(a)}
            </text>
          ))}
        </svg>
      </div>

      <Minimap mask={mask} view={view} bodies={bodies} yMax={yMax} onCenter={(c) => { setFollow('none'); setView((v) => ({ ...v, center: c })) }} width={width} />

      <p id={descId} className="mt-2 text-sm text-dust" aria-live="polite">
        <SunGlyph className="mr-1 inline text-sun" />
        {sunText} <EarthGlyph className="ml-2 mr-1 inline text-earth" />
        {earthText}
      </p>
    </section>
  )
}

function Minimap({
  mask,
  view,
  bodies,
  yMax,
  onCenter,
  width,
}: {
  mask: Float32Array
  view: View
  bodies: Bodies
  yMax: number
  onCenter: (az: number) => void
  width: number
}) {
  const h = 34
  const plotW = Math.max(50, width - MARGIN.l - MARGIN.r)
  const x = (az: number) => MARGIN.l + (norm(az) / 360) * plotW
  const y = (el: number) => 2 + ((yMax - clamp(el, Y_MIN, yMax)) / (yMax - Y_MIN)) * (h - 4)
  const d = useMemo(() => {
    let s = `M${MARGIN.l},${h}`
    for (let a = 0; a <= 360; a += 0.5) s += `L${x(a === 360 ? 359.999 : a).toFixed(1)},${y(horizonAt(mask, a)).toFixed(1)}`
    return `${s}L${MARGIN.l + plotW},${h}Z`
  }, [mask, plotW, yMax])
  const lo = norm(view.center - view.width / 2)
  const rects =
    view.width >= 360
      ? [[0, 360]]
      : lo + view.width <= 360
        ? [[lo, lo + view.width]]
        : [
            [lo, 360],
            [0, lo + view.width - 360],
          ]
  return (
    <svg
      width={width}
      height={h}
      className="mt-1 block cursor-pointer"
      aria-hidden="true"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        onCenter(norm(((e.clientX - r.left - MARGIN.l) / plotW) * 360))
      }}
    >
      <rect x={MARGIN.l} y={0} width={plotW} height={h} fill="var(--color-shadow)" />
      <path d={d} fill="var(--color-regolith)" />
      {rects.map(([a, b]) => (
        <rect key={a} x={x(a)} y={0.5} width={((b - a) / 360) * plotW} height={h - 1} fill="none" stroke="var(--color-bright)" strokeOpacity={0.7} />
      ))}
      <circle cx={x(bodies.earthAz)} cy={y(bodies.earthEl)} r={3} fill="var(--color-earth)" />
      <circle cx={x(bodies.sunAz)} cy={y(bodies.sunEl)} r={2.5} fill="var(--color-sun)" />
    </svg>
  )
}
