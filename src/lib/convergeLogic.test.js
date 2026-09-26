import { describe, it, expect } from 'vitest'
import {
  cleanWord, convergedNow, lockWord, maxStars, nextChain, normalizeConvergeRound, sameWord,
  startMatch, starsFor, unlockWord, wordProblem,
  CONVERGE_CHAINS, CONVERGE_MAX_STEPS,
} from './convergeLogic'

const lockBoth = (round, x, o) => lockWord(lockWord(round, { player: 'X', word: x }), { player: 'O', word: o })

describe('words', () => {
  it('cleans to upper-case letters', () => {
    expect(cleanWord(' pizza-pie! ')).toBe('PIZZAPIE')
  })

  it('treats plurals and case as the same word', () => {
    expect(sameWord('Wheels', 'WHEEL')).toBe(true)
    expect(sameWord('cheese', 'chess')).toBe(false)
    expect(sameWord('', '')).toBe(false)
  })

  it('rejects short, banned and repeated words', () => {
    const round = normalizeConvergeRound({ ...startMatch({ seed: 's' }), chain: [{ X: 'PIZZA', O: 'MOON' }] })
    expect(wordProblem('a', round)).toBe('TYPE A WORD')
    expect(wordProblem('pizzas', round)).toBe('ALREADY SAID THIS CHAIN')
    expect(wordProblem('cheese', round)).toBeNull()
    expect(wordProblem('fuck', round)).toBe('PICK ANOTHER WORD')
  })
})

describe('starsFor', () => {
  it('scores fewer steps higher', () => {
    expect([1, 2, 3, 4, 5, 8].map(starsFor)).toEqual([3, 3, 2, 2, 1, 1])
    expect(maxStars()).toBe(CONVERGE_CHAINS * 3)
  })
})

describe('lockWord', () => {
  it('holds the first lock until the partner locks', () => {
    const r = normalizeConvergeRound(lockWord(startMatch({ seed: 's' }), { player: 'X', word: 'pizza' }))
    expect(r.pending).toEqual({ X: 'PIZZA', O: null })
    expect(r.chain).toEqual([])
  })

  it('reveals both words and keeps going without a match', () => {
    const r = normalizeConvergeRound(lockBoth(startMatch({ seed: 's' }), 'pizza', 'moon'))
    expect(r.chain).toEqual([{ X: 'PIZZA', O: 'MOON' }])
    expect(r.pending).toEqual({ X: null, O: null })
    expect(r.phase).toBe('write')
    expect(r.last.kind).toBe('reveal')
  })

  it('converges on a match and scores stars', () => {
    const before = normalizeConvergeRound(lockBoth(startMatch({ seed: 's' }), 'pizza', 'moon'))
    const after = normalizeConvergeRound(lockBoth(before, 'cheese', 'cheeses'))
    expect(after.phase).toBe('chainEnd')
    expect(after.stars).toBe(3)
    expect(after.results[0]).toMatchObject({ chainNo: 1, steps: 2, stars: 3, converged: true, word: 'CHEESE' })
    const halfway = normalizeConvergeRound(lockWord(before, { player: 'X', word: 'cheese' }))
    expect(convergedNow(halfway, normalizeConvergeRound(lockWord(halfway, { player: 'O', word: 'cheese' })))).toBe(true)
  })

  it('loses the chain after the last step', () => {
    let r = startMatch({ seed: 's' })
    for (let i = 0; i < CONVERGE_MAX_STEPS; i++) r = lockBoth(r, `ax${'a'.repeat(i)}`, `bx${'b'.repeat(i)}`)
    const n = normalizeConvergeRound(r)
    expect(n.phase).toBe('chainEnd')
    expect(n.results[0]).toMatchObject({ converged: false, stars: 0, steps: CONVERGE_MAX_STEPS })
    expect(n.last.kind).toBe('lost')
  })

  it('refuses a second lock, a bad word and the wrong phase', () => {
    const one = lockWord(startMatch({ seed: 's' }), { player: 'X', word: 'pizza' })
    expect(lockWord(one, { player: 'X', word: 'moon' })).toBeNull()
    expect(lockWord(startMatch({ seed: 's' }), { player: 'X', word: 'x' })).toBeNull()
    expect(lockWord({ ...startMatch({ seed: 's' }), phase: 'chainEnd' }, { player: 'X', word: 'pizza' })).toBeNull()
  })

  it('ends the match after the last chain and tracks the best total', () => {
    let r = startMatch({ seed: 's', best: 2 })
    for (let c = 1; c <= CONVERGE_CHAINS; c++) {
      r = lockBoth(r, 'same', 'same')
      if (c < CONVERGE_CHAINS) r = nextChain(r)
    }
    const n = normalizeConvergeRound(r)
    expect(n.phase).toBe('done')
    expect(n.stars).toBe(CONVERGE_CHAINS * 3)
    expect(n.best).toBe(CONVERGE_CHAINS * 3)
    expect(n.results).toHaveLength(CONVERGE_CHAINS)
  })
})

describe('unlockWord / nextChain', () => {
  it('takes back a lock before the reveal', () => {
    const one = lockWord(startMatch({ seed: 's' }), { player: 'O', word: 'moon' })
    expect(normalizeConvergeRound(unlockWord(one, { player: 'O' })).pending.O).toBeNull()
    expect(unlockWord(one, { player: 'X' })).toBeNull()
  })

  it('starts a fresh chain', () => {
    const ended = lockBoth(startMatch({ seed: 's' }), 'same', 'same')
    const n = normalizeConvergeRound(nextChain(ended))
    expect(n).toMatchObject({ phase: 'write', chainNo: 2, chain: [], stars: 3 })
    expect(nextChain(startMatch({ seed: 's' }))).toBeNull()
  })
})
