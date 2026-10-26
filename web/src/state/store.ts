import { create } from 'zustand'
import type { PowerInputs } from '../lib/battery.ts'
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../lib/time.ts'

/** The UI covers 2026-01-01 00:00 UTC to 2031-01-01 00:00 UTC (the ephemeris span). */
export const MIN_MS = Date.UTC(2026, 0, 1)
export const MAX_MS = Date.UTC(2031, 0, 1)
export const STEP_MS = 10 * MINUTE_MS
export const SPEEDS_HPS = [1, 6, 24, 72] as const
export const DEFAULT_SITE = 'connecting-ridge'
export const MAX_COMPARE = 3

export type View = 'home' | 'plan' | 'compare' | 'finder' | '3d' | 'explore' | 'about' | 'credits'

export interface AppState {
  view: View
  siteId: string
  compareIds: string[]
  startMs: number
  endMs: number
  timeMs: number
  playing: boolean
  speedHps: number
  heightIndex: number
  darkThreshold: number
  earthMarginDeg: number
  power: PowerInputs
  setView: (view: View) => void
  setSite: (id: string) => void
  setCompare: (ids: string[]) => void
  setRange: (startMs: number, endMs: number) => void
  setTime: (timeMs: number) => void
  setPlaying: (playing: boolean) => void
  setSpeed: (speedHps: number) => void
  setHeightIndex: (heightIndex: number) => void
  setDarkThreshold: (t: number) => void
  setEarthMargin: (deg: number) => void
  setPower: (p: Partial<PowerInputs>) => void
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const snap = (ms: number) => Math.round(ms / STEP_MS) * STEP_MS

export function defaultRange(nowMs = Date.now()): [number, number] {
  const today = Math.floor(nowMs / DAY_MS) * DAY_MS
  const start = clamp(today, MIN_MS, MAX_MS - 30 * DAY_MS)
  return [start, start + 30 * DAY_MS]
}

const [start0, end0] = defaultRange()

export const DEFAULT_POWER: PowerInputs = { areaM2: 1.5, efficiency: 0.3, loadW: 100, depthOfDischarge: 0.8 }

export const useApp = create<AppState>()((set, get) => ({
  view: 'home',
  siteId: DEFAULT_SITE,
  compareIds: [DEFAULT_SITE, 'shackleton-rim', 'malapert-massif'],
  startMs: start0,
  endMs: end0,
  timeMs: start0,
  playing: false,
  speedHps: 24,
  heightIndex: 0,
  darkThreshold: 0,
  earthMarginDeg: 0,
  power: DEFAULT_POWER,
  setView: (view) => set({ view, playing: false }),
  setSite: (siteId) => set({ siteId }),
  setCompare: (ids) => set({ compareIds: ids.slice(0, MAX_COMPARE) }),
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
  setDarkThreshold: (darkThreshold) => set({ darkThreshold: clamp(darkThreshold, 0, 0.99) }),
  setEarthMargin: (earthMarginDeg) => set({ earthMarginDeg: clamp(earthMarginDeg, 0, 10) }),
  setPower: (p) => set({ power: { ...get().power, ...p } }),
}))
