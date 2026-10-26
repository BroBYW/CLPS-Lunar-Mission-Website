// The app's lit terrain against LROC Wide Angle Camera photos (lib/lroCompare.ts, the Plan view's photo comparison):
// for every photo in public/data/lro, light the site's 120 m terrain grid for the photo's moment and count the pixels
// where photo and model agree on sunlit or shadowed ground.
// node --experimental-strip-types scripts/lro-vs-model.ts (from web/); the result is in VALIDATION.md section 10.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import sharp from 'sharp'
import { R_SUN_KM } from '../src/lib/astro.ts'
import { comparePhoto, modelBrightness } from '../src/lib/lroCompare.ts'
import { decodeGrid, TerrainSun, type Patch } from '../src/lib/terrain.ts'

const D = fileURLToPath(new URL('../public/data/', import.meta.url))
const doc = JSON.parse(readFileSync(D + 'lro/photos.json', 'utf8'))
const index = JSON.parse(readFileSync(D + 'terrain/index.json', 'utf8'))
const names = Object.fromEntries(JSON.parse(readFileSync(D + 'sites.json', 'utf8')).sites.map((s: any) => [s.id, s.name]))
let pixels = 0
let agree = 0
let modelOnly = 0
let photoOnly = 0
let bothLit = 0
const scales: number[] = []
console.log('| Site | Photo (UTC) | Sun elevation, azimuth | Photo covers | Agree | Sunlit in the app only | Sunlit in the photo only | Sunlit in both, of sunlit in either |')
console.log('|---|---|---|---|---|---|---|---|')
for (const [id, entry] of Object.entries<any>(doc.sites)) {
  if (!entry.photos.length) continue
  const e = index.sites[id]
  const raw = gunzipSync(readFileSync(D + 'terrain/' + e.file))
  const res = new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2)
  const patch: Patch = { n: index.n, center: e.center_m, grids: index.grids.map((g: any, k: number) => ({ ...g, heights: decodeGrid(res, k * index.n * index.n, index.n, g.unit_m, e.base_m) })) }
  const gi = patch.grids.findIndex((g) => g.name === 'mid')
  const sunModel = new TerrainSun(patch)
  for (const p of entry.photos) {
    const lit = sunModel.compute(p.sun_km, Math.asin(R_SUN_KM / Math.hypot(...p.sun_km)))[gi]
    const model = modelBrightness(patch, gi, lit, p.sun_km, { size: doc.size, pixelM: doc.pixel_m, x0: entry.origin_m[0], y0: entry.origin_m[1] })
    const { data } = await sharp(D + 'lro/' + p.file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const iof = new Float32Array(doc.size * doc.size)
    for (let k = 0; k < iof.length; k++) {
      const v = data[4 * k] / 255
      iof[k] = data[4 * k + 3] < 128 ? Number.NaN : doc.stretch_iof * v * v
    }
    const a = comparePhoto(iof, model, doc.iof_lit)
    pixels += a.pixels
    agree += (a.agreePct / 100) * a.pixels
    modelOnly += (a.modelOnlyPct / 100) * a.pixels
    photoOnly += (a.photoOnlyPct / 100) * a.pixels
    bothLit += (a.bothLitPct / 100) * a.pixels
    const km2 = (a.pixels * doc.pixel_m ** 2) / 1e6
    const sun = `${p.sun_el.toFixed(1).replace('-', '−')}°, ${p.sun_az.toFixed(0)}°`
    console.log(`| ${names[id]} | ${p.utc.slice(0, 16).replace('T', ' ')} | ${sun} | ${Math.round(km2).toLocaleString('en-US')} km² | ${a.agreePct.toFixed(1)}% | ${a.modelOnlyPct.toFixed(1)}% | ${a.photoOnlyPct.toFixed(1)}% | ${a.litOverlapPct.toFixed(1)}% |`)
    scales.push(a.scale)
  }
}
console.log(`\nAll photos: ${Math.round((pixels * doc.pixel_m ** 2) / 1e6).toLocaleString('en-US')} km², agree ${((100 * agree) / pixels).toFixed(1)}%, ` +
  `sunlit in the app only ${((100 * modelOnly) / pixels).toFixed(1)}%, in the photo only ${((100 * photoOnly) / pixels).toFixed(1)}%; ` +
  `of the ground sunlit in either, ${((100 * bothLit) / (bothLit + modelOnly + photoOnly)).toFixed(1)}% is sunlit in both`)
scales.sort((a, b) => a - b)
console.log(`Fitted brightness scale (I/F per unit of Lommel–Seeliger): median ${scales[scales.length >> 1].toFixed(3)}, ` +
  `range ${scales[0].toFixed(3)}–${scales[scales.length - 1].toFixed(3)}`)
