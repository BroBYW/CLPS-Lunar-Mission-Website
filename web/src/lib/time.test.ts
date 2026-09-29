import { describe, expect, it } from 'vitest'
import { formatUtc, formatUtcDate, parseUtc } from './time.ts'

describe('time', () => {
  it('formats UTC timestamps', () => {
    expect(formatUtc(Date.UTC(2027, 2, 14, 6, 0))).toBe('2027-03-14 06:00 UTC')
    expect(formatUtcDate(Date.UTC(2030, 11, 31, 23, 59))).toBe('2030-12-31')
  })

  it('parses dates as midnight UTC', () => {
    expect(parseUtc('2026-11-01')).toBe(Date.UTC(2026, 10, 1))
    expect(parseUtc('2026-11-01T06:30:00Z')).toBe(Date.UTC(2026, 10, 1, 6, 30))
    expect(parseUtc('not a date')).toBeNaN()
  })
})
