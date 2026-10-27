import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Ephemeris, siteFrame, type EphemerisMeta } from './astro.ts'
import { findEclipses, siteEclipse } from './eclipses.ts'
import { HorizonSet, type HorizonMeta } from './horizon.ts'

const dataDir = new URL('../../public/data/', import.meta.url)
const buf = (name: string) => {
  const b = readFileSync(new URL(name, dataDir))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.length)
}
const json = (name: string) => JSON.parse(readFileSync(new URL(name, dataDir), 'utf8'))
const eph = new Ephemeris(buf('ephemeris.bin'), json('ephemeris.json') as EphemerisMeta)
const hz = new HorizonSet(buf('horizons.bin'), json('horizons.json') as HorizonMeta)
const sites: { id: string; lat: number; lon: number; height_m: number; mask_index: number }[] = json('sites.json').sites
const utc = (s: string) => Date.parse(`${s}Z`)

describe('eclipses seen from the Moon', () => {
  const all = findEclipses(eph, Date.UTC(2024, 0, 1), Date.UTC(2031, 0, 1))

  it('finds the total lunar eclipse of 3 March 2026 at NASA’s time of greatest eclipse', () => {
    const e = all.find((x) => x.startMs > Date.UTC(2026, 2, 3) && x.startMs < Date.UTC(2026, 2, 4))!
    expect(e).toBeDefined()
    expect(e.total).toBe(true)
    // NASA: greatest eclipse 11:34 UT (VALIDATION.md §5)
    expect(Math.abs(e.peakMs - utc('2026-03-03T11:34')) / 60_000).toBeLessThan(10)
    // Each of the 2024–2030 eclipses appears once
    expect(all.length).toBeGreaterThan(8)
    expect(all.every((x, i) => i === 0 || x.startMs > all[i - 1].endMs)).toBe(true)
  })

  it('times the eclipse at Malapert Massif as the SPICE pipeline does, to a couple of minutes', () => {
    const e = all.find((x) => x.startMs > Date.UTC(2026, 2, 3) && x.startMs < Date.UTC(2026, 2, 4))!
    const s = sites.find((x) => x.id === 'malapert-massif')!
    const r = siteEclipse(eph, siteFrame(s.lat, s.lon, s.height_m + 2), hz.mask(s.mask_index, 0), e)
    expect(r.visible).toBe(true)
    // pipeline/scripts/validate_eclipse.py (SPICE, minute by minute): 09:27, 10:55, 12:06, 13:34
    const near = (t: number, s2: string) => expect(Math.abs(t - utc(`2026-03-03T${s2}`)) / 60_000).toBeLessThanOrEqual(2)
    near(r.dimMs, '09:27')
    near(r.hiddenMs, '10:55')
    near(r.backMs, '12:06')
    near(r.undimMs, '13:34')
    expect(r.minFraction).toBe(0)
  })
})
