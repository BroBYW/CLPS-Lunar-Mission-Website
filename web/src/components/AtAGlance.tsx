import type { ReactNode } from 'react'
import type { Site } from '../data/load.ts'
import type { Longest, Metrics, Window } from '../lib/metrics.ts'
import { DAY_MS } from '../lib/time.ts'
import { useApp } from '../state/store.ts'
import { EarthGlyph, SunGlyph } from './Glyphs.tsx'

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const timeFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })

/** Hours in words a newcomer reads at a glance: days past two days, hours below */
export function plainDuration(h: number): string {
  if (h >= 48) return `${(h / 24).toFixed(1)} days`
  if (h >= 1) return `${Math.round(h)} hours`
  return 'under an hour'
}

function darkText(l: Longest): string {
  if (l.hours <= 0) return 'Never dark'
  return `${l.atEdge ? 'At least ' : ''}${plainDuration(l.hours)}`
}

function Tile({ glyph, value, label }: { glyph: ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-xl bg-sky p-4">
      <p className="heading-5 flex items-center gap-2 tabular">
        {glyph}
        {value}
      </p>
      <p className="body-6 mt-1 text-dust">{label}</p>
    </div>
  )
}

/**
 * The answer first, in plain words: how much sunlight and Earth the chosen site gets over the chosen dates, how long
 * a battery must last, and the best stretch to land. The detailed panels below give the same numbers with their
 * definitions.
 */
export function AtAGlance({ site, metrics, pending }: { site: Site; metrics: Metrics | null; pending: boolean }) {
  const startMs = useApp((s) => s.startMs)
  const endMs = useApp((s) => s.endMs)
  const setTime = useApp((s) => s.setTime)
  const setView = useApp((s) => s.setView)
  const lastDay = endMs - DAY_MS
  const sameYear = new Date(startMs).getUTCFullYear() === new Date(lastDay).getUTCFullYear()
  const dates = `${(sameYear ? dayFmt : dateFmt).format(startMs)} to ${dateFmt.format(lastDay)}`
  const best: Window | null = metrics?.windows.length ? metrics.windows.reduce((a, b) => (b.hours > a.hours ? b : a)) : null

  return (
    <section aria-label="At a glance" aria-busy={pending} className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="caption-4 text-dust">At a glance</p>
        <button type="button" onClick={() => setView('explore')} className="caption-1 text-sun-soft underline decoration-sun/40 underline-offset-4 transition-colors hover:text-sun">
          New here? Take the 2 minute tour
        </button>
      </div>
      {metrics ? (
        <div className={pending ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <p className="heading-6 mt-2 max-w-[680px]">
            At {site.name}, {dates}, the Sun is up {Math.round(metrics.sunAnyPct)}% of the time and Earth is in view{' '}
            {Math.round(metrics.earthPct)}% of the time.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Tile glyph={<SunGlyph size={20} className="text-sun" />} value={`${Math.round(metrics.sunAnyPct)}%`} label="of the time the Sun is up, so solar panels can charge" />
            <Tile glyph={<EarthGlyph size={20} className="text-earth" />} value={`${Math.round(metrics.earthPct)}%`} label="of the time Earth is in view, so the lander can radio home directly" />
            <Tile glyph={<SunGlyph size={20} className="text-regolith" />} value={darkText(metrics.longestDark)} label="the longest stretch in darkness: the battery has to last this long" />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4">
            {best ? (
              <>
                <p className="body-6 text-bright">
                  <span className="font-semibold">Best time to land:</span> {timeFmt.format(best.startMs)} to {timeFmt.format(best.endMs)} UTC.
                  Sunlight and Earth together for {plainDuration(best.hours)}.
                </p>
                <button type="button" className="btn btn-sm" onClick={() => setTime(best.startMs)}>
                  Show me
                </button>
              </>
            ) : (
              <p className="body-6 text-bright">
                No stretch in these dates has sunlight and Earth together. Try other dates, another site, or the 10 m mast.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3" aria-hidden="true">
          <div className="h-7 w-3/4 animate-pulse rounded-lg bg-shadow-2" />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="h-20 animate-pulse rounded-xl bg-shadow-2" />
            <div className="h-20 animate-pulse rounded-xl bg-shadow-2" />
            <div className="h-20 animate-pulse rounded-xl bg-shadow-2" />
          </div>
        </div>
      )}
    </section>
  )
}
