import { describe, expect, it } from 'vitest'
import { HOVER_DWELL_MS, PEEK_HOLD_MS, PEEK_LINGER_MS, PEEK_SLOP_PX, canHold, peekOutcome, routeCoach } from './arrowsPeekLogic'

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

describe('routeCoach (the line under the solo board)', () => {
  it('says nothing on a plain board with no tip', () => {
    expect(routeCoach()).toBeNull()
    expect(routeCoach({ routes: false, pick: null, nudge: false, tip: '' })).toBeNull()
  })
  it('a previewed arrow gets a verdict: clear is a win tone, blocked warns the star it costs', () => {
    expect(routeCoach({ routes: true, pick: { free: true } })).toEqual({ tone: 'win', text: 'CLEAR · TAP AGAIN TO SEND' })
    const blocked = routeCoach({ routes: true, pick: { free: false } })
    expect(blocked.tone).toBe('danger')
    expect(blocked.text).toMatch(/COSTS A STAR/)
  })
  it('after a first bump with ROUTES off, points at ROUTES (and beats the twist tip)', () => {
    expect(routeCoach({ nudge: true, tip: 'A TIP' })).toMatchObject({ tone: 'cta', text: expect.stringMatching(/ROUTES/) })
  })
  it('shows the twist tip when there is no nudge, and the ROUTES-on reminder otherwise', () => {
    expect(routeCoach({ tip: 'A TIP' })).toEqual({ tone: 'cta', text: 'A TIP' })
    expect(routeCoach({ routes: true, tip: 'A TIP' })).toMatchObject({ tone: 'dim', text: expect.stringMatching(/^ROUTES ON/) })
  })
  it('the nudge is for ROUTES-off only: turning ROUTES on drops it', () => {
    expect(routeCoach({ routes: true, nudge: true })).toMatchObject({ tone: 'dim' })
  })
  it('a pick is ignored when ROUTES is off', () => {
    expect(routeCoach({ routes: false, pick: { free: true } })).toBeNull()
  })
})
