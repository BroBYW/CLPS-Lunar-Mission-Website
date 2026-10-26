/**
 * Mission window finder: the metrics of a mission of a given length starting on every day of a span, from one
 * series per site. Same definitions as computeMetrics (lib/metrics.ts); a window is [start, start + length).
 */

import { runs, type Criteria, type Run } from './metrics.ts'
import type { Series } from './series.ts'
import { DAY_MS, HOUR_MS } from './time.ts'

export interface WindowScores {
  /** Per start day; NaN where the window runs past the end of the series. */
  sunPct: Float32Array
  darkH: Float32Array
  earthPct: Float32Array
  blackoutH: Float32Array
  bothPct: Float32Array
}

/** The longest stretch of any run inside [a, b), in samples. Runs are sorted; `from` carries a pointer forward. */
function longestIn(rs: Run[], a: number, b: number, from: { k: number }): number {
  while (from.k < rs.length && rs[from.k].end <= a) from.k++
  let best = 0
  for (let q = from.k; q < rs.length && rs[q].start < b; q++) {
    const len = Math.min(rs[q].end, b) - Math.max(rs[q].start, a)
    if (len > best) best = len
  }
  return best
}

/** Scores for `days` windows of `lengthDays`, starting at the series start and then every day after it. */
export function scanWindows(s: Series, days: number, lengthDays: number, c: Criteria): WindowScores {
  const { n, fSun, earthClear } = s
  const perDay = Math.round(DAY_MS / s.stepMs)
  const len = lengthDays * perDay
  const toH = s.stepMs / HOUR_MS
  const sun = new Float64Array(n + 1)
  const earth = new Int32Array(n + 1)
  const both = new Int32Array(n + 1)
  for (let i = 0; i < n; i++) {
    const e = earthClear[i] > c.earthMarginDeg
    sun[i + 1] = sun[i] + fSun[i]
    earth[i + 1] = earth[i] + (e ? 1 : 0)
    both[i + 1] = both[i] + (e && fSun[i] > c.darkThreshold ? 1 : 0)
  }
  const dark = runs(n, (i) => fSun[i] <= c.darkThreshold)
  const blackout = runs(n, (i) => !(earthClear[i] > c.earthMarginDeg))
  const out: WindowScores = {
    sunPct: new Float32Array(days),
    darkH: new Float32Array(days),
    earthPct: new Float32Array(days),
    blackoutH: new Float32Array(days),
    bothPct: new Float32Array(days),
  }
  const pd = { k: 0 }
  const pb = { k: 0 }
  for (let d = 0; d < days; d++) {
    const a = d * perDay
    const b = a + len
    if (b > n) {
      for (const arr of Object.values(out)) arr[d] = NaN
      continue
    }
    out.sunPct[d] = ((sun[b] - sun[a]) / len) * 100
    out.earthPct[d] = ((earth[b] - earth[a]) / len) * 100
    out.bothPct[d] = ((both[b] - both[a]) / len) * 100
    out.darkH[d] = longestIn(dark, a, b, pd) * toH
    out.blackoutH[d] = longestIn(blackout, a, b, pb) * toH
  }
  return out
}

export type RankBy = 'sun' | 'both' | 'earth' | 'dark'

export interface Limits {
  minSunPct: number
  maxDarkH: number
  minEarthPct: number
}

export function passes(w: WindowScores, d: number, l: Limits): boolean {
  return w.sunPct[d] >= l.minSunPct && w.darkH[d] <= l.maxDarkH && w.earthPct[d] >= l.minEarthPct
}

/** 0–1, higher is better, for colouring and ranking. */
export function score(w: WindowScores, d: number, by: RankBy, lengthDays: number): number {
  if (by === 'sun') return w.sunPct[d] / 100
  if (by === 'earth') return w.earthPct[d] / 100
  if (by === 'both') return w.bothPct[d] / 100
  return 1 - Math.min(1, w.darkH[d] / (lengthDays * 24))
}

export interface Pick {
  site: number
  day: number
  score: number
}

/** The best passing windows, at most `count`, never two of one site that overlap. */
export function bestWindows(all: WindowScores[], l: Limits, by: RankBy, lengthDays: number, count: number): Pick[] {
  const cands: Pick[] = []
  all.forEach((w, site) => {
    for (let d = 0; d < w.sunPct.length; d++) {
      if (!Number.isNaN(w.sunPct[d]) && passes(w, d, l)) cands.push({ site, day: d, score: score(w, d, by, lengthDays) })
    }
  })
  // Ties (often 100% sunlight in polar summer) go to more time with both, then to shorter darkness
  const both = (p: Pick) => all[p.site].bothPct[p.day]
  const dark = (p: Pick) => all[p.site].darkH[p.day]
  cands.sort((p, q) => q.score - p.score || both(q) - both(p) || dark(p) - dark(q) || p.day - q.day)
  const out: Pick[] = []
  for (const c of cands) {
    if (out.some((o) => o.site === c.site && Math.abs(o.day - c.day) < lengthDays)) continue
    out.push(c)
    if (out.length === count) break
  }
  return out
}
