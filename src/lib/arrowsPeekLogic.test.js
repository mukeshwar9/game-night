import { describe, expect, it } from 'vitest'
import { HOVER_DWELL_MS, PEEK_HOLD_MS, PEEK_LINGER_MS, PEEK_SLOP_PX, canHold, peekOutcome } from './arrowsPeekLogic'

const base = { heldMs: 100, movedPx: 0, multi: false, pointerType: 'touch' }

describe('peekOutcome', () => {
  it('a quick still press is a tap', () => {
    expect(peekOutcome(base)).toBe('tap')
  })
  it('flips to peek exactly at the hold threshold', () => {
    expect(peekOutcome({ ...base, heldMs: PEEK_HOLD_MS - 1 })).toBe('tap')
    expect(peekOutcome({ ...base, heldMs: PEEK_HOLD_MS })).toBe('peek')
    expect(peekOutcome({ ...base, heldMs: 5000 })).toBe('peek')
  })
  it('a pen holds like a finger', () => {
    expect(peekOutcome({ ...base, heldMs: PEEK_HOLD_MS, pointerType: 'pen' })).toBe('peek')
  })
  it('a moved finger cancels, tap or hold', () => {
    expect(peekOutcome({ ...base, movedPx: PEEK_SLOP_PX })).toBe('cancel')
    expect(peekOutcome({ ...base, heldMs: 900, movedPx: PEEK_SLOP_PX + 20 })).toBe('cancel')
    expect(peekOutcome({ ...base, heldMs: 900, movedPx: PEEK_SLOP_PX - 1 })).toBe('peek')
  })
  it('a second finger cancels', () => {
    expect(peekOutcome({ ...base, multi: true })).toBe('cancel')
    expect(peekOutcome({ ...base, heldMs: 900, multi: true })).toBe('cancel')
  })
  it('a mouse never peeks by holding', () => {
    expect(peekOutcome({ ...base, heldMs: 2000, pointerType: 'mouse' })).toBe('tap')
    expect(peekOutcome({ ...base, pointerType: 'mouse', movedPx: 30 })).toBe('cancel')
  })
})

describe('constants', () => {
  it('hold is about 380 ms, hover dwell is short, the route lingers', () => {
    expect(PEEK_HOLD_MS).toBe(380)
    expect(HOVER_DWELL_MS).toBeLessThan(PEEK_HOLD_MS)
    expect(PEEK_LINGER_MS).toBeGreaterThan(0)
  })
  it('only touch and pen hold', () => {
    expect(canHold('touch')).toBe(true)
    expect(canHold('pen')).toBe(true)
    expect(canHold('mouse')).toBe(false)
  })
})
