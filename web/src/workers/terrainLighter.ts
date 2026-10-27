import * as Comlink from 'comlink'
import { R_SUN_KM } from '../lib/astro.ts'
import type { Patch } from '../lib/terrain.ts'
import type { TerrainWorkerApi } from './terrain.worker.ts'

/**
 * A terrain worker of its own for lighting one site's patch at chosen moments (the photo comparison, the photo quiz
 * and the shadow movie), one grid at a time. Requests run in order; the worker starts on first use.
 */
export class TerrainLighter {
  private worker: Worker | null = null
  private remote: Comlink.Remote<TerrainWorkerApi> | null = null
  private patchId = ''

  /** Visible fraction of the Sun (0–1) at every node of one grid, or null if a later call changed the patch. */
  async light(siteId: string, patch: Patch, gridIndex: number, sunKm: ArrayLike<number>): Promise<Float32Array | null> {
    if (!this.worker || !this.remote) {
      this.worker = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' })
      this.remote = Comlink.wrap<TerrainWorkerApi>(this.worker)
    }
    const remote = this.remote
    if (this.patchId !== siteId) {
      this.patchId = siteId
      await remote.setPatch(siteId, patch)
    }
    const sun = [sunKm[0], sunKm[1], sunKm[2]]
    return remote.shadeGrid(siteId, sun, Math.asin(R_SUN_KM / Math.hypot(sun[0], sun[1], sun[2])), gridIndex)
  }

  destroy(): void {
    this.worker?.terminate()
    this.worker = null
    this.remote = null
    this.patchId = ''
  }
}
