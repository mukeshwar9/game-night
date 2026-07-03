import { describe, it, expect } from 'vitest'
import {
  POINTS_FOR_TRUTH,
  POINTS_PER_FOOL,
  seatOrder,
  hashString,
  seededShuffle,
  normalizeMap,
  buildOptions,
  attributeOptions,
  scoreRound,
  allVoted,
  allLied,
  allRevealed,
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
// buildOptions — the ANONYMISED ballot (info-leak fix)
// ---------------------------------------------------------------------------
describe('buildOptions', () => {
  it('includes the truth plus one option per distinct lie', () => {
    const opts = buildOptions('REAL', ['lie-a', 'lie-b'], 1)
    expect(opts).toHaveLength(3)
    const texts = opts.map(o => o.text).sort()
    expect(texts).toEqual(['REAL', 'lie-a', 'lie-b'])
  })

  it('does NOT expose an author (`by`) or a truth marker on any option', () => {
    // The whole point of the fix: nothing on the published ballot reveals who wrote
    // an option or which one is the real answer.
    const opts = buildOptions('REAL', ['lie-a', 'lie-b'], 5)
    for (const o of opts) {
      expect(o).not.toHaveProperty('by')
      expect(Object.keys(o).sort()).toEqual(['id', 'text'])
    }
    // The truth's id is indistinguishable from the lies' ids (same opt-N scheme).
    expect(opts.every(o => /^opt-\d+$/.test(o.id))).toBe(true)
  })

  it('gives every option a unique positional id', () => {
    const opts = buildOptions('REAL', ['a', 'b', 'c'], 3)
    const ids = opts.map(o => o.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('drops a lie that equals the truth (case-insensitive)', () => {
    const opts = buildOptions('Paris', ['  paris ', 'London'], 3)
    // truth + only the London lie
    expect(opts).toHaveLength(2)
    const texts = opts.map(o => o.text).sort()
    expect(texts).toEqual(['London', 'Paris'])
  })

  it('merges duplicate lies into a single option', () => {
    const opts = buildOptions('REAL', ['banana', 'BANANA', 'apple'], 8)
    expect(opts).toHaveLength(3) // truth + banana + apple
    const texts = opts.map(o => o.text.toLowerCase()).sort()
    expect(texts).toEqual(['apple', 'banana', 'real'])
  })

  it('is deterministic for the same seed', () => {
    const texts = ['a', 'b', 'c']
    const a = buildOptions('REAL', texts, 123)
    const b = buildOptions('REAL', texts, 123)
    expect(a).toEqual(b)
  })
})

// ---------------------------------------------------------------------------
// attributeOptions — recover author + truth key at reveal time
// ---------------------------------------------------------------------------
describe('attributeOptions', () => {
  const options = buildOptions('REAL', ['lieA', 'lieB'], 4)

  it('marks the truth option with by === null', () => {
    const rich = attributeOptions(options, 'REAL', { p1: 'lieA', p2: 'lieB' })
    const truth = rich.find(o => o.text === 'REAL')
    expect(truth.by).toBeNull()
  })

  it('attributes each lie option to its author(s)', () => {
    const rich = attributeOptions(options, 'REAL', { p1: 'lieA', p2: 'lieB' })
    const a = rich.find(o => o.text === 'lieA')
    const b = rich.find(o => o.text === 'lieB')
    expect(a.by).toEqual(['p1'])
    expect(b.by).toEqual(['p2'])
  })

  it('credits every author of a merged (duplicate) lie', () => {
    const opts = buildOptions('REAL', ['banana', 'BANANA'], 2)
    const rich = attributeOptions(opts, 'REAL', { p1: 'banana', p2: 'BANANA' })
    const banana = rich.find(o => o.text.toLowerCase() === 'banana')
    expect(banana.by.sort()).toEqual(['p1', 'p2'])
  })

  it('never attributes a lie-equal-to-truth to its author (no credit)', () => {
    const opts = buildOptions('Paris', ['London'], 3)
    const rich = attributeOptions(opts, 'Paris', { p1: 'paris', p2: 'London' })
    const truth = rich.find(o => o.text === 'Paris')
    expect(truth.by).toBeNull()
    expect(rich.find(o => o.text === 'London').by).toEqual(['p2'])
  })

  it('leaves a lie with no matching reveal unattributed ([])', () => {
    const rich = attributeOptions(options, 'REAL', {})
    for (const o of rich) {
      if (o.text === 'REAL') expect(o.by).toBeNull()
      else expect(o.by).toEqual([])
    }
  })
})

// ---------------------------------------------------------------------------
// scoreRound — consumes rich options from attributeOptions
// ---------------------------------------------------------------------------
describe('scoreRound', () => {
  const options = [
    { id: 'opt-0', text: 'REAL', by: null },
    { id: 'opt-1', text: 'lieA', by: ['p1'] },
    { id: 'opt-2', text: 'lieB', by: ['p2'] },
  ]

  it('awards truth points to a voter who picks the real answer', () => {
    const deltas = scoreRound(options, { p3: 'opt-0' })
    expect(deltas.p3).toBe(POINTS_FOR_TRUTH)
  })

  it('awards fool points to the lie author when someone is fooled', () => {
    const deltas = scoreRound(options, { p3: 'opt-1' })
    expect(deltas.p1).toBe(POINTS_PER_FOOL)
    expect(deltas.p3).toBeUndefined()
  })

  it('stacks fool points for multiple victims', () => {
    const deltas = scoreRound(options, { p2: 'opt-1', p3: 'opt-1' })
    // p1 fooled both p2 and p3
    expect(deltas.p1).toBe(POINTS_PER_FOOL * 2)
  })

  it('credits every author of a merged lie', () => {
    const merged = [
      { id: 'opt-0', text: 'REAL', by: null },
      { id: 'opt-1', text: 'shared', by: ['p1', 'p2'] },
    ]
    const deltas = scoreRound(merged, { p3: 'opt-1' })
    expect(deltas.p1).toBe(POINTS_PER_FOOL)
    expect(deltas.p2).toBe(POINTS_PER_FOOL)
  })

  it('never credits a player for being fooled by their own lie', () => {
    const merged = [
      { id: 'opt-0', text: 'REAL', by: null },
      { id: 'opt-1', text: 'shared', by: ['p1', 'p2'] },
    ]
    // p1 (an author) somehow votes for the shared lie — p1 gets nothing, p2 still credited
    const deltas = scoreRound(merged, { p1: 'opt-1' })
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

  it('end-to-end: build → attribute → score', () => {
    const opts = buildOptions('REAL', ['lieA', 'lieB'], 11)
    const rich = attributeOptions(opts, 'REAL', { p1: 'lieA', p2: 'lieB' })
    const truthId = rich.find(o => o.text === 'REAL').id
    const lieAId = rich.find(o => o.text === 'lieA').id
    // p2 finds the truth; p3 is fooled by p1's lie
    const deltas = scoreRound(rich, { p2: truthId, p3: lieAId })
    expect(deltas.p2).toBe(POINTS_FOR_TRUTH)
    expect(deltas.p1).toBe(POINTS_PER_FOOL)
  })
})

// ---------------------------------------------------------------------------
// allLied / allVoted / allRevealed
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
    expect(allVoted(['a', 'b'], { a: 't', b: 'opt-0' })).toBe(true)
    expect(allVoted(['a', 'b'], { a: 't' })).toBe(false)
  })

  it('false for empty eligible list', () => {
    expect(allVoted([], {})).toBe(false)
  })
})

describe('allRevealed', () => {
  it('true once every eligible player has revealed', () => {
    expect(allRevealed(['a', 'b'], { a: { text: 't', salt: 's' }, b: { text: 'u', salt: 'v' } })).toBe(true)
    expect(allRevealed(['a', 'b'], { a: { text: 't', salt: 's' } })).toBe(false)
  })

  it('false for empty eligible list', () => {
    expect(allRevealed([], {})).toBe(false)
  })
})
