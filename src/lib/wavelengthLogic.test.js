import { describe, it, expect } from 'vitest'
import { WAVELENGTH_PAIRS } from './decks/wavelength'
import {
  WAVELENGTH_MAX_SCORE,
  WAVELENGTH_MISS_DISTANCE,
  WAVELENGTH_PAIR_COUNT,
  getSpectrumPair,
  randomSpectrumIndex,
  nextSpectrumIndex,
  randomTarget,
  parseStoredTarget,
  storedOrNewTarget,
  clampGuess,
  scoreGuess,
  normalizeGuesses,
  seatOrder,
  onlineGuessers,
  nextClueGiver,
  nextOnlineClueGiver,
  normalizeUsedSpectrums,
  freshRound,
  firstRound,
  rotateRound,
  addScores,
  advanceAfterReveal,
  skipRound,
  beginMatch,
  validateClue,
  clueGiverScore,
  roundDeltas,
  matchWinners,
  WAVELENGTH_WIN_SCORE,
  WAVELENGTH_SEEN_KEY,
  normalizeIndexList,
  pickSpectrumIndex,
} from './wavelengthLogic'
import { markSeen } from './seenHistory'
import { matchKey } from './textMatchLogic'

// ---------------------------------------------------------------------------
// deck
// ---------------------------------------------------------------------------
describe('WAVELENGTH_PAIRS deck', () => {
  it('has at least 60 pairs', () => {
    expect(WAVELENGTH_PAIRS.length).toBeGreaterThanOrEqual(60)
  })

  it('has no duplicate pairs (either orientation)', () => {
    const keys = WAVELENGTH_PAIRS.map(p => [matchKey(p.left), matchKey(p.right)].sort().join('|'))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('never uses the same word for both ends', () => {
    for (const p of WAVELENGTH_PAIRS) expect(matchKey(p.left)).not.toBe(matchKey(p.right))
  })

  it('every bot clue is itself a legal clue for its pair (one word, no digits, no dial word)', () => {
    for (const p of WAVELENGTH_PAIRS) {
      for (const c of p.clueBank) {
        expect(validateClue(c.word, p), `${p.left}/${p.right}: ${c.word}`).toEqual({ ok: true, clue: c.word })
      }
    }
  })

  it('every clue bank spans the dial (something near each end)', () => {
    for (const p of WAVELENGTH_PAIRS) {
      const positions = p.clueBank.map(c => c.pos)
      expect(Math.min(...positions), `${p.left}`).toBeLessThanOrEqual(30)
      expect(Math.max(...positions), `${p.right}`).toBeGreaterThanOrEqual(70)
    }
  })

  it('every pair has non-empty left and right', () => {
    for (const p of WAVELENGTH_PAIRS) {
      expect(typeof p.left).toBe('string')
      expect(typeof p.right).toBe('string')
      expect(p.left.length).toBeGreaterThan(0)
      expect(p.right.length).toBeGreaterThan(0)
    }
  })

  it('WAVELENGTH_PAIR_COUNT matches the deck length', () => {
    expect(WAVELENGTH_PAIR_COUNT).toBe(WAVELENGTH_PAIRS.length)
  })
})

// ---------------------------------------------------------------------------
// clueBank
// ---------------------------------------------------------------------------
describe('clueBank', () => {
  it('every pair has at least 3 clues', () => {
    for (const p of WAVELENGTH_PAIRS) {
      expect(Array.isArray(p.clueBank)).toBe(true)
      expect(p.clueBank.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('every clue has a non-empty word and an in-range numeric pos', () => {
    for (const p of WAVELENGTH_PAIRS) {
      for (const c of p.clueBank) {
        expect(typeof c.word).toBe('string')
        expect(c.word.length).toBeGreaterThan(0)
        expect(typeof c.pos).toBe('number')
        expect(c.pos).toBeGreaterThanOrEqual(0)
        expect(c.pos).toBeLessThanOrEqual(100)
      }
    }
  })

  it('clue words are unique within a pair (case-insensitive)', () => {
    for (const p of WAVELENGTH_PAIRS) {
      const words = p.clueBank.map(c => c.word.toLowerCase())
      expect(new Set(words).size).toBe(words.length)
    }
  })
})

// ---------------------------------------------------------------------------
// getSpectrumPair
// ---------------------------------------------------------------------------
describe('getSpectrumPair', () => {
  it('returns the pair at a valid index', () => {
    expect(getSpectrumPair(0)).toEqual(WAVELENGTH_PAIRS[0])
    expect(getSpectrumPair(3)).toEqual(WAVELENGTH_PAIRS[3])
  })

  it('wraps indices beyond the deck length', () => {
    expect(getSpectrumPair(WAVELENGTH_PAIR_COUNT)).toEqual(WAVELENGTH_PAIRS[0])
    expect(getSpectrumPair(WAVELENGTH_PAIR_COUNT + 2)).toEqual(WAVELENGTH_PAIRS[2])
  })

  it('wraps negative indices', () => {
    expect(getSpectrumPair(-1)).toEqual(WAVELENGTH_PAIRS[WAVELENGTH_PAIR_COUNT - 1])
  })
})

// ---------------------------------------------------------------------------
// randomSpectrumIndex / randomTarget
// ---------------------------------------------------------------------------
describe('randomSpectrumIndex', () => {
  it('always returns a valid in-range index', () => {
    for (let i = 0; i < 200; i++) {
      const idx = randomSpectrumIndex()
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(WAVELENGTH_PAIR_COUNT)
    }
  })

  it('never returns the excluded index', () => {
    for (let i = 0; i < 200; i++) {
      expect(randomSpectrumIndex(5)).not.toBe(5)
    }
  })
})

describe('nextSpectrumIndex', () => {
  it('never returns the current index', () => {
    for (let i = 0; i < 200; i++) {
      expect(nextSpectrumIndex([], 5)).not.toBe(5)
    }
  })

  it('never returns an already-used index while unused ones remain', () => {
    const used = Array.from({ length: WAVELENGTH_PAIR_COUNT - 1 }, (_, i) => i).filter(i => i !== 3)
    for (let i = 0; i < 50; i++) {
      const idx = nextSpectrumIndex(used, 3)
      expect(used).not.toContain(idx)
      expect(idx).not.toBe(3)
    }
  })

  it('resets the pool once every other index has been used', () => {
    const used = Array.from({ length: WAVELENGTH_PAIR_COUNT }, (_, i) => i).filter(i => i !== 3)
    const idx = nextSpectrumIndex(used, 3)
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(idx).toBeLessThan(WAVELENGTH_PAIR_COUNT)
    expect(idx).not.toBe(3)
  })
})

describe('randomTarget', () => {
  it('stays comfortably inside the dial', () => {
    for (let i = 0; i < 500; i++) {
      const t = randomTarget()
      expect(t).toBeGreaterThanOrEqual(8)
      expect(t).toBeLessThanOrEqual(92)
      expect(Number.isInteger(t)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// parseStoredTarget / storedOrNewTarget — the clue-giver's hidden target
// ---------------------------------------------------------------------------
describe('parseStoredTarget', () => {
  it('reads a committed entry', () => {
    const raw = JSON.stringify({ target: 37, salt: 'ab', hash: 'cd' })
    expect(parseStoredTarget(raw)).toEqual({ target: 37, salt: 'ab', hash: 'cd' })
  })

  it('reads an uncommitted entry (target only)', () => {
    expect(parseStoredTarget(JSON.stringify({ target: 12 }))).toEqual({ target: 12, salt: null, hash: null })
  })

  it('returns null for missing, corrupt or out-of-range entries', () => {
    expect(parseStoredTarget(null)).toBeNull()
    expect(parseStoredTarget('')).toBeNull()
    expect(parseStoredTarget('{nope')).toBeNull()
    expect(parseStoredTarget(JSON.stringify({ target: 'x' }))).toBeNull()
    expect(parseStoredTarget(JSON.stringify({ target: 140 }))).toBeNull()
    expect(parseStoredTarget(JSON.stringify({ target: 4.5 }))).toBeNull()
  })
})

describe('storedOrNewTarget', () => {
  it('regression: the target exists before the clue — rolled at clue phase, not at submit', () => {
    // Old flow rolled the target inside handleSubmitClue, so the clue carried no
    // information. The clue phase now rolls (fresh) and later calls reuse it.
    const first = storedOrNewTarget(null, () => 61)
    expect(first).toEqual({ target: 61, salt: null, hash: null, fresh: true })
    const stored = JSON.stringify({ target: first.target })
    const again = storedOrNewTarget(stored, () => 5)
    expect(again.target).toBe(61)
    expect(again.fresh).toBe(false)
  })

  it('keeps the committed salt/hash across a reload', () => {
    const raw = JSON.stringify({ target: 44, salt: 's', hash: 'h' })
    expect(storedOrNewTarget(raw, () => 9)).toEqual({ target: 44, salt: 's', hash: 'h', fresh: false })
  })

  it('rolls a fresh in-range target when storage is empty', () => {
    for (let i = 0; i < 50; i++) {
      const t = storedOrNewTarget(null)
      expect(t.fresh).toBe(true)
      expect(t.target).toBeGreaterThanOrEqual(8)
      expect(t.target).toBeLessThanOrEqual(92)
    }
  })
})

// ---------------------------------------------------------------------------
// clampGuess
// ---------------------------------------------------------------------------
describe('clampGuess', () => {
  it('clamps below 0 to 0', () => {
    expect(clampGuess(-10)).toBe(0)
  })
  it('clamps above 100 to 100', () => {
    expect(clampGuess(150)).toBe(100)
  })
  it('rounds to an integer', () => {
    expect(clampGuess(42.6)).toBe(43)
  })
  it('falls back to 50 for non-numeric input', () => {
    expect(clampGuess('nope')).toBe(50)
    expect(clampGuess(NaN)).toBe(50)
  })
})

// ---------------------------------------------------------------------------
// scoreGuess
// ---------------------------------------------------------------------------
describe('scoreGuess', () => {
  it('awards the max for a bullseye', () => {
    expect(scoreGuess(50, 50)).toBe(WAVELENGTH_MAX_SCORE)
  })

  it('awards 0 at exactly the miss distance', () => {
    expect(scoreGuess(0, WAVELENGTH_MISS_DISTANCE)).toBe(0)
  })

  it('awards 0 beyond the miss distance', () => {
    expect(scoreGuess(0, 100)).toBe(0)
  })

  it('is symmetric around the target', () => {
    expect(scoreGuess(40, 50)).toBe(scoreGuess(60, 50))
  })

  it('decreases as the guess moves away from the target', () => {
    const close = scoreGuess(48, 50)
    const mid = scoreGuess(40, 50)
    const far = scoreGuess(20, 50)
    expect(close).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(far)
  })

  it('returns integer points within [0, max]', () => {
    for (let g = 0; g <= 100; g += 7) {
      for (let t = 0; t <= 100; t += 11) {
        const s = scoreGuess(g, t)
        expect(Number.isInteger(s)).toBe(true)
        expect(s).toBeGreaterThanOrEqual(0)
        expect(s).toBeLessThanOrEqual(WAVELENGTH_MAX_SCORE)
      }
    }
  })

  it('clamps out-of-range guesses before scoring', () => {
    expect(scoreGuess(-20, 50)).toBe(scoreGuess(0, 50))
    expect(scoreGuess(200, 50)).toBe(scoreGuess(100, 50))
  })
})

// ---------------------------------------------------------------------------
// normalizeGuesses
// ---------------------------------------------------------------------------
describe('normalizeGuesses', () => {
  it('returns {} for null/undefined', () => {
    expect(normalizeGuesses(null)).toEqual({})
    expect(normalizeGuesses(undefined)).toEqual({})
  })
  it('returns a shallow copy of the object', () => {
    const raw = { a: 10, b: 90 }
    const out = normalizeGuesses(raw)
    expect(out).toEqual(raw)
    expect(out).not.toBe(raw)
  })
})

// ---------------------------------------------------------------------------
// seatOrder
// ---------------------------------------------------------------------------
describe('seatOrder', () => {
  const players = {
    p2: { playerId: 'p2', joinedAt: 200 },
    p1: { playerId: 'p1', joinedAt: 100 },
    p3: { playerId: 'p3', joinedAt: 300 },
  }

  it('orders players by joinedAt ascending', () => {
    expect(seatOrder(players)).toEqual(['p1', 'p2', 'p3'])
  })

  it('returns [] for empty/missing input', () => {
    expect(seatOrder(null)).toEqual([])
    expect(seatOrder({})).toEqual([])
  })

  it('breaks joinedAt ties by playerId', () => {
    const tied = {
      b: { playerId: 'b', joinedAt: 50 },
      a: { playerId: 'a', joinedAt: 50 },
    }
    expect(seatOrder(tied)).toEqual(['a', 'b'])
  })

  it('skips entries without a playerId', () => {
    const ragged = { p1: { playerId: 'p1', joinedAt: 1 }, ghost: null }
    expect(seatOrder(ragged)).toEqual(['p1'])
  })
})

// ---------------------------------------------------------------------------
// onlineGuessers
// ---------------------------------------------------------------------------
describe('onlineGuessers', () => {
  const players = {
    p1: { playerId: 'p1', joinedAt: 100, online: true },
    p2: { playerId: 'p2', joinedAt: 200, online: false },
    p3: { playerId: 'p3', joinedAt: 300, online: true },
  }

  it('excludes the clue-giver', () => {
    expect(onlineGuessers(players, 'p1')).toEqual(['p3'])
  })

  it('drops explicitly offline players', () => {
    expect(onlineGuessers(players, 'p3')).toEqual(['p1'])
  })

  it('treats missing presence as online', () => {
    const fresh = {
      p1: { playerId: 'p1', joinedAt: 100, online: true },
      p2: { playerId: 'p2', joinedAt: 200 }, // presence write hasn't landed
    }
    expect(onlineGuessers(fresh, 'p1')).toEqual(['p2'])
  })

  it('keeps seat order', () => {
    const all = {
      p2: { playerId: 'p2', joinedAt: 200, online: true },
      p1: { playerId: 'p1', joinedAt: 100, online: true },
      p3: { playerId: 'p3', joinedAt: 300, online: true },
    }
    expect(onlineGuessers(all, 'p2')).toEqual(['p1', 'p3'])
  })

  it('returns [] when every guesser is offline', () => {
    const dark = {
      p1: { playerId: 'p1', joinedAt: 100, online: true },
      p2: { playerId: 'p2', joinedAt: 200, online: false },
      p3: { playerId: 'p3', joinedAt: 300, online: false },
    }
    expect(onlineGuessers(dark, 'p1')).toEqual([])
  })

  it('returns [] for empty/missing players', () => {
    expect(onlineGuessers(null, 'p1')).toEqual([])
    expect(onlineGuessers({}, 'p1')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// nextClueGiver
// ---------------------------------------------------------------------------
describe('nextClueGiver', () => {
  const players = {
    p1: { playerId: 'p1', joinedAt: 100 },
    p2: { playerId: 'p2', joinedAt: 200 },
    p3: { playerId: 'p3', joinedAt: 300 },
  }

  it('rotates to the next seat', () => {
    expect(nextClueGiver(players, 'p1')).toBe('p2')
    expect(nextClueGiver(players, 'p2')).toBe('p3')
  })

  it('wraps from the last seat back to the first', () => {
    expect(nextClueGiver(players, 'p3')).toBe('p1')
  })

  it('falls back to the first seat for an unknown current id', () => {
    expect(nextClueGiver(players, 'ghost')).toBe('p1')
  })

  it('returns null when there are no players', () => {
    expect(nextClueGiver({}, 'p1')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// room seen history + shared round flow (live room and demo)
// ---------------------------------------------------------------------------
const allIdx = () => Array.from({ length: WAVELENGTH_PAIR_COUNT }, (_, i) => i)
const three = {
  a: { playerId: 'a', joinedAt: 1 },
  b: { playerId: 'b', joinedAt: 2 },
  c: { playerId: 'c', joinedAt: 3 },
}

describe('nextSpectrumIndex with room seen history', () => {
  it('avoids spectra the room saw in earlier matches', () => {
    const seen = markSeen({}, allIdx().filter(i => i !== 9))
    for (let t = 0; t < 20; t++) expect(nextSpectrumIndex([], -1, seen)).toBe(9)
  })

  it('still never repeats within the match once the room history is exhausted', () => {
    const seen = markSeen({}, allIdx())
    const used = [0, 1, 2]
    for (let t = 0; t < 50; t++) {
      const i = nextSpectrumIndex(used, 3, seen)
      expect(used).not.toContain(i)
      expect(i).not.toBe(3)
    }
  })

  it('is deterministic for a given rng', () => {
    const rng = () => 0.42
    expect(nextSpectrumIndex([1], 2, { 5: 1 }, rng)).toBe(nextSpectrumIndex([1], 2, { 5: 1 }, rng))
  })
})

describe('normalizeUsedSpectrums', () => {
  it('reads arrays and numeric-keyed objects by key', () => {
    expect(normalizeUsedSpectrums([4, 7])).toEqual([4, 7])
    expect(normalizeUsedSpectrums({ 1: 7, 0: 4 })).toEqual([4, 7])
    expect(normalizeUsedSpectrums(undefined)).toEqual([])
  })
})

describe('firstRound / rotateRound', () => {
  it('starts with the first seat on a spectrum the room has not seen', () => {
    const seen = markSeen({}, allIdx().filter(i => i !== 11))
    const { round, seen: next } = firstRound(three, seen)
    expect(round).toEqual(freshRound({ clueGiver: 'a', spectrumIndex: 11 }))
    expect(next[11]).toBeGreaterThan(0)
  })

  it('rotates the clue-giver and records the used spectrum', () => {
    const { round } = rotateRound(three, { clueGiver: 'c', spectrumIndex: 3, usedSpectrums: [1] }, {})
    expect(round.clueGiver).toBe('a')
    expect(round.usedSpectrums).toEqual([1, 3])
    expect([1, 3]).not.toContain(round.spectrumIndex)
    expect(round.phase).toBe('clue')
  })
})

describe('addScores', () => {
  it('scores only guessers who locked in', () => {
    expect(roundDeltas({ guesses: { b: 50, c: null }, target: 50, clueGiver: 'a', seatIds: ['a', 'b', 'c'] }))
      .toEqual({ b: 50, a: 50 })
  })

  it('adds deltas without mutating', () => {
    const scores = { b: 10 }
    expect(addScores(scores, { b: 5, c: 1 })).toEqual({ b: 15, c: 1 })
    expect(scores).toEqual({ b: 10 })
  })
})

describe('advanceAfterReveal', () => {
  const revealed = (over = {}) => ({
    status: 'playing',
    players: three,
    scores: {},
    round: {
      clueGiver: 'a', phase: 'reveal', spectrumIndex: 2, usedSpectrums: [],
      guesses: { b: 50, c: 0 }, reveal: { target: 50, salt: 's' }, commitment: 'h',
      ...over,
    },
  })

  it('scores guessers by closeness and the clue-giver their mean, rotates and records the spectrum', () => {
    const next = advanceAfterReveal(revealed())
    expect(next.scores).toEqual({ a: 25, b: 50, c: 0 })
    expect(next.round.clueGiver).toBe('b')
    expect(next.round.usedSpectrums).toEqual([2])
    expect(next.seen[WAVELENGTH_SEEN_KEY][next.round.spectrumIndex]).toBeGreaterThan(0)
  })

  it('voids the round when the clue-giver cheated', () => {
    const next = advanceAfterReveal(revealed({ cheatDetected: true }))
    expect(next.scores).toEqual({})
    expect(next.status).toBe('playing')
  })

  it('ends the match when a guesser clinches', () => {
    const g = revealed()
    g.scores = { b: WAVELENGTH_WIN_SCORE - 10 }
    const next = advanceAfterReveal(g)
    expect(next).toMatchObject({ status: 'finished', winner: 'b' })
  })

  it('regression: the highest score wins when several cross together, not seat order', () => {
    const g = revealed()
    g.scores = { a: WAVELENGTH_WIN_SCORE - 1, b: WAVELENGTH_WIN_SCORE - 10 }
    // a (seat 1) reaches 224, b reaches 240.
    expect(advanceAfterReveal(g)).toMatchObject({ status: 'finished', winner: 'b' })
  })

  it('shares an exact tie at the top — no sole winner is written', () => {
    const g = revealed({ guesses: { b: 50, c: 50 } })
    g.scores = { b: WAVELENGTH_WIN_SCORE, c: WAVELENGTH_WIN_SCORE }
    const next = advanceAfterReveal(g)
    expect(next.status).toBe('finished')
    expect(next.winner).toBeNull()
    expect(matchWinners(next.scores, ['a', 'b', 'c'])).toEqual(['b', 'c'])
  })

  it('is a no-op once the round has already advanced', () => {
    expect(advanceAfterReveal(revealed({ phase: 'clue' }))).toBeNull()
    expect(advanceAfterReveal({ round: null })).toBeNull()
  })
})

describe('skipRound', () => {
  it('passes the clue on without scoring and keeps other seen history', () => {
    const game = { players: three, scores: { b: 3 }, seen: { spyfair: { 1: 1 } }, round: { clueGiver: 'b', phase: 'clue', spectrumIndex: 4 } }
    const next = skipRound(game)
    expect(next.scores).toEqual({ b: 3 })
    expect(next.round.clueGiver).toBe('c')
    expect(next.seen.spyfair).toEqual({ 1: 1 })
    expect(next.round.spectrumIndex).not.toBe(4)
  })
})

describe('beginMatch', () => {
  it('starts a lobby with enough players', () => {
    const next = beginMatch({ status: 'waiting', players: three, scores: {} }, 123)
    expect(next).toMatchObject({ status: 'playing', winner: null, lastActivityAt: 123 })
    expect(next.round.clueGiver).toBe('a')
  })

  it('refuses a running match (double START during a host handover) or a short lobby', () => {
    expect(beginMatch({ status: 'playing', players: three }, 1)).toBeNull()
    expect(beginMatch({ status: 'finished', players: three }, 1)).toBeNull()
    expect(beginMatch({ status: 'waiting', players: { a: three.a } }, 1)).toBeNull()
  })
})

describe('nextOnlineClueGiver', () => {
  const room = {
    a: { playerId: 'a', joinedAt: 1, online: false }, // host left
    b: { playerId: 'b', joinedAt: 2, online: true },
    c: { playerId: 'c', joinedAt: 3 },
  }

  it('starts from the first online seat', () => {
    expect(nextOnlineClueGiver(room, null)).toBe('b')
  })

  it('passes over offline seats when rotating', () => {
    expect(nextOnlineClueGiver(room, 'c')).toBe('b')
    expect(nextOnlineClueGiver(room, 'b')).toBe('c')
  })

  it('falls back to plain rotation when nobody else is online', () => {
    const dark = { a: { playerId: 'a', joinedAt: 1, online: false }, b: { playerId: 'b', joinedAt: 2, online: true } }
    expect(nextOnlineClueGiver(dark, 'b')).toBe('a')
  })

  it('the first round goes to the first online seat', () => {
    expect(firstRound(room).round.clueGiver).toBe('b')
  })
})

// ---------------------------------------------------------------------------
// validateClue
// ---------------------------------------------------------------------------
describe('validateClue', () => {
  const hotCold = { left: 'COLD', right: 'HOT' }

  it('accepts a single word and upper-cases it', () => {
    expect(validateClue('  sauna ', hotCold)).toEqual({ ok: true, clue: 'SAUNA' })
  })

  it('accepts a hyphenated word', () => {
    expect(validateClue('ice-cream', hotCold).ok).toBe(true)
  })

  it('rejects empty, multi-word and over-long clues', () => {
    expect(validateClue('   ', hotCold)).toEqual({ ok: false, error: 'TYPE A CLUE' })
    expect(validateClue('hot tub', hotCold)).toEqual({ ok: false, error: 'ONE WORD ONLY' })
    expect(validateClue('a'.repeat(25), hotCold)).toEqual({ ok: false, error: 'TOO LONG' })
  })

  it('regression: digits are rejected ("73" pointed straight at the number)', () => {
    expect(validateClue('73', hotCold)).toEqual({ ok: false, error: 'NO NUMBERS' })
    expect(validateClue('room4', hotCold).error).toBe('NO NUMBERS')
  })

  it('regression: the pole words are rejected, in any case or inflection', () => {
    for (const clue of ['HOT', 'hot', 'Cold!', 'colds', 'hotter', 'coldest']) {
      expect(validateClue(clue, hotCold)).toEqual({ ok: false, error: "CAN'T USE THE DIAL WORDS" })
    }
  })

  it('rejects any word of a multi-word or hyphenated pole', () => {
    const pair = { left: 'LAZY', right: 'HARD-WORKING' }
    expect(validateClue('hardworking', pair).ok).toBe(false)
    expect(validateClue('working', pair).ok).toBe(false)
    expect(validateClue('laziest', pair).ok).toBe(false)
    expect(validateClue('sloth', pair).ok).toBe(true)
  })

  it('rejects banned words', () => {
    expect(validateClue('shit', hotCold)).toEqual({ ok: false, error: 'PICK ANOTHER WORD' })
  })

  it('rejects punctuation-only input', () => {
    expect(validateClue('!!!', hotCold).ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// clueGiverScore / roundDeltas
// ---------------------------------------------------------------------------
describe('clueGiverScore', () => {
  it('is the rounded mean of the guessers\' scores', () => {
    expect(clueGiverScore([50, 40, 25])).toBe(38) // 38.33
    expect(clueGiverScore([10, 11])).toBe(11)     // 10.5 rounds up
    expect(clueGiverScore({ a: 20, b: 30 })).toBe(25)
  })

  it('is 0 when nobody guessed', () => {
    expect(clueGiverScore([])).toBe(0)
    expect(clueGiverScore(null)).toBe(0)
  })
})

describe('roundDeltas', () => {
  const seatIds = ['giver', 'a', 'b', 'c']

  it('regression: the clue-giver scores the guessers\' mean (they used to score nothing)', () => {
    const deltas = roundDeltas({ guesses: { a: 50, b: 60 }, target: 50, clueGiver: 'giver', seatIds })
    expect(deltas.a).toBe(scoreGuess(50, 50))
    expect(deltas.b).toBe(scoreGuess(60, 50))
    expect(deltas.giver).toBe(Math.round((deltas.a + deltas.b) / 2))
  })

  it('skips guessers who never guessed and averages only real guesses', () => {
    const deltas = roundDeltas({ guesses: { a: 50 }, target: 50, clueGiver: 'giver', seatIds })
    expect(deltas).toEqual({ a: 50, giver: 50 })
  })

  it('gives the clue-giver nothing when no guess landed', () => {
    expect(roundDeltas({ guesses: {}, target: 50, clueGiver: 'giver', seatIds })).toEqual({})
  })

  it('ignores guesses from players no longer seated', () => {
    const deltas = roundDeltas({ guesses: { a: 50, ghost: 50 }, target: 50, clueGiver: 'giver', seatIds })
    expect(deltas).not.toHaveProperty('ghost')
  })

  it('does not credit a clue-giver who left the room', () => {
    const deltas = roundDeltas({ guesses: { a: 50 }, target: 50, clueGiver: 'gone', seatIds })
    expect(deltas).toEqual({ a: 50 })
  })
})

// ---------------------------------------------------------------------------
// matchWinners
// ---------------------------------------------------------------------------
describe('matchWinners', () => {
  const ids = ['p1', 'p2', 'p3']

  it('returns nobody below the target', () => {
    expect(matchWinners({ p1: 199, p2: 150 }, ids, 200)).toEqual([])
  })

  it('regression: the highest score wins when several cross together — not seat order', () => {
    // p1 sits first but p2 finished higher.
    expect(matchWinners({ p1: 205, p2: 230, p3: 100 }, ids, 200)).toEqual(['p2'])
  })

  it('shares the win on an exact tie at the top', () => {
    expect(matchWinners({ p1: 210, p2: 210, p3: 209 }, ids, 200)).toEqual(['p1', 'p2'])
  })

  it('defaults to the Wavelength target', () => {
    expect(matchWinners({ p1: WAVELENGTH_WIN_SCORE }, ids)).toEqual(['p1'])
  })
})

// ---------------------------------------------------------------------------
// Cross-match repeats: room seen history + optional recent list
// ---------------------------------------------------------------------------
describe('normalizeIndexList', () => {
  it('reads arrays and Firebase numeric-keyed objects in index order', () => {
    expect(normalizeIndexList([3, 1])).toEqual([3, 1])
    expect(normalizeIndexList({ 1: 5, 0: 2 })).toEqual([2, 5])
    expect(normalizeIndexList(null)).toEqual([])
  })
})

describe('pickSpectrumIndex', () => {
  it('regression: avoids pairs played recently in this room, not just this match', () => {
    const recent = Array.from({ length: 30 }, (_, i) => i)
    for (let i = 0; i < 200; i++) {
      const idx = pickSpectrumIndex({ used: [], recent, current: 40 })
      expect(recent).not.toContain(idx)
      expect(idx).not.toBe(40)
    }
  })

  it('falls back to "unused this match" when everything is recent', () => {
    const all = Array.from({ length: WAVELENGTH_PAIR_COUNT }, (_, i) => i)
    const used = [0, 1, 2]
    for (let i = 0; i < 100; i++) {
      const idx = pickSpectrumIndex({ used, recent: all, current: 5 })
      expect(used).not.toContain(idx)
      expect(idx).not.toBe(5)
    }
  })

  it('falls back to anything but the current pair when the whole deck was used', () => {
    const all = Array.from({ length: WAVELENGTH_PAIR_COUNT }, (_, i) => i)
    for (let i = 0; i < 50; i++) {
      expect(pickSpectrumIndex({ used: all, recent: all, current: 7 })).not.toBe(7)
    }
  })

  it('regression: a new match opens on a pair the room has not seen', () => {
    const seen = markSeen({}, Array.from({ length: WAVELENGTH_PAIR_COUNT }, (_, i) => i).filter(i => i !== 17))
    for (let i = 0; i < 20; i++) expect(pickSpectrumIndex({ seen })).toBe(17)
  })
})
