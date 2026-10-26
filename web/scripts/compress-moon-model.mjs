/**
 * Builds the home page Moon (public/data/moon.glb) from the NASA SVS model (SVS 14959, moon_small.glb, 13.8 MB) and
 * the LOLA global elevation map (LDEM_16.IMG, 16 pixels per degree, 33 MB):
 * - the 4096² PNG texture becomes a JPEG, normals become radial, positions and normals are quantized, and the
 *   clearcoat and specular extensions are dropped (they give the regolith a glossy highlight);
 * - the model is a smooth ball with a color map only, so a normal map baked from the LOLA heights, in the color map's
 *   own layout, gives it relief: craters catch the light along the day-night line. Tangents are added to match.
 *
 *   node scripts/compress-moon-model.mjs <moon_small.glb> <LDEM_16.IMG> [output.glb]
 *
 * Sources: https://svs.gsfc.nasa.gov/14959/ and, for LDEM_16.IMG (keep it in pipeline/raw/, never commit it),
 * https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_16.img
 */

import { readFileSync } from 'node:fs'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, quantize, textureCompress, weld } from '@gltf-transform/functions'
import sharp from 'sharp'

const [input, ldemPath, output = 'public/data/moon.glb'] = process.argv.slice(2)
if (!input || !ldemPath) {
  console.error('usage: node scripts/compress-moon-model.mjs <moon_small.glb> <LDEM_16.IMG> [output.glb]')
  process.exit(1)
}

/** LOLA reference sphere, m. */
const R_MOON = 1_737_400
const DEG = 180 / Math.PI
/** Pixels each UV island is padded by, so texture filtering and mipmaps never blend in the flat filler. */
const PAD = 16
/**
 * Normal map size: half the color map's. On screens up to 1440p the Moon is drawn from the color map's 2048² mip
 * level or coarser anyway; 4096² would add 3–4 MB for 4K screens only.
 */
const NORMAL_SIZE = 2048
/**
 * Slopes are stored this many times steeper, and the material's normal scale (1 / PACK) undoes it on the GPU. Most
 * slopes are a few degrees, so this spreads them over more of the 8-bit range and the JPEG steps cost less.
 */
const PACK = 6

// LDEM_16: simple cylindrical in the DE421 mean-Earth frame (MOON_ME), 16 px/deg, pixel registered, the northernmost
// row first and 0°E first, heights as int16 × 0.5 m above the reference sphere
const LDEM_W = 5760
const LDEM_H = 2880
const ldemBytes = readFileSync(ldemPath)
if (ldemBytes.length !== LDEM_W * LDEM_H * 2) throw new Error(`${ldemPath}: expected ${LDEM_W * LDEM_H * 2} bytes`)
const ldem = new Int16Array(ldemBytes.buffer, ldemBytes.byteOffset, LDEM_W * LDEM_H)

/** LOLA height (m) at a unit vector in MOON_ME, interpolated bilinearly. */
function heightAt(x, y, z) {
  const lat = Math.asin(Math.max(-1, Math.min(1, z))) * DEG
  const lon = Math.atan2(y, x) * DEG
  const fy = Math.min(Math.max((90 - lat) * 16 - 0.5, 0), LDEM_H - 1)
  const fx = (lon < 0 ? lon + 360 : lon) * 16 - 0.5
  const y0 = Math.min(Math.floor(fy), LDEM_H - 2)
  const x0 = Math.floor(fx)
  const ty = fy - y0
  const tx = fx - x0
  const c0 = (x0 + LDEM_W) % LDEM_W
  const c1 = (c0 + 1) % LDEM_W
  const r0 = y0 * LDEM_W
  const r1 = r0 + LDEM_W
  const a = ldem[r0 + c0] + (ldem[r0 + c1] - ldem[r0 + c0]) * tx
  const b = ldem[r1 + c0] + (ldem[r1 + c1] - ldem[r1 + c0]) * tx
  return 0.5 * (a + (b - a) * ty)
}

/** Surface normal at unit vector m (MOON_ME) from the LOLA slopes over ±delta metres, into out. */
function lolaNormal(mx, my, mz, delta, out) {
  // East and north at m; at the pole itself any perpendicular pair will do
  let ex = -my
  let ey = mx
  const el = Math.hypot(ex, ey)
  if (el < 1e-9) {
    ex = 1
    ey = 0
  } else {
    ex /= el
    ey /= el
  }
  const nx = -mz * ey
  const ny = mz * ex
  const nz = mx * ey - my * ex
  const c = Math.cos(delta / R_MOON)
  const s = Math.sin(delta / R_MOON)
  // Rise over run across ±delta along a tangent direction
  const slope = (dx, dy, dz) => {
    const ahead = heightAt(mx * c + dx * s, my * c + dy * s, mz * c + dz * s)
    const behind = heightAt(mx * c - dx * s, my * c - dy * s, mz * c - dz * s)
    return (ahead - behind) / (2 * delta)
  }
  const slopeE = slope(ex, ey, 0)
  const slopeN = slope(nx, ny, nz)
  const ox = mx - slopeE * ex - slopeN * nx
  const oy = my - slopeE * ey - slopeN * ny
  const oz = mz - slopeN * nz
  const ol = Math.hypot(ox, oy, oz)
  out[0] = ox / ol
  out[1] = oy / ol
  out[2] = oz / ol
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(input)

for (const name of ['KHR_materials_clearcoat', 'KHR_materials_specular', 'KHR_materials_ior']) {
  doc.getRoot().listExtensionsUsed().find((e) => e.extensionName === name)?.dispose()
}

// The shipped normals are faceted (1.4° off radial on average), which draws triangles along the terminator when
// the Sun is low. The mesh is a sphere, so the true normal is the radial direction.
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION').getArray()
    const normal = new Float32Array(pos.length)
    for (let i = 0; i < pos.length; i += 3) {
      const r = Math.hypot(pos[i], pos[i + 1], pos[i + 2])
      normal[i] = pos[i] / r
      normal[i + 1] = pos[i + 1] / r
      normal[i + 2] = pos[i + 2] / r
    }
    prim.getAttribute('NORMAL').setArray(normal)
  }
}

await doc.transform(dedup(), weld(), prune())

const prims = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())
if (prims.length !== 1) throw new Error(`expected one primitive, found ${prims.length}`)
const prim = prims[0]
const material = prim.getMaterial()
const width = NORMAL_SIZE
const height = NORMAL_SIZE
const pos = prim.getAttribute('POSITION').getArray()
const nrm = prim.getAttribute('NORMAL').getArray()
const uv = prim.getAttribute('TEXCOORD_0').getArray()
const idx = prim.getIndices().getArray()
const vertexCount = pos.length / 3
let modelRadius = 0
for (let i = 0; i < pos.length; i += 3) {
  modelRadius = Math.max(modelRadius, Math.hypot(pos[i], pos[i + 1], pos[i + 2]))
}

/** ∂P/∂u and ∂P/∂v across triangle (a, b, c), in model units; null if its texture coordinates are degenerate */
function uvDerivatives(a, b, c) {
  const du1 = uv[2 * b] - uv[2 * a]
  const dv1 = uv[2 * b + 1] - uv[2 * a + 1]
  const du2 = uv[2 * c] - uv[2 * a]
  const dv2 = uv[2 * c + 1] - uv[2 * a + 1]
  const det = du1 * dv2 - du2 * dv1
  if (Math.abs(det) < 1e-14) return null
  const su = [0, 0, 0]
  const sv = [0, 0, 0]
  for (let k = 0; k < 3; k++) {
    const e1 = pos[3 * b + k] - pos[3 * a + k]
    const e2 = pos[3 * c + k] - pos[3 * a + k]
    su[k] = (e1 * dv2 - e2 * dv1) / det
    sv[k] = (e2 * du1 - e1 * du2) / det
  }
  return [su, sv]
}

// Tangents along +u, with the handedness that makes the bitangent point up the image (−v), as glTF expects
const dPdu = new Float64Array(pos.length)
const dPdv = new Float64Array(pos.length)
for (let t = 0; t < idx.length; t += 3) {
  const tri = [idx[t], idx[t + 1], idx[t + 2]]
  const d = uvDerivatives(...tri)
  if (!d) continue
  for (const v of tri) {
    for (let k = 0; k < 3; k++) {
      dPdu[3 * v + k] += d[0][k]
      dPdv[3 * v + k] += d[1][k]
    }
  }
}
const tangents = new Float32Array(vertexCount * 4)
for (let v = 0; v < vertexCount; v++) {
  const [nx, ny, nz] = [nrm[3 * v], nrm[3 * v + 1], nrm[3 * v + 2]]
  const d = dPdu[3 * v] * nx + dPdu[3 * v + 1] * ny + dPdu[3 * v + 2] * nz
  const tx = dPdu[3 * v] - d * nx
  const ty = dPdu[3 * v + 1] - d * ny
  const tz = dPdu[3 * v + 2] - d * nz
  const tl = Math.hypot(tx, ty, tz)
  tangents.set([tx / tl, ty / tl, tz / tl], 4 * v)
  // cross(N, T) along +v means the bitangent must be flipped
  const bx = ny * tz - nz * ty
  const by = nz * tx - nx * tz
  const bz = nx * ty - ny * tx
  tangents[4 * v + 3] = bx * dPdv[3 * v] + by * dPdv[3 * v + 1] + bz * dPdv[3 * v + 2] > 0 ? -1 : 1
}

// Bake: every texel of every triangle gets the LOLA normal at its point on the sphere, in the tangent frame the
// renderer will rebuild there. The glTF frame turns into MOON_ME as MODEL_ORIENTATION in src/globe/moonViewer.ts
// says: x = −z, y = −x, z = y.
const rgb = new Uint8Array(width * height * 3)
const covered = new Uint8Array(width * height)
const metresPerUnit = R_MOON / modelRadius
const n = new Float64Array(3)
/** The normal the shader gets from a stored texel: xy scaled by 1 / PACK, then normalized. */
const decodeNormal = (b, o) => {
  const v = [(b[o] / 127.5 - 1) / PACK, (b[o + 1] / 127.5 - 1) / PACK, b[o + 2] / 127.5 - 1]
  const l = Math.hypot(...v)
  return v.map((c) => c / l)
}
const angle = (p, q) => Math.acos(Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2])) * DEG
let texels = 0
let slopeSum = 0
let slopeMax = 0
let stepSum = 0
for (let t = 0; t < idx.length; t += 3) {
  const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]]
  const d = uvDerivatives(a, b, c)
  if (!d) continue
  // Half the slope baseline: one texel, measured on the ground
  const delta = Math.max(Math.hypot(...d[0]) / width, Math.hypot(...d[1]) / height) * metresPerUnit
  // Texel centers sit on whole numbers
  const px = [a, b, c].map((v) => uv[2 * v] * width - 0.5)
  const py = [a, b, c].map((v) => uv[2 * v + 1] * height - 0.5)
  const area = (px[1] - px[0]) * (py[2] - py[0]) - (px[2] - px[0]) * (py[1] - py[0])
  let w0 = 0
  let w1 = 0
  let w2 = 0
  const lerp = (arr, stride, k) => w0 * arr[stride * a + k] + w1 * arr[stride * b + k] + w2 * arr[stride * c + k]

  const xMin = Math.max(0, Math.ceil(Math.min(...px)))
  const xMax = Math.min(width - 1, Math.floor(Math.max(...px)))
  const yMin = Math.max(0, Math.ceil(Math.min(...py)))
  const yMax = Math.min(height - 1, Math.floor(Math.max(...py)))
  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      w0 = ((px[1] - x) * (py[2] - y) - (px[2] - x) * (py[1] - y)) / area
      w1 = ((px[2] - x) * (py[0] - y) - (px[0] - x) * (py[2] - y)) / area
      w2 = 1 - w0 - w1
      if (w0 < -1e-7 || w1 < -1e-7 || w2 < -1e-7) continue
      const i = y * width + x
      if (covered[i]) continue
      // Point on the sphere, interpolated frame (as the shader sees it), then Gram-Schmidt
      const gx = lerp(pos, 3, 0)
      const gy = lerp(pos, 3, 1)
      const gz = lerp(pos, 3, 2)
      const gl = Math.hypot(gx, gy, gz)
      let Nx = lerp(nrm, 3, 0)
      let Ny = lerp(nrm, 3, 1)
      let Nz = lerp(nrm, 3, 2)
      const Nl = Math.hypot(Nx, Ny, Nz)
      Nx /= Nl
      Ny /= Nl
      Nz /= Nl
      let Tx = lerp(tangents, 4, 0)
      let Ty = lerp(tangents, 4, 1)
      let Tz = lerp(tangents, 4, 2)
      const TN = Tx * Nx + Ty * Ny + Tz * Nz
      Tx -= TN * Nx
      Ty -= TN * Ny
      Tz -= TN * Nz
      const Tl = Math.hypot(Tx, Ty, Tz)
      Tx /= Tl
      Ty /= Tl
      Tz /= Tl
      const sign = lerp(tangents, 4, 3) < 0 ? -1 : 1
      const Bx = (Ny * Tz - Nz * Ty) * sign
      const By = (Nz * Tx - Nx * Tz) * sign
      const Bz = (Nx * Ty - Ny * Tx) * sign

      lolaNormal(-gz / gl, -gx / gl, gy / gl, delta, n)
      // Back to the glTF frame, then into the tangent frame
      const hx = -n[1]
      const hy = n[2]
      const hz = -n[0]
      const sx = hx * Tx + hy * Ty + hz * Tz
      const sy = hx * Bx + hy * By + hz * Bz
      const sz = hx * Nx + hy * Ny + hz * Nz
      const slope = Math.acos(Math.min(1, sz)) * DEG
      slopeSum += slope
      slopeMax = Math.max(slopeMax, slope)
      texels++
      // 8 bits can't hold 0 exactly (127.5), so dither the rounding instead of tilting every flat texel the same way
      const dither = ((Math.imul(i, 2654435761) >>> 0) / 2 ** 32) * 0.98 + 0.01
      const ql = Math.hypot(sx * PACK, sy * PACK, sz)
      rgb[3 * i] = Math.floor((sx * PACK * 127.5) / ql + 127.5 + dither)
      rgb[3 * i + 1] = Math.floor((sy * PACK * 127.5) / ql + 127.5 + dither)
      rgb[3 * i + 2] = Math.round((sz * 127.5) / ql + 127.5)
      stepSum += angle(decodeNormal(rgb, 3 * i), [sx, sy, sz])
      covered[i] = 1
    }
  }
}

// Pad the islands, then fill the rest flat
let frontier = []
const neighbours = (i) => {
  const x = i % width
  const out = []
  if (x > 0) out.push(i - 1)
  if (x < width - 1) out.push(i + 1)
  if (i >= width) out.push(i - width)
  if (i < width * (height - 1)) out.push(i + width)
  return out
}
for (let i = 0; i < width * height; i++) if (!covered[i] && neighbours(i).some((j) => covered[j])) frontier.push(i)
for (let layer = 0; layer < PAD && frontier.length; layer++) {
  const values = frontier.map((i) => {
    const from = neighbours(i).filter((j) => covered[j])
    return [0, 1, 2].map((k) => Math.round(from.reduce((s, j) => s + rgb[3 * j + k], 0) / from.length))
  })
  frontier.forEach((i, f) => {
    rgb.set(values[f], 3 * i)
    covered[i] = 2
  })
  const next = new Set()
  for (const i of frontier) for (const j of neighbours(i)) if (!covered[j]) next.add(j)
  frontier = [...next]
}
for (let i = 0; i < width * height; i++) if (!covered[i]) rgb.set([128, 128, 255], 3 * i)

// Full-resolution color channels and mozjpeg's flat quantization table: a normal map is data, not a picture, so the
// usual tables (coarse on fine detail and on color) cost 2–3 times the error at the same size
const normalImage = await sharp(rgb, { raw: { width, height, channels: 3 } })
  .jpeg({ quality: 85, chromaSubsampling: '4:4:4', mozjpeg: true, quantisationTable: 1 })
  .toBuffer()
const decoded = await sharp(normalImage).raw().toBuffer()
const jpegErrors = []
for (let i = 0; i < width * height; i++) {
  if (covered[i] === 1) jpegErrors.push(angle(decodeNormal(decoded, 3 * i), decodeNormal(rgb, 3 * i)))
}
jpegErrors.sort((p, q) => p - q)
const jpegMean = jpegErrors.reduce((s, e) => s + e, 0) / jpegErrors.length
const jpeg99 = jpegErrors[Math.floor(0.99 * jpegErrors.length)]
const megabytes = (normalImage.length / 1e6).toFixed(2)
const slopes = `slopes ${(slopeSum / texels).toFixed(2)}° on average, ${slopeMax.toFixed(1)}° at most`
console.log(`normal map: ${texels} texels; ${slopes}`)
console.log(
  `  error: 8-bit steps ${(stepSum / texels).toFixed(2)}°, then the ${megabytes} MB JPEG ${jpegMean.toFixed(2)}° ` +
    `on average and ${jpeg99.toFixed(2)}° at the 99th percentile`,
)

const colorInfo = material.getBaseColorTextureInfo()
material.setNormalTexture(doc.createTexture('LOLA_normals').setImage(normalImage).setMimeType('image/jpeg'))
material.setNormalScale(1 / PACK)
material.getNormalTextureInfo().setMinFilter(colorInfo.getMinFilter()).setMagFilter(colorInfo.getMagFilter())
const [buffer] = doc.getRoot().listBuffers()
prim.setAttribute('TANGENT', doc.createAccessor().setType('VEC4').setArray(tangents).setBuffer(buffer))

await doc.transform(
  quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 14 }),
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', quality: 86, slots: /^baseColorTexture$/ }),
)
await io.write(output, doc)
console.log(`wrote ${output}`)
