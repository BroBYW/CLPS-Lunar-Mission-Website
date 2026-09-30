/**
 * LOLA terrain around a site for the 3D views: four nested meshes (7.5 m spacing to 1.5 km, 30 m to 6 km, 240 m to
 * 48 km and 1500 m to 300 km) lit by the Sun at the app's time. Shadows come from the terrain itself, computed per
 * node in a worker (lib/terrain.ts) and passed to the shader as one small texture per mesh.
 */

import { decodeGrid, gridNormals, gridPositions, stereoToMoonFixed, type GridSpec, type Patch } from '../lib/terrain.ts'
import { Cesium } from './moonViewer.ts'

interface PatchIndex {
  n: number
  grids: GridSpec[]
  sites: Record<string, { file: string; center_m: [number, number]; base_m: number }>
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
      grids: index.grids.map((g, k) => ({ ...g, heights: decodeGrid(raw, k * n * n, n, g.unit_m, entry.base_m) })),
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
const TUCK_M = [0, 20, 60, 400]
/** The two finest grids are drawn as squares, the coarser ones as discs, each around the grid before it. */
const isDisc = (gi: number) => gi >= 2

/** Whether a point (m from the site) lies inside the area grid gi draws, clear of its edge. */
function drawnBy(g: GridSpec, gi: number, dx: number, dy: number): boolean {
  return isDisc(gi) ? Math.hypot(dx, dy) < g.half_m - g.spacing_m : Math.abs(dx) < g.half_m && Math.abs(dy) < g.half_m
}

// Lunar-Lambert: a blend of Lambert and Lommel–Seeliger, which keeps low-Sun terrain seen from nearby from going
// black, with a mild phase term (brighter looking away from the Sun). Earthshine and a faint constant stand-in
// for light scattered off sunlit slopes keep shadowed ground just visible.
//
// The finest map is 10 m, so up close the ground would be a few smooth triangles. Decorative relief below that
// scale gives a low Sun something to catch, as on real regolith: small craters at three scales, 0.1–5 m across.
// Fresh ones have 27° inner walls and raised rims; older ones are shallower. The relief tilts the shading normal
// only: the shape, the shadows and every number come from the data alone. Each scale fades out once it would span
// fewer than a few pixels.
// Positions are metres from the site in the stereographic plane, (st − 0.5) × stScale, the same for all four
// meshes, so the relief runs on across their edges.
const SOURCE = /* glsl */ `
vec2 detailHash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

// Slope of one scale of small craters, in about a third of the cells, smaller ones commoner. The profile, in
// radii: a bowl 0.25 deep, height 0.25 (x² − 1) + 0.06, then a rim falling from 0.06 to nothing by 1.45 radii.
// Older craters are shallower: each is scaled by 0.3–1.
vec2 craterSlope(vec2 p, float cell) {
  vec2 q = p / cell;
  vec2 base = floor(q);
  vec2 g = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = base + vec2(float(i), float(j));
      vec2 h = detailHash2(c);
      if (h.x < 0.66) continue;
      vec2 d = q - (c + 0.25 + 0.5 * detailHash2(c + 19.19));
      float dist = length(d);
      float x = dist / mix(0.1, 0.38, h.y * h.y);
      float dp = x < 1.0 ? 0.5 * x : (x < 1.45 ? -0.267 * (1.0 - (x - 1.0) / 0.45) : 0.0);
      g += dp * mix(0.3, 1.0, fract(h.x * 13.7)) * d / max(dist, 1e-4);
    }
  }
  return g;
}

// Slope of the decorative relief along the stereographic x and y axes
vec2 detailSlope(vec2 p) {
  vec2 fw = fwidth(p);
  // Between the widths along and across the view, so grazing views keep some texture without shimmering
  float footprint = max(sqrt(fw.x * fw.y), 1e-4);
  vec2 g = vec2(0.0);
  float cell = 0.5;
  for (int k = 0; k < 3; k++) {
    g += clamp((0.3 * cell / footprint - 3.0) / 3.0, 0.0, 1.0) * craterSlope(p + float(k) * 37.1, cell);
    cell *= 3.6;
  }
  return g;
}

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material m = czm_getDefaultMaterial(materialInput);
  vec3 n = normalize(materialInput.normalEC);
  vec2 slope = detailSlope((materialInput.st - 0.5) * stScale);
  n = normalize(n - slope.x * (czm_viewRotation * tangentU) - slope.y * (czm_viewRotation * tangentV));
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
        if (!drawnBy(inner, gi - 1, -half + i * w, half - j * w)) continue
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
      if (isDisc(gi) && Math.hypot(-half + (i + 0.5) * w, half - (j + 0.5) * w) > half) continue
      if (inner && tucked[a] && tucked[a + 1] && tucked[a + n] && tucked[a + n + 1]) continue
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
  // The stereographic x and y directions at the site, Moon-fixed, for the decorative roughness
  const [cx, cy] = patch.center
  const axis = (dx: number, dy: number) => {
    const a = new Float64Array(3)
    const b = new Float64Array(3)
    stereoToMoonFixed(cx + dx, cy + dy, 0, a)
    stereoToMoonFixed(cx - dx, cy - dy, 0, b)
    return Cesium.Cartesian3.normalize(new Cesium.Cartesian3(a[0] - b[0], a[1] - b[1], a[2] - b[2]), new Cesium.Cartesian3())
  }
  const tangentU = axis(1, 0)
  const tangentV = axis(0, 1)
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
    (g, gi) =>
      new Cesium.Material({
        fabric: {
          uniforms: {
            shade: canvases[gi][0],
            earthshine: new Cesium.Cartesian3(0, 0, 0),
            albedo,
            stScale: n * g.spacing_m,
            tangentU,
            tangentV,
          },
          source: SOURCE,
        },
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

  const finest = patch.grids[0].heights
  let maxNear = -Infinity
  for (const g of patch.grids.filter((g) => g.half_m <= 48_000)) for (const h of g.heights) maxNear = Math.max(maxNear, h)
  let flip = 0

  return {
    siteId,
    patch,
    centreHeight: finest[((n - 1) / 2) * n + (n - 1) / 2],
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
