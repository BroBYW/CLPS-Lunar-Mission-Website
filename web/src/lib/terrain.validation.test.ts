/**
 * VALIDATION.md §8: sunlight from the 3D terrain (terrain.ts), probed 2 m above each site, against the horizon masks
 * that every metric uses. It reads the published data files and takes a few minutes, so it only runs on request:
 *   CLPS_VALIDATE=1 npx vitest run src/lib/terrain.validation.test.ts
 */

import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { Ephemeris, siteFrame } from './astro.ts'
import { HorizonSet } from './horizon.ts'
import { decodeGrid, TerrainSun, type GridSpec, type Patch } from './terrain.ts'
import { bodiesAt } from './track.ts'
import { sunFraction } from './visibility.ts'

const DATA = 'public/data/'
const buffer = (path: string) => {
  const b = readFileSync(DATA + path)
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
}
const json = (path: string) => JSON.parse(readFileSync(DATA + path, 'utf8'))

describe.skipIf(!process.env.CLPS_VALIDATE)('3D terrain against the horizon masks', () => {
  it('agrees on whether a 2 m observer sees the Sun', () => {
    const eph = new Ephemeris(buffer('ephemeris.bin'), json('ephemeris.json'))
    const hz = new HorizonSet(buffer('horizons.bin'), json('horizons.json'))
    const sitesJson = json('sites.json')
    const sites: { id: string; lat: number; lon: number; height_m: number; mask_index: number }[] = sitesJson.sites ?? sitesJson
    const index: { n: number; grids: GridSpec[]; sites: Record<string, { file: string; center_m: [number, number] }> } = json('terrain/index.json')
    const { n } = index
    const start = Date.parse('2027-01-01T00:00:00Z')
    const v = new Float64Array(6)
    const rows: string[] = []
    let agreeAll = 0
    let totalAll = 0
    for (const s of sites) {
      const raw = gunzipSync(readFileSync(DATA + 'terrain/' + index.sites[s.id].file))
      const res = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2)
      const patch: Patch = {
        n,
        center: index.sites[s.id].center_m,
        grids: index.grids.map((g, k) => ({ ...g, heights: decodeGrid(res, k * n * n, n, g.unit_m) })),
      }
      const terrain = new TerrainSun(patch)
      const mask = hz.mask(s.mask_index, 0)
      const frame = siteFrame(s.lat, s.lon, s.height_m + hz.heightsM[0])
      let agree = 0
      let total = 0
      let maskSun = 0
      let terrainSun = 0
      // Every 2 hours for 28 days
      for (let h = 0; h < 28 * 24; h += 2) {
        const t = start + h * 3600e3
        eph.sample(t, v)
        const b = bodiesAt(eph, frame, t)
        const f = sunFraction(mask, b.sunAz, b.sunEl, b.sunRadius)
        const sun = [v[0], v[1], v[2]]
        const radius = Math.asin(695_700 / Math.hypot(v[0], v[1], v[2]))
        terrain.compute(sun, radius)
        const p = terrain.probeSite(sun, radius, hz.heightsM[0])
        total++
        if (p > 0.5 === f > 0.5) agree++
        maskSun += f
        terrainSun += p
      }
      agreeAll += agree
      totalAll += total
      rows.push(
        `${s.id.padEnd(22)} agree ${((100 * agree) / total).toFixed(1)}%   sunlight: masks ${((100 * maskSun) / total).toFixed(1)}%, 3D ${((100 * terrainSun) / total).toFixed(1)}%`,
      )
      expect(Math.abs(maskSun - terrainSun) / total).toBeLessThan(0.05)
    }
    rows.push(`all sites: ${((100 * agreeAll) / totalAll).toFixed(1)}% of ${totalAll}`)
    console.log(rows.join('\n'))
    expect(agreeAll / totalAll).toBeGreaterThan(0.98)
  }, 600_000)
})
