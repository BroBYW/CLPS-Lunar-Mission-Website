import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HorizonSet, horizonAt, type HorizonMeta } from './horizon.ts'
import { earthVisible, sunFraction } from './visibility.ts'
import fixtures from './__fixtures__/fraction.json'

const dataDir = new URL('../../public/data/', import.meta.url)

function loadHorizons(): HorizonSet {
  const meta = JSON.parse(readFileSync(new URL('horizons.json', dataDir), 'utf8')) as HorizonMeta
  const bin = readFileSync(new URL('horizons.bin', dataDir))
  return new HorizonSet(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer, meta)
}

describe('sun fraction vs Python (same inputs, same masks)', () => {
  const hs = loadHorizons()

  it('matches every fixture, including partial and eclipse cases', () => {
    let maxErr = 0
    let partial = 0
    for (const c of fixtures.cases) {
      const mask = hs.mask(c.mask_index, c.height_index)
      const f = sunFraction(mask, c.sun_az, c.sun_el, c.sun_r, { az: c.earth_az, el: c.earth_el, radius: c.earth_r })
      maxErr = Math.max(maxErr, Math.abs(f - c.f_sun))
      if (c.f_sun > 0 && c.f_sun < 1) partial++
      expect(earthVisible(mask, c.earth_az, c.earth_el)).toBe(c.earth_vis)
    }
    console.info(`${fixtures.cases.length} cases (${partial} partial): max |Δfraction| ${maxErr.toExponential(2)}`)
    expect(partial).toBeGreaterThan(40)
    expect(maxErr).toBeLessThan(1e-6)
  })

  it('reports zero sunlight during the 3 Mar 2026 total lunar eclipse at Malapert', () => {
    const c = fixtures.cases.find((x) => 'note' in x)!
    const mask = hs.mask(c.mask_index, c.height_index)
    expect(c.sun_el).toBeGreaterThan(horizonAt(mask, c.sun_az) + c.sun_r) // clear of terrain...
    expect(sunFraction(mask, c.sun_az, c.sun_el, c.sun_r, { az: c.earth_az, el: c.earth_el, radius: c.earth_r })).toBe(0) // ...but behind Earth
    expect(sunFraction(mask, c.sun_az, c.sun_el, c.sun_r)).toBe(1)
  })
})
