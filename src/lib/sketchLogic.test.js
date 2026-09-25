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
  participantGuessers,
  roundDeltas,
  deriveWord,
  acceptedKeys,
  isAcceptedGuess,
  isNearMiss,
  acceptHashes,
  guessMatchesAccept,
  isBannedGuess,
  TIER_MULTIPLIERS,
  tierMultiplier,
  entryForWord,
} from './sketchLogic'
import { SKETCH_WORDS } from './decks/sketch'

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
  it('mid-match: advances artist/cycle and carries used/matchSeed forward', () => {
    const round = { order: ['a', 'b', 'c'], artist: 'a', cycle: 1, used: [1, 2], matchSeed: 'seed1', options: [5, 6, 7] }
    const result = nextRoundState(round)
    expect(result.finished).toBe(false)
    expect(result.round.phase).toBe('choosing')
    expect(result.round.artist).toBe('b')
    expect(result.round.cycle).toBe(1)
    expect(result.round.used).toEqual([1, 2, 5, 6, 7])
    expect(result.round.matchSeed).toBe('seed1')
    expect(result.round.options).toBeNull()
    expect(result.round.commitment).toBeNull()
    expect(result.round.accept).toBeNull()
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

describe('participantGuessers', () => {
  it('keeps disconnected participants eligible for scoring', () => {
    expect(participantGuessers(['artist', 'online', 'offline'], 'artist')).toEqual(['online', 'offline'])
  })

  it('excludes artist without presence input', () => {
    expect(participantGuessers(['a', 'b'], 'b')).toEqual(['a'])
    expect(participantGuessers(null, 'b')).toEqual([])
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
  it('keeps scoring mode and credit when one participant is offline', () => {
    const guesserIds = participantGuessers(['artist', 'online', 'offline'], 'artist')
    const deltas = roundDeltas({
      guesserIds,
      correct: { offline: { at: 10 } },
      artistId: 'artist',
      endsAt: 9999,
    })
    expect(deltas.offline).toBe(100)
    expect(deltas.artist).toBe(25)
  })

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

// ---------------------------------------------------------------------------
// Guess matching — plural/space/hyphen folding, listed alts, near misses
// ---------------------------------------------------------------------------
describe('guess matching', () => {
  const deckEntry = word => {
    const entry = SKETCH_WORDS.find(e => e.word === word)
    if (!entry) throw new Error(`deck is missing "${word}"`)
    return entry
  }

  it('regression: plural, spacing and hyphen variants are accepted', () => {
    // Previously exact-match only: all of these were wrong answers.
    expect(normalize('cats')).not.toBe(normalize('cat'))
    expect(isAcceptedGuess('cats', deckEntry('cat'))).toBe(true)
    expect(isAcceptedGuess('icecream', deckEntry('ice cream'))).toBe(true)
    expect(isAcceptedGuess('Ice-Cream', deckEntry('ice cream'))).toBe(true)
    expect(isAcceptedGuess('yo yo', deckEntry('yo-yo'))).toBe(true)
    expect(isAcceptedGuess('yoyo', deckEntry('yo-yo'))).toBe(true)
    expect(isAcceptedGuess('glass', deckEntry('glasses'))).toBe(true)
    expect(isAcceptedGuess('the cat', deckEntry('cat'))).toBe(true)
  })

  it('regression: the core noun of a phrase is accepted via alts', () => {
    const bath = deckEntry('taking a bath')
    expect(isAcceptedGuess('bath', bath)).toBe(true)
    expect(isAcceptedGuess('bathing', bath)).toBe(true)
    expect(isAcceptedGuess('Taking a bath!', bath)).toBe(true)
    expect(acceptedKeys(bath)).toContain('bath')
  })

  it('wrong answers stay wrong', () => {
    expect(isAcceptedGuess('dog', deckEntry('cat'))).toBe(false)
    expect(isAcceptedGuess('car', deckEntry('cat'))).toBe(false)
    expect(isAcceptedGuess('', deckEntry('cat'))).toBe(false)
    expect(isAcceptedGuess('shower', deckEntry('taking a bath'))).toBe(false)
  })

  it('near misses: one edit from an accepted form, never for accepted or far guesses', () => {
    expect(isNearMiss('elephent', deckEntry('elephant'))).toBe(true)
    expect(isNearMiss('bathe', deckEntry('taking a bath'))).toBe(true)
    expect(isNearMiss('umbrela', deckEntry('umbrella'))).toBe(true)
    expect(isNearMiss('cats', deckEntry('cat'))).toBe(false) // accepted, not "close"
    expect(isNearMiss('giraffe', deckEntry('elephant'))).toBe(false)
    // short keys (< CLOSE_MIN_KEY_LENGTH) only match exactly — "car" is not "close" to "cat"
    expect(isNearMiss('car', deckEntry('cat'))).toBe(false)
  })

  it('hashed accept set matches exactly the accepted keys', async () => {
    const entry = deckEntry('taking a bath')
    const { salt } = await commit(normalize(entry.word))
    const accept = await acceptHashes(entry, salt)
    expect(accept).toHaveLength(acceptedKeys(entry).length)
    expect(await guessMatchesAccept('bath', accept, salt)).toBe(true)
    expect(await guessMatchesAccept('Taking-a-Bath', accept, salt)).toBe(true)
    expect(await guessMatchesAccept('shower', accept, salt)).toBe(false)
    expect(await guessMatchesAccept('bath', accept, 'wrong-salt')).toBe(false)
    expect(await guessMatchesAccept('bath', null, salt)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Tier multiplier — harder words pay more
// ---------------------------------------------------------------------------
describe('tier multiplier', () => {
  it('EASY ×1, MEDIUM ×1.2, HARD ×1.5; unknown tiers ×1', () => {
    expect(TIER_MULTIPLIERS).toEqual({ 1: 1, 2: 1.2, 3: 1.5 })
    expect(tierMultiplier(1)).toBe(1)
    expect(tierMultiplier(2)).toBe(1.2)
    expect(tierMultiplier(3)).toBe(1.5)
    expect(tierMultiplier(undefined)).toBe(1)
  })

  it('regression: a HARD word scores more than an EASY one for the same solves', () => {
    const correct = { g1: { at: 1000 }, g2: { at: 2000 }, g3: { at: 3000 } }
    const args = { guesserIds: ['g1', 'g2', 'g3'], correct, artistId: 'artist', endsAt: 9999 }
    const easy = roundDeltas({ ...args, multiplier: tierMultiplier(1) })
    const hard = roundDeltas({ ...args, multiplier: tierMultiplier(3) })
    expect(easy).toEqual({ g1: 100, g2: 90, g3: 80, artist: 75 })
    expect(hard).toEqual({ g1: 150, g2: 135, g3: 120, artist: 113 })
    const medium = roundDeltas({ ...args, multiplier: tierMultiplier(2) })
    expect(medium).toEqual({ g1: 120, g2: 108, g3: 96, artist: 90 })
  })

  it('scales the 2-player variant too, and omitting it keeps ×1', () => {
    const endsAt = 100000
    const correct = { g1: { at: endsAt - DRAW_MS } } // instant solve: 100 pts, artist 50
    const base = roundDeltas({ guesserIds: ['g1'], correct, artistId: 'artist', endsAt })
    expect(base).toEqual({ g1: 100, artist: 50 })
    expect(roundDeltas({ guesserIds: ['g1'], correct, artistId: 'artist', endsAt, multiplier: 1.5 }))
      .toEqual({ g1: 150, artist: 75 })
  })

  it('entryForWord finds the drawn entry among the public options', () => {
    const deck = [{ word: 'cat', tier: 1 }, { word: 'dragon', tier: 2 }, { word: 'narwhal', tier: 3 }]
    expect(entryForWord(deck, [0, 1, 2], 'narwhal')).toEqual({ word: 'narwhal', tier: 3 })
    expect(entryForWord(deck, [0, 1], 'narwhal')).toBeNull()
    expect(entryForWord(deck, [0, 1, 2], null)).toBeNull()
  })
})

describe('isBannedGuess', () => {
  it('keeps slurs and vulgarity out of the public chat', () => {
    expect(isBannedGuess('shit')).toBe(true)
    expect(isBannedGuess('what the fuck')).toBe(true)
    expect(isBannedGuess('f-u-c-k')).toBe(true)
  })
  it('allows ordinary guesses', () => {
    expect(isBannedGuess('scuba diver')).toBe(false)
    expect(isBannedGuess('cat')).toBe(false)
    expect(isBannedGuess('')).toBe(false)
  })
})
