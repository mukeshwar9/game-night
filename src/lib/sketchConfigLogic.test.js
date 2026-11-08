import { describe, it, expect } from 'vitest'
import {
  SKETCH_CONFIG_KEY, SKETCH_CONFIG_VERSION, DRAW_CHOICES, DRAW_TIME_CHOICES, HINT_CHOICES,
  DEFAULT_DRAW_S, DEFAULT_HINTS, ESTIMATE_OVERHEAD_S, DRAWS_BLURB, HINTS_BLURB,
  normalizeSketchConfig, patchSketchConfig, resolveSketchSetup, roundSetupSnapshot,
  sketchSetupSummary, estimateMinutes, estimateLines,
} from './sketchConfigLogic'
import { DRAW_MS, MAX_HINTS, cyclesFor, roundCycles, roundDrawBase, roundHintCount } from './sketchLogic'
import { getGameConfig } from './games'

describe('sketch match setup: menus and defaults', () => {
  it('offers the designed menus', () => {
    expect(SKETCH_CONFIG_KEY).toBe('sketchConfig')
    expect(SKETCH_CONFIG_VERSION).toBe(1)
    expect(DRAW_CHOICES).toEqual([1, 2, 3])
    expect(DRAW_TIME_CHOICES).toEqual([45, 60, 75, 90, 120])
    expect(HINT_CHOICES).toEqual([0, 1, 2])
  })

  it('defaults to today\'s match: 75 s, two hints, draws by player count', () => {
    expect(DEFAULT_DRAW_S * 1000).toBe(DRAW_MS)
    expect(DEFAULT_HINTS).toBe(MAX_HINTS)
    expect(resolveSketchSetup(undefined, 4)).toEqual({ draws: 2, drawS: 75, hints: 2 })
    expect(resolveSketchSetup(null, 2)).toEqual({ draws: 3, drawS: 75, hints: 2 })
    expect(resolveSketchSetup({ v: 1 }, 8).draws).toBe(cyclesFor(8))
  })

  it('has a blurb for every draws and hints choice', () => {
    for (const n of DRAW_CHOICES) expect(DRAWS_BLURB[n]).toMatch(/^EVERYONE DRAWS /)
    for (const n of HINT_CHOICES) expect(typeof HINTS_BLURB[n]).toBe('string')
  })
})

describe('normalizeSketchConfig', () => {
  it('keeps values on the menu and drops everything else to null', () => {
    expect(normalizeSketchConfig({ v: 1, draws: 3, drawS: 45, hints: 0 })).toEqual({ draws: 3, drawS: 45, hints: 0 })
    expect(normalizeSketchConfig({ draws: 4, drawS: 50, hints: 3 })).toEqual({ draws: null, drawS: null, hints: null })
    expect(normalizeSketchConfig({ draws: '2', drawS: '75', hints: '1' })).toEqual({ draws: null, drawS: null, hints: null })
    expect(normalizeSketchConfig('junk')).toEqual({ draws: null, drawS: null, hints: null })
    expect(normalizeSketchConfig(undefined)).toEqual({ draws: null, drawS: null, hints: null })
  })

  it('an off-menu stored value resolves to the default, never to a broken match', () => {
    expect(resolveSketchSetup({ draws: 9, drawS: 5, hints: -1 }, 3)).toEqual({ draws: 2, drawS: 75, hints: 2 })
  })
})

describe('patchSketchConfig', () => {
  it('merges one tap over the room\'s setup and keeps unpicked fields out', () => {
    expect(patchSketchConfig(null, { drawS: 60 })).toEqual({ v: 1, drawS: 60 })
    expect(patchSketchConfig({ v: 1, drawS: 60 }, { hints: 0 })).toEqual({ v: 1, drawS: 60, hints: 0 })
    expect(patchSketchConfig({ v: 1, drawS: 60, hints: 0 }, { draws: 1 })).toEqual({ v: 1, draws: 1, drawS: 60, hints: 0 })
    expect(patchSketchConfig({ v: 1, draws: 1 }, { draws: 3 })).toEqual({ v: 1, draws: 3 })
  })

  it('ignores an off-menu tap and repairs an off-menu stored value', () => {
    expect(patchSketchConfig({ v: 1, drawS: 60 }, { drawS: 61 })).toEqual({ v: 1, drawS: 60 })
    expect(patchSketchConfig({ v: 1, drawS: 61, draws: 2 }, { hints: 1 })).toEqual({ v: 1, draws: 2, hints: 1 })
    expect(patchSketchConfig({ v: 7, extra: 'x' }, {})).toEqual({ v: 1 })
  })

  it('never writes null or undefined (Firebase would delete or throw)', () => {
    const out = patchSketchConfig({ v: 1 }, { draws: undefined, hints: null })
    expect(Object.values(out).every(v => v != null)).toBe(true)
  })
})

describe('roundSetupSnapshot', () => {
  it('turns the setup into round fields the round helpers read back', () => {
    const snap = roundSetupSnapshot({ v: 1, draws: 1, drawS: 120, hints: 1 }, 5)
    expect(snap).toEqual({ cycles: 1, drawBase: 120000, hintCount: 1 })
    const round = { order: ['a', 'b', 'c', 'd', 'e'], ...snap }
    expect(roundCycles(round)).toBe(1)
    expect(roundDrawBase(round)).toBe(120000)
    expect(roundHintCount(round)).toBe(1)
  })

  it('with no setup stores today\'s rule', () => {
    expect(roundSetupSnapshot(undefined, 2)).toEqual({ cycles: 3, drawBase: DRAW_MS, hintCount: 2 })
    expect(roundSetupSnapshot(undefined, 6)).toEqual({ cycles: 2, drawBase: DRAW_MS, hintCount: 2 })
  })

  it('every menu value is one the round helpers accept as is', () => {
    for (const draws of DRAW_CHOICES) {
      for (const drawS of DRAW_TIME_CHOICES) {
        for (const hints of HINT_CHOICES) {
          const r = { order: ['a', 'b', 'c'], ...roundSetupSnapshot({ draws, drawS, hints }, 3) }
          expect([roundCycles(r), roundDrawBase(r), roundHintCount(r)]).toEqual([draws, drawS * 1000, hints])
        }
      }
    }
  })
})

describe('registry startRound snapshots the setup', () => {
  const players = { a: { name: 'A', joinedAt: 1 }, b: { name: 'B', joinedAt: 2 }, c: { name: 'C', joinedAt: 3 } }

  it('copies the room\'s sketchConfig into the first round', () => {
    const { round } = getGameConfig('sketch').startRound(players, { sketchConfig: { v: 1, draws: 3, drawS: 45, hints: 0 } })
    expect(round).toMatchObject({ cycle: 1, cycles: 3, drawBase: 45000, hintCount: 0 })
  })

  it('a room without setup gets today\'s defaults by its drawing order', () => {
    const three = getGameConfig('sketch').startRound(players, {}).round
    expect(three).toMatchObject({ cycles: 2, drawBase: DRAW_MS, hintCount: 2 })
    const two = getGameConfig('sketch').startRound({ a: players.a, b: players.b, c: { ...players.c, online: false } }, {}).round
    expect(two.order).toHaveLength(2)
    expect(two.cycles).toBe(3)
  })
})

describe('summary line and estimate', () => {
  it('reads like the design', () => {
    expect(sketchSetupSummary({ draws: 2, drawS: 75, hints: 2 })).toBe('2 DRAWS · 75 S · 2 HINTS')
    expect(sketchSetupSummary({ draws: 1, drawS: 45, hints: 1 })).toBe('1 DRAW · 45 S · 1 HINT')
    expect(sketchSetupSummary({ draws: 3, drawS: 120, hints: 0 })).toBe('3 DRAWS · 120 S · NO HINTS')
  })

  it('estimates players × draws × (drawing + 15 s), in whole minutes', () => {
    expect(ESTIMATE_OVERHEAD_S).toBe(15)
    expect(estimateMinutes({ players: 4, draws: 2, drawS: 75 })).toBe(12)
    expect(estimateMinutes({ players: 8, draws: 2, drawS: 75 })).toBe(24)
    expect(estimateMinutes({ players: 2, draws: 1, drawS: 45 })).toBe(2)
    expect(estimateMinutes({ players: 4, draws: 2, drawS: 75, timerScale: 2 })).toBe(22) // 8 × 165 s
    expect(estimateMinutes({ players: 0, draws: 1, drawS: 45 })).toBe(1)
    expect(estimateMinutes({ players: 4, draws: 2, drawS: 75, timerScale: 0 })).toBeNull()
  })

  it('footer lines for normal, relaxed and timers-off rooms', () => {
    expect(estimateLines({ players: 4, draws: 2, drawS: 75 })).toEqual(['ABOUT 12 MIN WITH 4 PLAYERS'])
    expect(estimateLines({ players: 1, draws: 1, drawS: 45 })).toEqual(['ABOUT 1 MIN WITH 1 PLAYER'])
    expect(estimateLines({ players: 4, draws: 2, drawS: 75, timerScale: 2 }))
      .toEqual(['ABOUT 22 MIN WITH 4 PLAYERS', '75 S × 2 = 150 S A DRAWING'])
    expect(estimateLines({ players: 4, draws: 2, drawS: 75, timerScale: 0 }))
      .toEqual(['TIMERS ARE OFF — THE HOST ENDS EACH DRAWING'])
  })
})
