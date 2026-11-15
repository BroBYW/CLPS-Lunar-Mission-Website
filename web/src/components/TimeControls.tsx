import { InfoTip } from './InfoTip.tsx'
import { useId, type CSSProperties } from 'react'
import { MAX_MS, MIN_MS, SPEEDS_HPS, STEP_MS, useApp } from '../state/store.ts'
import { DAY_MS, formatUtc, formatUtcDate, HOUR_MS, parseUtc } from '../lib/time.ts'

import { cameraAvailable, HandGlyph } from './Glyphs.tsx'

const speedLabel = (h: number) => (h < 24 ? `${h} h per second` : `${h / 24} day${h === 24 ? '' : 's'} per second`)

export function TimeControls() {
  const { startMs, endMs, timeMs, playing, speedHps, setRange, setTime, setPlaying, setSpeed } = useApp()
  const handControl = useApp((s) => s.handControl)
  const setHandControl = useApp((s) => s.setHandControl)
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

  const fill = endMs > startMs ? Math.min(100, Math.max(0, ((timeMs - startMs) / (endMs - startMs)) * 100)) : 0
  return (
    <section
      aria-label="Time"
      className="relative z-30 mt-4 rounded-3xl border border-white/10 bg-shadow/80 p-4 backdrop-blur-xl sm:sticky sm:bottom-3"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2">
          <button type="button" className="btn" onClick={() => setTime(timeMs - HOUR_MS)} aria-label="Back one hour">
            −1 h
          </button>
          <button type="button" className="btn btn-primary min-w-24" onClick={() => setPlaying(!playing)} aria-pressed={playing}>
            {playing ? <PauseIcon /> : <PlayIcon />}
            {playing ? 'Pause' : 'Play'}
          </button>
          <button type="button" className="btn" onClick={() => setTime(timeMs + HOUR_MS)} aria-label="Forward one hour">
            +1 h
          </button>
        </div>
        {/* The label and its menu wrap together on narrow screens */}
        <span className="flex items-center gap-2">
          <label htmlFor={ids.speed} className="text-xs text-dust">
            Speed
          </label>
          <select id={ids.speed} value={speedHps} onChange={(e) => setSpeed(Number(e.target.value))} className="field">
            {SPEEDS_HPS.map((h) => (
              <option key={h} value={h}>
                {speedLabel(h)}
              </option>
            ))}
          </select>
        </span>
        {cameraAvailable && (
          <button
            type="button"
            className="btn btn-sun"
            onClick={() => setHandControl(!handControl)}
            aria-pressed={handControl}
            title="Use your camera: an open hand drags time, a fist holds it"
          >
            <HandGlyph />
            Hand control
            {handControl && <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-sun" />}
          </button>
        )}
        <div className="flex items-end gap-2 max-sm:w-full sm:ml-auto">
          <div className="max-sm:flex-1">
            <label htmlFor={ids.start} className="caption-5 mb-1 block text-dust">
              From (UTC)
            </label>
            <input
              id={ids.start}
              type="date"
              min={minDate}
              max={maxDate}
              value={formatUtcDate(startMs)}
              onChange={(e) => onStart(e.target.value)}
              className="field tabular max-sm:w-full"
            />
          </div>
          <div className="max-sm:flex-1">
            <label htmlFor={ids.end} className="caption-5 mb-1 block text-dust">
              To (UTC, inclusive)
            </label>
            <input
              id={ids.end}
              type="date"
              min={minDate}
              max={maxDate}
              value={formatUtcDate(endMs - DAY_MS)}
              onChange={(e) => onEnd(e.target.value)}
              className="field tabular max-sm:w-full"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <div className="shrink-0">
          <p className="flex items-center gap-2 text-xs text-dust">Time shown <InfoTip topic="the time bar" what="The moment the whole page shows, and the dates every number covers. Times are in UTC." how="Press Play to watch time pass, drag the slider, or step an hour with −1 h and +1 h. Change From and To for other dates. Hand control moves time when you wave an open hand at your camera; a fist holds it." /></p>
          <p className="title-2 tabular text-bright" aria-live="off">
            {formatUtc(timeMs)}
          </p>
        </div>
        <div className="min-w-0 flex-1">
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
            className="scrub w-full"
            style={{ '--fill': `${fill}%` } as CSSProperties}
          />
          <div className="flex justify-between text-xs tabular text-dust">
            <span>{formatUtc(startMs)}</span>
            <span>{formatUtc(endMs)}</span>
          </div>
        </div>
      </div>
    </section>
  )
}

// Phosphor Icons (MIT)
const icon = { viewBox: '0 0 256 256', 'aria-hidden': true, fill: 'currentColor' } as const
function PlayIcon() {
  return (
    <svg {...icon} width={16} height={16}>
      <path d="M240 128a15.74 15.74 0 0 1-7.6 13.51L88.32 229.65a16 16 0 0 1-16.2.3A15.86 15.86 0 0 1 64 216.13V39.87a15.86 15.86 0 0 1 8.12-13.82a16 16 0 0 1 16.2.3l144.08 88.14A15.74 15.74 0 0 1 240 128" />
    </svg>
  )
}
function PauseIcon() {
  return (
    <svg {...icon} width={16} height={16}>
      <path d="M216 48v160a16 16 0 0 1-16 16h-40a16 16 0 0 1-16-16V48a16 16 0 0 1 16-16h40a16 16 0 0 1 16 16M96 32H56a16 16 0 0 0-16 16v160a16 16 0 0 0 16 16h40a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16" />
    </svg>
  )
}
