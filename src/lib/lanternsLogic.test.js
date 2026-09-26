import { describe, it, expect } from 'vitest'
import {
  buildDeck, dealRound, normalizeRound, applyAction, actionProblem, clueTargets,
  scoreOf, maxScore, winThreshold, isCritical, isPlayable, maxReachable, ratingFor,
  describeAction, HAND_SIZE, MAX_CLUES, MAX_FUSES,
} from './lanternsLogic'

const card = (id, s, n) => ({ id, s, n })

// A hand-built round: X holds orb 1..5 would be too kind, so give each seat a
// fixed hand and a short deck.
function fixture(overrides = {}) {
  return normalizeRound({
    phase: 'playing', mode: 'full',
    deck: [card(20, 2, 1), card(21, 3, 1), card(22, 4, 1)],
    hands: {
      X: [card(0, 0, 1), card(1, 0, 2), card(2, 1, 1), card(3, 1, 5), card(4, 2, 3)],
      O: [card(10, 0, 1), card(11, 1, 2), card(12, 3, 4), card(13, 0, 3), card(14, 4, 2)],
    },
    knowledge: { X: [], O: [] },
    stacks: [0, 0, 0, 0, 0],
    discards: [],
    clues: MAX_CLUES, fuses: 0, finalTurns: null, turn: 'X',
    ...overrides,
  })
}

describe('deck and deal', () => {
  it('builds 50 cards in full mode and 40 in short mode', () => {
    expect(buildDeck('full')).toHaveLength(50)
    expect(buildDeck('short')).toHaveLength(40)
    const ones = buildDeck('full').filter(c => c.s === 0 && c.n === 1)
    const fives = buildDeck('full').filter(c => c.s === 0 && c.n === 5)
    expect(ones).toHaveLength(3)
    expect(fives).toHaveLength(1)
  })

  it('deals five cards to each seat with blank knowledge', () => {
    let i = 0
    const r = dealRound({ mode: 'full', starter: 'O', rng: () => ((i++ * 0.37) % 1) })
    expect(r.hands.X).toHaveLength(HAND_SIZE)
    expect(r.hands.O).toHaveLength(HAND_SIZE)
    expect(r.deck).toHaveLength(40)
    expect(r.knowledge.X).toHaveLength(HAND_SIZE)
    expect(r.turn).toBe('O')
    expect(r.stacks).toEqual([0, 0, 0, 0, 0])
    const ids = new Set([...r.deck, ...r.hands.X, ...r.hands.O].map(c => c.id))
    expect(ids.size).toBe(50)
  })

  it('short mode has four rows and a max of 20', () => {
    const r = dealRound({ mode: 'short' })
    expect(r.stacks).toHaveLength(4)
    expect(maxScore('short')).toBe(20)
    expect(winThreshold('short')).toBe(16)
    expect(winThreshold('full')).toBe(20)
    expect([...r.deck, ...r.hands.X, ...r.hands.O].every(c => c.s < 4)).toBe(true)
  })
})

describe('normalizeRound', () => {
  it('rebuilds sparse Firebase arrays by key and fills dropped fields', () => {
    const r = normalizeRound({
      phase: 'playing', mode: 'full',
      hands: { X: { 1: card(1, 0, 2), 0: card(0, 0, 1) }, O: [card(5, 1, 1)] },
      knowledge: { X: { 1: { n: 2, notS: 0, notN: 0 } } },
      stacks: { 0: 1 },
      clues: 3, fuses: 1, turn: 'O',
    })
    expect(r.hands.X.map(c => c.id)).toEqual([0, 1])
    expect(r.knowledge.X[0]).toEqual({ notS: 0, notN: 0 })
    expect(r.knowledge.X[1].n).toBe(2)
    expect(r.knowledge.O).toHaveLength(1)
    expect(r.stacks).toEqual([1, 0, 0, 0, 0])
    expect(r.deck).toEqual([])
    expect(r.discards).toEqual([])
    expect(r.finalTurns).toBeNull()
  })
})

describe('clues', () => {
  it('marks every matching card and rules the clue out for the rest', () => {
    const r = fixture()
    expect(clueTargets(r, 'O', { kind: 'suit', value: 0 })).toEqual([0, 3])
    const next = applyAction(r, 'X', { type: 'clue', kind: 'suit', value: 0 })
    expect(next.knowledge.O[0].s).toBe(0)
    expect(next.knowledge.O[3].s).toBe(0)
    expect(next.knowledge.O[1].s).toBeUndefined()
    expect(next.knowledge.O[1].notS & 1).toBe(1)
    expect(next.clues).toBe(MAX_CLUES - 1)
    expect(next.turn).toBe('O')
    expect(next.lastAction).toMatchObject({ type: 'clue', by: 'X', slots: [0, 3] })
  })

  it('number clues mark numbers', () => {
    const next = applyAction(fixture(), 'X', { type: 'clue', kind: 'number', value: 1 })
    expect(next.knowledge.O[0].n).toBe(1)
    expect(next.knowledge.O[2].notN & (1 << 1)).toBeTruthy()
  })

  it('rejects clues that mark nothing, clues out of turn and clues with no tokens', () => {
    const r = fixture()
    expect(actionProblem(r, 'X', { type: 'clue', kind: 'number', value: 5 })).toBe('THAT CLUE MARKS NO CARDS')
    expect(applyAction(r, 'O', { type: 'clue', kind: 'suit', value: 0 })).toBeNull()
    expect(applyAction(fixture({ clues: 0 }), 'X', { type: 'clue', kind: 'suit', value: 0 })).toBeNull()
    expect(actionProblem(r, 'X', { type: 'clue', kind: 'suit', value: 7 })).toBe('BAD CLUE')
  })
})

describe('play and discard', () => {
  it('a playable card lights its row and the seat draws a new card at slot 0', () => {
    const next = applyAction(fixture({ clues: 5 }), 'X', { type: 'play', slot: 0 })
    expect(next.stacks[0]).toBe(1)
    expect(next.hands.X).toHaveLength(HAND_SIZE)
    expect(next.hands.X[0].id).toBe(20)
    expect(next.knowledge.X[0]).toEqual({ notS: 0, notN: 0 })
    expect(next.deck).toHaveLength(2)
    expect(next.fuses).toBe(0)
    expect(next.lastAction).toMatchObject({ type: 'play', ok: true })
  })

  it('a wrong play burns a fuse and discards the card', () => {
    const next = applyAction(fixture(), 'X', { type: 'play', slot: 1 })
    expect(next.stacks[0]).toBe(0)
    expect(next.fuses).toBe(1)
    expect(next.discards.map(c => c.id)).toEqual([1])
    expect(next.lastAction.ok).toBe(false)
  })

  it('knowledge follows the cards when a middle slot leaves the hand', () => {
    const r = applyAction(fixture(), 'X', { type: 'clue', kind: 'number', value: 1 })
    // O holds 1 at slot 0; clue marked it. O discards slot 2 (the 4).
    const next = applyAction({ ...r, clues: 4 }, 'O', { type: 'discard', slot: 2 })
    expect(next.hands.O.map(c => c.id)).toEqual([20, 10, 11, 13, 14])
    expect(next.knowledge.O[1].n).toBe(1)
    expect(next.clues).toBe(5)
  })

  it('cannot discard with all clue tokens in hand', () => {
    expect(actionProblem(fixture(), 'X', { type: 'discard', slot: 0 })).toBe('CLUES ARE FULL — CLUE OR PLAY')
  })

  it('completing a row with a 5 returns a clue token', () => {
    const r = fixture({ stacks: [0, 4, 0, 0, 0], clues: 2 })
    const next = applyAction(r, 'X', { type: 'play', slot: 3 })
    expect(next.stacks[1]).toBe(5)
    expect(next.clues).toBe(3)
  })

  it('rejects a slot outside the hand', () => {
    expect(actionProblem(fixture(), 'X', { type: 'play', slot: 9 })).toBe('PICK A CARD')
  })
})

describe('end of the evening', () => {
  it('the third fuse ends the round as a loss', () => {
    const next = applyAction(fixture({ fuses: MAX_FUSES - 1 }), 'X', { type: 'play', slot: 1 })
    expect(next.phase).toBe('done')
    expect(next.result).toMatchObject({ outcome: 'loss', reason: 'fuses' })
  })

  it('drawing the last card gives each player one more turn', () => {
    let r = fixture({ deck: [card(20, 2, 1)], clues: 4 })
    r = applyAction(r, 'X', { type: 'discard', slot: 4 })
    expect(r.deck).toHaveLength(0)
    expect(r.finalTurns).toBe(2)
    expect(r.phase).toBe('playing')
    r = applyAction(r, 'O', { type: 'clue', kind: 'number', value: 1 })
    expect(r.finalTurns).toBe(1)
    expect(r.phase).toBe('playing')
    r = applyAction(r, 'X', { type: 'play', slot: 0 })
    expect(r.phase).toBe('done')
    expect(r.result.reason).toBe('deck')
    expect(r.result.score).toBe(1)
    expect(r.result.outcome).toBe('loss')
  })

  it('a deck-out at or above the threshold is a win', () => {
    const r = fixture({ deck: [], finalTurns: 1, stacks: [5, 5, 5, 4, 0], clues: 4 })
    const next = applyAction(r, 'X', { type: 'discard', slot: 0 })
    // 19 < 20: still a loss; one more row step crosses the line.
    expect(next.result).toMatchObject({ outcome: 'loss', score: 19 })
    const winning = applyAction(fixture({ deck: [], finalTurns: 1, stacks: [5, 5, 5, 5, 0], clues: 4 }), 'X', { type: 'discard', slot: 0 })
    expect(winning.result).toMatchObject({ outcome: 'win', score: 20 })
  })

  it('a perfect score ends the round at once', () => {
    const r = fixture({ stacks: [5, 4, 5, 5, 5], clues: 3 })
    const next = applyAction(r, 'X', { type: 'play', slot: 3 })
    expect(next.result).toMatchObject({ outcome: 'win', reason: 'perfect', score: 25, max: 25 })
  })

  it('no action is legal once the round is done', () => {
    const done = { ...fixture(), phase: 'done' }
    expect(actionProblem(normalizeRound(done), 'X', { type: 'clue', kind: 'suit', value: 0 })).toBe('NOT PLAYING')
  })
})

describe('helpers', () => {
  it('scores, playability and critical cards', () => {
    const r = fixture({ stacks: [2, 0, 0, 0, 0], discards: [card(30, 1, 2)] })
    expect(scoreOf(r)).toBe(2)
    expect(isPlayable(r, card(0, 0, 3))).toBe(true)
    expect(isPlayable(r, card(0, 0, 4))).toBe(false)
    expect(isCritical(r, card(0, 1, 2))).toBe(true)
    expect(isCritical(r, card(0, 2, 5))).toBe(true)
    expect(isCritical(r, card(0, 2, 3))).toBe(false)
    expect(isCritical(r, card(0, 0, 1))).toBe(false)
  })

  it('maxReachable caps a row once every copy of a needed card is gone', () => {
    const r = fixture({ stacks: [1, 0, 0, 0, 0], discards: [card(30, 0, 2), card(31, 0, 2)] })
    expect(maxReachable(r)).toBe(1 + 20)
  })

  it('ratings climb with the score', () => {
    expect(ratingFor(25, 'full')).toBe('A PERFECT FESTIVAL')
    expect(ratingFor(20, 'full')).toBe('THE SKY IS FULL')
    expect(ratingFor(0, 'full')).toBe('THE NIGHT STAYED DARK')
    expect(ratingFor(16, 'short')).toBe('THE SKY IS FULL')
  })

  it('describes actions for the banner', () => {
    expect(describeAction({ type: 'clue', by: 'X', kind: 'suit', value: 1, slots: [0, 2] }, { X: 'ANA' })).toBe('ANA CLUED ▲ PEAK · 2 CARDS')
    expect(describeAction({ type: 'play', by: 'O', card: card(0, 0, 3), ok: false })).toBe('O MISFIRED ●3 · FUSE BURNS')
  })
})
