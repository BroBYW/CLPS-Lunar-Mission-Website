import { useEffect, useId, useMemo, useState } from 'react'
import type { AppData } from '../../data/load.ts'
import { TRIES, best, dailyMission, dailyNumber, feasible, grade, squares, type Graded } from '../../lib/daily.ts'
import type { WindowScores } from '../../lib/finder.ts'
import { fmtHours } from '../../lib/format.ts'
import { DAY_MS, HOUR_MS, formatUtcDate, parseUtc } from '../../lib/time.ts'
import { MAX_MS, useApp } from '../../state/store.ts'
import { requestScan } from '../../workers/client.ts'
import { SitePicker } from '../SitePicker.tsx'

const RANK_TEXT = { sun: 'more sunlight', both: 'more time with both the Sun and Earth', earth: 'more time with Earth in view', dark: 'shorter darkness' }
const SHARE_URL = 'https://clps-lunar-mission-browser.vercel.app/?view=play&game=daily'

/** Saved tries for today, a convenience only: a private window simply starts afresh. */
function loadTries(number: number): { siteId: string; day: number }[] {
  try {
    const v = JSON.parse(localStorage.getItem(`clps-daily-${number}`) ?? '[]')
    return Array.isArray(v) ? v.filter((t) => typeof t?.siteId === 'string' && Number.isInteger(t?.day)) : []
  } catch {
    return []
  }
}
function saveTries(number: number, tries: { siteId: string; day: number }[]): void {
  try {
    localStorage.setItem(`clps-daily-${number}`, JSON.stringify(tries))
  } catch {
    // storage blocked: the tries last until the page closes
  }
}

/**
 * Daily landing challenge (lib/daily.ts): the same mission for everyone each day. Pick a site and a start date; each
 * try is scored with the Find dates view's code against the best window of any site that year.
 */
export function DailyChallenge({ data }: { data: AppData }) {
  const number = useMemo(() => Math.max(1, dailyNumber(Date.now())), [])
  const raw = useMemo(() => dailyMission(number), [number])
  const yearStart = Date.UTC(raw.year, 0, 1)
  const days = Math.round((Date.UTC(raw.year + 1, 0, 1) - yearStart) / DAY_MS)
  const [scores, setScores] = useState<WindowScores[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [tries, setTries] = useState(() => loadTries(number))
  const [siteId, setSiteId] = useState(data.sites[0].id)
  const [date, setDate] = useState(() => formatUtcDate(yearStart))
  const [copied, setCopied] = useState(false)
  const dateId = useId()

  useEffect(() => {
    let live = true
    requestScan({
      sites: data.sites.map((s) => ({ lat: s.lat, lon: s.lon, heightM: s.height_m + data.horizons.heightsM[0], maskIndex: s.mask_index })),
      heightIndex: 0,
      startMs: yearStart,
      days,
      lengthDays: raw.lengthDays,
      stepMs: HOUR_MS,
      limitMs: MAX_MS,
      criteria: { darkThreshold: 0, earthMarginDeg: 0 },
    }).then(
      (l) => live && setScores(l),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [data, raw, yearStart, days])

  const mission = useMemo(() => (scores ? feasible(raw, scores) : raw), [raw, scores])
  const top = useMemo(() => (scores ? best(mission, scores) : null), [mission, scores])
  const graded = useMemo((): Graded[] => {
    if (!scores || !top) return []
    return tries.flatMap((t) => {
      const site = data.sites.findIndex((s) => s.id === t.siteId)
      return site < 0 ? [] : [grade(mission, scores, top, site, t.day)]
    })
  }, [scores, top, tries, mission, data.sites])
  const bestPct = graded.reduce((m, g) => Math.max(m, g.pct), 0)
  const done = graded.length >= TRIES || bestPct >= 99.5

  const parsed = parseUtc(date)
  const day = Number.isNaN(parsed) ? -1 : Math.round((parsed - yearStart) / DAY_MS)
  const dayValid = day >= 0 && day < days && !!scores && !Number.isNaN(scores[0].sunPct[day])
  const check = () => {
    if (!dayValid || done) return
    const next = [...tries, { siteId, day }]
    setTries(next)
    saveTries(number, next)
  }
  const open = (site: number, d: number) => {
    const s = useApp.getState()
    const t0 = yearStart + d * DAY_MS
    s.setSite(data.sites[site].id)
    s.setRange(t0, t0 + mission.lengthDays * DAY_MS)
    s.setTime(t0)
    s.setView('plan')
  }
  const share = async () => {
    const text = `CLPS Lunar Mission daily #${number}: ${bestPct.toFixed(0)}% ${squares(graded)}\n${SHARE_URL}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const l = mission.limits
  const primary = 'rounded-sm border border-sun px-4 py-1.5 text-sm text-sun hover:bg-sun hover:text-sky disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-sun'
  const btn = 'rounded-sm border border-regolith px-3 py-1.5 text-sm text-dust hover:border-dust hover:text-bright'

  if (failed) return <p className="text-sm text-alert">The challenge didn't load. Reload the page to try again.</p>

  return (
    <section aria-label="Daily landing challenge">
      <p className="text-sm text-dust">
        Challenge #{number}, {formatUtcDate(Date.now())} UTC. Everyone gets the same mission today; a new one comes at midnight UTC.
      </p>
      <div className="mt-3 max-w-prose rounded-sm border border-shadow-2 bg-shadow px-4 py-3">
        <p className="font-display text-lg text-bright">
          Land for {mission.lengthDays} days in {mission.year}
        </p>
        <ul className="mt-1 list-disc pl-5 text-sm">
          <li>at least {l.minSunPct}% sunlight</li>
          <li>no darkness longer than {fmtHours(l.maxDarkH)}</li>
          <li>Earth in view at least {l.minEarthPct}% of the time</li>
        </ul>
        <p className="mt-1 text-sm text-dust">
          Among landings that meet all three, {RANK_TEXT[mission.rankBy]} scores higher. Your score is your best try as a share of the
          best landing anywhere that year, for a lander 2 m up. You have {TRIES} tries.
        </p>
      </div>

      {!scores ? (
        <p className="mt-4 text-sm text-dust">Scoring every site and day of {mission.year}…</p>
      ) : (
        <>
          {!done && (
            <div className="mt-4 flex max-w-3xl flex-wrap items-end gap-3">
              <SitePicker label="Site" sites={data.sites} value={siteId} onChange={setSiteId} className="min-w-56 flex-1" />
              <div>
                <label htmlFor={dateId} className="block text-xs text-dust">
                  Landing date (UTC)
                </label>
                <input
                  id={dateId}
                  type="date"
                  value={date}
                  min={formatUtcDate(yearStart)}
                  max={formatUtcDate(yearStart + (days - 1) * DAY_MS)}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 rounded-sm border border-regolith bg-sky px-2 py-1.5 text-sm"
                />
              </div>
              <button type="button" className={primary} disabled={!dayValid} onClick={check}>
                Try it ({TRIES - graded.length} left)
              </button>
            </div>
          )}
          {!dayValid && !done && <p className="mt-2 text-xs text-alert">Pick a date in {mission.year} with {mission.lengthDays} days of data after it.</p>}

          <ol className="mt-4 max-w-3xl space-y-2 text-sm" aria-live="polite">
            {graded.map((g, k) => (
              <li key={k} className="rounded-sm border border-shadow-2 px-3 py-2">
                <span className="text-dust">Try {k + 1}:</span> {data.sites[g.site].name} from {formatUtcDate(yearStart + g.day * DAY_MS)}{' '}
                <span className={`tabular ${g.pass ? 'text-sun' : 'text-alert'}`}>{g.pass ? `${g.pct.toFixed(0)}%` : 'misses a limit'}</span>
                <span className="mt-1 block text-xs text-dust">
                  {g.checks.sun ? '✓' : '✗'} sunlight {g.sunPct.toFixed(0)}% · {g.checks.dark ? '✓' : '✗'} longest darkness {fmtHours(g.darkH)} ·{' '}
                  {g.checks.earth ? '✓' : '✗'} Earth {g.earthPct.toFixed(0)}% · both {g.bothPct.toFixed(0)}%
                </span>
              </li>
            ))}
          </ol>

          {done && top && (
            <div className="mt-4 max-w-prose" aria-live="polite">
              <p className="font-display text-xl text-bright">
                Your score: {bestPct.toFixed(0)}% {squares(graded)}
              </p>
              <p className="mt-1 text-sm">
                The best landing was {data.sites[top.site].name} from {formatUtcDate(yearStart + top.day * DAY_MS)}.{' '}
                <button type="button" className="underline decoration-regolith underline-offset-2 hover:text-bright" onClick={() => open(top.site, top.day)}>
                  Open it in the Plan view
                </button>
              </p>
              <button type="button" className={`${btn} mt-3`} onClick={() => void share()}>
                {copied ? 'Copied: paste it anywhere' : 'Copy my result'}
              </button>
            </div>
          )}
          <p className="mt-4 text-xs text-dust">
            Stuck? The Find dates view shows every site and day at once, but that would be cheating. A little.
          </p>
        </>
      )}
    </section>
  )
}
