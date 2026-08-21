import { describe, it, expect } from 'vitest'
import {
  HERD_TARGET,
  ANSWER_MS,
  normalizeAnswer,
  groupAnswers,
  scoreGroups,
  nextCow,
  getMatchWinner,
  seatOrder,
  allAnswered,
  seededShuffle,
} from './herdLogic'
import { HERD_PROMPTS } from './decks/herd'

describe('normalizeAnswer', () => {
  it('lowercases, trims and collapses whitespace', () => {
    expect(normalizeAnswer('  Pepperoni   Pizza ')).toBe('pepperoni pizza')
  })
  it('strips punctuation', () => {
    expect(normalizeAnswer('Mac & Cheese!')).toBe('mac cheese')
    expect(normalizeAnswer("kid's")).toBe('kids')
  })
  it('folds a naive plural (tacos == taco)', () => {
    expect(normalizeAnswer('tacos')).toBe(normalizeAnswer('taco'))
  })
  it('does not fold words ending in ss', () => {
    expect(normalizeAnswer('chess')).toBe('chess')
    expect(normalizeAnswer('class')).toBe('class')
    expect(normalizeAnswer('bus')).toBe('bus')
  })
  it('does not fold when the stem would be under 4 chars', () => {
    expect(normalizeAnswer('bus')).toBe('bus')
    expect(normalizeAnswer('lens')).toBe('lens')
    expect(normalizeAnswer('pies')).toBe('pies') // stem 'pie' is 3
  })
  it('keeps the s when the stem has no vowel (rhythms)', () => {
    expect(normalizeAnswer('rhythms')).toBe('rhythms')
  })
  it('leaves short words alone', () => {
    expect(normalizeAnswer('cats')).toBe('cats') // stem 'cat' is 3
    expect(normalizeAnswer('dog')).toBe('dog')
  })
  it('handles null/undefined/blank', () => {
    expect(normalizeAnswer(null)).toBe('')
    expect(normalizeAnswer(undefined)).toBe('')
    expect(normalizeAnswer('   ')).toBe('')
  })
})

describe('groupAnswers', () => {
  const g = (answers) => groupAnswers(answers)

  it('groups exact matches on the normalized form', () => {
    const groups = g({ a: 'Pepperoni!', b: 'pepperoni', c: 'Mushroom' })
    expect(groups).toHaveLength(2)
    expect(groups[0].norm).toBe('pepperoni')
    expect(groups[0].members).toEqual(['a', 'b'])
    expect(groups[1].members).toEqual(['c'])
  })
  it('sorts biggest-first; equal sizes break ties alphabetically by norm', () => {
    const groups = g({
      a: 'zzz', b: 'zzz',
      c: 'aaa', d: 'aaa',
      e: 'mmm',
    })
    expect(groups.map(x => x.norm)).toEqual(['aaa', 'zzz', 'mmm'])
  })
  it('sorts members lexicographically for determinism', () => {
    const groups = g({ z: 'x', a: 'x' })
    expect(groups[0].members).toEqual(['a', 'z'])
  })
  it('excludes blank/non-answers from grouping', () => {
    const groups = g({ a: 'pizza', b: '   ', c: '' })
    expect(groups).toHaveLength(1)
    expect(groups[0].members).toEqual(['a'])
  })
  it('handles null/undefined input', () => {
    expect(g(null)).toEqual([])
    expect(g(undefined)).toEqual([])
  })
})

describe('scoreGroups', () => {
  it('every member of the largest group scores', () => {
    const groups = [
      { norm: 'a', members: ['u1', 'u2', 'u3'] },
      { norm: 'b', members: ['u4'] },
    ]
    expect(scoreGroups(groups).pointUids.sort()).toEqual(['u1', 'u2', 'u3'])
  })
  it('ties at the top → all tied groups score', () => {
    const groups = [
      { norm: 'a', members: ['u1', 'u2'] },
      { norm: 'b', members: ['u3', 'u4'] },
      { norm: 'c', members: ['u5'] },
    ]
    expect(scoreGroups(groups).pointUids.sort()).toEqual(['u1', 'u2', 'u3', 'u4'])
  })
  it('all-unique round scores nobody', () => {
    const groups = [
      { norm: 'a', members: ['u1'] },
      { norm: 'b', members: ['u2'] },
    ]
    expect(scoreGroups(groups).pointUids).toEqual([])
  })
  it('empty input scores nobody', () => {
    expect(scoreGroups([]).pointUids).toEqual([])
    expect(scoreGroups(null).pointUids).toEqual([])
  })
})

describe('nextCow — the Pink Cow matrix', () => {
  const oneSingleton = [{ norm: 'a', members: ['u1', 'u2'] }, { norm: 'b', members: ['solo'] }]

  it('sole singleton takes the Cow when others grouped', () => {
    expect(nextCow(oneSingleton, null, ['u1', 'u2', 'solo'])).toEqual({ cow: 'solo', transferred: true })
  })
  it('already-cow singleton keeps it without a transfer event', () => {
    expect(nextCow(oneSingleton, 'solo', ['u1', 'u2', 'solo']).transferred).toBe(false)
    expect(nextCow(oneSingleton, 'solo', ['u1', 'u2', 'solo']).cow).toBe('solo')
  })
  it('two singletons → no transfer', () => {
    const groups = [
      { norm: 'a', members: ['u1', 'u2'] },
      { norm: 'b', members: ['s1'] },
      { norm: 'c', members: ['s2'] },
    ]
    expect(nextCow(groups, 'old', ['u1', 'u2', 's1', 's2'])).toEqual({ cow: 'old', transferred: false })
  })
  it('everyone matched → Cow stays', () => {
    const groups = [{ norm: 'a', members: ['u1', 'u2'] }]
    expect(nextCow(groups, 'holder', ['u1', 'u2'])).toEqual({ cow: 'holder', transferred: false })
  })
  it('all answers unique (no real group) → Cow stays', () => {
    const groups = [
      { norm: 'a', members: ['u1'] },
      { norm: 'b', members: ['u2'] },
    ]
    expect(nextCow(groups, 'holder', ['u1', 'u2'])).toEqual({ cow: 'holder', transferred: false })
  })
  it('non-answers can never take the Cow', () => {
    // 'ghost' submitted nothing → absent from answeredUids AND from groups
    const groups = [{ norm: 'a', members: ['u1', 'u2'] }, { norm: 'b', members: ['ghost'] }]
    expect(nextCow(groups, null, ['u1', 'u2'])).toEqual({ cow: null, transferred: false })
  })
  it('empty round keeps the current holder', () => {
    expect(nextCow([], 'holder', [])).toEqual({ cow: 'holder', transferred: false })
    expect(nextCow(null, null, [])).toEqual({ cow: null, transferred: false })
  })
})

describe('getMatchWinner', () => {
  it('first uid to reach the target wins', () => {
    expect(getMatchWinner({ a: 8, b: 5 })).toBe('a')
    expect(getMatchWinner({ a: 7, b: 8 })).toBe('b')
  })
  it('below target → no winner', () => {
    expect(getMatchWinner({ a: 7, b: 7 })).toBeNull()
    expect(getMatchWinner({}, null)).toBeNull()
  })
  it('the Cow holder cannot win even at/above target', () => {
    expect(getMatchWinner({ a: 10, b: 8 }, 'a')).toBe('b')
    expect(getMatchWinner({ a: 10 }, 'a')).toBeNull()
  })
  it('target is overridable', () => {
    expect(getMatchWinner({ a: 3 }, null, 3)).toBe('a')
  })
  it('default target constant is 8', () => {
    expect(HERD_TARGET).toBe(8)
  })
})

describe('seatOrder', () => {
  it('orders by joinedAt then playerId', () => {
    const players = {
      b: { joinedAt: 2, playerId: 'b' },
      a: { joinedAt: 1, playerId: 'a' },
      d: { joinedAt: 3, playerId: 'd' },
      c: { joinedAt: 3, playerId: 'c' },
    }
    expect(seatOrder(players)).toEqual(['a', 'b', 'c', 'd'])
  })
  it('drops empty seats and handles null input', () => {
    expect(seatOrder({ a: null })).toEqual([])
    expect(seatOrder(null)).toEqual([])
  })
})

describe('allAnswered', () => {
  it('true only when every eligible seat submitted non-blank text', () => {
    expect(allAnswered(['a', 'b'], { a: 'x', b: 'y' })).toBe(true)
    expect(allAnswered(['a', 'b'], { a: 'x', b: '  ' })).toBe(false)
    expect(allAnswered(['a', 'b'], { a: 'x' })).toBe(false)
  })
  it('no eligible seats → false (never auto-advance an empty room)', () => {
    expect(allAnswered([], {})).toBe(false)
  })
})

describe('seededShuffle', () => {
  it('is deterministic per seed', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(seededShuffle(arr, 42)).toEqual(seededShuffle(arr, 42))
    expect(seededShuffle(arr, 42)).not.toEqual(seededShuffle(arr, 43))
  })
  it('returns a permutation (no loss, no dupes)', () => {
    const arr = Array.from({ length: 50 }, (_, i) => i)
    const out = seededShuffle(arr, 7)
    expect([...out].sort((a, b) => a - b)).toEqual(arr)
  })
  it('does not mutate the source array', () => {
    const arr = [1, 2, 3]
    seededShuffle(arr, 9)
    expect(arr).toEqual([1, 2, 3])
  })
})

describe('deck + constants sanity', () => {
  it('deck ships 150+ prompts, all non-empty strings', () => {
    expect(HERD_PROMPTS.length).toBeGreaterThanOrEqual(150)
    expect(HERD_PROMPTS.every(p => typeof p === 'string' && p.trim().length > 5)).toBe(true)
  })
  it('answering window is 45s', () => {
    expect(ANSWER_MS).toBe(45000)
  })
})
