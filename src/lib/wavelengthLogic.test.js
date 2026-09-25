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
  roundDeltas,
  addScores,
  findClincher,
  advanceAfterReveal,
  skipRound,
  beginMatch,
  WAVELENGTH_WIN_SCORE,
  WAVELENGTH_SEEN_KEY,
} from './wavelengthLogic'
import { markSeen } from './seenHistory'

// ---------------------------------------------------------------------------
// deck
// ---------------------------------------------------------------------------
describe('WAVELENGTH_PAIRS deck', () => {
  it('has at least 30 pairs', () => {
    expect(WAVELENGTH_PAIRS.length).toBeGreaterThanOrEqual(30)
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

describe('roundDeltas / addScores / findClincher', () => {
  it('scores only guessers who locked in', () => {
    expect(roundDeltas({ b: 50, c: null }, ['b', 'c'], 50)).toEqual({ b: 50 })
  })

  it('adds deltas without mutating', () => {
    const scores = { b: 10 }
    expect(addScores(scores, { b: 5, c: 1 })).toEqual({ b: 15, c: 1 })
    expect(scores).toEqual({ b: 10 })
  })

  it('finds the first seat past the win score', () => {
    expect(findClincher(['a', 'b'], { b: WAVELENGTH_WIN_SCORE })).toBe('b')
    expect(findClincher(['a', 'b'], { b: WAVELENGTH_WIN_SCORE - 1 })).toBeNull()
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

  it('scores guessers (never the clue-giver), rotates and records the spectrum', () => {
    const next = advanceAfterReveal(revealed())
    expect(next.scores).toEqual({ b: 50, c: 0 })
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
