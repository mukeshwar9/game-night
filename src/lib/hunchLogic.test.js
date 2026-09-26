import { describe, it, expect } from 'vitest'
import {
  applyPlay, applySteady, clearedLevel, dealLevel, isRunOver, lowestCard, nextLevel,
  normalizeHunchRound, pileTop, startRun,
  HUNCH_GRACE_MS, HUNCH_MAX_LIVES, HUNCH_REWARDS, HUNCH_START_LIVES, HUNCH_START_STEADIES,
  HUNCH_TARGET_LEVEL,
} from './hunchLogic'

// A round in play with the given hands (everything else from startRun).
const withHands = (X, O, extra = {}) => ({
  ...startRun({ seed: 't' }),
  hands: { X, O },
  ...extra,
})

describe('dealLevel', () => {
  it('deals n distinct sorted cards per seat from 1..100', () => {
    for (let level = 1; level <= HUNCH_TARGET_LEVEL; level++) {
      const { X, O } = dealLevel(level, 'seed-a')
      expect(X).toHaveLength(level)
      expect(O).toHaveLength(level)
      const all = [...X, ...O]
      expect(new Set(all).size).toBe(2 * level)
      all.forEach(c => expect(c >= 1 && c <= 100).toBe(true))
      expect(X).toEqual([...X].sort((a, b) => a - b))
    }
  })

  it('is deterministic per seed and level', () => {
    expect(dealLevel(5, 'abc')).toEqual(dealLevel(5, 'abc'))
    expect(dealLevel(5, 'abc')).not.toEqual(dealLevel(5, 'abd'))
  })
})

describe('startRun / normalizeHunchRound', () => {
  it('starts at level 1 with the starting lives and steadies', () => {
    const r = startRun({ seed: 's', best: 4 })
    expect(r.phase).toBe('play')
    expect(r.level).toBe(1)
    expect(r.lives).toBe(HUNCH_START_LIVES)
    expect(r.steadies).toBe(HUNCH_START_STEADIES)
    expect(r.best).toBe(4)
    expect(r.hands.X).toHaveLength(1)
  })

  it('normalizes Firebase shapes: absent arrays and numeric-keyed objects', () => {
    const r = normalizeHunchRound({
      phase: 'play', level: 3, lives: 2, steadies: 0, seed: 'x',
      hands: { X: { 0: 40, 2: 12 } },
      pile: { 1: { card: 5, by: 'O', at: 1 } },
    })
    expect(r.hands).toEqual({ X: [12, 40], O: [] })
    expect(r.pile).toEqual([{ card: 5, by: 'O', at: 1 }])
    expect(r.discards).toEqual([])
    expect(r.steady).toEqual({ X: false, O: false })
    expect(normalizeHunchRound(null)).toBeNull()
  })
})

describe('applyPlay', () => {
  it('plays the lowest card onto the pile', () => {
    const next = normalizeHunchRound(applyPlay(withHands([10, 50], [30]), { player: 'X', card: 10, at: 100 }))
    expect(next.hands).toEqual({ X: [50], O: [30] })
    expect(pileTop(next)).toBe(10)
    expect(next.lives).toBe(HUNCH_START_LIVES)
    expect(next.last.kind).toBe('play')
  })

  it('costs a life and discards every lower card on a mistake', () => {
    const next = normalizeHunchRound(applyPlay(withHands([40, 90], [10, 20, 60]), { player: 'X', card: 40, at: 100 }))
    expect(next.lives).toBe(HUNCH_START_LIVES - 1)
    expect(next.hands).toEqual({ X: [90], O: [60] })
    expect(next.discards.map(d => d.card)).toEqual([10, 20])
    expect(next.last).toMatchObject({ kind: 'mistake', by: 'X', card: 40 })
    expect(next.last.lost).toEqual({ X: [], O: [10, 20] })
  })

  it('rejects a stale tap whose card is no longer the lowest', () => {
    expect(applyPlay(withHands([10, 50], [30]), { player: 'X', card: 50, at: 1 })).toBeNull()
    expect(applyPlay(withHands([], [30]), { player: 'X', card: 10, at: 1 })).toBeNull()
    expect(applyPlay({ ...withHands([10], [30]), phase: 'clear' }, { player: 'X', card: 10, at: 1 })).toBeNull()
  })

  it('clears the level when both hands empty and grants the reward', () => {
    const level = Number(Object.keys(HUNCH_REWARDS).find(k => HUNCH_REWARDS[k] === 'life'))
    const before = withHands([], [70], { level })
    const next = normalizeHunchRound(applyPlay(before, { player: 'O', card: 70, at: 1 }))
    expect(next.phase).toBe('clear')
    expect(next.reward).toBe('life')
    expect(next.lives).toBe(HUNCH_START_LIVES + 1)
    expect(next.best).toBe(level)
    expect(clearedLevel(before, next)).toBe(true)
  })

  it('caps lives at the maximum', () => {
    const level = Number(Object.keys(HUNCH_REWARDS).find(k => HUNCH_REWARDS[k] === 'life'))
    const next = normalizeHunchRound(applyPlay(withHands([], [70], { level, lives: HUNCH_MAX_LIVES }), { player: 'O', card: 70, at: 1 }))
    expect(next.lives).toBe(HUNCH_MAX_LIVES)
    expect(next.reward).toBeNull()
  })

  it('wins the run on the target level', () => {
    const before = withHands([99], [], { level: HUNCH_TARGET_LEVEL })
    const next = normalizeHunchRound(applyPlay(before, { player: 'X', card: 99, at: 1 }))
    expect(next.phase).toBe('won')
    expect(isRunOver(next)).toBe(true)
    expect(clearedLevel(before, next)).toBe(true)
  })

  it('loses the run when the last life goes', () => {
    const next = normalizeHunchRound(applyPlay(withHands([50], [10, 80], { lives: 1 }), { player: 'X', card: 50, at: 1 }))
    expect(next.phase).toBe('lost')
    expect(next.lives).toBe(0)
    expect(isRunOver(next)).toBe(true)
  })

  it('a mistake that empties both hands still clears the level', () => {
    const next = normalizeHunchRound(applyPlay(withHands([50], [10], { lives: 2 }), { player: 'X', card: 50, at: 1 }))
    expect(next.lives).toBe(1)
    expect(next.phase).toBe('clear')
  })
})

describe('grace window', () => {
  // X plays 50 while O still holds 48: a mistake. O's tap for 48 arrives right after.
  const afterMistake = (at) => applyPlay(withHands([50, 90], [48, 70]), { player: 'X', card: 50, at })

  it('forgives crossed taps inside the window', () => {
    const next = normalizeHunchRound(applyPlay(afterMistake(1000), { player: 'O', card: 48, at: 1000 + HUNCH_GRACE_MS }))
    expect(next.lives).toBe(HUNCH_START_LIVES)
    expect(next.pile.map(p => p.card)).toEqual([48, 50])
    expect(next.discards).toEqual([])
    expect(next.last.kind).toBe('forgive')
    expect(next.hands).toEqual({ X: [90], O: [70] })
  })

  it('keeps the mistake outside the window', () => {
    expect(applyPlay(afterMistake(1000), { player: 'O', card: 48, at: 1001 + HUNCH_GRACE_MS })).toBeNull()
  })

  it('does not forgive when more than the tapped card was lost', () => {
    const mistake = applyPlay(withHands([50], [47, 48, 70]), { player: 'X', card: 50, at: 1000 })
    expect(applyPlay(mistake, { player: 'O', card: 47, at: 1100 })).toBeNull()
  })

  it('does not let the player who made the mistake forgive it', () => {
    const mistake = applyPlay(withHands([50, 90], [48]), { player: 'X', card: 50, at: 1000 })
    expect(applyPlay(mistake, { player: 'X', card: 48, at: 1100 })).toBeNull()
  })
})

describe('applySteady', () => {
  it('waits for both players, then discards each lowest and spends a steady', () => {
    const one = applySteady(withHands([10, 60], [20, 70]), { player: 'X', on: true, at: 1 })
    expect(normalizeHunchRound(one).steady).toEqual({ X: true, O: false })
    const both = normalizeHunchRound(applySteady(one, { player: 'O', on: true, at: 2 }))
    expect(both.hands).toEqual({ X: [60], O: [70] })
    expect(both.steadies).toBe(HUNCH_START_STEADIES - 1)
    expect(both.steady).toEqual({ X: false, O: false })
    expect(both.discards.map(d => d.why)).toEqual(['steady', 'steady'])
    expect(both.lives).toBe(HUNCH_START_LIVES)
  })

  it('can be released, and needs a steady to hold', () => {
    const held = applySteady(withHands([10], [20]), { player: 'X', on: true, at: 1 })
    expect(normalizeHunchRound(applySteady(held, { player: 'X', on: false, at: 2 })).steady.X).toBe(false)
    expect(applySteady(withHands([10], [20], { steadies: 0 }), { player: 'X', on: true, at: 1 })).toBeNull()
    expect(applySteady(withHands([10], [20]), { player: 'X', on: false, at: 1 })).toBeNull()
  })

  it('can clear a level', () => {
    const one = applySteady(withHands([10], [20]), { player: 'O', on: true, at: 1 })
    expect(normalizeHunchRound(applySteady(one, { player: 'X', on: true, at: 2 })).phase).toBe('clear')
  })
})

describe('nextLevel', () => {
  it('deals the next level from a cleared one', () => {
    const cleared = applyPlay(withHands([], [70]), { player: 'O', card: 70, at: 1 })
    const next = normalizeHunchRound(nextLevel(cleared))
    expect(next.phase).toBe('play')
    expect(next.level).toBe(2)
    expect(next.hands.X).toHaveLength(2)
    expect(next.pile).toEqual([])
  })

  it('refuses outside the clear phase', () => {
    expect(nextLevel(withHands([1], [2]))).toBeNull()
  })
})

describe('lowestCard', () => {
  it('returns the smallest card or null', () => {
    expect(lowestCard([30, 4, 9])).toBe(4)
    expect(lowestCard([])).toBeNull()
  })
})
