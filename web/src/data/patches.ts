/**
 * LOLA terrain patches around each site (pipeline/scripts/terrain_patches.py): six nested grids, decoded to heights.
 * Kept apart from the 3D code so views without Cesium can use them too.
 */

import { gunzip } from '../lib/gunzip.ts'
import { decodeGrid, type GridSpec, type Patch } from '../lib/terrain.ts'

interface PatchIndex {
  n: number
  grids: GridSpec[]
  sites: Record<string, { file: string; center_m: [number, number]; base_m: number }>
}

const base = `${import.meta.env.BASE_URL}data/terrain/`
let indexPromise: Promise<PatchIndex> | null = null
const cache = new Map<string, Promise<Patch>>()

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
