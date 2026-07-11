import { describe, it, expect } from 'vitest'
import { commit } from './commit'
import {
  DRAW_MS,
  normalize,
  wordPattern,
  quantize,
  dequantize,
  pickOptions,
  nextArtist,
  cyclesFor,
  matchOver,
  nextRoundState,
  activeGuessers,
  roundDeltas,
  deriveWord,
} from './sketchLogic'

// ---------------------------------------------------------------------------
// normalize
// ---------------------------------------------------------------------------
describe('normalize', () => {
  it('lowercases and trims', () => {
    expect(normalize('  Cat  ')).toBe('cat')
  })

  it('collapses internal whitespace', () => {
    expect(normalize('multiple    spaces')).toBe('multiple spaces')
  })

  it('strips punctuation without fracturing tokens', () => {
    expect(normalize("writer's block")).toBe('writers block')
  })

  it('returns "" for null/undefined', () => {
    expect(normalize(null)).toBe('')
    expect(normalize(undefined)).toBe('')
  })
})

// ---------------------------------------------------------------------------
// wordPattern
// ---------------------------------------------------------------------------
describe('wordPattern', () => {
  it('single word', () => {
    expect(wordPattern('sunglasses')).toBe('10')
  })

  it('two words', () => {
    expect(wordPattern('hot dog')).toBe('3 3')
  })

  it('counts punctuation as part of a token\'s raw length', () => {
    // NOTE: spec §3b/§7 give this example as "9 5", but "writer's".length is
    // actually 8 (w-r-i-t-e-r-'-s) under the specified .length-based algorithm
    // (verbatim pseudocode, §4) — an arithmetic typo in the spec text, not a
    // deviation in this implementation. See builder's openIssues.
    expect(wordPattern("writer's block")).toBe('8 5')
  })

  it('ignores extra whitespace', () => {
    expect(wordPattern('  Ice   Cream  ')).toBe('3 5')
  })
})

// ---------------------------------------------------------------------------
// quantize / dequantize
// ---------------------------------------------------------------------------
describe('quantize / dequantize', () => {
  it('roundtrips every integer 0..255', () => {
    for (let i = 0; i <= 255; i++) {
      expect(quantize(dequantize(i))).toBe(i)
    }
  })

  it('clamps out-of-range fractions', () => {
    expect(quantize(-0.5)).toBe(0)
    expect(quantize(1.5)).toBe(255)
  })
})

// ---------------------------------------------------------------------------
// pickOptions
// ---------------------------------------------------------------------------
describe('pickOptions', () => {
  const deck = [
    { word: 't1a', tier: 1 }, { word: 't1b', tier: 1 }, { word: 't1c', tier: 1 },
    { word: 't2a', tier: 2 }, { word: 't2b', tier: 2 }, { word: 't2c', tier: 2 },
    { word: 't3a', tier: 3 }, { word: 't3b', tier: 3 }, { word: 't3c', tier: 3 },
  ]

  it('is deterministic for the same (deck, seed, used)', () => {
    expect(pickOptions(deck, 42)).toEqual(pickOptions(deck, 42))
    expect(pickOptions(deck, 42, [0])).toEqual(pickOptions(deck, 42, [0]))
  })

  it('excludes indices already in `used`', () => {
    const used = [0, 3, 6]
    const picks = pickOptions(deck, 7, used)
    for (const i of picks) expect(used).not.toContain(i)
  })

  it('offers one word per tier: result[0]/[1]/[2] map to tier 1/2/3', () => {
    const picks = pickOptions(deck, 3)
    expect(picks).toHaveLength(3)
    expect(deck[picks[0]].tier).toBe(1)
    expect(deck[picks[1]].tier).toBe(2)
    expect(deck[picks[2]].tier).toBe(3)
  })

  it('falls back to another tier when a tier pool is exhausted', () => {
    const tinyDeck = [
      { word: 'only1', tier: 1 },
      { word: 'only2a', tier: 2 }, { word: 'only2b', tier: 2 },
      { word: 'only3', tier: 3 },
    ]
    const used = [0] // the only tier-1 entry is already used
    const picks = pickOptions(tinyDeck, 1, used)
    expect(picks).toHaveLength(3)
    expect(new Set(picks).size).toBe(3)
    expect(picks).not.toContain(0)
  })

  it('falls back to reuse when the entire deck is exhausted', () => {
    const tinyDeck = [
      { word: 'a', tier: 1 }, { word: 'b', tier: 2 }, { word: 'c', tier: 3 },
    ]
    const used = [0, 1, 2] // everything already used
    const picks = pickOptions(tinyDeck, 1, used)
    expect(picks).toHaveLength(3)
    expect(new Set(picks).size).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// nextArtist / cyclesFor / matchOver
// ---------------------------------------------------------------------------
describe('nextArtist', () => {
  it('middle-of-order wraps to the next seat', () => {
    expect(nextArtist(['a', 'b', 'c'], 'a')).toBe('b')
    expect(nextArtist(['a', 'b', 'c'], 'b')).toBe('c')
  })

  it('last-seat wraps to order[0]', () => {
    expect(nextArtist(['a', 'b', 'c'], 'c')).toBe('a')
  })

  it('falls back to order[0] if artist is not present in order', () => {
    expect(nextArtist(['a', 'b', 'c'], 'zzz')).toBe('a')
  })
})

describe('cyclesFor', () => {
  it('is 3 for exactly 2 players', () => {
    expect(cyclesFor(2)).toBe(3)
  })
  it('is 2 for 3+ players', () => {
    expect(cyclesFor(3)).toBe(2)
    expect(cyclesFor(8)).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// matchOver / rotation simulations
// ---------------------------------------------------------------------------
describe('matchOver / rotation — 2 players (cyclesFor = 3, 6 rounds)', () => {
  it('simulates the full 6-round sequence', () => {
    const order = ['a', 'b']
    const expectedArtists = ['a', 'b', 'a', 'b', 'a', 'b']
    const expectedCycles = [1, 1, 2, 2, 3, 3]

    let round = { order, artist: order[0], cycle: 1, used: [], options: [900, 901, 902] }
    for (let i = 0; i < 6; i++) {
      expect(round.artist).toBe(expectedArtists[i])
      expect(round.cycle).toBe(expectedCycles[i])
      const isLast = i === 5
      expect(matchOver(round.order, round.artist, round.cycle)).toBe(isLast)
      if (!isLast) {
        const next = nextRoundState(round)
        expect(next.finished).toBe(false)
        round = { ...next.round, options: [i * 10 + 100, i * 10 + 101, i * 10 + 102] }
      } else {
        expect(nextRoundState(round)).toEqual({ finished: true })
      }
    }
  })
})

describe('matchOver / rotation — 5 players (cyclesFor = 2, 10 rounds)', () => {
  it('simulates the full 10-round sequence', () => {
    const order = ['a', 'b', 'c', 'd', 'e']
    const expectedArtists = ['a', 'b', 'c', 'd', 'e', 'a', 'b', 'c', 'd', 'e']
    const expectedCycles = [1, 1, 1, 1, 1, 2, 2, 2, 2, 2]

    let round = { order, artist: order[0], cycle: 1, used: [], options: [900, 901, 902] }
    for (let i = 0; i < 10; i++) {
      expect(round.artist).toBe(expectedArtists[i])
      expect(round.cycle).toBe(expectedCycles[i])
      const isLast = i === 9
      expect(matchOver(round.order, round.artist, round.cycle)).toBe(isLast)
      if (!isLast) {
        const next = nextRoundState(round)
        expect(next.finished).toBe(false)
        round = { ...next.round, options: [i * 10 + 100, i * 10 + 101, i * 10 + 102] }
      } else {
        expect(nextRoundState(round)).toEqual({ finished: true })
      }
    }
  })
})

describe('nextRoundState', () => {
  it('mid-match: advances artist/cycle and carries used forward', () => {
    const round = { order: ['a', 'b', 'c'], artist: 'a', cycle: 1, used: [1, 2], options: [5, 6, 7] }
    const result = nextRoundState(round)
    expect(result.finished).toBe(false)
    expect(result.round.phase).toBe('choosing')
    expect(result.round.artist).toBe('b')
    expect(result.round.cycle).toBe(1)
    expect(result.round.used).toEqual([1, 2, 5, 6, 7])
    expect(result.round.options).toBeNull()
    expect(result.round.commitment).toBeNull()
    expect(result.round.wordPattern).toBe('')
    expect(result.round.scored).toBe(false)
  })

  it('final round of the match returns { finished: true }', () => {
    const round = { order: ['a', 'b'], artist: 'b', cycle: 3, used: [1], options: [2, 3, 4] }
    expect(nextRoundState(round)).toEqual({ finished: true })
  })
})

// ---------------------------------------------------------------------------
// activeGuessers
// ---------------------------------------------------------------------------
describe('activeGuessers', () => {
  it('excludes the artist', () => {
    const players = { a: { online: true }, b: { online: true }, c: { online: true } }
    expect(activeGuessers(players, ['a', 'b', 'c'], 'a').sort()).toEqual(['b', 'c'])
  })

  it('falls back to the full guesser list when none are online', () => {
    const players = { a: { online: true }, b: { online: false }, c: { online: false } }
    expect(activeGuessers(players, ['a', 'b', 'c'], 'a').sort()).toEqual(['b', 'c'])
  })

  it('returns only the online subset otherwise', () => {
    const players = { a: { online: true }, b: { online: true }, c: { online: false } }
    expect(activeGuessers(players, ['a', 'b', 'c'], 'a')).toEqual(['b'])
  })
})

// ---------------------------------------------------------------------------
// roundDeltas — 2-player (1 guesser) time-scaled variant, boundaries
// ---------------------------------------------------------------------------
describe('roundDeltas — 2-player (1 guesser)', () => {
  const endsAt = 1_000_000

  it('instant guess (guessed the moment drawing started) scores max', () => {
    const correct = { g1: { at: endsAt - DRAW_MS } }
    const deltas = roundDeltas({ guesserIds: ['g1'], correct, artistId: 'artist', endsAt })
    expect(deltas.g1).toBe(100)
    expect(deltas.artist).toBe(50)
  })

  it('last-second guess (at === endsAt) scores the floor', () => {
    const correct = { g1: { at: endsAt } }
    const deltas = roundDeltas({ guesserIds: ['g1'], correct, artistId: 'artist', endsAt })
    expect(deltas.g1).toBe(50)
    expect(deltas.artist).toBe(25)
  })

  it('timeout (no correct entry at all) scores {} for both', () => {
    const deltas = roundDeltas({ guesserIds: ['g1'], correct: {}, artistId: 'artist', endsAt })
    expect(deltas).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// roundDeltas — 3+ guessers
// ---------------------------------------------------------------------------
describe('roundDeltas — 3+ guessers', () => {
  it('ranks by `at` ascending: 100/90/80, artist +25 per correct guesser', () => {
    const correct = { g1: { at: 10 }, g2: { at: 20 }, g3: { at: 30 } }
    const deltas = roundDeltas({ guesserIds: ['g1', 'g2', 'g3'], correct, artistId: 'artist', endsAt: 9999 })
    expect(deltas.g1).toBe(100)
    expect(deltas.g2).toBe(90)
    expect(deltas.g3).toBe(80)
    expect(deltas.artist).toBe(75)
  })

  it('tie-breaks identical `at` by uid string ascending', () => {
    const correct = { z: { at: 5 }, a: { at: 5 } }
    const deltas = roundDeltas({ guesserIds: ['z', 'a'], correct, artistId: 'artist', endsAt: 9999 })
    expect(deltas.a).toBe(100)
    expect(deltas.z).toBe(90)
  })

  it('floors at 50 for 6th place or later', () => {
    const guesserIds = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7']
    const correct = {}
    guesserIds.forEach((id, i) => { correct[id] = { at: i } })
    const deltas = roundDeltas({ guesserIds, correct, artistId: 'artist', endsAt: 9999 })
    expect(deltas.g6).toBe(50)
    expect(deltas.g7).toBe(50)
  })

  it('nobody guessed correctly → {} (artist also 0)', () => {
    const deltas = roundDeltas({ guesserIds: ['g1', 'g2'], correct: {}, artistId: 'artist', endsAt: 9999 })
    expect(deltas).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// deriveWord — real commit()
// ---------------------------------------------------------------------------
describe('deriveWord', () => {
  const deck = [
    { word: 'cat', tier: 1 },
    { word: 'dog', tier: 1 },
    { word: 'time travel', tier: 3 },
  ]

  it('derives the chosen candidate from options + a real commitment', async () => {
    const { hash, salt } = await commit(normalize('dog'))
    const word = await deriveWord(deck, [0, 1, 2], { hash, salt })
    expect(word).toBe('dog')
  })

  it('derives a multi-word candidate too', async () => {
    const { hash, salt } = await commit(normalize('time travel'))
    const word = await deriveWord(deck, [0, 1, 2], { hash, salt })
    expect(word).toBe('time travel')
  })

  it('returns null when the commitment matches none of the candidates (corrupted state)', async () => {
    const { hash, salt } = await commit(normalize('elephant'))
    const word = await deriveWord(deck, [0, 1, 2], { hash, salt })
    expect(word).toBeNull()
  })
})
