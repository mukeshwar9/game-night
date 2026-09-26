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
  seededRng,
  MATCH_PROMPTS,
  FINAL_MULTIPLIER,
  drawPromptOrder,
  promptOrderOf,
  promptMultiplier,
  applyMultiplier,
  nextPromptRound,
  phaseDeadline,
  pendingLiars,
  matchChampions,
  optionKey,
  sameOption,
  isTruthLike,
  validateLie,
  allReady,
} from './fibbageLogic'
import { markSeen } from './seenHistory'
import { FIBBAGE_FACTS } from './decks/fibbage'
import { isBannedWord } from './wordDenylist'

// ---------------------------------------------------------------------------
// deck sanity
// ---------------------------------------------------------------------------
describe('FIBBAGE_FACTS deck', () => {
  it('has at least 60 entries', () => {
    expect(FIBBAGE_FACTS.length).toBeGreaterThanOrEqual(60)
  })

  it('has no duplicate prompts', () => {
    const keys = FIBBAGE_FACTS.map(f => optionKey(f.prompt))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('every prompt has exactly one blank', () => {
    for (const f of FIBBAGE_FACTS) {
      expect(f.prompt.split('___').length - 1).toBe(1)
    }
  })

  it('regression: the "elephant is the only mammal that can\'t jump" myth is gone', () => {
    expect(FIBBAGE_FACTS.some(f => /only mammal that cannot jump|can't jump/i.test(f.prompt))).toBe(false)
  })

  it('answers are short and have letters or digits', () => {
    for (const f of FIBBAGE_FACTS) {
      expect(optionKey(f.answer).length).toBeGreaterThan(0)
      expect(f.answer.length).toBeLessThanOrEqual(24)
    }
  })

  it('no shipped prompt, answer or decoy contains a banned word', () => {
    for (const f of FIBBAGE_FACTS) {
      for (const text of [f.prompt, f.answer, ...f.decoys]) {
        for (const word of text.toLowerCase().split(/[^a-z]+/).filter(Boolean)) {
          expect(isBannedWord(word)).toBe(false)
        }
      }
    }
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
// decoys
// ---------------------------------------------------------------------------
describe('decoys', () => {
  it('every fact has at least 2 decoys', () => {
    for (const f of FIBBAGE_FACTS) {
      expect(Array.isArray(f.decoys)).toBe(true)
      expect(f.decoys.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('every decoy is a non-empty string', () => {
    for (const f of FIBBAGE_FACTS) {
      for (const d of f.decoys) {
        expect(typeof d).toBe('string')
        expect(d.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('no decoy case-insensitively equals the fact answer', () => {
    for (const f of FIBBAGE_FACTS) {
      const answerLower = f.answer.toLowerCase()
      for (const d of f.decoys) {
        expect(d.toLowerCase()).not.toBe(answerLower)
      }
    }
  })

  it('no decoy is truth-like (bots must pass the same lie check as players)', () => {
    for (const f of FIBBAGE_FACTS) {
      for (const d of f.decoys) {
        expect(isTruthLike(d, f.answer), `${f.answer} / ${d}`).toBe(false)
        expect(validateLie(d, f.answer).ok, `${f.answer} / ${d}`).toBe(true)
      }
    }
  })

  it('decoys are distinct options within a fact', () => {
    for (const f of FIBBAGE_FACTS) {
      const keys = f.decoys.map(optionKey)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('decoys are unique within a fact (case-insensitive)', () => {
    for (const f of FIBBAGE_FACTS) {
      const lower = f.decoys.map(d => d.toLowerCase())
      expect(new Set(lower).size).toBe(lower.length)
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

describe('seededRng', () => {
  it('is deterministic per seed and in [0, 1)', () => {
    const a = seededRng(7)
    const b = seededRng(7)
    for (let i = 0; i < 20; i++) {
      const x = a()
      expect(x).toBe(b())
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })
})

describe('drawPromptOrder (seeded per-match shuffle + per-room seen history)', () => {
  const N = FIBBAGE_FACTS.length

  it('draws MATCH_PROMPTS distinct prompts, deterministic per seed', () => {
    const a = drawPromptOrder(N, 1234)
    expect(a).toHaveLength(MATCH_PROMPTS)
    expect(new Set(a).size).toBe(MATCH_PROMPTS)
    expect(drawPromptOrder(N, 1234)).toEqual(a)
  })

  it('does not always open on prompt 0 (the old fixed-order bug)', () => {
    const openers = new Set()
    for (let seed = 1; seed <= 30; seed++) openers.add(drawPromptOrder(N, seed)[0])
    expect(openers.size).toBeGreaterThan(5)
  })

  it('avoids the room\'s seen prompts until the deck runs out', () => {
    let seen = {}
    const used = new Set()
    for (let m = 0; m < Math.floor(N / MATCH_PROMPTS); m++) {
      const order = drawPromptOrder(N, 50 + m, seen)
      for (const i of order) {
        expect(used.has(i)).toBe(false)
        used.add(i)
      }
      seen = markSeen(seen, order)
    }
  })

  it('still draws a full distinct match when every prompt was seen', () => {
    const seen = {}
    for (let i = 0; i < N; i++) seen[i] = i + 1
    const order = drawPromptOrder(N, 3, seen)
    expect(new Set(order).size).toBe(MATCH_PROMPTS)
  })

  it('handles tiny decks', () => {
    expect(drawPromptOrder(3, 1)).toHaveLength(3)
    expect(drawPromptOrder(0, 1)).toEqual([])
  })
})

describe('promptOrderOf', () => {
  it('reads Firebase numeric-keyed objects by key and drops junk', () => {
    expect(promptOrderOf({ order: { 1: 9, 0: 4 } })).toEqual([4, 9])
    expect(promptOrderOf({ order: [1, 'x', 999] }, 27)).toEqual([1])
    expect(promptOrderOf(null)).toEqual([])
  })
})

describe('final-prompt catch-up', () => {
  it('doubles only the last prompt', () => {
    expect(promptMultiplier(0)).toBe(1)
    expect(promptMultiplier(MATCH_PROMPTS - 1)).toBe(FINAL_MULTIPLIER)
    expect(promptMultiplier(2, 3)).toBe(2)
    expect(FINAL_MULTIPLIER).toBe(2)
  })
  it('applyMultiplier scales every delta', () => {
    expect(applyMultiplier({ a: 1000, b: 500 }, 2)).toEqual({ a: 2000, b: 1000 })
    expect(applyMultiplier({ a: 1000 }, 1)).toEqual({ a: 1000 })
    expect(applyMultiplier(null, 2)).toEqual({})
  })
})

describe('nextPromptRound', () => {
  const round = { phase: 'reveal', deckSeed: 5, order: [7, 3, 11], num: 0, promptIndex: 7 }
  it('steps to the next prompt of the stored order', () => {
    expect(nextPromptRound(round, 27, 1000)).toEqual({
      round: { phase: 'lying', deckSeed: 5, order: [7, 3, 11], num: 1, promptIndex: 3, lieStartedAt: 1000 },
    })
  })
  it('finishes after the last prompt', () => {
    expect(nextPromptRound({ ...round, num: 2, promptIndex: 11 }, 27, 1000)).toEqual({ finished: true })
  })
  it('hands a legacy round (no order) back to the coordinator for a fresh draw', () => {
    expect(nextPromptRound({ phase: 'reveal', promptIndex: 4 }, 27, 1000)).toEqual({ round: { phase: 'lying' } })
  })
})

describe('phaseDeadline', () => {
  it('scales from the phase start', () => {
    expect(phaseDeadline(1000, null, 60000, 1)).toBe(61000)
    expect(phaseDeadline(1000, null, 60000, 2)).toBe(121000)
    expect(phaseDeadline(1000, null, 60000, undefined)).toBe(61000)
  })
  it('converts a legacy absolute 1× deadline', () => {
    expect(phaseDeadline(null, 61000, 60000, 1)).toBe(61000)
    expect(phaseDeadline(null, 61000, 60000, 2)).toBe(121000)
  })
  it('is null with timers off or nothing stamped', () => {
    expect(phaseDeadline(1000, 61000, 60000, 0)).toBeNull()
    expect(phaseDeadline(null, null, 60000, 1)).toBeNull()
  })
})

describe('pendingLiars', () => {
  it('waits only on players who committed a lie', () => {
    expect(pendingLiars({ a: { hash: 'x' }, b: { hash: 'y' } }, { a: { text: 't', salt: 's' } })).toEqual(['b'])
    expect(pendingLiars({}, {})).toEqual([])
  })
})

describe('matchChampions', () => {
  it('returns every player tied on the top score', () => {
    expect(matchChampions({ a: 3000, b: 3000, c: 1000 }, ['a', 'b', 'c'])).toEqual(['a', 'b'])
    expect(matchChampions({ a: 500 }, ['a', 'b'])).toEqual(['a'])
  })
  it('is empty when nobody scored', () => {
    expect(matchChampions({}, ['a', 'b'])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Truth-bypass + casing tell (lie validation and loose option matching)
// ---------------------------------------------------------------------------
describe('isTruthLike', () => {
  it('regression: punctuation/casing variants of the truth are the truth', () => {
    expect(isTruthLike('Scotland.', 'Scotland')).toBe(true)
    expect(isTruthLike('SCOTLAND!', 'Scotland')).toBe(true)
  })

  it('treats a leading article or plural as the same answer', () => {
    expect(isTruthLike('Pringles can', 'a Pringles can')).toBe(true)
    expect(isTruthLike('guinea pigs', 'guinea pig')).toBe(true)
  })

  it('treats one typo in a longer answer as the truth', () => {
    expect(isTruthLike('Scotlnd', 'Scotland')).toBe(true)
    expect(isTruthLike('flamboyanse', 'flamboyance')).toBe(true)
  })

  it('keeps short answers exact so a real lie one letter off is allowed', () => {
    expect(isTruthLike('hat', 'cat')).toBe(false)
    expect(isTruthLike('14', '13')).toBe(false)
  })

  it('treats the same number written as a word or digits as the truth', () => {
    expect(isTruthLike('3', 'three')).toBe(true)
    expect(isTruthLike('Three.', '3')).toBe(true)
    expect(isTruthLike('4', 'three')).toBe(false)
  })

  it('does not flag a genuinely different lie', () => {
    expect(isTruthLike('Ireland', 'Scotland')).toBe(false)
    expect(isTruthLike('a cookie jar', 'a Pringles can')).toBe(false)
  })
})

describe('validateLie', () => {
  it('accepts a normal lie (trimmed)', () => {
    expect(validateLie('  Ireland ', 'Scotland')).toEqual({ ok: true, text: 'Ireland' })
  })

  it('regression: rejects "Scotland." and "SCOTLAND!" when the truth is Scotland', () => {
    expect(validateLie('Scotland.', 'Scotland').ok).toBe(false)
    expect(validateLie('SCOTLAND!', 'Scotland')).toEqual({ ok: false, error: "THAT'S THE TRUTH — LIE HARDER" })
  })

  it('rejects empty, symbol-only and over-long lies', () => {
    expect(validateLie('   ', 'x').error).toBe('TYPE YOUR LIE')
    expect(validateLie('!!!', 'x').error).toBe('USE LETTERS OR NUMBERS')
    expect(validateLie('a'.repeat(61), 'x').error).toBe('TOO LONG')
  })

  it('rejects banned words', () => {
    expect(validateLie('a big shit', 'snow')).toEqual({ ok: false, error: 'KEEP IT CLEAN' })
  })
})

describe('optionKey / sameOption', () => {
  it('regression: "a pringles can" and "Pringles can" are the same option', () => {
    expect(sameOption('a pringles can', 'Pringles can')).toBe(true)
    expect(optionKey('A Pringles Can.')).toBe(optionKey('pringles can'))
  })

  it('never matches empty text', () => {
    expect(sameOption('', '')).toBe(false)
    expect(sameOption('!!', '??')).toBe(false)
  })
})

describe('buildOptions / attributeOptions with loose matching', () => {
  it('regression: drops truth variants from the ballot ("SCOTLAND!" / "Scotlnd")', () => {
    const opts = buildOptions('Scotland', ['SCOTLAND!', 'Scotlnd', 'Ireland'], 9)
    expect(opts.map(o => o.text).sort()).toEqual(['Ireland', 'Scotland'])
  })

  it('merges lies that differ only by article/case/punctuation and credits every author', () => {
    const opts = buildOptions('a Pringles can', ['a cookie jar', 'Cookie jar!', 'his golf bag'], 4)
    expect(opts).toHaveLength(3) // truth + cookie jar + golf bag
    const rich = attributeOptions(opts, 'a Pringles can', { p1: 'a cookie jar', p2: 'Cookie jar!', p3: 'his golf bag' })
    const jar = rich.find(o => sameOption(o.text, 'cookie jar'))
    expect(jar.by.sort()).toEqual(['p1', 'p2'])
  })

  it('gives no credit to a truth-like lie that slipped onto an old ballot', () => {
    // A ballot built by an older client could still carry "Scotlnd".
    const legacy = [{ id: 'opt-0', text: 'Scotland' }, { id: 'opt-1', text: 'Scotlnd' }]
    const rich = attributeOptions(legacy, 'Scotland', { p1: 'Scotlnd' })
    expect(rich.find(o => o.id === 'opt-0').by).toBeNull()
    expect(rich.find(o => o.id === 'opt-1').by).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// allReady — reveal pacing
// ---------------------------------------------------------------------------
describe('allReady', () => {
  it('is true only when every eligible player is ready', () => {
    expect(allReady(['a', 'b'], { a: true, b: true })).toBe(true)
    expect(allReady(['a', 'b'], { a: true })).toBe(false)
    expect(allReady(['a', 'b'], null)).toBe(false)
  })

  it('is false for an empty table', () => {
    expect(allReady([], { a: true })).toBe(false)
  })
})
