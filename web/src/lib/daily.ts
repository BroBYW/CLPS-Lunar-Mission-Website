/**
 * Daily landing challenge: one mission a day, the same for everyone, drawn from the date with a seeded random number
 * generator. A guess (a site and a start day) is scored with the Find dates view's code (lib/finder.ts) against the
 * best window of any site that year.
 */

import { passes, score, type Limits, type RankBy, type WindowScores } from './finder.ts'
import { DAY_MS } from './time.ts'

/** Challenge number 1 is 27 October 2026 (UTC). */
export const FIRST_DAY_MS = Date.UTC(2026, 9, 27)
export const TRIES = 5
export const YEARS = [2026, 2027, 2028, 2029, 2030]
export const LENGTHS = [7, 14, 21, 28]
const RANKS: RankBy[] = ['both', 'sun', 'earth']

export interface DailyMission {
  number: number
  year: number
  lengthDays: number
  rankBy: RankBy
  limits: Limits
}

/** mulberry32: small, fast and the same in every browser. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function dailyNumber(nowMs: number): number {
  return Math.floor((nowMs - FIRST_DAY_MS) / DAY_MS) + 1
}

export function dailyMission(number: number): DailyMission {
  const r = rng(Math.imul(number, 2654435761))
  const pick = <T>(list: T[]) => list[Math.floor(r() * list.length)]
  return {
    number,
    year: pick(YEARS),
    lengthDays: pick(LENGTHS),
    rankBy: pick(RANKS),
    limits: { minSunPct: pick([60, 70, 80, 90]), maxDarkH: pick([24, 48, 72, 96]), minEarthPct: pick([40, 50, 60, 70]) },
  }
}

function countPassing(all: WindowScores[], l: Limits): number {
  let n = 0
  for (const w of all) for (let d = 0; d < w.sunPct.length; d++) if (!Number.isNaN(w.sunPct[d]) && passes(w, d, l)) n++
  return n
}

/** The mission with its limits eased, the same way for everyone, until at least `minWindows` windows meet them. */
export function feasible(m: DailyMission, all: WindowScores[], minWindows = 5): DailyMission {
  let l = { ...m.limits }
  for (let k = 0; k < 12 && countPassing(all, l) < minWindows; k++) {
    l = { minSunPct: Math.max(0, l.minSunPct - 10), maxDarkH: l.maxDarkH + 24, minEarthPct: Math.max(0, l.minEarthPct - 10) }
  }
  return { ...m, limits: l }
}

export interface Best {
  site: number
  day: number
  score: number
}

export function best(m: DailyMission, all: WindowScores[]): Best | null {
  let out: Best | null = null
  all.forEach((w, site) => {
    for (let d = 0; d < w.sunPct.length; d++) {
      if (Number.isNaN(w.sunPct[d]) || !passes(w, d, m.limits)) continue
      const s = score(w, d, m.rankBy, m.lengthDays)
      if (!out || s > out.score) out = { site, day: d, score: s }
    }
  })
  return out
}

export interface Graded {
  site: number
  day: number
  sunPct: number
  darkH: number
  earthPct: number
  bothPct: number
  checks: { sun: boolean; dark: boolean; earth: boolean }
  pass: boolean
  /** 0–100: the window's score as a share of the best possible; 0 when it misses a limit */
  pct: number
}

export function grade(m: DailyMission, all: WindowScores[], top: Best, site: number, day: number): Graded {
  const w = all[site]
  const valid = day >= 0 && day < w.sunPct.length && !Number.isNaN(w.sunPct[day])
  const v = (a: Float32Array) => (valid ? a[day] : NaN)
  const checks = valid
    ? { sun: w.sunPct[day] >= m.limits.minSunPct, dark: w.darkH[day] <= m.limits.maxDarkH, earth: w.earthPct[day] >= m.limits.minEarthPct }
    : { sun: false, dark: false, earth: false }
  const pass = checks.sun && checks.dark && checks.earth
  const pct = pass && top.score > 0 ? Math.min(100, (100 * score(w, day, m.rankBy, m.lengthDays)) / top.score) : 0
  return { site, day, sunPct: v(w.sunPct), darkH: v(w.darkH), earthPct: v(w.earthPct), bothPct: v(w.bothPct), checks, pass, pct }
}

/** One square per try for sharing: green near the best, yellow good, orange passing, black missing a limit. */
export function squares(tries: Graded[]): string {
  return tries.map((g) => (!g.pass ? '⬛' : g.pct >= 95 ? '🟩' : g.pct >= 75 ? '🟨' : '🟧')).join('')
}
