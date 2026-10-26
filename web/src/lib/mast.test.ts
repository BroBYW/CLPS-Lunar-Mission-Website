import { describe, expect, it } from 'vitest'
import { heightFor } from './mast.ts'

describe('heightFor', () => {
  const heights = [2, 5, 10, 20, 30, 50]
  const sun = [80, 84, 88, 92, 94, 97]

  it('interpolates between computed heights', () => {
    expect(heightFor(heights, sun, 90)).toBeCloseTo(15, 6)
    expect(heightFor(heights, sun, 84)).toBe(5)
  })

  it('returns the lowest height when it already meets the target', () => {
    expect(heightFor(heights, sun, 75)).toBe(2)
  })

  it('returns null when even the tallest mast falls short', () => {
    expect(heightFor(heights, sun, 99)).toBeNull()
  })
})
