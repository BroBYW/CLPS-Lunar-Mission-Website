import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { loadMastHorizons, type AppData, type MastHorizons } from '../../data/load.ts'
import { fmtPct } from '../../lib/format.ts'
import { BATTERY_STEPS, BUDGET, DEPTH_OF_DISCHARGE, MASTS, PANEL_STEPS, STORE_H, designCost, startState, step, type LanderDesign, type LanderState } from '../../lib/survive.ts'
import { DAY_MS, formatUtc, formatUtcDate, parseUtc } from '../../lib/time.ts'
import { useElementWidth } from '../../lib/useElementWidth.ts'
import { DEFAULT_SITE, MAX_MS, MIN_MS, STEP_MS, useApp } from '../../state/store.ts'
import { initMastWorker, seriesRequest, useSeries } from '../../workers/client.ts'
import type { SeriesRequest } from '../../workers/metrics.worker.ts'
import { EarthGlyph, SunGlyph } from '../Glyphs.tsx'
import { SitePicker } from '../SitePicker.tsx'

const MISSION_DAYS = 28
const SPEEDS = [6, 12, 24]
const kwh = (wh: number) => `${(wh / 1000).toFixed(wh % 1000 ? 1 : 0)} kWh`

type Phase = 'setup' | 'running' | 'over'

/**
 * Survive the lunar night (lib/survive.ts): land at a real site and date, buy a panel, battery and mast from a fixed
 * budget, then keep the lander alive for a lunar day while sending as much science home as you can.
 */
export function SurviveGame({ data }: { data: AppData }) {
  const heightsM = data.horizons.heightsM
  const appSite = useApp((s) => s.siteId)
  const appStart = useApp((s) => s.startMs)
  const [siteId, setSiteId] = useState(() => (data.sites.some((s) => s.id === appSite) ? appSite : DEFAULT_SITE))
  const [day, setDay] = useState(() => formatUtcDate(Math.min(appStart, MAX_MS - MISSION_DAYS * DAY_MS)))
  const [design, setDesign] = useState<LanderDesign>({ panelM2: 1.5, batteryWh: 4000, mastM: 2 })
  const [phase, setPhase] = useState<Phase>('setup')
  const [mast, setMast] = useState<MastHorizons | null>(null)
  const ids = { day: useId(), panel: useId(), battery: useId(), mast: useId() }

  const site = data.sites.find((s) => s.id === siteId) ?? data.sites[0]
  const parsed = parseUtc(day)
  const startMs = Number.isNaN(parsed) ? MIN_MS : Math.min(MAX_MS - MISSION_DAYS * DAY_MS, Math.max(MIN_MS, parsed))
  const endMs = startMs + MISSION_DAYS * DAY_MS
  const cost = designCost(design)

  // The 20 m mast needs the mast planner's horizons
  useEffect(() => {
    if (design.mastM !== 20 || mast) return
    let live = true
    loadMastHorizons()
      .then(async (m) => {
        await initMastWorker(m)
        if (live) setMast(m)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [design.mastM, mast])

  const req = useMemo((): SeriesRequest | null => {
    const hi = heightsM.indexOf(design.mastM)
    if (hi >= 0) return seriesRequest(site, hi, heightsM, startMs, endMs)
    if (!mast) return null
    const mi = mast.meta.sites.indexOf(site.id)
    return mi < 0 ? null : { lat: site.lat, lon: site.lon, heightM: site.height_m + design.mastM, maskIndex: mi, heightIndex: mast.heightsM.indexOf(design.mastM), startMs, endMs, stepMs: STEP_MS, maskSet: 'mast' }
  }, [site, design.mastM, heightsM, mast, startMs, endMs])
  const { series, pending } = useSeries(req)
  const ready = !!series && !pending

  const surprise = () => {
    const pick = data.sites[Math.floor(Math.random() * data.sites.length)]
    const span = (MAX_MS - Date.UTC(2026, 0, 1)) / DAY_MS - MISSION_DAYS
    setSiteId(pick.id)
    setDay(formatUtcDate(Date.UTC(2026, 0, 1) + Math.floor(Math.random() * span) * DAY_MS))
  }

  const btn = 'rounded-sm border border-regolith px-3 py-1.5 text-sm text-dust hover:border-dust hover:text-bright aria-pressed:border-bright aria-pressed:text-bright disabled:opacity-40'
  const primary = 'rounded-sm border border-sun px-4 py-1.5 text-sm text-sun hover:bg-sun hover:text-sky disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-sun'

  if (phase !== 'setup' && series) {
    return <Mission key={`${siteId}/${startMs}/${JSON.stringify(design)}`} siteName={site.name} series={series} design={design} onEnd={() => setPhase('over')} onSetup={() => setPhase('setup')} />
  }

  return (
    <section aria-label="Survive the lunar night">
      <p className="max-w-prose text-sm text-dust">
        Land at a real site on a real date and keep your lander alive for {MISSION_DAYS} days. The Sun, Earth and terrain are the
        Plan view's: when the Sun drops behind the terrain your panel goes dark, and the battery has to last until it comes back.
        Science earns points only when it reaches Earth, and Earth has to be above the skyline to hear you.
      </p>
      <div className="mt-4 grid max-w-3xl gap-4 sm:grid-cols-2">
        <SitePicker label="Landing site" sites={data.sites} value={siteId} onChange={setSiteId} />
        <div>
          <label htmlFor={ids.day} className="block text-xs text-dust">
            Landing date (UTC)
          </label>
          <input
            id={ids.day}
            type="date"
            value={day}
            min={formatUtcDate(MIN_MS)}
            max={formatUtcDate(MAX_MS - MISSION_DAYS * DAY_MS)}
            onChange={(e) => setDay(e.target.value)}
            className="mt-1 w-full rounded-sm border border-regolith bg-sky px-2 py-1.5 text-sm"
          />
        </div>
      </div>
      <button type="button" className={`${btn} mt-3`} onClick={surprise}>
        Surprise me
      </button>

      <h3 className="mt-6 font-display text-lg font-medium">Build your lander</h3>
      <div className="mt-2 grid max-w-3xl gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor={ids.panel} className="block text-xs text-dust">
            Solar panel (tracks the Sun)
          </label>
          <select id={ids.panel} value={design.panelM2} onChange={(e) => setDesign({ ...design, panelM2: Number(e.target.value) })} className="mt-1 w-full rounded-sm border border-regolith bg-sky px-2 py-1.5 text-sm">
            {PANEL_STEPS.map((m) => (
              <option key={m} value={m}>
                {m} m² ({m * 8} points)
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={ids.battery} className="block text-xs text-dust">
            Battery
          </label>
          <select id={ids.battery} value={design.batteryWh} onChange={(e) => setDesign({ ...design, batteryWh: Number(e.target.value) })} className="mt-1 w-full rounded-sm border border-regolith bg-sky px-2 py-1.5 text-sm">
            {BATTERY_STEPS.map((wh) => (
              <option key={wh} value={wh}>
                {kwh(wh)} ({(wh / 1000) * 4} points)
              </option>
            ))}
          </select>
        </div>
        <fieldset>
          <legend className="text-xs text-dust">Mast for the panel</legend>
          <div className="mt-1 flex gap-1">
            {MASTS.map(({ m, cost: c }) => (
              <label key={m} className={`cursor-pointer rounded-sm border px-2 py-1 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-bright ${design.mastM === m ? 'border-bright text-bright' : 'border-regolith text-dust'}`}>
                <input type="radio" name="mast" className="sr-only" checked={design.mastM === m} onChange={() => setDesign({ ...design, mastM: m })} />
                {m} m{c ? ` (${c})` : ''}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="mt-4 max-w-3xl">
        <div className="flex justify-between text-sm">
          <span className="text-dust">Budget</span>
          <span className={`tabular ${cost > BUDGET ? 'text-alert' : 'text-bright'}`}>
            {cost} of {BUDGET} points
          </span>
        </div>
        <div className="mt-1 h-2 bg-shadow-2" aria-hidden="true">
          <div className={`h-full ${cost > BUDGET ? 'bg-alert' : 'bg-sun'}`} style={{ width: `${Math.min(100, cost)}%` }} />
        </div>
        <p className="mt-2 text-xs text-dust">
          The lander needs 60 W to stay warm and awake, and 60 W more for science. A 1 m² panel facing the Sun gives about 400 W. The
          battery can use {Math.round(DEPTH_OF_DISCHARGE * 100)}% of its capacity, and the lander can store {STORE_H} hours of science while
          Earth is out of sight.
        </p>
      </div>
      <button type="button" className={`${primary} mt-4`} disabled={cost > BUDGET || !ready} onClick={() => setPhase('running')}>
        {cost > BUDGET ? 'Over budget' : ready ? `Land on ${formatUtcDate(startMs)}` : 'Loading the sunlight…'}
      </button>
    </section>
  )
}

/** The mission itself: time runs, the player switches science on and off. */
function Mission({ siteName, series, design, onEnd, onSetup }: { siteName: string; series: import('../../lib/series.ts').Series; design: LanderDesign; onEnd: () => void; onSetup: () => void }) {
  const [state, setState] = useState<LanderState>(() => startState(design))
  const [running, setRunning] = useState(true)
  const [speed, setSpeed] = useState(12)
  const [science, setScience] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const charge = useRef(new Float32Array(series.n).fill(Number.NaN))
  const live = useRef({ state, science, speed })
  live.current = { state, science, speed }
  const speedId = useId()

  const note = (msg: string, i: number) => setLog((l) => [`${formatUtc(series.startMs + i * series.stepMs)}: ${msg}`, ...l].slice(0, 6))

  useEffect(() => {
    if (!running) return
    let raf = 0
    let last = performance.now()
    let acc = 0
    const usable = design.batteryWh * DEPTH_OF_DISCHARGE
    const tick = (now: number) => {
      // Up to a second per frame, so slow frames slow the clock only a little
      const dt = Math.min(1, (now - last) / 1000)
      last = now
      acc += (dt * live.current.speed * 3_600_000) / series.stepMs
      let s = live.current.state
      while (acc >= 1 && !s.frozen && !s.done) {
        acc -= 1
        const prev = s
        s = step(s, series, design, live.current.science)
        charge.current[prev.i] = s.chargeWh / usable
        const i = prev.i
        if (i > 0) {
          const sunNow = series.fSun[i] > 0
          if (sunNow !== series.fSun[i - 1] > 0) note(sunNow ? 'the Sun is back' : 'the Sun has set behind the terrain', i)
          const earthNow = series.earthClear[i] > 0
          if (earthNow !== series.earthClear[i - 1] > 0) note(earthNow ? 'Earth is up: sending data' : 'Earth has set: data will wait', i)
          if (prev.chargeWh / usable >= 0.2 && s.chargeWh / usable < 0.2) note('battery below 20%', i)
        }
      }
      setState(s)
      if (s.frozen || s.done) {
        setRunning(false)
        onEnd()
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [running, series, design, onEnd])

  const i = Math.min(state.i, series.n - 1)
  const usable = design.batteryWh * DEPTH_OF_DISCHARGE
  const pct = state.chargeWh / usable
  const dayN = Math.min(MISSION_DAYS, Math.floor((state.i * series.stepMs) / DAY_MS) + 1)
  const over = state.frozen || state.done
  const btn = 'rounded-sm border border-regolith px-3 py-1.5 text-sm text-dust hover:border-dust hover:text-bright aria-pressed:border-bright aria-pressed:text-bright disabled:opacity-40'

  return (
    <section aria-label="Survive the lunar night">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-lg">
          {siteName}, day <span className="tabular">{dayN}</span> of {MISSION_DAYS}
        </p>
        <p className="text-sm text-dust tabular">{formatUtc(series.startMs + state.i * series.stepMs)}</p>
      </div>

      {over ? (
        <div className="mt-4 max-w-prose" aria-live="assertive">
          <p className={`font-display text-2xl ${state.frozen ? 'text-alert' : 'text-sun'}`}>
            {state.frozen ? `Your lander froze on day ${dayN}.` : 'Mission complete!'}
          </p>
          <p className="mt-2">
            You sent <span className="text-bright tabular">{state.sent.toFixed(0)} hours</span> of science home
            {state.stored > 0.5 ? `; ${state.stored.toFixed(0)} more were still waiting for Earth` : ''}
            {state.lost > 0.5 ? `, and lost ${state.lost.toFixed(0)} when the store was full` : ''}.
          </p>
          <p className="mt-2 text-sm text-dust">
            {state.frozen
              ? 'The battery ran flat in a long darkness. Switch science off when the Sun is gone, buy more battery, or raise the panel on a mast to see over the terrain.'
              : 'Can you send more? Science in long sunlit stretches while Earth is up is the cheapest.'}
          </p>
        </div>
      ) : (
        <div className="mt-3 grid max-w-3xl gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <div className="flex justify-between text-sm">
              <span className="text-dust">Battery</span>
              <span className="tabular">{fmtPct(pct)} ({kwh(state.chargeWh)})</span>
            </div>
            <div className="mt-1 h-3 bg-shadow-2" role="meter" aria-label="Battery charge" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)}>
              <div className={`h-full ${pct < 0.2 ? 'bg-alert' : pct < 0.5 ? 'bg-dust' : 'bg-sun'}`} style={{ width: `${pct * 100}%` }} />
            </div>
            <p className="mt-2 text-sm">
              <SunGlyph className="mr-1 inline text-sun" />
              {series.fSun[i] <= 0 ? 'Sun hidden' : series.fSun[i] >= 1 ? 'Full Sun' : `${fmtPct(series.fSun[i])} of the Sun`}: panel {state.solarW.toFixed(0)} W, using{' '}
              {state.loadW} W
              <EarthGlyph className="ml-3 mr-1 inline text-earth" />
              {series.earthClear[i] > 0 ? 'Earth in view' : 'Earth hidden'}
            </p>
            <p className="mt-1 text-sm">
              Science sent home <span className="text-bright tabular">{state.sent.toFixed(0)} h</span>, waiting{' '}
              <span className="tabular">{state.stored.toFixed(0)}</span> of {STORE_H} h
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <button type="button" className={`rounded-sm border px-4 py-2 text-sm ${science ? 'border-sun bg-sun text-sky' : 'border-regolith text-dust hover:border-dust hover:text-bright'}`} aria-pressed={science} onClick={() => setScience(!science)}>
              Science {science ? 'on (+60 W)' : 'off'}
            </button>
            <div className="flex gap-2">
              <button type="button" className={btn} onClick={() => setRunning(!running)}>
                {running ? 'Pause' : 'Resume'}
              </button>
              <label htmlFor={speedId} className="sr-only">
                Speed
              </label>
              <select id={speedId} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="rounded-sm border border-regolith bg-sky px-2 py-1 text-sm">
                {SPEEDS.map((v) => (
                  <option key={v} value={v}>
                    {v} h per second
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      <MissionStrip series={series} charge={charge.current} at={state.i} />
      <ul className="mt-2 text-xs text-dust" aria-live="polite">
        {log.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <div className="mt-4 flex gap-2">
        {over && (
          <button type="button" className="rounded-sm border border-sun px-4 py-1.5 text-sm text-sun hover:bg-sun hover:text-sky" onClick={onSetup}>
            Try again
          </button>
        )}
        {!over && (
          <button type="button" className={btn} onClick={onSetup}>
            Give up
          </button>
        )}
      </div>
    </section>
  )
}

/** The whole mission ahead: sunlight (top), Earth in view (bottom) and the battery so far, with a cursor. */
function MissionStrip({ series, charge, at }: { series: import('../../lib/series.ts').Series; charge: Float32Array; at: number }) {
  const wrap = useRef<HTMLDivElement>(null)
  const ref = useRef<HTMLCanvasElement>(null)
  const width = useElementWidth(wrap, 600)
  const H = 64
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(width * dpr)
    c.height = Math.round(H * dpr)
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()
    ctx.fillStyle = css('--color-shadow')
    ctx.fillRect(0, 0, width, H)
    const n = series.n
    const xOf = (k: number) => (k / n) * width
    for (let k = 0; k < n; k++) {
      const x = xOf(k)
      const w = Math.max(1, xOf(k + 1) - x)
      if (series.fSun[k] > 0) {
        ctx.globalAlpha = series.fSun[k]
        ctx.fillStyle = css('--color-sun')
        ctx.fillRect(x, 0, w, 24)
      }
      if (series.earthClear[k] > 0) {
        ctx.globalAlpha = 1
        ctx.fillStyle = css('--color-earth')
        ctx.fillRect(x, 28, w, 8)
      }
    }
    ctx.globalAlpha = 1
    // Battery so far
    ctx.strokeStyle = css('--color-bright')
    ctx.lineWidth = 1.5
    ctx.beginPath()
    let pen = false
    for (let k = 0; k < n; k++) {
      if (Number.isNaN(charge[k])) continue
      const y = H - 2 - charge[k] * 22
      if (pen) ctx.lineTo(xOf(k), y)
      else ctx.moveTo(xOf(k), y)
      pen = true
    }
    ctx.stroke()
    ctx.fillStyle = css('--color-bright')
    ctx.fillRect(xOf(at), 0, 1.5, H)
  }, [series, charge, at, width])
  return (
    <div ref={wrap} className="mt-4 max-w-3xl">
      <canvas ref={ref} style={{ width, height: H }} className="block" aria-hidden="true" />
      <p className="mt-1 text-xs text-dust">
        <span className="text-sun">Yellow</span>: sunlight ahead. <span className="text-earth">Blue</span>: Earth in view. White line: your battery.
      </p>
    </div>
  )
}
