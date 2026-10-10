import { describe, expect, it } from 'vitest'
import { leanDeg, steerFromDelta, newTilt, tiltUpdate, tiltRecenter, TILT_DEAD, TILT_FULL } from './tiltLogic'

describe('lean', () => {
  it('is zero for a phone held upright in portrait, whatever gamma says (gimbal)', () => {
    expect(leanDeg(90, 0, 0)).toBeCloseTo(0, 5)
    expect(leanDeg(90, 70, 0)).toBeCloseTo(0, 5)
  })
  it('reads the steering-wheel turn of an upright phone: 30 degrees clockwise is +30', () => {
    // A 30 degree clockwise wheel turn from upright is beta 60, gamma 90 in the W3C rotation order.
    expect(leanDeg(60, 90, 0)).toBeCloseTo(30, 4)
    expect(leanDeg(60, -90, 0)).toBeCloseTo(-30, 4)
  })
  it('reads a roll of a phone held flat or laid back: right edge down is positive', () => {
    expect(leanDeg(0, 20, 0)).toBeCloseTo(20, 4)
    expect(leanDeg(0, -12, 0)).toBeCloseTo(-12, 4)
    expect(leanDeg(40, 20, 0)).toBeGreaterThan(10)
  })
  it('follows the screen when the phone is turned to landscape', () => {
    // Landscape held upright (device x up): straight ahead, then a wheel turn of 15 degrees.
    expect(leanDeg(0, -90, 90)).toBeCloseTo(0, 4)
    expect(leanDeg(15, -90, 90)).toBeCloseTo(15, 4)
    expect(leanDeg(-15, 90, 270)).toBeCloseTo(15, 4)
    expect(leanDeg(0, 20, 180)).toBeCloseTo(-20, 4)
  })
  it('has no reading without sensor data', () => {
    expect(leanDeg(null, 3)).toBe(null)
    expect(leanDeg(NaN, 3)).toBe(null)
    expect(leanDeg(10, undefined)).toBe(null)
  })
})

describe('steer', () => {
  it('has a dead zone, a linear ramp and full lock', () => {
    expect(steerFromDelta(0)).toBe(0)
    expect(steerFromDelta(TILT_DEAD)).toBe(0)
    expect(steerFromDelta(-TILT_DEAD + 0.1)).toBe(0)
    expect(steerFromDelta((TILT_DEAD + TILT_FULL) / 2)).toBeCloseTo(0.5, 5)
    expect(steerFromDelta(-(TILT_DEAD + TILT_FULL) / 2)).toBeCloseTo(-0.5, 5)
    expect(steerFromDelta(TILT_FULL)).toBe(1)
    expect(steerFromDelta(80)).toBe(1)
    expect(steerFromDelta(-80)).toBe(-1)
  })
})

describe('calibration and smoothing', () => {
  const settle = (t, secs, calibrating) => { let v = 0; for (let i = 0; i < secs * 60; i++) v = tiltUpdate(t, 1 / 60, calibrating); return v }
  it('makes the pose held during the countdown straight ahead', () => {
    const t = newTilt()
    t.raw = 14 // the player holds the phone 14 degrees off a level pose
    expect(settle(t, 3, true)).toBe(0)
    expect(t.neutral).toBeCloseTo(14, 1)
    expect(settle(t, 1, false)).toBe(0)
    t.raw = 14 + 20
    expect(settle(t, 1, false)).toBeCloseTo(1, 2)
    t.raw = 14 - 10.25
    expect(settle(t, 1, false)).toBeCloseTo(-(10.25 - TILT_DEAD) / (TILT_FULL - TILT_DEAD), 2)
  })
  it('smooths a sudden tilt instead of jumping', () => {
    const t = newTilt()
    t.raw = 0
    settle(t, 1, true)
    t.raw = 30
    const first = tiltUpdate(t, 1 / 60, false)
    expect(first).toBeGreaterThan(0)
    expect(first).toBeLessThan(0.5)
    expect(settle(t, 0.5, false)).toBeGreaterThan(0.99)
  })
  it('steers nothing without a reading, and recentres on demand', () => {
    const t = newTilt()
    expect(tiltUpdate(t, 1 / 60, false)).toBe(0)
    t.raw = 25
    tiltUpdate(t, 1 / 60, true)
    t.raw = 40
    tiltRecenter(t)
    expect(settle(t, 0.5, false)).toBe(0)
    expect(t.neutral).toBe(40)
  })
})
