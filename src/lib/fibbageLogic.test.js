import { describe, it, expect } from 'vitest'
import {
  POINTS_FOR_TRUTH,
  POINTS_PER_FOOL,
  TRUTH_ID,
  seatOrder,
  hashString,
  seededShuffle,
  normalizeMap,
  buildOptions,
  scoreRound,
  allVoted,
  allLied,
} from './fibbageLogic'
import { FIBBAGE_FACTS } from './decks/fibbage'

// ---------------------------------------------------------------------------
// deck sanity
// ---------------------------------------------------------------------------
describe('FIBBAGE_FACTS deck', () => {
  it('has at least 25 entries', () => {
    expect(FIBBAGE_FACTS.length).toBeGreaterThanOrEqual(25)
  })

  it('every entry has a prompt with a blank and a non-empty answer', () => {
    for (const f of FIBBAGE_FACTS) {
      expect(typeof f.prompt).toBe('string')
      expect(f.prompt).toContain('___')
      expect(typeof f.answer).toBe('string')
      expect(f.answer.trim().length).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// seatOrder
// ---------------------------------------------------------------------------
describe('seatOrder', () => {
  it('orders by joinedAt ascending', () => {
    const players = {
      c: { playerId: 'c', joinedAt: 30 },
      a: { playerId: 'a', joinedAt: 10 },
      b: { playerId: 'b', joinedAt: 20 },
    }
    expect(seatOrder(players)).toEqual(['a', 'b', 'c'])
  })

  it('tie-breaks equal joinedAt by playerId', () => {
    const players = {
      y: { playerId: 'y', joinedAt: 5 },
      x: { playerId: 'x', joinedAt: 5 },
    }
    expect(seatOrder(players)).toEqual(['x', 'y'])
  })

  it('returns [] for null/empty', () => {
    expect(seatOrder(null)).toEqual([])
    expect(seatOrder({})).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// hashString / seededShuffle determinism
// ---------------------------------------------------------------------------
describe('hashString', () => {
  it('is deterministic', () => {
    expect(hashString('PROMPT-3')).toBe(hashString('PROMPT-3'))
  })

  it('differs for different input', () => {
    expect(hashString('a')).not.toBe(hashString('b'))
  })
})

describe('seededShuffle', () => {
  it('same seed yields same order on every client', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7]
    expect(seededShuffle(arr, 42)).toEqual(seededShuffle(arr, 42))
  })

  it('preserves all elements', () => {
    const arr = ['a', 'b', 'c', 'd']
    const out = seededShuffle(arr, 99)
    expect(out.sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('does not mutate input', () => {
    const arr = [1, 2, 3]
    const copy = [...arr]
    seededShuffle(arr, 7)
    expect(arr).toEqual(copy)
  })
})

// ---------------------------------------------------------------------------
// normalizeMap
// ---------------------------------------------------------------------------
describe('normalizeMap', () => {
  it('returns {} for null/undefined', () => {
    expect(normalizeMap(null)).toEqual({})
    expect(normalizeMap(undefined)).toEqual({})
  })

  it('copies object', () => {
    const obj = { p1: 'a' }
    const out = normalizeMap(obj)
    expect(out).toEqual(obj)
    expect(out).not.toBe(obj)
  })
})

// ---------------------------------------------------------------------------
// buildOptions
// ---------------------------------------------------------------------------
describe('buildOptions', () => {
  it('includes the truth plus one option per distinct lie', () => {
    const opts = buildOptions('REAL', { p1: 'lie-a', p2: 'lie-b' }, 1)
    expect(opts).toHaveLength(3)
    const texts = opts.map(o => o.text).sort()
    expect(texts).toEqual(['REAL', 'lie-a', 'lie-b'])
  })

  it('marks the truth option with id TRUTH_ID and by null', () => {
    const opts = buildOptions('REAL', { p1: 'lie' }, 5)
    const truth = opts.find(o => o.id === TRUTH_ID)
    expect(truth).toBeTruthy()
    expect(truth.by).toBeNull()
    expect(truth.text).toBe('REAL')
  })

  it('drops a lie that equals the truth (case-insensitive)', () => {
    const opts = buildOptions('Paris', { p1: '  paris ', p2: 'London' }, 3)
    // truth + only the London lie
    expect(opts).toHaveLength(2)
    const lie = opts.find(o => o.id !== TRUTH_ID)
    expect(lie.text).toBe('London')
    expect(lie.by).toEqual(['p2'])
  })

  it('merges duplicate lies into one option crediting both authors', () => {
    const opts = buildOptions('REAL', { p1: 'banana', p2: 'BANANA', p3: 'apple' }, 8)
    expect(opts).toHaveLength(3) // truth + banana + apple
    const banana = opts.find(o => o.text.toLowerCase() === 'banana')
    expect(banana.by.sort()).toEqual(['p1', 'p2'])
  })

  it('is deterministic for the same seed', () => {
    const lies = { p1: 'a', p2: 'b', p3: 'c' }
    const a = buildOptions('REAL', lies, 123)
    const b = buildOptions('REAL', lies, 123)
    expect(a.map(o => o.id)).toEqual(b.map(o => o.id))
  })
})

// ---------------------------------------------------------------------------
// scoreRound
// ---------------------------------------------------------------------------
describe('scoreRound', () => {
  const options = [
    { id: TRUTH_ID, text: 'REAL', by: null },
    { id: 'lie-0', text: 'lieA', by: ['p1'] },
    { id: 'lie-1', text: 'lieB', by: ['p2'] },
  ]

  it('awards truth points to a voter who picks the real answer', () => {
    const deltas = scoreRound(options, { p3: TRUTH_ID })
    expect(deltas.p3).toBe(POINTS_FOR_TRUTH)
  })

  it('awards fool points to the lie author when someone is fooled', () => {
    const deltas = scoreRound(options, { p3: 'lie-0' })
    expect(deltas.p1).toBe(POINTS_PER_FOOL)
    expect(deltas.p3).toBeUndefined()
  })

  it('stacks fool points for multiple victims', () => {
    const deltas = scoreRound(options, { p2: 'lie-0', p3: 'lie-0' })
    // p1 fooled both p2 and p3
    expect(deltas.p1).toBe(POINTS_PER_FOOL * 2)
  })

  it('credits every author of a merged lie', () => {
    const merged = [
      { id: TRUTH_ID, text: 'REAL', by: null },
      { id: 'lie-0', text: 'shared', by: ['p1', 'p2'] },
    ]
    const deltas = scoreRound(merged, { p3: 'lie-0' })
    expect(deltas.p1).toBe(POINTS_PER_FOOL)
    expect(deltas.p2).toBe(POINTS_PER_FOOL)
  })

  it('never credits a player for being fooled by their own lie', () => {
    const merged = [
      { id: TRUTH_ID, text: 'REAL', by: null },
      { id: 'lie-0', text: 'shared', by: ['p1', 'p2'] },
    ]
    // p1 (an author) somehow votes for the shared lie — p1 gets nothing, p2 still credited
    const deltas = scoreRound(merged, { p1: 'lie-0' })
    expect(deltas.p1).toBeUndefined()
    expect(deltas.p2).toBe(POINTS_PER_FOOL)
  })

  it('ignores votes for unknown options', () => {
    const deltas = scoreRound(options, { p3: 'bogus' })
    expect(deltas).toEqual({})
  })

  it('returns {} for no votes', () => {
    expect(scoreRound(options, {})).toEqual({})
    expect(scoreRound(options, null)).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// allLied / allVoted
// ---------------------------------------------------------------------------
describe('allLied', () => {
  it('false until every eligible player submitted', () => {
    expect(allLied(['a', 'b', 'c'], { a: 'x', b: 'y' })).toBe(false)
    expect(allLied(['a', 'b', 'c'], { a: 'x', b: 'y', c: 'z' })).toBe(true)
  })

  it('false for empty eligible list', () => {
    expect(allLied([], { a: 'x' })).toBe(false)
  })
})

describe('allVoted', () => {
  it('true once every eligible player has voted', () => {
    expect(allVoted(['a', 'b'], { a: 't', b: 'lie-0' })).toBe(true)
    expect(allVoted(['a', 'b'], { a: 't' })).toBe(false)
  })

  it('false for empty eligible list', () => {
    expect(allVoted([], {})).toBe(false)
  })
})
