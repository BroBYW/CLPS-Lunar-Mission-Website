import { useId, useMemo } from 'react'
import type { AppData, Site } from '../data/load.ts'
import { windowsCsv, downloadText } from '../lib/csv.ts'
import { fmtHours, fmtLatLon } from '../lib/format.ts'
import { computeMetrics, type Metrics } from '../lib/metrics.ts'
import { formatUtcDate } from '../lib/time.ts'
import { MAX_COMPARE, useApp } from '../state/store.ts'
import { seriesRequest, useSeries } from '../workers/client.ts'
import { GROUP_LABELS } from '../data/groups.ts'
import { Timeline } from './Timeline.tsx'
import { TimeControls } from './TimeControls.tsx'

interface Row {
  label: string
  value: (m: Metrics) => number
  text: (m: Metrics) => string
  better: 'high' | 'low'
}

const ROWS: Row[] = [
  { label: 'Sunlight (average share of the disk)', value: (m) => m.sunMeanPct, text: (m) => `${m.sunMeanPct.toFixed(1)}%`, better: 'high' },
  { label: 'Longest darkness', value: (m) => m.longestDark.hours, text: (m) => `${m.longestDark.atEdge ? '≥ ' : ''}${fmtHours(m.longestDark.hours)}`, better: 'low' },
  { label: 'Earth in view', value: (m) => m.earthPct, text: (m) => `${m.earthPct.toFixed(1)}%`, better: 'high' },
  { label: 'Longest blackout', value: (m) => m.longestBlackout.hours, text: (m) => `${m.longestBlackout.atEdge ? '≥ ' : ''}${fmtHours(m.longestBlackout.hours)}`, better: 'low' },
  { label: 'Sun and Earth together', value: (m) => m.bothPct, text: (m) => `${m.bothPct.toFixed(1)}%`, better: 'high' },
  { label: 'Longest window with both', value: (m) => m.longestWindowH, text: (m) => fmtHours(m.longestWindowH), better: 'high' },
]

function SitePicker({ index, sites, value, onChange }: { index: number; sites: Site[]; value: string; onChange: (id: string) => void }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block text-xs text-dust">
        Site {index + 1}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-sm border border-regolith bg-sky px-2 py-1 text-sm">
        {index > 0 && <option value="">None</option>}
        {(['illumination', 'artemis', 'clps', 'contrast'] as const).map((g) => (
          <optgroup key={g} label={GROUP_LABELS[g]}>
            {sites.filter((s) => s.group === g).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}

export function CompareView({ data }: { data: AppData }) {
  const compareIds = useApp((s) => s.compareIds)
  const setCompare = useApp((s) => s.setCompare)
  const startMs = useApp((s) => s.startMs)
  const endMs = useApp((s) => s.endMs)
  const heightIndex = useApp((s) => s.heightIndex)
  const darkThreshold = useApp((s) => s.darkThreshold)
  const earthMarginDeg = useApp((s) => s.earthMarginDeg)
  const heightsM = data.horizons.heightsM

  const sites = compareIds.map((id) => data.sites.find((s) => s.id === id)).filter((s): s is Site => !!s)
  const req = (i: number) => (sites[i] ? seriesRequest(sites[i], heightIndex, heightsM, startMs, endMs) : null)
  const r0 = useSeries(req(0))
  const r1 = useSeries(req(1))
  const r2 = useSeries(req(2))
  const results = [r0, r1, r2].slice(0, sites.length)
  const pending = results.some((r) => r.pending)
  const n = sites.length
  const metrics = useMemo(
    () =>
      [r0.series, r1.series, r2.series]
        .slice(0, n)
        .map((s) => (s ? computeMetrics(s, { darkThreshold, earthMarginDeg }) : null)),
    [r0.series, r1.series, r2.series, n, darkThreshold, earthMarginDeg],
  )

  const setAt = (i: number, id: string) => {
    const ids = [...compareIds]
    if (!id) ids.splice(i, 1)
    else ids[i] = id
    setCompare([...new Set(ids)])
  }
  const pickers = Array.from({ length: Math.min(MAX_COMPARE, sites.length + 1) }, (_, i) => i)
  const ready = metrics.every((m) => m)

  const download = () => {
    const entries = sites.flatMap((s, i) => (results[i]?.series ? [{ siteId: s.id, series: results[i].series! }] : []))
    downloadText(
      `compare-${formatUtcDate(startMs)}-to-${formatUtcDate(endMs - 86_400_000)}.csv`,
      windowsCsv(entries, { darkThreshold, earthMarginDeg }, heightsM[heightIndex]),
    )
  }

  return (
    <main className="px-4 py-4 lg:px-6">
      <h2 className="font-display text-2xl font-medium">Compare sites</h2>
      <p className="mt-1 max-w-prose text-sm text-dust">
        Pick up to three sites. They share the dates, observer height and criteria set below and in the Plan view.
      </p>
      <div className="mt-4 grid max-w-3xl gap-3 sm:grid-cols-3">
        {pickers.map((i) => (
          <SitePicker key={i} index={i} sites={data.sites} value={compareIds[i] ?? ''} onChange={(id) => setAt(i, id)} />
        ))}
      </div>

      <TimeControls />

      <section aria-label="Comparison table" aria-busy={pending} className="mt-6 overflow-x-auto">
        <table className={`w-full min-w-[640px] text-sm tabular ${pending ? 'opacity-60' : ''}`}>
          <caption className="sr-only">
            Metrics per site from {formatUtcDate(startMs)} to {formatUtcDate(endMs - 86_400_000)}, observer {heightsM[heightIndex]} m. The best value in each row is marked.
          </caption>
          <thead>
            <tr className="text-left align-bottom">
              <th scope="col" className="w-64 py-2 text-xs font-normal text-dust">
                {heightsM[heightIndex]} m observer
              </th>
              {sites.map((s) => (
                <th key={s.id} scope="col" className="py-2 pr-4 font-normal">
                  <span className="block font-display text-base">{s.name}</span>
                  <span className="block text-xs text-dust">
                    {fmtLatLon(s.lat, s.lon, 2)}, {s.kind === 'exact' ? 'published point' : 'approximate'}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              const vals = metrics.map((m) => (m ? row.value(m) : NaN))
              const best = ready && sites.length > 1 ? (row.better === 'high' ? Math.max(...vals) : Math.min(...vals)) : NaN
              return (
                <tr key={row.label} className="border-t border-shadow-2">
                  <th scope="row" className="py-2 pr-4 text-left font-normal text-dust">
                    {row.label}
                  </th>
                  {metrics.map((m, i) => (
                    <td key={i} className="py-2 pr-4">
                      {m ? (
                        <>
                          <span className={vals[i] === best ? 'text-bright' : 'text-dust'}>{row.text(m)}</span>
                          {vals[i] === best && <span className="ml-2 rounded-sm border border-bright px-1 text-xs text-bright">best</span>}
                        </>
                      ) : (
                        '…'
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section aria-label="Aligned timelines" className="mt-6">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-lg font-medium">Timelines</h3>
          <button type="button" onClick={download} disabled={!ready} className="rounded-sm border border-regolith px-3 py-1 text-sm hover:border-dust disabled:opacity-50">
            Download CSV of all windows
          </button>
        </div>
        <Timeline rows={sites.map((s, i) => ({ label: s.name, series: results[i]?.series ?? null }))} startMs={startMs} endMs={endMs} />
      </section>
    </main>
  )
}
