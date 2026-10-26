import { useMemo } from 'react'
import type { AppData } from '../data/load.ts'
import { fmtDeg, fmtHours, fmtPct } from '../lib/format.ts'
import { computeMetrics } from '../lib/metrics.ts'
import { DAY_MS, formatUtc } from '../lib/time.ts'
import { useApp } from '../state/store.ts'
import { seriesRequest, useSeries } from '../workers/client.ts'

interface Mission {
  id: string
  siteId: string
  name: string
  when: string
  landedMs: number
  /** When the lander stopped working */
  endedMs: number
  /** The sources only give the end roughly ("about a week") */
  endApprox?: boolean
  story: string
  /** Extra caveat about what the 10 m maps can and can't show at this spot */
  caveat?: string
  sources: [string, string][]
}

const MISSIONS: Mission[] = [
  {
    id: 'im1',
    siteId: 'im1-odysseus',
    name: 'IM-1 Odysseus',
    when: 'Feb 2024',
    landedMs: Date.UTC(2024, 1, 22, 23, 23),
    endedMs: Date.UTC(2024, 1, 29, 12),
    endApprox: true,
    story:
      'Intuitive Machines’ Odysseus, the first US lander on the Moon since 1972, touched down near Malapert A on 22 February 2024. It came to rest tilted, on a 12° slope inside a worn 1 km crater, and worked for about a week.',
    sources: [
      ['NASA: LRO images Odysseus', 'https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/'],
      ['LROC image 1360', 'https://lroc.im-ldi.com/images/1360'],
    ],
  },
  {
    id: 'im2',
    siteId: 'im2-athena',
    name: 'IM-2 Athena',
    when: 'Mar 2025',
    landedMs: Date.UTC(2025, 2, 6, 17, 32),
    endedMs: Date.UTC(2025, 2, 7, 6, 15),
    story:
      'Athena touched down on 6 March 2025, about 250 m from its target on Mons Mouton, but on its side inside a small crater. With its solar panels turned away from the low Sun and the crater cold, its batteries ran down, and the mission was declared over early the next day.',
    caveat:
      'The numbers below are for a 2 m observer on the 10 m maps. They can’t see the small crater Athena lay in, or its tilt, so its panels got less light than this.',
    sources: [
      ['SpacePolicyOnline', 'https://spacepolicyonline.com/news/im-2-mission-ends-one-day-after-lunar-landing/'],
      ['Spaceflight Now', 'https://spaceflightnow.com/2025/03/07/intuitive-machines-im-2-mission-ends-with-lander-on-its-side-on-the-moon/'],
      ['LROC image 1408', 'https://lroc.im-ldi.com/images/1408'],
    ],
  },
]

/** The dates a replay opens: from the day before landing to three days after the mission ended. */
const rangeOf = (m: Mission): [number, number] => [Math.floor(m.landedMs / DAY_MS) * DAY_MS - DAY_MS, Math.ceil(m.endedMs / DAY_MS) * DAY_MS + 3 * DAY_MS]

/** Past south-pole landings, replayed in the Plan view at their real sites and dates. */
export function MissionReplays({ data }: { data: AppData }) {
  const siteId = useApp((s) => s.siteId)
  const startMs = useApp((s) => s.startMs)
  const endMs = useApp((s) => s.endMs)
  const missions = MISSIONS.filter((m) => data.sites.some((s) => s.id === m.siteId))
  const active = missions.find((m) => m.siteId === siteId && startMs <= m.landedMs && m.landedMs < endMs)

  const play = (m: Mission) => {
    const s = useApp.getState()
    const [a, b] = rangeOf(m)
    s.setSite(m.siteId)
    s.setRange(a, b)
    s.setTime(m.landedMs)
    s.setPlaying(false)
  }

  return (
    <section aria-label="Replay a real landing" className="mb-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-dust">Replay a real landing:</span>
        {missions.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={active?.id === m.id}
            onClick={() => play(m)}
            className="rounded-sm border border-regolith px-2 py-1 text-dust hover:border-dust hover:text-bright aria-pressed:border-bright aria-pressed:text-bright"
          >
            {m.name}, {m.when}
          </button>
        ))}
      </div>
      {active && <MissionCard data={data} mission={active} />}
    </section>
  )
}

function MissionCard({ data, mission }: { data: AppData; mission: Mission }) {
  const site = data.sites.find((s) => s.id === mission.siteId)!
  const { series } = useSeries(seriesRequest(site, 0, data.horizons.heightsM, mission.landedMs, mission.endedMs))
  const m = useMemo(() => (series ? computeMetrics(series, { darkThreshold: 0, earthMarginDeg: 0 }) : null), [series])
  const hours = (mission.endedMs - mission.landedMs) / 3_600_000

  return (
    <div className="mt-3 max-w-3xl rounded-sm border border-shadow-2 bg-shadow px-4 py-3 text-sm">
      <p className="font-display text-base text-bright">
        {mission.name}, landed {formatUtc(mission.landedMs)}
      </p>
      <p className="mt-1 text-dust">{mission.story}</p>
      {series && m && series.n > 0 && (
        <p className="mt-2 text-bright">
          At touchdown the Sun stood {fmtDeg(series.sunEl[0])} above the horizontal, with {fmtPct(series.fSun[0])} of its disk above the
          terrain, and Earth was {series.earthClear[0] > 0 ? 'in view' : 'below the skyline'}. Over the {mission.endApprox ? `roughly ${(hours / 24).toFixed(0)} days` : fmtHours(hours)} it
          worked, the site saw{' '}
          {m.sunMeanPct.toFixed(0)}% sunlight and had Earth in view {m.earthPct.toFixed(0)}% of the time.
        </p>
      )}
      {mission.caveat && <p className="mt-2 text-xs text-dust">{mission.caveat}</p>}
      <p className="mt-2 text-xs text-dust">
        Press Play to watch the Sun and Earth move over those days. Sources:{' '}
        {mission.sources.map(([label, url], i) => (
          <span key={url}>
            {i > 0 && ', '}
            <a href={url} className="underline decoration-regolith underline-offset-2 hover:text-bright">
              {label}
            </a>
          </span>
        ))}
        .
      </p>
    </div>
  )
}
