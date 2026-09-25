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
  validateClue,
  clueGiverScore,
  roundDeltas,
  matchWinners,
  WAVELENGTH_WIN_SCORE,
} from './wavelengthLogic'

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
