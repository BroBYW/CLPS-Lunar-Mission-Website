import { describe, expect, it } from 'vitest'
import { compassHeading } from './compass.ts'

describe('phone compass heading', () => {
  it('follows the back camera of an upright phone', () => {
    expect(compassHeading(0, 90, 0)).toBeCloseTo(0, 9)
    // Alpha grows counterclockwise: a phone turned 90° to the left faces west
    expect(compassHeading(90, 90, 0)).toBeCloseTo(270, 9)
    expect(compassHeading(270, 90, 0)).toBeCloseTo(90, 9)
    // Tilting it up or down doesn't change where it faces
    expect(compassHeading(45, 60, 0)).toBeCloseTo(315, 9)
  })

  it('follows the top edge of a phone lying flat', () => {
    expect(compassHeading(0, 0, 0)).toBeCloseTo(0, 9)
    expect(compassHeading(30, 5, -3)).toBeCloseTo(330, 9)
  })
})
