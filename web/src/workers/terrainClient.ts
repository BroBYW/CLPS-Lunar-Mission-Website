import * as Comlink from 'comlink'
import type { Patch } from '../lib/terrain.ts'
import type { TerrainWorkerApi } from './terrain.worker.ts'

/** Shading requests for one terrain patch at a time. While one is running, only the latest waits. */
export class TerrainShading {
  private readonly worker = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' })
  private readonly remote = Comlink.wrap<TerrainWorkerApi>(this.worker)
  private id = ''
  private ready: Promise<void> = Promise.resolve()
  private busy = false
  private pending: { sun: number[]; radius: number } | null = null

  constructor(private readonly onResult: (id: string, images: Uint8ClampedArray[]) => void) {}

  setPatch(id: string, patch: Patch): void {
    this.id = id
    this.ready = this.remote.setPatch(id, patch)
  }

  request(sun: ArrayLike<number>, sunRadiusRad: number): void {
    this.pending = { sun: [sun[0], sun[1], sun[2]], radius: sunRadiusRad }
    if (!this.busy) void this.pump()
  }

  private async pump(): Promise<void> {
    this.busy = true
    while (this.pending) {
      const { sun, radius } = this.pending
      this.pending = null
      const id = this.id
      try {
        await this.ready
        const images = await this.remote.shade(id, sun, radius)
        if (images && id === this.id) this.onResult(id, images)
      } catch {
        // The worker was stopped (view closed); nothing to draw
      }
    }
    this.busy = false
  }

  destroy(): void {
    this.pending = null
    this.worker.terminate()
  }
}
