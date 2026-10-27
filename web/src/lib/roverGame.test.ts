import { describe, expect, it } from 'vitest'
import { Ephemeris } from './astro.ts'
import { toStereo } from './pinHorizon.ts'
import { BATTERY_WH, DRIVE_W, IDLE_W, SPEED_KMH, roverTick, startRover } from './roverGame.ts'
import type { Patch } from './terrain.ts'

/** A flat two-grid patch around 89° S, 0° E. */
function flat(): Patch {
  const n = 101
  const center = toStereo(-89, 0) as [number, number]
  return {
    n,
    center,
    grids: [100, 2000].map((spacing, k) => ({ name: ['fine', 'far'][k], spacing_m: spacing, half_m: ((n - 1) / 2) * spacing, unit_m: 1, heights: new Float32Array(n * n) })),
  }
}

/**
 * An ephemeris with the Sun fixed in the sky of a site at 89° S, 0° E: north of it (away from the pole), 10° up or
 * 20° down. Earth sits opposite, out of sight.
 */
function sky(sunUp: boolean): Ephemeris {
  const lat = (-89 * Math.PI) / 180
  const up = [Math.cos(lat), 0, Math.sin(lat)]
  const north = [-Math.sin(lat), 0, Math.cos(lat)]
  const el = ((sunUp ? 10 : -20) * Math.PI) / 180
  const dir = up.map((u, i) => u * Math.sin(el) + north[i] * Math.cos(el))
  const count = 3
  const data = new Float32Array(count * 6)
  for (let i = 0; i < count; i++) data.set([...dir.map((d) => d * 1.496e8), ...dir.map((d) => -d * 3.84e5)], i * 6)
  return new Ephemeris(data.buffer, { t0_utc: '2026-12-01T00:00:00Z', step_s: 86_400 * 30, count, columns: [], frame: 'MOON_ME', abcorr: 'LT+S' })
}

describe('outrun the shadows', () => {
  it('drives toward the target at its top speed and stays on the terrain', () => {
    const p = flat()
    let s = startRover(p, sky(true), Date.UTC(2027, 0, 1))
    const target: [number, number] = [p.center[0] + 10_000, p.center[1]]
    s = roverTick(p, sky(true), s, target, 3_600_000)
    expect(s.x - p.center[0]).toBeCloseTo(SPEED_KMH * 1000, 6)
    expect(s.km).toBeCloseTo(SPEED_KMH, 9)
    // At the edge of the terrain (98 km out on the 2 km grid) it stops rather than leave it
    const edge = { ...s, x: p.center[0] + 97_800 }
    const off = roverTick(p, sky(true), edge, [p.center[0] + 1e7, p.center[1]], 3_600_000)
    expect(off.x).toBe(edge.x)
  })

  it('charges in sunlight, and drains to a frozen rover in the dark', () => {
    const p = flat()
    const day = roverTick(p, sky(true), { ...startRover(p, sky(true), 0), chargeWh: 100 }, null, 3_600_000)
    expect(day.sun).toBe(1)
    expect(day.chargeWh).toBeGreaterThan(100)
    let s = startRover(p, sky(false), 0)
    expect(s.sun).toBe(0)
    let hours = 0
    while (!s.frozen && hours < 1000) {
      s = roverTick(p, sky(false), s, [p.center[0] + 1e5, p.center[1]], 3_600_000)
      hours++
    }
    // Driving east the whole time: idle + drive power until the battery is empty
    expect(hours).toBe(Math.ceil(BATTERY_WH / (IDLE_W + DRIVE_W)))
  })
})
