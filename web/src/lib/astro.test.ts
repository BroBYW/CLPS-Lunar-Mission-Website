import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  Ephemeris,
  type EphemerisMeta,
  angularRadiusDeg,
  azDiff,
  azElTo,
  R_EARTH_KM,
  R_SUN_KM,
  siteFrame,
} from './astro.ts'
import fixtures from './__fixtures__/azel.json'

const dataDir = new URL('../../public/data/', import.meta.url)

function loadEphemeris(): Ephemeris {
  const meta = JSON.parse(readFileSync(new URL('ephemeris.json', dataDir), 'utf8')) as EphemerisMeta
  const bin = readFileSync(new URL('ephemeris.bin', dataDir))
  const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer
  return new Ephemeris(buffer, meta)
}

describe('ephemeris + az/el vs Python (SPICE at exact epochs)', () => {
  const eph = loadEphemeris()
  const out = new Float64Array(6)

  it('covers 2024-01-01 to 2031-01-01 hourly', () => {
    expect(eph.count).toBe(61_369)
    expect(new Date(eph.startMs).toISOString()).toBe('2024-01-01T00:00:00.000Z')
    expect(new Date(eph.endMs).toISOString()).toBe('2031-01-01T00:00:00.000Z')
  })

  it('matches every fixture within 0.01° (azimuth and elevation)', () => {
    let maxAz = 0
    let maxEl = 0
    let maxRadius = 0
    for (const c of fixtures.cases) {
      const frame = siteFrame(c.lat, c.lon, c.height_m)
      eph.sample(c.t_ms, out)
      const o = c.body === 'sun' ? 0 : 3
      const r = azElTo(frame, out[o], out[o + 1], out[o + 2])
      const radius = angularRadiusDeg(c.body === 'sun' ? R_SUN_KM : R_EARTH_KM, r.dist)
      maxAz = Math.max(maxAz, Math.abs(azDiff(r.az, c.az)))
      maxEl = Math.max(maxEl, Math.abs(r.el - c.el))
      maxRadius = Math.max(maxRadius, Math.abs(radius - c.radius_deg))
    }
    console.info(
      `${fixtures.cases.length} cases: max |Δaz| ${maxAz.toExponential(2)}°, ` +
        `max |Δel| ${maxEl.toExponential(2)}°, max |Δradius| ${maxRadius.toExponential(2)}°`,
    )
    expect(maxAz).toBeLessThan(0.01)
    expect(maxEl).toBeLessThan(0.01)
    expect(maxRadius).toBeLessThan(0.001)
  })
})

describe('azDiff', () => {
  it('wraps across north', () => {
    expect(azDiff(1, 359)).toBeCloseTo(2)
    expect(azDiff(359, 1)).toBeCloseTo(-2)
    expect(azDiff(180, 0)).toBeCloseTo(-180)
  })
})
