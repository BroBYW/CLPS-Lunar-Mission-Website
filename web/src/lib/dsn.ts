/**
 * Deep Space Network contact (pipeline/scripts/dsn.py): when a site can talk to Earth directly, Earth must be above
 * its skyline and at least one DSN complex must have the Moon above its antenna limit.
 */

import { runs } from './metrics.ts'
import type { Series } from './series.ts'

export interface Dsn {
  names: string[]
  limitDeg: number
  t0Ms: number
  stepMs: number
  count: number
  /** Whole degrees, [hour][complex] */
  el: Int8Array
}

/** Moon elevation (deg) at complex k, linear between hourly samples. */
export function dsnElevation(d: Dsn, k: number, tMs: number): number {
  const f = Math.min(Math.max((tMs - d.t0Ms) / d.stepMs, 0), d.count - 1)
  const i = Math.min(Math.floor(f), d.count - 2)
  const w = f - i
  const n = d.names.length
  return d.el[i * n + k] * (1 - w) + d.el[(i + 1) * n + k] * w
}

export interface Contact {
  /** Per sample: bit k set when complex k has the Moon above the limit */
  stations: Uint8Array
  /** Per sample: Earth above the site's skyline and at least one complex in reach */
  contact: Uint8Array
  contactPct: number
  /** Share of time each complex has the Moon above the limit */
  stationPct: number[]
  /** Longest stretch without contact, hours, and whether it touches the end of the range */
  longestGapH: number
  gapAtEdge: boolean
}

export function contactOf(s: Series, d: Dsn, earthMarginDeg: number): Contact {
  const n = s.n
  const stations = new Uint8Array(n)
  const contact = new Uint8Array(n)
  const per = d.names.map(() => 0)
  let c = 0
  for (let i = 0; i < n; i++) {
    const t = s.startMs + i * s.stepMs
    let bits = 0
    for (let k = 0; k < d.names.length; k++) {
      if (dsnElevation(d, k, t) >= d.limitDeg) {
        bits |= 1 << k
        per[k]++
      }
    }
    stations[i] = bits
    if (bits && s.earthClear[i] > earthMarginDeg) {
      contact[i] = 1
      c++
    }
  }
  let best = { start: 0, end: 0 }
  for (const r of runs(n, (i) => !contact[i])) if (r.end - r.start > best.end - best.start) best = r
  return {
    stations,
    contact,
    contactPct: n ? (100 * c) / n : 0,
    stationPct: per.map((k) => (n ? (100 * k) / n : 0)),
    longestGapH: ((best.end - best.start) * s.stepMs) / 3_600_000,
    gapAtEdge: best.end > best.start && (best.start === 0 || best.end === n),
  }
}
