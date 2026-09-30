import { create } from 'zustand'
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../lib/time.ts'

/** The UI covers 2026-01-01 00:00 UTC to 2031-01-01 00:00 UTC (the ephemeris span). */
export const MIN_MS = Date.UTC(2026, 0, 1)
export const MAX_MS = Date.UTC(2031, 0, 1)
export const STEP_MS = 10 * MINUTE_MS
export const SPEEDS_HPS = [1, 6, 24, 72] as const
export const DEFAULT_SITE = 'connecting-ridge'

export interface AppState {
  siteId: string
  startMs: number
  endMs: number
  timeMs: number
  playing: boolean
  speedHps: number
  heightIndex: number
  darkThreshold: number
  earthMarginDeg: number
  setSite: (id: string) => void
  setRange: (startMs: number, endMs: number) => void
  setTime: (timeMs: number) => void
  setPlaying: (playing: boolean) => void
  setSpeed: (speedHps: number) => void
  setHeightIndex: (heightIndex: number) => void
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const snap = (ms: number) => Math.round(ms / STEP_MS) * STEP_MS

function defaultRange(): [number, number] {
  const now = Date.now()
  const today = Math.floor(now / DAY_MS) * DAY_MS
  const start = clamp(today, MIN_MS, MAX_MS - 30 * DAY_MS)
  return [start, start + 30 * DAY_MS]
}

const [start0, end0] = defaultRange()

export const useApp = create<AppState>()((set, get) => ({
  siteId: DEFAULT_SITE,
  startMs: start0,
  endMs: end0,
  timeMs: start0,
  playing: false,
  speedHps: 24,
  heightIndex: 0,
  darkThreshold: 0,
  earthMarginDeg: 0,
  setSite: (siteId) => set({ siteId }),
  setRange: (startMs, endMs) => {
    const s = clamp(snap(startMs), MIN_MS, MAX_MS - DAY_MS)
    const e = clamp(snap(endMs), s + HOUR_MS, MAX_MS)
    set({ startMs: s, endMs: e, timeMs: clamp(get().timeMs, s, e) })
  },
  setTime: (timeMs) => {
    const { startMs, endMs } = get()
    set({ timeMs: clamp(timeMs, startMs, endMs) })
  },
  setPlaying: (playing) => {
    const { timeMs, endMs, startMs } = get()
    // Restart from the beginning when play is pressed at the end of the range
    set(playing && timeMs >= endMs ? { playing, timeMs: startMs } : { playing })
  },
  setSpeed: (speedHps) => set({ speedHps }),
  setHeightIndex: (heightIndex) => set({ heightIndex }),
}))
