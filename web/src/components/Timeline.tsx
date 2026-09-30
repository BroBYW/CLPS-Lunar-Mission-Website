import { scaleUtc } from 'd3-scale'
import { utcFormat } from 'd3-time-format'
import { useEffect, useMemo, useRef, type PointerEvent } from 'react'
import type { Criteria } from '../lib/metrics.ts'
import type { Series } from '../lib/series.ts'
import { useElementWidth } from '../lib/useElementWidth.ts'
import { useApp } from '../state/store.ts'
import { EarthGlyph, SunGlyph } from './Glyphs.tsx'

export interface TimelineRow {
  label: string
  series: Series | null
}

const ROW_H = 16
const ROW_GAP = 3
const BLOCK_GAP = 14
const LABEL_W = 132

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

function pattern(ctx: CanvasRenderingContext2D, colors: string[], dpr: number): CanvasPattern {
  const size = Math.round(6 * dpr)
  const c = document.createElement('canvas')
  c.width = c.height = size
  const p = c.getContext('2d')!
  p.lineWidth = 1.6 * dpr
  colors.forEach((color, k) => {
    p.strokeStyle = color
    const off = (k * size) / colors.length
    for (const d of [-size, 0, size]) {
      p.beginPath()
      p.moveTo(d + off, size)
      p.lineTo(d + off + size, 0)
      p.stroke()
    }
  })
  return ctx.createPattern(c, 'repeat')!
}

/** Per-column means: sunlit (mean visible fraction), Earth in view and both (share of samples). */
function aggregate(s: Series, cols: number, c: Criteria) {
  const sun = new Float32Array(cols)
  const earth = new Float32Array(cols)
  const both = new Float32Array(cols)
  for (let j = 0; j < cols; j++) {
    const a = Math.floor((j * s.n) / cols)
    const b = Math.max(a + 1, Math.floor(((j + 1) * s.n) / cols))
    let fs = 0
    let fe = 0
    let fb = 0
    for (let i = a; i < b && i < s.n; i++) {
      const f = s.fSun[i]
      const e = s.earthClear[i] > c.earthMarginDeg
      fs += f
      if (e) fe++
      if (e && f > c.darkThreshold) fb++
    }
    const k = Math.min(b, s.n) - a || 1
    sun[j] = fs / k
    earth[j] = fe / k
    both[j] = fb / k
  }
  return { sun, earth, both }
}

export function Timeline({ rows, startMs, endMs }: { rows: TimelineRow[]; startMs: number; endMs: number }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const width = useElementWidth(wrapRef)
  const plotW = Math.max(100, width - LABEL_W)
  const timeMs = useApp((s) => s.timeMs)
  const setTime = useApp((s) => s.setTime)
  const darkThreshold = useApp((s) => s.darkThreshold)
  const earthMarginDeg = useApp((s) => s.earthMarginDeg)
  const blockH = 3 * ROW_H + 2 * ROW_GAP
  const height = rows.length * blockH + (rows.length - 1) * BLOCK_GAP

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(plotW * dpr)
    canvas.height = Math.round(height * dpr)
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const sunC = css('--color-sun')
    const earthC = css('--color-earth')
    const hatch = pattern(ctx, [earthC], dpr)
    const stripes = pattern(ctx, [sunC, earthC], dpr)
    const cols = Math.max(1, Math.round(plotW * dpr))
    rows.forEach((row, r) => {
      const y0 = r * (blockH + BLOCK_GAP) * dpr
      const rh = ROW_H * dpr
      ctx.fillStyle = css('--color-shadow')
      for (let k = 0; k < 3; k++) ctx.fillRect(0, y0 + k * (ROW_H + ROW_GAP) * dpr, cols, rh)
      if (!row.series || row.series.n === 0) return
      const agg = aggregate(row.series, cols, { darkThreshold, earthMarginDeg })
      const draw = (vals: Float32Array, k: number, style: string | CanvasPattern) => {
        ctx.fillStyle = style
        const yb = y0 + k * (ROW_H + ROW_GAP) * dpr + rh
        for (let j = 0; j < cols; j++) {
          const h = vals[j] * rh
          if (h > 0.2) ctx.fillRect(j, yb - h, 1, h)
        }
      }
      draw(agg.sun, 0, sunC)
      draw(agg.earth, 1, hatch)
      draw(agg.both, 2, stripes)
    })
  }, [rows, plotW, height, blockH, darkThreshold, earthMarginDeg])

  const scale = useMemo(() => scaleUtc().domain([startMs, endMs]).range([0, plotW]), [startMs, endMs, plotW])
  const span = endMs - startMs
  const fmt = utcFormat(span > 400 * 86_400_000 ? '%Y' : span > 60 * 86_400_000 ? '%b %Y' : '%d %b')
  const ticks = scale.ticks(Math.max(2, Math.floor(plotW / 110)))
  const cursorX = scale(timeMs)

  const seek = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setTime(scale.invert(Math.min(plotW, Math.max(0, e.clientX - r.left))).getTime())
  }

  return (
    <div ref={wrapRef} className="w-full">
      <div className="flex">
        <div className="shrink-0" style={{ width: LABEL_W }} aria-hidden="true">
          {rows.map((row, r) => (
            <div key={r} style={{ height: blockH, marginBottom: r < rows.length - 1 ? BLOCK_GAP : 0 }} className="text-xs">
              {rows.length > 1 && <span className="sr-only">{row.label}</span>}
              {[
                [<SunGlyph key="s" className="text-sun" />, rows.length > 1 ? `${row.label}: sunlit` : 'Sunlit'],
                [<EarthGlyph key="e" className="text-earth" />, 'Earth in view'],
                [
                  <span key="b" className="flex">
                    <SunGlyph size={10} className="text-sun" />
                    <EarthGlyph size={10} className="text-earth" />
                  </span>,
                  'Both',
                ],
              ].map(([glyph, text], k) => (
                <div key={k} className="flex items-center gap-1.5 truncate pr-2 text-dust" style={{ height: ROW_H, marginBottom: k < 2 ? ROW_GAP : 0 }}>
                  {glyph}
                  <span className="truncate">{text}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div
          className="relative cursor-crosshair touch-none"
          style={{ width: plotW, height }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            seek(e)
          }}
          onPointerMove={(e) => e.buttons === 1 && seek(e)}
          aria-hidden="true"
        >
          <canvas ref={canvasRef} style={{ width: plotW, height }} className="block" />
          <div className="pointer-events-none absolute top-0 w-px bg-bright" style={{ left: cursorX, height }} />
        </div>
      </div>
      <div className="relative ml-auto h-5 text-xs tabular text-dust" style={{ width: plotW }} aria-hidden="true">
        {ticks.map((t) => (
          <span key={t.getTime()} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: scale(t) }}>
            {fmt(t)}
          </span>
        ))}
      </div>
    </div>
  )
}
