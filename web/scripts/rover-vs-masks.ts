// The rover's two-ray skyline (lib/rover.ts) against the sites' horizon masks: at each site's own point, every 6 hours
// through 2027, does a rover there see more than half the Sun, and Earth, when the masks say so?
// node --experimental-strip-types scripts/rover-vs-masks.ts (from web/); the result is in VALIDATION.md section 9.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { angularRadiusDeg, azElTo, Ephemeris, newAzEl, R_SUN_KM, siteFrame } from '../src/lib/astro.ts'
import { horizonAt, HorizonSet } from '../src/lib/horizon.ts'
import { rayHorizon } from '../src/lib/rover.ts'
import { decodeGrid, diskAbove } from '../src/lib/terrain.ts'
import { sunFraction } from '../src/lib/visibility.ts'

const D = fileURLToPath(new URL('../public/data/', import.meta.url))
const buf = (f: string) => { const b = readFileSync(D + f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }
const eph = new Ephemeris(buf('ephemeris.bin'), JSON.parse(readFileSync(D + 'ephemeris.json', 'utf8')))
const hz = new HorizonSet(buf('horizons.bin'), JSON.parse(readFileSync(D + 'horizons.json', 'utf8')))
const sites = JSON.parse(readFileSync(D + 'sites.json', 'utf8')).sites
const index = JSON.parse(readFileSync(D + 'terrain/index.json', 'utf8'))
const v = new Float64Array(6)
const sun = newAzEl()
const earth = newAzEl()
let agreeSun = 0, agreeEarth = 0, total = 0
for (const s of sites) {
  const e = index.sites[s.id]
  const raw = gunzipSync(readFileSync(D + 'terrain/' + e.file))
  const res = new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2)
  const patch = { n: index.n, center: e.center_m, grids: index.grids.map((g: any, k: number) => ({ ...g, heights: decodeGrid(res, k * index.n * index.n, index.n, g.unit_m, e.base_m) })) }
  const mask = hz.mask(s.mask_index, 0)
  const frame = siteFrame(s.lat, s.lon, s.height_m + 2)
  const [x, y] = patch.center
  const ground = patch.grids[0].heights[((index.n - 1) / 2) * index.n + (index.n - 1) / 2]
  let as = 0, ae = 0, n = 0
  for (let t = Date.UTC(2027, 0, 1); t < Date.UTC(2028, 0, 1); t += 6 * 3_600_000) {
    eph.sample(t, v)
    azElTo(frame, v[0], v[1], v[2], sun)
    azElTo(frame, v[3], v[4], v[5], earth)
    const r = angularRadiusDeg(R_SUN_KM, sun.dist)
    const roverSun = diskAbove((sun.el - rayHorizon(patch, x, y, ground, 2, sun.az)) / r) > 0.5
    const maskSun = sunFraction(mask, sun.az, sun.el, r) > 0.5
    const roverEarth = earth.el > rayHorizon(patch, x, y, ground, 2, earth.az)
    const maskEarth = earth.el > horizonAt(mask, earth.az)
    if (roverSun === maskSun) as++
    if (roverEarth === maskEarth) ae++
    n++
  }
  agreeSun += as; agreeEarth += ae; total += n
  console.log(`${s.id.padEnd(22)} Sun agrees ${(100 * as / n).toFixed(1)}%, Earth ${(100 * ae / n).toFixed(1)}%`)
}
console.log(`all ${sites.length} sites, ${total} samples: Sun ${(100 * agreeSun / total).toFixed(1)}%, Earth ${(100 * agreeEarth / total).toFixed(1)}%`)
