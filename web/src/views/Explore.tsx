import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { EarthGlyph, SunGlyph } from '../components/Glyphs.tsx'
import { Panorama, type Follow } from '../components/Panorama.tsx'
import { Timeline } from '../components/Timeline.tsx'
import type { AppData, Site } from '../data/load.ts'
import { maskExtremes } from '../lib/horizon.ts'
import { computeMetrics, type Metrics } from '../lib/metrics.ts'
import { DAY_MS, formatUtc } from '../lib/time.ts'
import { AHEAD_MS, MAX_MS, useApp } from '../state/store.ts'
import { useSiteScene } from '../state/useSiteScene.ts'
import { seriesRequest, useManySeries } from '../workers/client.ts'

const MONTH_START = Date.UTC(2027, 0, 1)
const CHALLENGE = {
  start: Date.UTC(2027, 0, 1),
  days: 14,
  minSunPct: 80,
  minEarthPct: 50,
  sites: ['connecting-ridge', 'shackleton-rim', 'malapert-massif', 'mons-mouton', 'nobile-rim-1', 'de-gerlache-rim-2', 'haworth', 'peak-near-cabeus-b'],
}
const CRITERIA = { darkThreshold: 0, earthMarginDeg: 0 }

interface StepDef {
  title: string
  site: string
  start: number
  days: number
  width?: number
  follow?: Follow
}

const STEPS: StepDef[] = [
  { title: 'The Sun never climbs high', site: 'connecting-ridge', start: MONTH_START, days: 30 },
  { title: 'A little height goes a long way', site: 'connecting-ridge', start: MONTH_START, days: 30 },
  { title: 'Craters the Sun never reaches', site: 'shackleton-floor', start: MONTH_START, days: 30 },
  { title: 'Earth wobbles in the sky', site: 'malapert-massif', start: MONTH_START, days: 30, width: 90, follow: 'earth' },
  { title: 'Power and a link home, together', site: 'connecting-ridge', start: MONTH_START, days: 30 },
  // Opens on the first candidate so the panorama doesn't give the answer away
  { title: 'Your turn: pick a landing site', site: 'connecting-ridge', start: CHALLENGE.start, days: CHALLENGE.days },
]

/** Metrics for several sites over a range, observer 2 m, computed in the worker. */
function useMetricsFor(data: AppData, ids: string[], startMs: number, endMs: number): (Metrics | null)[] {
  const sites = ids.map((id) => data.sites.find((s) => s.id === id)!)
  const reqs = useMemo(() => sites.map((s) => seriesRequest(s, 0, data.horizons.heightsM, startMs, endMs)), [sites.map((s) => s.id).join(), startMs, endMs, data])
  const series = useManySeries(reqs)
  return useMemo(() => series.map((s) => (s ? computeMetrics(s, CRITERIA) : null)), [series])
}

const pct = (m: Metrics | null | undefined, k: 'sunMeanPct' | 'earthPct' | 'bothPct') => (m ? `${m[k].toFixed(1)}%` : '…')

function PlayMonth() {
  const playing = useApp((s) => s.playing)
  const setPlaying = useApp((s) => s.setPlaying)
  const setSpeed = useApp((s) => s.setSpeed)
  return (
    <button
      type="button"
      onClick={() => {
        setSpeed(72)
        setPlaying(!playing)
      }}
      aria-pressed={playing}
      className="mt-4 rounded-full bg-bright px-5 py-2.5 text-sm font-semibold text-sky"
    >
      {playing ? 'Pause' : 'Play the month'}
    </button>
  )
}

function Body({ step, data, onSite }: { step: number; data: AppData; onSite: (id: string) => void }) {
  const siteId = useApp((s) => s.siteId)
  const full = useMetricsFor(data, ['connecting-ridge', 'shackleton-floor', 'malapert-massif'], AHEAD_MS, MAX_MS)
  const [ridge, floor, malapert] = full
  const walls = maskExtremes(data.horizons.mask(data.sites.find((s) => s.id === 'shackleton-floor')!.mask_index, 0))

  switch (step) {
    case 0:
      return (
        <>
          <p>
            At the lunar south pole the Sun never gets far above the horizon. The Moon's axis is tilted only 1.5°, against
            Earth's 23.4°, so instead of rising high each day the Sun circles the whole horizon once every 29.5 days. It rarely
            climbs higher than a finger's width held at arm's length.
          </p>
          <p className="mt-3">
            Press play to watch a month pass at the Connecting ridge. The yellow line is the Sun's path; the grey silhouette is
            the real terrain around the site, from NASA's LOLA laser altimeter.
          </p>
          <PlayMonth />
        </>
      )
    case 1:
      return (
        <>
          <p>
            Because the light comes in so low, height decides almost everything. The Connecting ridge stands nearly 5 km higher
            than the floor of Shackleton crater, about 20 km away. Over 2026 to 2030 the ridge sees{' '}
            <strong className="text-sun">{pct(ridge, 'sunMeanPct')}</strong> of the Sun on average. The crater floor sees{' '}
            <strong className="text-sun">{pct(floor, 'sunMeanPct')}</strong>.
          </p>
          <div className="mt-4 flex gap-2" role="group" aria-label="Compare the two places">
            {[
              ['connecting-ridge', 'Stand on the ridge'],
              ['shackleton-floor', 'Stand in the crater'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={siteId === id}
                onClick={() => onSite(id)}
                className={`rounded-full border px-4 py-2 text-sm ${siteId === id ? 'border-bright text-bright' : 'border-regolith text-dust'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )
    case 2:
      return (
        <p>
          From the floor of Shackleton crater, the walls rise {walls.min.toFixed(0)}° to {walls.max.toFixed(0)}° above you, far
          higher than the Sun ever climbs at the pole. Craters like this are permanently shadowed. They are among the coldest
          places measured in the solar system and may hold water ice, one reason missions want to land close to them.
        </p>
      )
    case 3:
      return (
        <p>
          From the Moon, Earth stays in almost the same part of the sky, but over a month it drifts up to about 8° up and down
          and side to side. This drift is called libration. Near the pole it decides whether Earth clears the horizon. Malapert
          Massif, on the side of the Moon that faces Earth, has Earth in view <strong className="text-earth">{pct(malapert, 'earthPct')}</strong>{' '}
          of the time over 2026 to 2030. The Connecting ridge, on the side of the pole facing away from Earth, has it{' '}
          <strong className="text-earth">{pct(ridge, 'earthPct')}</strong>.
        </p>
      )
    case 4:
      return <TogetherStep data={data} />
    default:
      return <Challenge data={data} />
  }
}

function TogetherStep({ data }: { data: AppData }) {
  const start = MONTH_START
  const end = MONTH_START + 30 * DAY_MS
  const ids = ['connecting-ridge', 'malapert-massif']
  const sites = ids.map((id) => data.sites.find((s) => s.id === id)!)
  const reqs = useMemo(() => sites.map((s) => seriesRequest(s, 0, data.horizons.heightsM, start, end)), [data])
  const series = useManySeries(reqs)
  const metrics = series.map((s) => (s ? computeMetrics(s, CRITERIA) : null))
  return (
    <>
      <p>
        A lander needs sunlight for power and a clear line to Earth to send its data straight home. The strips show when each
        happens during January 2027 at two sites. Long stretches of both are what planners look for.
      </p>
      <div className="mt-4">
        <Timeline rows={sites.map((s, i) => ({ label: s.name, series: series[i] }))} startMs={start} endMs={end} />
      </div>
      <p className="mt-2 text-sm text-dust">
        Both at once: {sites[0].name} {pct(metrics[0], 'bothPct')}, {sites[1].name} {pct(metrics[1], 'bothPct')} of the month.
      </p>
    </>
  )
}

function Challenge({ data }: { data: AppData }) {
  const [choice, setChoice] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [reveal, setReveal] = useState(false)
  const groupId = useId()
  const end = CHALLENGE.start + CHALLENGE.days * DAY_MS
  const metrics = useMetricsFor(data, CHALLENGE.sites, CHALLENGE.start, end)
  const sites = CHALLENGE.sites.map((id) => data.sites.find((s) => s.id === id)!)
  const passes = (m: Metrics) => m.sunMeanPct >= CHALLENGE.minSunPct && m.earthPct >= CHALLENGE.minEarthPct
  const ready = metrics.every((m) => m)
  const best = ready
    ? sites
        .map((s, i) => ({ s, m: metrics[i]! }))
        .filter((x) => passes(x.m))
        .sort((a, b) => b.m.bothPct - a.m.bothPct)[0]
    : undefined
  const picked = choice ? { s: sites[CHALLENGE.sites.indexOf(choice)], m: metrics[CHALLENGE.sites.indexOf(choice)] } : null
  const verdict = (s: Site, m: Metrics) => {
    const sunOk = m.sunMeanPct >= CHALLENGE.minSunPct
    const earthOk = m.earthPct >= CHALLENGE.minEarthPct
    if (sunOk && earthOk) return `${s.name} works: sunlight ${m.sunMeanPct.toFixed(0)}% and Earth in view ${m.earthPct.toFixed(0)}% of the time.`
    if (sunOk) return `${s.name} has plenty of sunlight (${m.sunMeanPct.toFixed(0)}%), but Earth is in view only ${m.earthPct.toFixed(0)}% of the time.`
    if (earthOk) return `${s.name} sees Earth ${m.earthPct.toFixed(0)}% of the time, but gets only ${m.sunMeanPct.toFixed(0)}% sunlight.`
    return `${s.name} falls short on both: sunlight ${m.sunMeanPct.toFixed(0)}%, Earth in view ${m.earthPct.toFixed(0)}%.`
  }
  const setView = useApp((s) => s.setView)
  const setRange = useApp((s) => s.setRange)
  const setSite = useApp((s) => s.setSite)
  const setCompare = useApp((s) => s.setCompare)

  return (
    <>
      <p>
        A 14-day mission lands on {formatUtc(CHALLENGE.start).slice(0, 10)} at 00:00 UTC. It needs sunlight at least{' '}
        {CHALLENGE.minSunPct}% of the time for power, and Earth in view at least half the time for radio. Which site would you
        choose?
      </p>
      <fieldset className="mt-4">
        <legend className="sr-only">Candidate sites</legend>
        <div className="grid gap-2 sm:grid-cols-2" id={groupId}>
          {sites.map((s) => (
            <label
              key={s.id}
              className={`flex cursor-pointer items-center gap-2 rounded-sm border px-3 py-2 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-bright ${
                choice === s.id ? 'border-bright text-bright' : 'border-regolith text-dust'
              }`}
            >
              <input
                type="radio"
                name="challenge"
                className="accent-bright"
                checked={choice === s.id}
                onChange={() => {
                  setChoice(s.id)
                  setChecked(false)
                  setSite(s.id)
                }}
              />
              {s.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={!choice} onClick={() => setChecked(true)} className="rounded-full bg-bright px-5 py-2.5 text-sm font-semibold text-sky disabled:opacity-40">
          Check my choice
        </button>
        <button type="button" onClick={() => setReveal(true)} className="rounded-full border border-regolith px-5 py-2.5 text-sm text-dust hover:border-dust">
          Show every site
        </button>
      </div>
      <div aria-live="polite">
        {checked && picked && (
          <p className="mt-4">{picked.m ? verdict(picked.s, picked.m) : 'Working it out…'}</p>
        )}
        {reveal && (
          <table className="mt-4 w-full text-sm tabular">
            <caption className="sr-only">Every candidate site for the 14-day mission</caption>
            <thead>
              <tr className="text-left text-xs text-dust">
                <th scope="col" className="py-1 font-normal">Site</th>
                <th scope="col" className="py-1 text-right font-normal">
                  <SunGlyph className="mr-1 inline text-sun" />
                  Sunlight
                </th>
                <th scope="col" className="py-1 text-right font-normal">
                  <EarthGlyph className="mr-1 inline text-earth" />
                  Earth in view
                </th>
                <th scope="col" className="py-1 text-right font-normal">Meets both</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((s, i) => {
                const m = metrics[i]
                return (
                  <tr key={s.id} className={`border-t border-shadow-2 ${best?.s.id === s.id ? 'text-bright' : 'text-dust'}`}>
                    <td className="py-1.5">{s.name}</td>
                    <td className="py-1.5 text-right">{pct(m, 'sunMeanPct')}</td>
                    <td className="py-1.5 text-right">{pct(m, 'earthPct')}</td>
                    <td className="py-1.5 text-right">{m ? (passes(m) ? 'Yes' : 'No') : '…'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {reveal && best && (
          <p className="mt-3">
            The best choice is <strong>{best.s.name}</strong>. The sunniest spot, the Connecting ridge, loses Earth for most of the
            fortnight, and the site with the best view of Earth doesn't get enough light. Planning is a trade-off.
          </p>
        )}
      </div>
      {reveal && (
        <button
          type="button"
          className="mt-4 text-sm text-bright underline underline-offset-2"
          onClick={() => {
            setRange(CHALLENGE.start, end)
            if (best) {
              setSite(best.s.id)
              // The winner against the sunniest and the most Earth-facing candidates
              const sunniest = [...sites].sort((a, b) => metrics[CHALLENGE.sites.indexOf(b.id)]!.sunMeanPct - metrics[CHALLENGE.sites.indexOf(a.id)]!.sunMeanPct)[0]
              const earthiest = [...sites].sort((a, b) => metrics[CHALLENGE.sites.indexOf(b.id)]!.earthPct - metrics[CHALLENGE.sites.indexOf(a.id)]!.earthPct)[0]
              setCompare([...new Set([best.s.id, sunniest.id, earthiest.id])])
            }
            setView('compare')
          }}
        >
          Compare these sites in the planner
        </button>
      )}
    </>
  )
}

export default function Explore({ data }: { data: AppData }) {
  const [step, setStep] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const setSite = useApp((s) => s.setSite)
  const setRange = useApp((s) => s.setRange)
  const setTime = useApp((s) => s.setTime)
  const setPlaying = useApp((s) => s.setPlaying)
  const setHeightIndex = useApp((s) => s.setHeightIndex)
  const siteId = useApp((s) => s.siteId)
  const def = STEPS[step]

  useEffect(() => {
    setPlaying(false)
    setHeightIndex(0)
    setSite(def.site)
    setRange(def.start, def.start + def.days * DAY_MS)
    setTime(def.start)
  }, [step, def, setPlaying, setHeightIndex, setSite, setRange, setTime])

  const go = (i: number) => {
    setStep(i)
    requestAnimationFrame(() => heading.current?.focus())
  }

  const site = data.sites.find((s) => s.id === siteId) ?? data.sites[0]
  const scene = useSiteScene(data, site)

  return (
    <main className="mx-auto max-w-5xl px-4 py-4 lg:px-6">
      <p className="text-xs text-dust">
        Step {step + 1} of {STEPS.length}
      </p>
      <h2 ref={heading} tabIndex={-1} className="mt-1 font-display text-2xl font-medium outline-none">
        {def.title}
      </h2>
      <p className="mt-1 text-sm text-dust">
        {site.name}, lander height 2 m
      </p>
      <div className="mt-3">
        <Panorama
          key={`${step}-${site.id}`}
          mask={scene.mask}
          track={scene.track}
          bodies={scene.bodies}
          sunFrac={scene.sunFrac}
          earthVis={scene.earthVis}
          initialWidth={def.width ?? 360}
          initialFollow={def.follow ?? 'none'}
        />
      </div>
      <div className="mt-4 max-w-[68ch] text-base leading-relaxed">
        <Body step={step} data={data} onSite={setSite} />
      </div>
      <nav aria-label="Story steps" className="mt-8 flex items-center justify-between gap-3 border-t border-shadow-2 pt-4">
        <button type="button" onClick={() => go(step - 1)} disabled={step === 0} className="rounded-full border border-regolith px-5 py-2.5 text-sm disabled:opacity-30">
          Back
        </button>
        <ol className="flex gap-1.5" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-label={`Step ${i + 1}: ${s.title}`}
                aria-current={i === step ? 'step' : undefined}
                className={`block size-2.5 rounded-full ${i === step ? 'bg-bright' : 'bg-regolith hover:bg-dust'}`}
              />
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => go(step + 1)} disabled={step === STEPS.length - 1} className="rounded-full bg-bright px-5 py-2.5 text-sm font-semibold text-sky disabled:opacity-30">
          Next
        </button>
      </nav>
    </main>
  )
}
