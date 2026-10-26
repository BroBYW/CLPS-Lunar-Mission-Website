import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { loadDsn } from '../data/load.ts'
import { contactOf, dsnElevation, type Dsn } from '../lib/dsn.ts'
import { fmtHours } from '../lib/format.ts'
import type { Series } from '../lib/series.ts'
import { useElementWidth } from '../lib/useElementWidth.ts'
import { useApp } from '../state/store.ts'
import { EarthGlyph } from './Glyphs.tsx'

const ROW_H = 12
const ROW_GAP = 3
/** Same label widths as the main timeline, so the two line up */
const LABEL_W = 132
const LABEL_W_NARROW = 104

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/** When the site can reach a Deep Space Network dish: Earth above its skyline and the Moon above a dish's limit. */
export function DsnPanel({ series }: { series: Series | null }) {
  const earthMarginDeg = useApp((s) => s.earthMarginDeg)
  const timeMs = useApp((s) => s.timeMs)
  const startMs = useApp((s) => s.startMs)
  const endMs = useApp((s) => s.endMs)
  const setTime = useApp((s) => s.setTime)
  const [dsn, setDsn] = useState<Dsn | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    loadDsn().then(
      (d) => live && setDsn(d),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [])

  const contact = useMemo(() => (series && dsn ? contactOf(series, dsn, earthMarginDeg) : null), [series, dsn, earthMarginDeg])
  const rows = dsn ? [...dsn.names, 'Contact possible'] : []

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const width = useElementWidth(wrapRef)
  const labelW = width < 480 ? LABEL_W_NARROW : LABEL_W
  const plotW = Math.max(100, width - labelW)
  const height = rows.length * (ROW_H + ROW_GAP) - ROW_GAP

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !series || !contact || !dsn) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(plotW * dpr)
    canvas.height = Math.round(height * dpr)
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const cols = Math.max(1, Math.round(plotW * dpr))
    const k = dsn.names.length
    const colors = [...dsn.names.map(() => css('--color-dust')), css('--color-earth')]
    for (let r = 0; r < rows.length; r++) {
      const y0 = r * (ROW_H + ROW_GAP) * dpr
      const rh = ROW_H * dpr
      ctx.fillStyle = css('--color-shadow')
      ctx.fillRect(0, y0, cols, rh)
      ctx.fillStyle = colors[r]
      for (let j = 0; j < cols; j++) {
        const a = Math.floor((j * series.n) / cols)
        const b = Math.max(a + 1, Math.floor(((j + 1) * series.n) / cols))
        let on = 0
        for (let i = a; i < b && i < series.n; i++) on += r < k ? (contact.stations[i] >> r) & 1 : contact.contact[i]
        const h = (on / (Math.min(b, series.n) - a || 1)) * rh
        if (h > 0.2) ctx.fillRect(j, y0 + rh - h, 1, h)
      }
    }
  }, [series, contact, dsn, plotW, height, rows.length])

  const cursorX = ((timeMs - startMs) / (endMs - startMs)) * plotW
  const seek = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setTime(startMs + (Math.min(plotW, Math.max(0, e.clientX - r.left)) / plotW) * (endMs - startMs))
  }
  const inReach = dsn ? dsn.names.filter((_, k) => dsnElevation(dsn, k, timeMs) >= dsn.limitDeg) : []

  return (
    <section aria-label="Deep Space Network contact" className="mt-8">
      <h3 className="flex items-center gap-2 font-display text-lg font-medium">
        <EarthGlyph className="text-earth" />
        Deep Space Network contact
      </h3>
      <p className="mt-1 max-w-prose text-xs text-dust">
        Seeing Earth is half of a direct link: a dish on Earth must see the Moon too. NASA's Deep Space Network has three
        complexes about 120° of longitude apart. Each row shows when the Moon is at least {dsn?.limitDeg ?? 10}° above that
        complex's horizon; contact is possible when one of them is and Earth is above this site's skyline. This is geometry
        only: it doesn't know antenna schedules or other missions.
      </p>
      {failed && <p className="mt-3 text-sm text-alert">The DSN data didn't load. Check your connection and reload the page.</p>}
      {contact && dsn && (
        <p className="mt-3 text-sm" aria-live="polite">
          Contact possible <span className="text-bright tabular">{contact.contactPct.toFixed(1)}%</span> of the time; longest gap{' '}
          <span className="text-bright tabular">
            {contact.gapAtEdge ? '≥ ' : ''}
            {fmtHours(contact.longestGapH)}
          </span>
          . At the time shown, {inReach.length ? `${inReach.join(' and ')} ${inReach.length > 1 ? 'have' : 'has'} the Moon in reach` : 'no complex has the Moon in reach'}.
          <span className="block text-xs text-dust">
            Moon above {dsn.limitDeg}° over these dates: {dsn.names.map((n, k) => `${n} ${contact.stationPct[k].toFixed(0)}%`).join(', ')}.
          </span>
        </p>
      )}
      <div ref={wrapRef} className="mt-3 w-full">
        {dsn && (
          <div className="flex" aria-hidden="true">
            <div className="shrink-0" style={{ width: labelW }}>
              {rows.map((label, r) => (
                <p
                  key={label}
                  className={`truncate pr-2 text-xs ${r === rows.length - 1 ? 'text-earth' : 'text-dust'}`}
                  style={{ height: ROW_H, lineHeight: `${ROW_H}px`, marginBottom: r < rows.length - 1 ? ROW_GAP : 0 }}
                >
                  {label}
                </p>
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
            >
              <canvas ref={canvasRef} style={{ width: plotW, height }} className="block" />
              <div className="pointer-events-none absolute top-0 w-px bg-bright" style={{ left: cursorX, height }} />
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
