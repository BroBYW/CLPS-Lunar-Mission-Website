/** P0 metrics and windows (PLAN.md §4.5). Mirrors pipeline/clps/visibility.py metrics. */

import type { Series } from './series.ts'

export interface Run {
  start: number
  end: number
}

/** Maximal runs where pred(i) is true, as [start, end) sample indices. */
export function runs(n: number, pred: (i: number) => boolean): Run[] {
  const out: Run[] = []
  let start = -1
  for (let i = 0; i < n; i++) {
    if (pred(i)) {
      if (start < 0) start = i
    } else if (start >= 0) {
      out.push({ start, end: i })
      start = -1
    }
  }
  if (start >= 0) out.push({ start, end: n })
  return out
}

export interface Longest {
  hours: number
  /** The run touches the start or end of the range, so the true length may be longer */
  atEdge: boolean
  startMs: number
}

function longest(rs: Run[], s: Series): Longest {
  let best: Run | null = null
  for (const r of rs) if (!best || r.end - r.start > best.end - best.start) best = r
  if (!best) return { hours: 0, atEdge: false, startMs: s.startMs }
  return {
    hours: ((best.end - best.start) * s.stepMs) / 3_600_000,
    atEdge: best.start === 0 || best.end === s.n,
    startMs: s.startMs + best.start * s.stepMs,
  }
}

export interface Window {
  startMs: number
  endMs: number
  hours: number
}

export interface Metrics {
  sunMeanPct: number
  sunAnyPct: number
  sunFullPct: number
  longestDark: Longest
  earthPct: number
  longestBlackout: Longest
  bothPct: number
  windows: Window[]
  longestWindowH: number
}

export interface Criteria {
  /** Dark when the visible fraction of the solar disk is at or below this (0–1) */
  darkThreshold: number
  /** Earth counts as visible when its center clears the terrain by more than this (degrees) */
  earthMarginDeg: number
}

export function computeMetrics(s: Series, c: Criteria): Metrics {
  const { n, fSun, earthClear } = s
  const dark = (i: number) => fSun[i] <= c.darkThreshold
  const earth = (i: number) => earthClear[i] > c.earthMarginDeg
  let sum = 0
  let any = 0
  let full = 0
  let earthN = 0
  let bothN = 0
  for (let i = 0; i < n; i++) {
    const f = fSun[i]
    sum += f
    if (f > 0) any++
    if (f >= 1 - 1e-6) full++ // fractions are stored as float32
    const e = earth(i)
    if (e) earthN++
    if (e && !dark(i)) bothN++
  }
  const pct = (k: number) => (n ? (k / n) * 100 : 0)
  const windows = runs(n, (i) => !dark(i) && earth(i)).map((r) => ({
    startMs: s.startMs + r.start * s.stepMs,
    endMs: s.startMs + r.end * s.stepMs,
    hours: ((r.end - r.start) * s.stepMs) / 3_600_000,
  }))
  return {
    sunMeanPct: n ? (sum / n) * 100 : 0,
    sunAnyPct: pct(any),
    sunFullPct: pct(full),
    longestDark: longest(runs(n, dark), s),
    earthPct: pct(earthN),
    longestBlackout: longest(runs(n, (i) => !earth(i)), s),
    bothPct: pct(bothN),
    windows,
    longestWindowH: windows.reduce((m, w) => Math.max(m, w.hours), 0),
  }
}

/** Windows of one kind, for CSV export. */
export function windowsOf(s: Series, pred: (i: number) => boolean): Window[] {
  return runs(s.n, pred).map((r) => ({
    startMs: s.startMs + r.start * s.stepMs,
    endMs: s.startMs + r.end * s.stepMs,
    hours: ((r.end - r.start) * s.stepMs) / 3_600_000,
  }))
}
