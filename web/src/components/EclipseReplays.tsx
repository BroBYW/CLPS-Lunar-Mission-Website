import { useId, useMemo, useState } from 'react'
import type { AppData, Site } from '../data/load.ts'
import { siteFrame } from '../lib/astro.ts'
import { findEclipses, siteEclipse, type Eclipse, type SiteEclipse } from '../lib/eclipses.ts'
import { DAY_MS, HOUR_MS, formatUtc, formatUtcDate } from '../lib/time.ts'
import { MAX_MS, MIN_MS, useApp } from '../state/store.ts'

const hhmm = (t: number) => new Date(t).toISOString().slice(11, 16)
const day = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/**
 * Eclipses seen from the Moon (lib/eclipses.ts): every lunar eclipse of 2024–2030 is, from the Moon, Earth crossing
 * the Sun. Pick one to watch it from the selected site in the panorama.
 */
export function EclipseReplays({ data, site }: { data: AppData; site: Site }) {
  const eclipses = useMemo(() => findEclipses(data.ephemeris, MIN_MS, MAX_MS), [data])
  const startMs = useApp((s) => s.startMs)
  const endMs = useApp((s) => s.endMs)
  const heightIndex = useApp((s) => s.heightIndex)
  const [pick, setPick] = useState(() => Math.max(0, eclipses.findIndex((e) => e.peakMs > Date.now())))
  const pickId = useId()
  // An eclipse is on show when the dates are its replay window
  const active = eclipses.find((e) => Math.abs(startMs - replayRange(e)[0]) < HOUR_MS && Math.abs(endMs - replayRange(e)[1]) < HOUR_MS) ?? null

  const watch = (e: Eclipse) => {
    const s = useApp.getState()
    const [a, b] = replayRange(e)
    s.setRange(a, b)
    s.setTime(replayStart(e))
    s.setSpeed(1)
    useApp.setState({ panoramaFocus: { n: s.panoramaFocus.n + 1, follow: 'sun', width: 24 } })
    s.setPlaying(true)
  }

  return (
    <section aria-label="Eclipses seen from the Moon" className="mb-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor={pickId} className="text-dust">
          Watch Earth eclipse the Sun:
        </label>
        <select id={pickId} value={pick} onChange={(e) => setPick(Number(e.target.value))} className="rounded-sm border border-regolith bg-sky px-2 py-1">
          {eclipses.map((e, i) => (
            <option key={e.peakMs} value={i}>
              {day(e.peakMs)}
            </option>
          ))}
        </select>
        <button type="button" className="rounded-sm border border-regolith px-2 py-1 text-dust hover:border-dust hover:text-bright" onClick={() => eclipses[pick] && watch(eclipses[pick])}>
          Watch
        </button>
      </div>
      {active && <EclipseCard data={data} site={site} eclipse={active} heightIndex={heightIndex} />}
    </section>
  )
}

/** The whole UTC days around the eclipse (so a shared link opens the same dates), playing from an hour before it. */
function replayRange(e: Eclipse): [number, number] {
  return [Math.floor((e.startMs - HOUR_MS) / DAY_MS) * DAY_MS, Math.ceil((e.endMs + HOUR_MS) / DAY_MS) * DAY_MS]
}
const replayStart = (e: Eclipse) => Math.floor((e.startMs - HOUR_MS) / (10 * 60_000)) * 10 * 60_000

function EclipseCard({ data, site, eclipse, heightIndex }: { data: AppData; site: Site; eclipse: Eclipse; heightIndex: number }) {
  const heightsM = data.horizons.heightsM
  const at = (s: Site): SiteEclipse | null =>
    s.mask_index < 0 ? null : siteEclipse(data.ephemeris, siteFrame(s.lat, s.lon, s.height_m + heightsM[heightIndex]), data.horizons.mask(s.mask_index, heightIndex), eclipse)
  const here = useMemo(() => at(site), [site, eclipse, heightIndex])
  const elsewhere = useMemo(() => (here?.visible ? [] : data.sites.filter((s) => s.id !== site.id && at(s)?.visible)), [here, data.sites, site.id, eclipse, heightIndex])
  const setSite = useApp((s) => s.setSite)

  let what: string
  if (!here) what = `Eclipses are worked out for the listed sites only, not for a dropped pin.`
  else if (!here.visible) what = `The Sun is behind the terrain at ${site.name} for the whole eclipse, so there is nothing to see from here.`
  else if (Number.isNaN(here.dimMs)) what = `From ${site.name}, Earth passes beside the Sun without covering it.`
  else if (!Number.isNaN(here.hiddenMs))
    what = `From ${site.name}, Earth starts to cover the Sun at ${hhmm(here.dimMs)} UTC, hides all of it from ${hhmm(here.hiddenMs)} to ${hhmm(here.backMs)}, and has passed by ${hhmm(here.undimMs)}.`
  else what = `From ${site.name}, Earth covers up to ${Math.round((1 - here.minFraction) * 100)}% of the Sun between ${hhmm(here.dimMs)} and ${hhmm(here.undimMs)} UTC.`

  return (
    <div className="mt-3 max-w-3xl rounded-sm border border-shadow-2 bg-shadow px-4 py-3 text-sm" aria-live="polite">
      <p className="font-display text-base text-bright">Earth eclipses the Sun, {formatUtcDate(eclipse.peakMs)}</p>
      <p className="mt-1">{what}</p>
      {elsewhere.length > 0 && (
        <p className="mt-2 text-dust">
          Watch it from{' '}
          {elsewhere.map((s, i) => (
            <span key={s.id}>
              {i > 0 && ', '}
              <button type="button" className="underline decoration-regolith underline-offset-2 hover:text-bright" onClick={() => setSite(s.id)}>
                {s.name}
              </button>
            </span>
          ))}
          .
        </p>
      )}
      <p className="mt-2 text-xs text-dust">
        From Earth this is the lunar eclipse of {day(eclipse.peakMs)}, greatest at {formatUtc(eclipse.peakMs)} as seen from the Moon's centre. The
        panorama follows the Sun, zoomed in; Earth is the large disk. The Sun drawn is the solid disk: Earth's atmosphere, which
        turns the eclipsed Moon red, is left out.
      </p>
    </div>
  )
}
