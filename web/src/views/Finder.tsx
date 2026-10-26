import { utcFormat } from 'd3-time-format'
import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from 'react'
import { EarthGlyph, SunGlyph } from '../components/Glyphs.tsx'
import { GROUP_ORDER } from '../data/groups.ts'
import type { AppData, Site } from '../data/load.ts'
import { bestWindows, passes, score, type Limits, type RankBy, type WindowScores } from '../lib/finder.ts'
import { fmtHours } from '../lib/format.ts'
import { DAY_MS, HOUR_MS, formatUtcDate } from '../lib/time.ts'
import { useElementWidth } from '../lib/useElementWidth.ts'
import { MAX_MS, MIN_MS, useApp } from '../state/store.ts'
import { requestScan } from '../workers/client.ts'

const LENGTHS = [3, 7, 14, 28]
const RANKS: [RankBy, string][] = [
  ['sun', 'Most sunlight'],
  ['both', 'Most time with Sun and Earth'],
  ['earth', 'Most time with Earth in view'],
  ['dark', 'Shortest darkness'],
]
const ROW_H = 18
const ROW_GAP = 2
const LABEL_W = 156
const LABEL_W_NARROW = 108
const BEST_COUNT = 10

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
/** Colour for a 0–1 score: from the background toward the metric's hue. */
const mix = (a: number[], b: number[], t: number) => `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * t)).join(',')})`

const firstYear = new Date(MIN_MS).getUTCFullYear()
const lastYear = new Date(MAX_MS - 1).getUTCFullYear()
const YEARS = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i)

/** One row per site, in the site list's order. */
function orderedSites(sites: Site[]): Site[] {
  return GROUP_ORDER.flatMap((g) => sites.filter((s) => s.group === g))
}

export default function Finder({ data }: { data: AppData }) {
  const heightIndex = useApp((s) => s.heightIndex)
  const setHeightIndex = useApp((s) => s.setHeightIndex)
  const darkThreshold = useApp((s) => s.darkThreshold)
  const earthMarginDeg = useApp((s) => s.earthMarginDeg)
  const startMs = useApp((s) => s.startMs)
  const heightsM = data.horizons.heightsM
  const ids = { year: useId(), len: useId(), rank: useId(), h: useId(), sun: useId(), dark: useId(), earth: useId() }

  const [year, setYear] = useState(() => Math.min(lastYear, Math.max(firstYear, new Date(startMs).getUTCFullYear())))
  const [lengthDays, setLengthDays] = useState(14)
  const [rankBy, setRankBy] = useState<RankBy>('sun')
  const [limits, setLimits] = useState<Limits>({ minSunPct: 70, maxDarkH: 48, minEarthPct: 50 })
  const [scores, setScores] = useState<{ key: string; list: WindowScores[] } | null>(null)
  const [failed, setFailed] = useState(false)
  const [hover, setHover] = useState<{ row: number; day: number; x: number; y: number } | null>(null)

  const sites = useMemo(() => orderedSites(data.sites), [data.sites])
  const yearStart = Date.UTC(year, 0, 1)
  const days = Math.round((Date.UTC(year + 1, 0, 1) - yearStart) / DAY_MS)
  const key = JSON.stringify([year, lengthDays, heightIndex, darkThreshold, earthMarginDeg])
  const pending = scores?.key !== key
  const list = scores?.list ?? null

  useEffect(() => {
    let live = true
    requestScan({
      sites: sites.map((s) => ({ lat: s.lat, lon: s.lon, heightM: s.height_m + heightsM[heightIndex], maskIndex: s.mask_index })),
      heightIndex,
      startMs: yearStart,
      days,
      lengthDays,
      stepMs: HOUR_MS,
      limitMs: MAX_MS,
      criteria: { darkThreshold, earthMarginDeg },
    }).then(
      (l) => {
        if (!live) return
        setFailed(false)
        setScores({ key, list: l })
      },
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
    // key covers every input of the scan
  }, [key])

  const picks = useMemo(() => (list ? bestWindows(list, limits, rankBy, lengthDays, BEST_COUNT) : []), [list, limits, rankBy, lengthDays])
  const passing = useMemo(() => {
    if (!list) return { n: 0, total: 0 }
    let n = 0
    let total = 0
    for (const w of list) {
      for (let d = 0; d < days; d++) {
        if (Number.isNaN(w.sunPct[d])) continue
        total++
        if (passes(w, d, limits)) n++
      }
    }
    return { n, total }
  }, [list, limits, days])

  const open = (site: Site, day: number) => {
    const s = useApp.getState()
    const t0 = yearStart + day * DAY_MS
    s.setSite(site.id)
    s.setRange(t0, t0 + lengthDays * DAY_MS)
    s.setTime(t0)
    s.setView('plan')
  }

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const width = useElementWidth(wrapRef)
  const labelW = width < 560 ? LABEL_W_NARROW : LABEL_W
  const plotW = Math.max(120, width - labelW)
  const height = sites.length * (ROW_H + ROW_GAP) - ROW_GAP

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(plotW * dpr)
    canvas.height = Math.round(height * dpr)
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const base = rgb(css('--color-shadow-2'))
    const hue = rgb(css(rankBy === 'earth' ? '--color-earth' : rankBy === 'sun' ? '--color-sun' : '--color-bright'))
    const failC = css('--color-shadow')
    sites.forEach((_, r) => {
      const y = r * (ROW_H + ROW_GAP) * dpr
      const h = ROW_H * dpr
      const w = list?.[r]
      for (let d = 0; d < days; d++) {
        const x0 = Math.round(((d * plotW) / days) * dpr)
        const x1 = Math.round((((d + 1) * plotW) / days) * dpr)
        if (!w || Number.isNaN(w.sunPct[d])) continue
        // Windows that meet the limits always show some colour; the rest stay dark
        ctx.fillStyle = passes(w, d, limits) ? mix(base, hue, 0.25 + 0.75 * score(w, d, rankBy, lengthDays)) : failC
        ctx.fillRect(x0, y, Math.max(1, x1 - x0), h)
      }
    })
  }, [list, sites, days, plotW, height, limits, rankBy, lengthDays])

  const months = Array.from({ length: 12 }, (_, m) => ({ m, x: ((Date.UTC(year, m, 1) - yearStart) / DAY_MS / days) * plotW }))
  const monthFmt = utcFormat('%b')
  // On narrow screens, one label per quarter
  const showMonth = (m: number) => plotW >= 420 || m % 3 === 0

  const pointAt = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    const row = Math.floor(y / (ROW_H + ROW_GAP))
    const day = Math.floor((x / plotW) * days)
    if (row < 0 || row >= sites.length || day < 0 || day >= days) return null
    return { row, day, x, y }
  }
  const tip = hover && list?.[hover.row] && !Number.isNaN(list[hover.row].sunPct[hover.day]) ? hover : null

  const num = (id: string, label: string, unit: string, value: number, onChange: (v: number) => void, max: number) => (
    <label htmlFor={id} className="flex items-center gap-2 text-sm text-dust">
      {label}
      <input
        id={id}
        type="number"
        min={0}
        max={max}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? (max === 100 ? 0 : Infinity) : Number(e.target.value))}
        className="w-20 rounded-sm border border-regolith bg-shadow px-2 py-1 tabular text-bright"
      />
      {unit}
    </label>
  )

  return (
    <main className="px-4 py-4 lg:px-6">
      <h2 className="font-display text-2xl font-medium">Find landing dates</h2>
      <p className="mt-1 max-w-prose text-sm text-dust">
        Every site and every start date in a year, scored for a mission of the length you choose. Bright cells meet your limits;
        dark ones don't. Pick a cell, or a row in the table below, to open those dates in the Plan view.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
        <label htmlFor={ids.year} className="flex flex-col gap-1 text-xs text-dust">
          Year
          <select id={ids.year} value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-sm border border-regolith bg-shadow px-2 py-1 text-sm text-bright">
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={ids.len} className="flex flex-col gap-1 text-xs text-dust">
          Mission length
          <select id={ids.len} value={lengthDays} onChange={(e) => setLengthDays(Number(e.target.value))} className="rounded-sm border border-regolith bg-shadow px-2 py-1 text-sm text-bright">
            {LENGTHS.map((l) => (
              <option key={l} value={l}>
                {l} days
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={ids.h} className="flex flex-col gap-1 text-xs text-dust">
          Observer
          <select id={ids.h} value={heightIndex} onChange={(e) => setHeightIndex(Number(e.target.value))} className="rounded-sm border border-regolith bg-shadow px-2 py-1 text-sm text-bright">
            {heightsM.map((h, i) => (
              <option key={h} value={i}>
                {i === 0 ? `Lander, ${h} m` : `Mast, ${h} m`}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={ids.rank} className="flex flex-col gap-1 text-xs text-dust">
          Brightest for
          <select id={ids.rank} value={rankBy} onChange={(e) => setRankBy(e.target.value as RankBy)} className="rounded-sm border border-regolith bg-shadow px-2 py-1 text-sm text-bright">
            {RANKS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        <legend className="mb-2 text-xs text-dust">Limits a window must meet</legend>
        {num(ids.sun, 'Sunlight at least', '%', limits.minSunPct, (v) => setLimits({ ...limits, minSunPct: v }), 100)}
        {num(ids.dark, 'Longest darkness at most', 'h', limits.maxDarkH, (v) => setLimits({ ...limits, maxDarkH: v }), 24 * 28)}
        {num(ids.earth, 'Earth in view at least', '%', limits.minEarthPct, (v) => setLimits({ ...limits, minEarthPct: v }), 100)}
      </fieldset>

      <section aria-label="Windows for every site and start date" aria-busy={pending} className="mt-6">
        <p className={`text-sm ${failed ? 'text-alert' : 'text-dust'}`} aria-live="polite">
          {failed
            ? "The windows couldn't be scored. Reload the page to try again."
            : list
              ? `${passing.n.toLocaleString('en')} of ${passing.total.toLocaleString('en')} windows meet your limits.`
              : 'Scoring every site and start date…'}
        </p>
        <div ref={wrapRef} className={`relative mt-2 w-full ${pending ? 'opacity-60' : ''}`}>
          <div className="relative h-5 text-xs tabular text-dust" style={{ marginLeft: labelW }} aria-hidden="true">
            {months.filter(({ m }) => showMonth(m)).map(({ m, x }) => (
              <span key={m} className="absolute" style={{ left: x }}>
                {monthFmt(new Date(Date.UTC(year, m, 1)))}
              </span>
            ))}
          </div>
          <div className="flex">
            <div className="shrink-0" style={{ width: labelW }} aria-hidden="true">
              {sites.map((s, r) => (
                <p key={s.id} className="truncate pr-2 text-xs text-dust" style={{ height: ROW_H, lineHeight: `${ROW_H}px`, marginBottom: r < sites.length - 1 ? ROW_GAP : 0 }}>
                  {s.name}
                </p>
              ))}
            </div>
            <div
              className="relative cursor-pointer touch-none"
              style={{ width: plotW, height }}
              onPointerMove={(e) => setHover(pointAt(e))}
              onPointerLeave={() => setHover(null)}
              onClick={(e) => {
                const p = pointAt(e)
                if (p && list?.[p.row] && !Number.isNaN(list[p.row].sunPct[p.day])) open(sites[p.row], p.day)
              }}
              aria-hidden="true"
            >
              <canvas ref={canvasRef} style={{ width: plotW, height }} className="block" />
              {tip && (
                <div
                  className="pointer-events-none absolute z-10 w-60 rounded-sm border border-regolith bg-shadow px-3 py-2 text-xs tabular text-dust shadow-lg"
                  style={{ left: Math.min(tip.x + 12, plotW - 244), top: tip.y + 14 }}
                >
                  <p className="font-display text-sm text-bright">{sites[tip.row].name}</p>
                  <p>
                    {formatUtcDate(yearStart + tip.day * DAY_MS)} for {lengthDays} days
                  </p>
                  <WindowFacts w={list![tip.row]} d={tip.day} />
                  <p className="mt-1 text-bright">{passes(list![tip.row], tip.day, limits) ? 'Meets your limits. Click to open.' : 'Misses your limits. Click to open anyway.'}</p>
                </div>
              )}
            </div>
          </div>
        </div>
        <Legend rankBy={rankBy} />
      </section>

      <section aria-label="Best windows" className="mt-8">
        <h3 className="font-display text-lg font-medium">Best windows in {year}</h3>
        <p className="mt-1 max-w-prose text-sm text-dust">
          The {BEST_COUNT} best that meet your limits, ranked by {RANKS.find(([v]) => v === rankBy)![1].toLowerCase()}, with at most one per
          site in any {lengthDays} days. Hourly samples here; the Plan view recomputes every 10 minutes.
        </p>
        {list && picks.length === 0 && <p className="mt-3 text-sm text-alert">No window meets these limits. Try loosening them.</p>}
        {/* relative keeps the screen-reader-only header inside the scroll box on phones */}
        {picks.length > 0 && (
          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm tabular">
              <thead>
                <tr className="text-left text-xs text-dust">
                  <th scope="col" className="py-2 pr-4 font-normal">
                    Site
                  </th>
                  <th scope="col" className="py-2 pr-4 font-normal">
                    Starts (UTC)
                  </th>
                  <th scope="col" className="py-2 pr-4 font-normal">
                    Sunlight
                  </th>
                  <th scope="col" className="py-2 pr-4 font-normal">
                    Longest darkness
                  </th>
                  <th scope="col" className="py-2 pr-4 font-normal">
                    Earth in view
                  </th>
                  <th scope="col" className="py-2 pr-4 font-normal">
                    Both
                  </th>
                  <th scope="col" className="py-2 font-normal">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {picks.map((p) => {
                  const w = list![p.site]
                  return (
                    <tr key={`${p.site}-${p.day}`} className="border-t border-shadow-2">
                      <th scope="row" className="py-2 pr-4 text-left font-normal text-bright">
                        {sites[p.site].name}
                      </th>
                      <td className="py-2 pr-4">{formatUtcDate(yearStart + p.day * DAY_MS)}</td>
                      <td className="py-2 pr-4">{w.sunPct[p.day].toFixed(1)}%</td>
                      <td className="py-2 pr-4">{fmtHours(w.darkH[p.day])}</td>
                      <td className="py-2 pr-4">{w.earthPct[p.day].toFixed(1)}%</td>
                      <td className="py-2 pr-4">{w.bothPct[p.day].toFixed(1)}%</td>
                      <td className="py-2">
                        <button type="button" onClick={() => open(sites[p.site], p.day)} className="rounded-sm border border-regolith px-2 py-0.5 text-xs hover:border-dust">
                          Open in Plan
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}

function WindowFacts({ w, d }: { w: WindowScores; d: number }) {
  return (
    <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3">
      <dt>Sunlight</dt>
      <dd className="text-right">{w.sunPct[d].toFixed(1)}%</dd>
      <dt>Longest darkness</dt>
      <dd className="text-right">{fmtHours(w.darkH[d])}</dd>
      <dt>Earth in view</dt>
      <dd className="text-right">{w.earthPct[d].toFixed(1)}%</dd>
      <dt>Longest blackout</dt>
      <dd className="text-right">{fmtHours(w.blackoutH[d])}</dd>
      <dt>Sun and Earth together</dt>
      <dd className="text-right">{w.bothPct[d].toFixed(1)}%</dd>
    </dl>
  )
}

function Legend({ rankBy }: { rankBy: RankBy }) {
  const hue = rankBy === 'earth' ? 'var(--color-earth)' : rankBy === 'sun' ? 'var(--color-sun)' : 'var(--color-bright)'
  const glyph = rankBy === 'earth' ? <EarthGlyph className="text-earth" /> : rankBy === 'sun' ? <SunGlyph className="text-sun" /> : null
  const what = rankBy === 'sun' ? 'sunlight' : rankBy === 'earth' ? 'Earth in view' : rankBy === 'both' ? 'Sun and Earth together' : 'darkness (brighter is shorter)'
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-dust" aria-hidden="true">
      <span className="flex items-center gap-2">
        {glyph}
        <span className="h-3 w-24 rounded-sm" style={{ background: `linear-gradient(90deg, color-mix(in srgb, var(--color-shadow-2) 75%, ${hue}), ${hue})` }} />
        Meets your limits: less to more {what}
      </span>
      <span className="flex items-center gap-2">
        <span className="h-3 w-6 rounded-sm bg-shadow ring-1 ring-shadow-2" />
        Misses your limits
      </span>
    </div>
  )
}
