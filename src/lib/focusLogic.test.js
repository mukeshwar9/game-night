import { describe, it, expect } from 'vitest'
import { canFocus, fitScale, unionBox, MAX_FIT_SCALE } from './focusLogic'
import { GAME_TYPES } from './games'

describe('canFocus', () => {
  it('needs the registry opt-in', () => {
    expect(canFocus({ focus: true })).toBe(true)
    expect(canFocus({})).toBe(false)
    expect(canFocus(null)).toBe(false)
  })
  it('stays off for custom pages and the waiting room', () => {
    expect(canFocus({ focus: true }, { custom: true })).toBe(false)
    expect(canFocus({ focus: true }, { status: 'waiting' })).toBe(false)
    expect(canFocus({ focus: true }, { status: 'finished' })).toBe(true)
  })
})

describe('registry focus opt-ins', () => {
  const focused = GAME_TYPES.filter(g => g.focus)
  it('only standard board games opt in (focus wraps the BoardComponent path)', () => {
    expect(focused.length).toBeGreaterThan(25)
    for (const g of focused) {
      expect(g.BoardComponent, g.type).toBeTruthy()
      expect(g.Page, g.type).toBeFalsy()
      expect(g.nPlayer, g.type).toBeFalsy()
    }
  })
  it('leaves the real-time arenas and keyboard games out for now', () => {
    for (const type of ['pong', 'snake', 'tron', 'airhockey', 'wordduel', 'hangwoman', 'arrows', 'minigolf']) {
      expect(GAME_TYPES.find(g => g.type === type)?.focus, type).toBeFalsy()
    }
  })
})

describe('fitScale', () => {
  it('fits by the tighter side', () => {
    expect(fitScale({ w: 374, h: 700 }, { w: 300, h: 300 })).toBeCloseTo(374 / 300)
    expect(fitScale({ w: 374, h: 400 }, { w: 300, h: 500 })).toBeCloseTo(0.8)
  })
  it('caps how far a small board grows', () => {
    expect(fitScale({ w: 1000, h: 1000 }, { w: 100, h: 50 })).toBe(MAX_FIT_SCALE)
  })
  it('is 1 until both boxes are measured', () => {
    expect(fitScale({ w: 0, h: 700 }, { w: 300, h: 300 })).toBe(1)
    expect(fitScale({ w: 374, h: 700 }, { w: 0, h: 0 })).toBe(1)
  })
})

describe('unionBox', () => {
  it('spans every child', () => {
    expect(unionBox([
      { left: 20, top: 0, width: 300, height: 300 },
      { left: 0, top: 310, width: 340, height: 20 },
    ])).toEqual({ left: 0, top: 0, width: 340, height: 330 })
  })
  it('ignores empty children', () => {
    expect(unionBox([{ left: 500, top: 500, width: 0, height: 0 }, { left: 10, top: 10, width: 5, height: 5 }]))
      .toEqual({ left: 10, top: 10, width: 5, height: 5 })
    expect(unionBox([])).toEqual({ left: 0, top: 0, width: 0, height: 0 })
  })
})
