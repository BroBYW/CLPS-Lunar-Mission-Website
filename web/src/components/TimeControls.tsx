import { useId } from 'react'
import { MAX_MS, MIN_MS, SPEEDS_HPS, STEP_MS, useApp } from '../state/store.ts'
import { DAY_MS, formatUtc, formatUtcDate, HOUR_MS, parseUtc } from '../lib/time.ts'

const speedLabel = (h: number) => (h < 24 ? `${h} h per second` : `${h / 24} day${h === 24 ? '' : 's'} per second`)

export function TimeControls() {
  const { startMs, endMs, timeMs, playing, speedHps, setRange, setTime, setPlaying, setSpeed } = useApp()
  const ids = { start: useId(), end: useId(), scrub: useId(), speed: useId() }
  const minDate = formatUtcDate(MIN_MS)
  const maxDate = formatUtcDate(MAX_MS - DAY_MS)

  const onStart = (v: string) => {
    const s = parseUtc(v)
    if (!Number.isNaN(s)) setRange(s, Math.max(endMs, s + DAY_MS))
  }
  const onEnd = (v: string) => {
    const e = parseUtc(v)
    if (!Number.isNaN(e)) setRange(Math.min(startMs, e), e + DAY_MS)
  }

  const btn = 'rounded-sm border border-regolith px-3 py-1.5 text-sm hover:border-dust'
  return (
    <section aria-label="Time" className="mt-4 rounded-sm bg-shadow p-3">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div>
          <label htmlFor={ids.start} className="block text-xs text-dust">
            From (UTC)
          </label>
          <input
            id={ids.start}
            type="date"
            min={minDate}
            max={maxDate}
            value={formatUtcDate(startMs)}
            onChange={(e) => onStart(e.target.value)}
            className="rounded-sm border border-regolith bg-sky px-2 py-1 text-sm tabular"
          />
        </div>
        <div>
          <label htmlFor={ids.end} className="block text-xs text-dust">
            To (UTC, inclusive)
          </label>
          <input
            id={ids.end}
            type="date"
            min={minDate}
            max={maxDate}
            value={formatUtcDate(endMs - DAY_MS)}
            onChange={(e) => onEnd(e.target.value)}
            className="rounded-sm border border-regolith bg-sky px-2 py-1 text-sm tabular"
          />
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-dust">Time shown</p>
          <p className="font-display text-lg tabular" aria-live="off">
            {formatUtc(timeMs)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => setTime(timeMs - HOUR_MS)} aria-label="Back one hour">
          −1 h
        </button>
        <button
          type="button"
          className={`${btn} min-w-20 border-bright text-bright`}
          onClick={() => setPlaying(!playing)}
          aria-pressed={playing}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className={btn} onClick={() => setTime(timeMs + HOUR_MS)} aria-label="Forward one hour">
          +1 h
        </button>
        <label htmlFor={ids.speed} className="ml-2 text-xs text-dust">
          Speed
        </label>
        <select
          id={ids.speed}
          value={speedHps}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="rounded-sm border border-regolith bg-sky px-2 py-1 text-sm"
        >
          {SPEEDS_HPS.map((h) => (
            <option key={h} value={h}>
              {speedLabel(h)}
            </option>
          ))}
        </select>
      </div>

      <label htmlFor={ids.scrub} className="sr-only">
        Time within the selected range
      </label>
      <input
        id={ids.scrub}
        type="range"
        min={startMs}
        max={endMs}
        step={STEP_MS}
        value={timeMs}
        onChange={(e) => setTime(Number(e.target.value))}
        aria-valuetext={formatUtc(timeMs)}
        className="mt-3 w-full accent-bright"
      />
      <div className="flex justify-between text-xs tabular text-dust">
        <span>{formatUtc(startMs)}</span>
        <span>{formatUtc(endMs)}</span>
      </div>
    </section>
  )
}
