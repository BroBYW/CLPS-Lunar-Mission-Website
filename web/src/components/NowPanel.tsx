import type { ReactNode } from 'react'
import type { AppData } from '../data/load.ts'
import { DEG, type SiteFrame } from '../lib/astro.ts'
import { fmtDeg, fmtPct } from '../lib/format.ts'
import { fmtDuration, type Now } from '../lib/nextEvents.ts'
import { formatUtc } from '../lib/time.ts'
import { useApp } from '../state/store.ts'
import { describeNow, useSkyNow, type SiteNow, type SkyNow } from '../state/useSkyNow.ts'
import { EarthGlyph, SunGlyph } from './Glyphs.tsx'

/** "Up, 82% of its disk visible", "Down: behind the terrain", "Hidden by Earth (an eclipse)" */
export function sunStateText(n: Omit<SiteNow, 'sky'>, up: boolean): string {
  if (up) return n.sunFrac >= 1 ? 'Up, the whole disk visible' : `Up, ${fmtPct(n.sunFrac)} of its disk visible`
  if (n.terrainFrac > n.sunFrac + 1e-6) return 'Hidden by Earth (an eclipse)'
  if (n.sunFrac > 0) return `Dark by your threshold: ${fmtPct(n.sunFrac)} of the disk visible`
  return 'Down: behind the terrain'
}

/** "Sets in 3 d 4 h", "Rises in 11 h 20 min", or how long nothing changes. */
export function changeText(body: 'sun' | 'earth', now: Now, timeMs: number, untilMs: number): string {
  const n = now.next
  if (!n) {
    const days = Math.floor((untilMs - timeMs) / 86_400_000)
    const what = body === 'sun' ? (now.up ? 'No sunset' : 'No sunrise') : now.up ? 'No Earthset' : 'No Earthrise'
    return `${what} in the next ${days} days`
  }
  const verb = n.eclipse ? (n.up ? 'Eclipse ends' : 'Eclipse begins') : n.up ? 'Rises' : 'Sets'
  return `${verb} in ${fmtDuration(n.atMs - timeMs)}`
}

/**
 * At the time shown: whether the Sun and Earth are up at the site, how long until each rises or sets (by the same
 * rules as the metrics below), the Sun's elevation, and what that elevation means for a solar panel.
 */
export function NowPanel({ data, frame, mask }: { data: AppData; frame: SiteFrame; mask: Float32Array }) {
  const timeMs = useApp((s) => s.timeMs)
  const sky = useSkyNow(data, frame, mask)
  if (!sky) return null
  const n = describeNow(data, frame, mask, timeMs)
  return <NowCards n={n} sky={sky} timeMs={timeMs} />
}

function NowCards({ n, sky, timeMs }: { n: Omit<SiteNow, 'sky'>; sky: SkyNow; timeMs: number }) {
  const b = n.bodies
  // Power on a panel facing the Sun goes with the cosine of its elevation, on one lying flat with the sine
  const standing = n.sunFrac * Math.cos(b.sunEl * DEG)
  const flat = n.sunFrac * Math.max(0, Math.sin(b.sunEl * DEG))
  return (
    <section aria-label="At the time shown" className="mt-4 grid gap-3 sm:grid-cols-2">
      <Card
        glyph={<SunGlyph className="text-sun" />}
        title="Sun"
        state={sunStateText(n, sky.sun.up)}
        change={changeText('sun', sky.sun, timeMs, sky.untilMs)}
        next={sky.sun.next?.atMs ?? null}
        detail={`Elevation ${fmtDeg(b.sunEl, 2)} above the level horizon, ${n.sunClear >= 0 ? `${fmtDeg(n.sunClear, 2)} above` : `${fmtDeg(-n.sunClear, 2)} below`} the skyline (azimuth ${fmtDeg(b.sunAz, 0)}).`}
        extra={
          n.sunFrac > 0
            ? `A solar panel standing up and turning with the Sun gets ${fmtPct(standing)} of full sunlight; one lying flat, ${fmtPct(flat, flat < 0.1 ? 1 : 0)}.`
            : 'Panels get no direct sunlight now; the battery carries the load.'
        }
      />
      <Card
        glyph={<EarthGlyph className="text-earth" />}
        title="Earth"
        state={sky.earth.up ? `In view, ${fmtDeg(n.earthClear, 2)} above the skyline` : 'Below the skyline: no direct link'}
        change={changeText('earth', sky.earth, timeMs, sky.untilMs)}
        next={sky.earth.next?.atMs ?? null}
        detail={`Elevation ${fmtDeg(b.earthEl, 2)} above the level horizon (azimuth ${fmtDeg(b.earthAz, 0)}).`}
        extra={sky.earth.up ? 'Direct-to-Earth radio works while Earth stays above the skyline, when a Deep Space Network dish faces the Moon (see below).' : 'Until then, data waits on board or goes through a relay orbiter.'}
      />
    </section>
  )
}

function Card({ glyph, title, state, change, next, detail, extra }: { glyph: ReactNode; title: string; state: string; change: string; next: number | null; detail: string; extra: string }) {
  const endMs = useApp((s) => s.endMs)
  const setTime = useApp((s) => s.setTime)
  return (
    <div className="rounded-sm border border-shadow-2 bg-shadow px-4 py-3 text-sm">
      <p className="flex items-center gap-1.5 text-xs text-dust">
        {glyph}
        {title}: {state}
      </p>
      <p className="mt-1 font-display text-xl tabular text-bright">{change}</p>
      {next !== null && (
        <p className="text-xs text-dust">
          at <span className="tabular">{formatUtc(next)}</span>
          {next <= endMs && (
            <button type="button" onClick={() => setTime(next)} className="ml-2 underline decoration-regolith underline-offset-2 hover:text-bright">
              Go there
            </button>
          )}
        </p>
      )}
      <p className="mt-2 text-xs text-dust">{detail}</p>
      <p className="mt-1 text-xs text-dust">{extra}</p>
    </div>
  )
}
