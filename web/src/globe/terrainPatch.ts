/**
 * LOLA terrain around a site for the 3D views: three nested meshes (30 m spacing to 6 km, 240 m to 48 km and
 * 1500 m to 300 km) lit by the Sun at the app's time. Shadows come from the terrain itself, computed per node
 * in a worker (lib/terrain.ts) and passed to the shader as one small texture per mesh.
 */

import { decodeGrid, gridNormals, gridPositions, type GridSpec, type Patch } from '../lib/terrain.ts'
import { Cesium } from './moonViewer.ts'

interface PatchIndex {
  n: number
  grids: GridSpec[]
  sites: Record<string, { file: string; center_m: [number, number] }>
}

const base = `${import.meta.env.BASE_URL}data/terrain/`
let indexPromise: Promise<PatchIndex> | null = null
const cache = new Map<string, Promise<Patch>>()

/** Some servers send .gz files with Content-Encoding: gzip (the browser has then unpacked them), others don't. */
async function gunzip(res: Response): Promise<ArrayBuffer> {
  const buf = await res.arrayBuffer()
  const b = new Uint8Array(buf, 0, 2)
  if (b[0] !== 0x1f || b[1] !== 0x8b) return buf
  return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
}

export function loadPatch(siteId: string): Promise<Patch> {
  const hit = cache.get(siteId)
  if (hit) return hit
  const p = (async () => {
    indexPromise ??= fetch(`${base}index.json`).then((r) => {
      if (!r.ok) throw new Error(`terrain index: HTTP ${r.status}`)
      return r.json() as Promise<PatchIndex>
    })
    const index = await indexPromise
    const entry = index.sites[siteId]
    if (!entry) throw new Error(`no terrain for ${siteId}`)
    const res = await fetch(base + entry.file)
    if (!res.ok) throw new Error(`terrain ${siteId}: HTTP ${res.status}`)
    const raw = new Int16Array(await gunzip(res))
    const { n } = index
    return {
      n,
      center: entry.center_m,
      grids: index.grids.map((g, k) => ({ ...g, heights: decodeGrid(raw, k * n * n, n, g.unit_m) })),
    }
  })()
  cache.set(siteId, p)
  p.catch(() => {
    cache.delete(siteId)
    indexPromise = null
  })
  return p
}

/** Where a coarser mesh overlaps a finer one, its vertices sink this far (m) so the finer mesh shows. */
const TUCK_M = [0, 60, 400]

// Lunar-Lambert: a blend of Lambert and Lommel–Seeliger, which keeps low-Sun terrain seen from nearby from going
// black, with a mild phase term (brighter looking away from the Sun). Earthshine and a faint constant stand-in
// for light scattered off sunlit slopes keep shadowed ground just visible.
const SOURCE = /* glsl */ `
czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material m = czm_getDefaultMaterial(materialInput);
  vec3 n = normalize(materialInput.normalEC);
  vec3 v = normalize(materialInput.positionToEyeEC);
  vec3 l = czm_lightDirectionEC;
  float mu0 = dot(n, l);
  float mu = max(dot(n, v), 0.0);
  float sunLight = 0.0;
  if (mu0 > 0.0) {
    float ls = 2.0 * mu0 / (mu0 + mu + 0.05);
    float phase = 0.35 + 0.65 * (0.5 + 0.5 * dot(l, v));
    sunLight = texture(shade, materialInput.st).r * mix(mu0, ls, 0.7) * phase;
  }
  float e = length(earthshine);
  float fill = e > 0.0 ? e * max(dot(n, normalize(czm_viewRotation * earthshine)), 0.0) : 0.0;
  m.diffuse = vec3(0.0);
  m.emission = albedo.rgb * (1.6 * sunLight + fill + 0.022);
  m.alpha = 1.0;
  return m;
}
`

function buildGeometry(p: Patch, gi: number): Cesium.Geometry {
  const { n } = p
  const g = p.grids[gi]
  const w = g.spacing_m
  const half = g.half_m
  const pos = gridPositions(p, g)
  const normals = gridNormals(pos, n)
  const inner = gi > 0 ? p.grids[gi - 1] : null
  const tucked = new Uint8Array(n * n)
  if (inner) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const dx = -half + i * w
        const dy = half - j * w
        // The fine grid is drawn as a square, the coarse one as a disc
        const covered = gi === 1 ? Math.abs(dx) < inner.half_m && Math.abs(dy) < inner.half_m : Math.hypot(dx, dy) < inner.half_m - inner.spacing_m
        if (!covered) continue
        const k = j * n + i
        tucked[k] = 1
        const r = Math.hypot(pos[3 * k], pos[3 * k + 1], pos[3 * k + 2])
        const f = (r - TUCK_M[gi]) / r
        pos[3 * k] *= f
        pos[3 * k + 1] *= f
        pos[3 * k + 2] *= f
      }
    }
  }
  const st = new Float32Array(n * n * 2)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      st[2 * (j * n + i)] = (i + 0.5) / n
      st[2 * (j * n + i) + 1] = 1 - (j + 0.5) / n
    }
  }
  const idx: number[] = []
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i
      if (inner) {
        if (Math.hypot(-half + (i + 0.5) * w, half - (j + 0.5) * w) > half) continue
        if (tucked[a] && tucked[a + 1] && tucked[a + n] && tucked[a + n + 1]) continue
      }
      idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1)
    }
  }
  const attributes = new Cesium.GeometryAttributes()
  attributes.position = new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: pos })
  attributes.normal = new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.FLOAT, componentsPerAttribute: 3, values: normals })
  attributes.st = new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.FLOAT, componentsPerAttribute: 2, values: st })
  return new Cesium.Geometry({
    attributes,
    indices: new Uint32Array(idx),
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: Cesium.BoundingSphere.fromVertices(pos as unknown as number[]),
  })
}

export interface TerrainScene {
  siteId: string
  patch: Patch
  /** Terrain height at the site and the highest point within 48 km, metres above the sphere. */
  centreHeight: number
  maxNearHeight: number
  show: (visible: boolean) => void
  /** Visible fraction of the Sun per node, one RGBA image per grid (from the terrain worker). */
  setShading: (images: Uint8ClampedArray[]) => void
  /** Direction toward the Earth (Moon-fixed, any length) and the fill strength. */
  setEarthshine: (towardEarth: ArrayLike<number>, strength: number) => void
  destroy: () => void
}

export function addTerrain(viewer: Cesium.Viewer, siteId: string, patch: Patch): TerrainScene {
  const { n } = patch
  const albedo = new Cesium.Color(0.62, 0.6, 0.56, 1)
  // Two canvases per mesh, used in turn, so every update is a new texture source
  const canvases = patch.grids.map(() =>
    [0, 1].map(() => {
      const c = document.createElement('canvas')
      c.width = n
      c.height = n
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, n, n)
      return c
    }),
  )
  const materials = patch.grids.map(
    (_, gi) =>
      new Cesium.Material({
        fabric: { uniforms: { shade: canvases[gi][0], earthshine: new Cesium.Cartesian3(0, 0, 0), albedo }, source: SOURCE },
        translucent: false,
      }),
  )
  const primitives = patch.grids.map(
    (_, gi) =>
      new Cesium.Primitive({
        geometryInstances: new Cesium.GeometryInstance({ geometry: buildGeometry(patch, gi) }),
        appearance: new Cesium.MaterialAppearance({
          material: materials[gi],
          materialSupport: Cesium.MaterialAppearance.MaterialSupport.TEXTURED,
          flat: true,
          faceForward: false,
          translucent: false,
          closed: false,
        }),
        asynchronous: false,
        allowPicking: false,
        show: false,
      }),
  )
  for (const p of primitives) viewer.scene.primitives.add(p)

  const fine = patch.grids[0].heights
  let maxNear = -Infinity
  for (const g of patch.grids.slice(0, 2)) for (const h of g.heights) maxNear = Math.max(maxNear, h)
  let flip = 0

  return {
    siteId,
    patch,
    centreHeight: fine[((n - 1) / 2) * n + (n - 1) / 2],
    maxNearHeight: maxNear,
    show(visible) {
      for (const p of primitives) p.show = visible
      viewer.scene.requestRender()
    },
    setShading(images) {
      flip ^= 1
      images.forEach((rgba, gi) => {
        const c = canvases[gi][flip]
        c.getContext('2d')!.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, n, n), 0, 0)
        materials[gi].uniforms.shade = c
      })
      viewer.scene.requestRender()
    },
    setEarthshine(towardEarth, strength) {
      const v = new Cesium.Cartesian3(towardEarth[0], towardEarth[1], towardEarth[2])
      Cesium.Cartesian3.normalize(v, v)
      Cesium.Cartesian3.multiplyByScalar(v, strength, v)
      for (const m of materials) m.uniforms.earthshine = v
      viewer.scene.requestRender()
    },
    destroy() {
      if (viewer.isDestroyed()) return
      for (const p of primitives) viewer.scene.primitives.remove(p)
    },
  }
}
