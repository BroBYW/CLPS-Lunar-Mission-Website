/**
 * Shrinks the NASA SVS Moon model (SVS 14959, moon_small.glb, 13.8 MB) for the home page backdrop:
 * the 4096² PNG texture becomes a JPEG, normals become radial, positions and normals are quantized, and the
 * clearcoat and specular extensions are dropped (they give the regolith a glossy highlight).
 *
 *   node scripts/compress-moon-model.mjs <input.glb> [output.glb]
 */

import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, quantize, textureCompress, weld } from '@gltf-transform/functions'
import sharp from 'sharp'

const [input, output = 'public/data/moon.glb'] = process.argv.slice(2)
if (!input) {
  console.error('usage: node scripts/compress-moon-model.mjs <input.glb> [output.glb]')
  process.exit(1)
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

await doc.transform(
  dedup(),
  weld(),
  prune(),
  quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 14 }),
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', quality: 86 }),
)
await io.write(output, doc)
console.log(`wrote ${output}`)
