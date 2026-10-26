// How rough is a dropped pin? Each listed site's 10 m masks against a pin's 480 m masks at the same point, over 2027.
// node --experimental-strip-types scripts/pin-vs-sites.ts (from web/); the result is in VALIDATION.md section 9.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { Ephemeris, siteFrame } from '../src/lib/astro.ts'
import { HorizonSet } from '../src/lib/horizon.ts'
import { computeMetrics } from '../src/lib/metrics.ts'
import { castHorizon } from '../src/lib/pinHorizon.ts'
import { computeSeries } from '../src/lib/series.ts'
import { decodeGrid } from '../src/lib/terrain.ts'

const D = fileURLToPath(new URL('../public/data/', import.meta.url))
const buf = (f: string) => { const b = readFileSync(D + f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }
const eph = new Ephemeris(buf('ephemeris.bin'), JSON.parse(readFileSync(D + 'ephemeris.json', 'utf8')))
const hz = new HorizonSet(buf('horizons.bin'), JSON.parse(readFileSync(D + 'horizons.json', 'utf8')))
const sites = JSON.parse(readFileSync(D + 'sites.json', 'utf8')).sites
const pm = JSON.parse(readFileSync(D + 'pin-dem.json', 'utf8'))
const raw = gunzipSync(readFileSync(D + 'pin-dem.bin.gz'))
const grid = { n: pm.n, spacing: pm.spacing_m, half: pm.half_m, heights: decodeGrid(new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2), 0, pm.n, pm.unit_m, pm.base_m) }
const t0 = Date.UTC(2027, 0, 1), t1 = Date.UTC(2028, 0, 1), step = 600_000
const crit = { darkThreshold: 0, earthMarginDeg: 0 }
for (const s of sites.filter((x: any) => x.lat <= -82)) {
  const mask = hz.mask(s.mask_index, 0)
  const a = computeMetrics(computeSeries(eph, siteFrame(s.lat, s.lon, s.height_m + 2), mask, t0, t1, step), crit)
  const t = performance.now()
  const p = castHorizon(grid, s.lat, s.lon, [2])
  const ms = performance.now() - t
  const b = computeMetrics(computeSeries(eph, siteFrame(s.lat, s.lon, p.groundM + 2), p.masks[0], t0, t1, step), crit)
  let dSum = 0
  for (let k = 0; k < mask.length; k++) dSum += Math.abs(mask[k] - p.masks[0][k])
  console.log(`${s.id.padEnd(22)} sun ${a.sunMeanPct.toFixed(1).padStart(5)} vs ${b.sunMeanPct.toFixed(1).padStart(5)} | longest dark ${a.longestDark.hours.toFixed(0).padStart(4)} vs ${b.longestDark.hours.toFixed(0).padStart(4)} h | earth ${a.earthPct.toFixed(1).padStart(5)} vs ${b.earthPct.toFixed(1).padStart(5)} | mean |dHorizon| ${(dSum / mask.length).toFixed(2)} deg | cast ${ms.toFixed(0)} ms`)
}
