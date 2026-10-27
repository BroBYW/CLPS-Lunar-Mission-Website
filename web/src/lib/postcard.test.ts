import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { angularRadiusDeg, Ephemeris, R_EARTH_KM, siteFrame, type EphemerisMeta } from './astro.ts'
import { HorizonSet, type HorizonMeta } from './horizon.ts'
import { bestEarthMoment, earthLit } from './postcard.ts'
import { HOUR_MS } from './time.ts'

const dataDir = new URL('../../public/data/', import.meta.url)
const buf = (name: string) => {
  const b = readFileSync(new URL(name, dataDir))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.length)
}

describe('Earth postcard', () => {
  it('measures how much of Earth is lit, seen from the Moon', () => {
    expect(earthLit([1, 0, 0], [-1, 0, 0])).toBeCloseTo(1, 12)
    expect(earthLit([1, 0, 0], [1, 0, 0])).toBeCloseTo(0, 12)
    expect(earthLit([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.5, 12)
  })

  it('finds a full Earth just over Haworth’s skyline in January 2027, near new Moon', () => {
    const eph = new Ephemeris(buf('ephemeris.bin'), JSON.parse(readFileSync(new URL('ephemeris.json', dataDir), 'utf8')) as EphemerisMeta)
    const hz = new HorizonSet(buf('horizons.bin'), JSON.parse(readFileSync(new URL('horizons.json', dataDir), 'utf8')) as HorizonMeta)
    const sites = JSON.parse(readFileSync(new URL('sites.json', dataDir), 'utf8')).sites
    const s = sites.find((x: { id: string }) => x.id === 'haworth')
    const m = bestEarthMoment(eph, siteFrame(s.lat, s.lon, s.height_m + 2), hz.mask(s.mask_index, 0), Date.UTC(2027, 0, 1), Date.UTC(2027, 1, 1), HOUR_MS)!
    expect(m).not.toBeNull()
    // The new Moon of January 2027 (Earth full, seen from the Moon) falls on the 7th–8th
    expect(m.tMs).toBeGreaterThan(Date.UTC(2027, 0, 5))
    expect(m.tMs).toBeLessThan(Date.UTC(2027, 0, 11))
    // A nearly full Earth (the score also wants the Sun up, so the ground is lit)
    expect(m.lit).toBeGreaterThan(0.9)
    expect(m.aboveDeg).toBeGreaterThan(angularRadiusDeg(R_EARTH_KM, 384_400))
    expect(m.aboveDeg).toBeLessThanOrEqual(4)
  })
})
