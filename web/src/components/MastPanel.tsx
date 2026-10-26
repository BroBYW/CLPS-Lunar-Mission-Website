import { scaleLinear } from 'd3-scale'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { loadMastHorizons, type MastHorizons, type Site } from '../data/load.ts'
import { fmtHours } from '../lib/format.ts'
import { heightFor } from '../lib/mast.ts'
import { computeMetrics } from '../lib/metrics.ts'
import { useElementWidth } from '../lib/useElementWidth.ts'
import { STEP_MS, useApp } from '../state/store.ts'
import { initMastWorker, useManySeries } from '../workers/client.ts'
import type { SeriesRequest } from '../workers/metrics.worker.ts'
import { EarthGlyph, SunGlyph } from './Glyphs.tsx'

const TARGETS = [80, 90, 95, 99]
const CHART_H = 190
const PAD = { left: 40, right: 12, top: 10, bottom: 26 }

/** Sunlight and Earth visibility against mast height at the selected site and dates. */
export function MastPanel({ site }: { site: Site }) {
  const startMs = useApp((s) => s.startMs)
  const endMs = useApp((s) => s.endMs)
  const darkThreshold = useApp((s) => s.darkThreshold)
  const earthMarginDeg = useApp((s) => s.earthMarginDeg)
  const [mast, setMast] = useState<MastHorizons | null>(null)
  const [failed, setFailed] = useState(false)
  const [target, setTarget] = useState(90)
  const targetId = useId()

  useEffect(() => {
    let live = true
    loadMastHorizons()
      .then(async (m) => {
        await initMastWorker(m)
        if (live) setMast(m)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [])

  const maskIndex = mast ? mast.meta.sites.indexOf(site.id) : -1
  const heights = mast?.heightsM ?? []
  const reqs: SeriesRequest[] =
    mast && maskIndex >= 0
      ? heights.map((h, hi) => ({ lat: site.lat, lon: site.lon, heightM: site.height_m + h, maskIndex, heightIndex: hi, startMs, endMs, stepMs: STEP_MS, maskSet: 'mast' }))
      : []
  const list = useManySeries(reqs)
  const metrics = useMemo(() => list.map((s) => (s ? computeMetrics(s, { darkThreshold, earthMarginDeg }) : null)), [list, darkThreshold, earthMarginDeg])
  const done = metrics.length > 0 && metrics.every((m) => m)
  const sun = done ? metrics.map((m) => m!.sunMeanPct) : []
  const earth = done ? metrics.map((m) => m!.earthPct) : []
  const needed = done ? heightFor(heights, sun, target) : null

  const wrapRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(wrapRef, 480)
  const yLo = done ? Math.max(0, Math.floor(Math.min(...sun, ...earth, target) / 10) * 10 - 10) : 0
  const x = scaleLinear().domain([0, heights[heights.length - 1] ?? 50]).range([PAD.left, width - PAD.right])
  const y = scaleLinear().domain([yLo, 100]).range([CHART_H - PAD.bottom, PAD.top])
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(heights[i]).toFixed(1)},${y(v).toFixed(1)}`).join('')

  return (
    <section aria-label="Mast height" className="mt-8">
      <h3 className="font-display text-lg font-medium">Mast height</h3>
      <p className="mt-1 max-w-prose text-xs text-dust">
        At the pole the Sun skims the horizon, so a few metres of height can add days of sunlight. NASA's Vertical Solar Array
        Technology project is building solar arrays on masts about 10 m tall for the south pole, and larger designs reach over
        30 m. These are the selected dates at this site, from horizons computed for each height.
      </p>
      {site.mask_index < 0 ? (
        <p className="mt-3 text-sm text-dust">Mast heights are computed for the listed sites only, not for a dropped pin.</p>
      ) : failed ? (
        <p className="mt-3 text-sm text-alert">The mast horizons didn't load. Check your connection and reload the page.</p>
      ) : maskIndex < 0 && mast ? (
        <p className="mt-3 text-sm text-dust">No mast horizons for this site.</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <label htmlFor={targetId} className="text-dust">
                Mast needed for
              </label>
              <select id={targetId} value={target} onChange={(e) => setTarget(Number(e.target.value))} className="rounded-sm border border-regolith bg-sky px-2 py-1">
                {TARGETS.map((t) => (
                  <option key={t} value={t}>
                    {t}% sunlight
                  </option>
                ))}
              </select>
              <p className="font-display text-xl tabular text-bright" aria-live="polite">
                {!done ? '…' : needed === null ? `over ${heights[heights.length - 1]} m` : needed <= heights[0] ? `${heights[0]} m is enough` : `about ${Math.ceil(needed)} m`}
              </p>
            </div>
            {done && (
              <p className="mt-1 text-xs text-dust">
                Sunlight goes from {sun[0].toFixed(1)}% at {heights[0]} m to {sun[sun.length - 1].toFixed(1)}% at {heights[heights.length - 1]} m; Earth in view
                from {earth[0].toFixed(1)}% to {earth[earth.length - 1].toFixed(1)}%.
              </p>
            )}
            <div ref={wrapRef} className="mt-3 w-full" aria-hidden="true">
              <svg width={width} height={CHART_H} className="block overflow-visible text-xs">
                {y.ticks(5).map((t) => (
                  <g key={t}>
                    <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="stroke-shadow-2" />
                    <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-dust tabular">
                      {t}%
                    </text>
                  </g>
                ))}
                {heights.map((h) => (
                  <text key={h} x={x(h)} y={CHART_H - 6} textAnchor="middle" className="fill-dust tabular">
                    {h} m
                  </text>
                ))}
                <line x1={PAD.left} x2={width - PAD.right} y1={y(target)} y2={y(target)} strokeDasharray="4 4" className="stroke-dust" />
                {done && (
                  <>
                    <path d={path(earth)} fill="none" strokeWidth={2} strokeDasharray="6 4" className="stroke-earth" />
                    <path d={path(sun)} fill="none" strokeWidth={2.5} className="stroke-sun" />
                    {heights.map((h, i) => (
                      <circle key={h} cx={x(h)} cy={y(sun[i])} r={3.5} className="fill-sun" />
                    ))}
                    {needed !== null && needed > heights[0] && (
                      <line x1={x(needed)} x2={x(needed)} y1={y(target)} y2={CHART_H - PAD.bottom} strokeDasharray="2 3" className="stroke-bright" />
                    )}
                  </>
                )}
              </svg>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-dust" aria-hidden="true">
              <span className="flex items-center gap-1.5">
                <SunGlyph className="text-sun" />
                Sunlight
              </span>
              <span className="flex items-center gap-1.5">
                <EarthGlyph className="text-earth" />
                Earth in view (dashed)
              </span>
              <span>Dotted line: your target</span>
            </div>
          </div>
          <table className={`self-start text-sm tabular ${done ? '' : 'opacity-60'}`}>
            <caption className="sr-only">Sunlight, longest darkness and Earth in view for each mast height over the selected dates</caption>
            <thead>
              <tr className="text-left text-xs text-dust">
                <th scope="col" className="py-1 pr-4 font-normal">
                  Mast
                </th>
                <th scope="col" className="py-1 pr-4 font-normal">
                  Sunlight
                </th>
                <th scope="col" className="py-1 pr-4 font-normal">
                  Longest darkness
                </th>
                <th scope="col" className="py-1 font-normal">
                  Earth in view
                </th>
              </tr>
            </thead>
            <tbody>
              {heights.map((h, i) => {
                const m = metrics[i]
                return (
                  <tr key={h} className="border-t border-shadow-2">
                    <th scope="row" className="py-1 pr-4 text-left font-normal text-dust">
                      {h} m
                    </th>
                    <td className="py-1 pr-4">{m ? `${m.sunMeanPct.toFixed(1)}%` : '…'}</td>
                    <td className="py-1 pr-4">{m ? `${m.longestDark.atEdge ? '≥ ' : ''}${fmtHours(m.longestDark.hours)}` : '…'}</td>
                    <td className="py-1">{m ? `${m.earthPct.toFixed(1)}%` : '…'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
