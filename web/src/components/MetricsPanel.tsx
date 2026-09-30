import { useId, type ReactNode } from 'react'
import { fmtHours } from '../lib/format.ts'
import type { Longest, Metrics } from '../lib/metrics.ts'
import { useApp } from '../state/store.ts'
import { EarthGlyph, SunGlyph } from './Glyphs.tsx'

function hoursText(l: Longest): string {
  return `${l.atEdge ? '≥ ' : ''}${fmtHours(l.hours)}`
}

function Stat({ glyph, label, value, meaning }: { glyph: ReactNode; label: string; value: string; meaning: string }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs text-dust">
        {glyph}
        {label}
      </p>
      <p className="mt-1 font-display text-xl tabular">{value}</p>
      <p className="mt-1 text-xs text-dust">{meaning}</p>
    </div>
  )
}

export function MetricsPanel({ metrics, pending }: { metrics: Metrics | null; pending: boolean }) {
  const darkThreshold = useApp((s) => s.darkThreshold)
  const earthMarginDeg = useApp((s) => s.earthMarginDeg)
  const setDarkThreshold = useApp((s) => s.setDarkThreshold)
  const setEarthMargin = useApp((s) => s.setEarthMargin)
  const ids = { dark: useId(), margin: useId() }
  const pct = Math.round(darkThreshold * 100)
  const darkDef = pct === 0 ? 'no part of the Sun visible' : `at most ${pct}% of the Sun visible`

  return (
    <section aria-label="Metrics for the selected dates" aria-busy={pending} className="mt-6">
      <h3 className="font-display text-lg font-medium">Over the selected dates</h3>
      {metrics ? (
        <div className={`mt-3 grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3 xl:grid-cols-5 ${pending ? 'opacity-60' : ''}`}>
          <Stat
            glyph={<SunGlyph className="text-sun" />}
            label="Sunlight"
            value={`${metrics.sunMeanPct.toFixed(1)}%`}
            meaning={`Average share of the Sun's disk above the terrain. Some of the Sun is up ${metrics.sunAnyPct.toFixed(1)}% of the time.`}
          />
          <Stat
            glyph={<SunGlyph className="text-dust" />}
            label="Longest darkness"
            value={hoursText(metrics.longestDark)}
            meaning={`Longest stretch with ${darkDef}. A battery must carry the load this long.`}
          />
          <Stat
            glyph={<EarthGlyph className="text-earth" />}
            label="Earth in view"
            value={`${metrics.earthPct.toFixed(1)}%`}
            meaning={`Share of time Earth's center is above the terrain${earthMarginDeg > 0 ? ` by more than ${earthMarginDeg}°` : ''}.`}
          />
          <Stat
            glyph={<EarthGlyph className="text-dust" />}
            label="Longest blackout"
            value={hoursText(metrics.longestBlackout)}
            meaning="Longest stretch with no direct-to-Earth line of sight."
          />
          <Stat
            glyph={
              <span className="flex">
                <SunGlyph className="text-sun" />
                <EarthGlyph className="text-earth" />
              </span>
            }
            label="Sun and Earth together"
            value={`${metrics.bothPct.toFixed(1)}%`}
            meaning={`${metrics.windows.length} window${metrics.windows.length === 1 ? '' : 's'} with power and a link to Earth; the longest lasts ${fmtHours(metrics.longestWindowH)}.`}
          />
        </div>
      ) : (
        <p className="mt-3 text-sm text-dust" aria-live="polite">
          Computing…
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3 text-sm">
        <div>
          <label htmlFor={ids.dark} className="block text-xs text-dust">
            Dark means at most <span className="tabular text-bright">{pct}%</span> of the Sun is visible
          </label>
          <input
            id={ids.dark}
            type="range"
            min={0}
            max={95}
            step={5}
            value={pct}
            onChange={(e) => setDarkThreshold(Number(e.target.value) / 100)}
            className="mt-1 w-56 accent-bright"
          />
        </div>
        <div>
          <label htmlFor={ids.margin} className="block text-xs text-dust">
            Earth must clear the terrain by <span className="tabular text-bright">{earthMarginDeg.toFixed(1)}°</span>
          </label>
          <input
            id={ids.margin}
            type="range"
            min={0}
            max={5}
            step={0.5}
            value={earthMarginDeg}
            onChange={(e) => setEarthMargin(Number(e.target.value))}
            className="mt-1 w-56 accent-bright"
          />
        </div>
      </div>
    </section>
  )
}
