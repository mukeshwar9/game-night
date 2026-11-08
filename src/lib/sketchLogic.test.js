import { describe, it, expect } from 'vitest'
import { commit } from './commit'
import {
  DRAW_MS,
  sketchChatLock,
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
  pickRoundOptions,
  scoringWindow,
  acceptedKeys,
  isAcceptedGuess,
  isNearMiss,
  acceptHashes,
  guessMatchesAccept,
  isBannedGuess,
  TIER_MULTIPLIERS,
  tierMultiplier,
  entryForWord,
  HINT_AT,
  HINT_MAX_FRACTION,
  letterPositions,
  hintBudget,
  planHints,
  hintDueAt,
  normalizeHints,
  nextHintToPublish,
  blankCells,
  MAX_HINTS,
  roundCycles,
  roundDrawBase,
  roundHintCount,
  cells,
} from './sketchLogic'
import { markSeen } from './seenHistory'
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

  it('keeps accents and vowel signs, however they were typed', () => {
    expect(normalize('Cafe\u0301')).toBe('café')
    expect(normalize('नमस्ते!')).toBe('नमस्ते')
    expect(normalize('काल')).not.toBe(normalize('कल'))
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
    expect(result.round.hints).toBeNull()
    expect(result.round.revealAt).toBeNull()
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
// room seen history + timer scale
// ---------------------------------------------------------------------------
describe('pickRoundOptions', () => {
  const deck = Array.from({ length: 30 }, (_, i) => ({ word: `w${i}`, tier: (i % 3) + 1 }))

  it('never offers a word this room was offered in an earlier match while fresh ones remain', () => {
    const seen = markSeen({}, Array.from({ length: 24 }, (_, i) => i))
    const picks = pickRoundOptions(deck, 99, [], seen)
    expect(picks).toHaveLength(3)
    for (const i of picks) expect(i).toBeGreaterThanOrEqual(24)
  })

  it('still honours this match\'s used list', () => {
    const picks = pickRoundOptions(deck, 5, [0, 1, 2, 3, 4, 5], {})
    for (const i of picks) expect(i).toBeGreaterThan(5)
  })

  it('once the room has seen (nearly) everything, avoids the most recent half', () => {
    const seen = markSeen({}, Array.from({ length: 30 }, (_, i) => i)) // 29 newest
    const picks = pickRoundOptions(deck, 11, [], seen)
    for (const i of picks) expect(i).toBeLessThan(15)
  })

  it('is deterministic for the same seed and room state', () => {
    const seen = markSeen({}, [3, 7])
    expect(pickRoundOptions(deck, 42, [1], seen)).toEqual(pickRoundOptions(deck, 42, [1], seen))
  })

  it('matches pickOptions exactly for a room with no history', () => {
    expect(pickRoundOptions(deck, 42, [1], null)).toEqual(pickOptions(deck, 42, [1]))
  })
})

describe('scoringWindow + roundDeltas drawMs', () => {
  it('uses drawStartedAt + drawMs when present (relaxed or timers-off rounds)', () => {
    expect(scoringWindow({ drawStartedAt: 1000, drawMs: 150000, endsAt: null })).toEqual({ endsAt: 151000, drawMs: 150000 })
  })

  it('falls back to the drawing deadline for older rounds', () => {
    expect(scoringWindow({ endsAt: 5000 })).toEqual({ endsAt: 5000, drawMs: DRAW_MS })
    expect(scoringWindow({ endsAt: 9 }, 5000)).toEqual({ endsAt: 5000, drawMs: DRAW_MS })
  })

  it('a relaxed room\'s speed bonus decays over its longer clock', () => {
    const drawMs = DRAW_MS * 2
    const endsAt = 1_000_000
    const halfway = { g1: { at: endsAt - drawMs / 2 } }
    const deltas = roundDeltas({ guesserIds: ['g1'], correct: halfway, artistId: 'artist', endsAt, drawMs })
    expect(deltas.g1).toBe(75)
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

describe('roundDeltas drawMs + multiplier together', () => {
  it('scales a relaxed-clock solo solve by the tier multiplier', () => {
    const drawMs = DRAW_MS * 2
    const endsAt = 1_000_000
    const halfway = { g1: { at: endsAt - drawMs / 2 } }
    const deltas = roundDeltas({ guesserIds: ['g1'], correct: halfway, artistId: 'artist', endsAt, drawMs, multiplier: 1.5 })
    expect(deltas).toEqual({ g1: 113, artist: 56 })
  })
})

describe('sketchChatLock', () => {
  it('locks room chat for the artist while choosing and drawing', () => {
    expect(sketchChatLock({ artist: 'a', phase: 'choosing' }, 'a')).toMatch(/DRAWING/)
    expect(sketchChatLock({ artist: 'a', phase: 'drawing' }, 'a')).toMatch(/DRAWING/)
  })
  it('leaves guessers, the reveal and an empty round alone', () => {
    expect(sketchChatLock({ artist: 'a', phase: 'drawing' }, 'b')).toBeNull()
    expect(sketchChatLock({ artist: 'a', phase: 'reveal' }, 'a')).toBeNull()
    expect(sketchChatLock(null, 'a')).toBeNull()
    expect(sketchChatLock({ artist: 'a', phase: 'drawing' }, '')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Letter hints
// ---------------------------------------------------------------------------
describe('letter hints', () => {
  const round = { phase: 'drawing', drawStartedAt: 1000, drawMs: 80000 }

  it('lands at half time and three quarters, capped at a third of the letters', () => {
    expect(HINT_AT).toEqual([0.5, 0.75])
    expect(HINT_MAX_FRACTION).toBeCloseTo(1 / 3)
    expect(hintDueAt(round, 0)).toBe(41000)
    expect(hintDueAt(round, 1)).toBe(61000)
    expect(hintDueAt(round, 2)).toBeNull()
    expect(hintDueAt({ phase: 'drawing' }, 0)).toBeNull()
    expect(hintDueAt({ drawStartedAt: 1, drawMs: 0 }, 0)).toBeNull()
  })

  it('counts letters only, across the words, with no gaps', () => {
    expect(letterPositions('hot dog')).toEqual([0, 1, 2, 3, 4, 5])
    expect(letterPositions("it's")).toEqual([0, 1, 3])
    expect(letterPositions('')).toEqual([])
    expect(letterPositions('R2D2')).toEqual([0, 2])
  })

  it('never reveals more than a third of the letters, and none of a tiny word', () => {
    expect(hintBudget('at')).toBe(0)
    expect(hintBudget('cat')).toBe(1)
    expect(hintBudget('house')).toBe(1)
    expect(hintBudget('rainbow')).toBe(2)
    expect(hintBudget('fire escape')).toBe(2)
    for (const e of SKETCH_WORDS) {
      const letters = letterPositions(e.word).length
      expect(planHints(e.word, 7).length).toBeLessThanOrEqual(Math.floor(letters / 3))
      expect(planHints(e.word, 7).length).toBeLessThanOrEqual(2)
    }
  })

  it('plans distinct real letters of the word, the same every time for one seed', () => {
    const word = 'Fire Escape'
    const plan = planHints(word, 12345)
    expect(plan).toEqual(planHints(word, 12345))
    expect(plan).toHaveLength(2)
    expect(new Set(plan.map(h => h.i)).size).toBe(2)
    const flat = 'FireEscape'
    plan.forEach(h => expect(flat[h.i].toLowerCase()).toBe(h.c))
    expect(planHints('at', 1)).toEqual([])
  })

  it('does not publish before the moment, then one hint at a time in order', () => {
    const base = { word: 'rainbow', seed: 9, round, published: [] }
    expect(nextHintToPublish({ ...base, now: 40999 })).toBeNull()
    const first = nextHintToPublish({ ...base, now: 41000 })
    expect(first).toMatchObject({ n: 0 })
    expect(first.c).toBe(planHints('rainbow', 9)[0].c)
    // still only the first one until its slot is filled
    expect(nextHintToPublish({ ...base, now: 90000 })).toMatchObject({ n: 0 })
    const published = [{ n: 0, i: first.i, c: first.c }]
    expect(nextHintToPublish({ ...base, published, now: 60999 })).toBeNull()
    expect(nextHintToPublish({ ...base, published, now: 61000 })).toMatchObject({ n: 1 })
    const both = [...published, { n: 1, i: 0, c: 'x' }]
    expect(nextHintToPublish({ ...base, published: both, now: 99999 })).toBeNull()
  })

  it('publishes nothing outside the drawing phase, without a word, or for a short word', () => {
    const base = { word: 'rainbow', seed: 9, round, published: [], now: 99999 }
    expect(nextHintToPublish({ ...base, round: { ...round, phase: 'reveal' } })).toBeNull()
    expect(nextHintToPublish({ ...base, round: { ...round, phase: 'choosing' } })).toBeNull()
    expect(nextHintToPublish({ ...base, word: null })).toBeNull()
    expect(nextHintToPublish({ ...base, word: 'ox' })).toBeNull()
  })

  it('reads hints back by key, dropping anything malformed or out of range', () => {
    const raw = { 1: { i: 4, c: 'b' }, 0: { i: 2, c: 'i' }, 2: { i: 0, c: 'z' }, x: { i: 0, c: 'a' } }
    expect(normalizeHints(raw)).toEqual([{ n: 0, i: 2, c: 'i' }, { n: 1, i: 4, c: 'b' }])
    expect(normalizeHints(raw, '7')).toHaveLength(2)
    expect(normalizeHints({ 0: { i: 7, c: 'a' } }, '7')).toEqual([])
    expect(normalizeHints({ 0: { i: 1, c: 'ab' } })).toEqual([])
    expect(normalizeHints({ 0: { i: 1, c: '7' } })).toEqual([])
    expect(normalizeHints({ 0: { i: 1.5, c: 'a' } })).toEqual([])
    expect(normalizeHints(null)).toEqual([])
    expect(normalizeHints(undefined)).toEqual([])
    // Firebase may hand a sparse list back as an array with a hole
    expect(normalizeHints([undefined, { i: 3, c: 'w' }])).toEqual([{ n: 1, i: 3, c: 'w' }])
  })

  it('draws the blanks per word and fills in a hint letter', () => {
    expect(blankCells('3 3')).toEqual([
      [{ ch: '', hint: false }, { ch: '', hint: false }, { ch: '', hint: false }],
      [{ ch: '', hint: false }, { ch: '', hint: false }, { ch: '', hint: false }],
    ])
    const cells = blankCells('3 3', [{ n: 0, i: 4, c: 'o' }])
    expect(cells[1][1]).toEqual({ ch: 'o', hint: true })
    expect(cells.flat().filter(c => c.hint)).toHaveLength(1)
    expect(blankCells('', [])).toEqual([])
  })

  it('every deck word still needs the hint to be a guess, never the whole word', () => {
    for (const e of SKETCH_WORDS) {
      const letters = letterPositions(e.word).length
      expect(hintBudget(e.word)).toBeLessThan(Math.max(letters, 1))
    }
  })
})

// ---------------------------------------------------------------------------
// Match setup carried by the round (round.cycles / drawBase / hintCount)
// ---------------------------------------------------------------------------
describe('round match setup', () => {
  it('reads the snapshot, falling back to today\'s rule for older rounds or bad values', () => {
    expect(roundCycles({ order: ['a', 'b', 'c'], cycles: 1 })).toBe(1)
    expect(roundCycles({ order: ['a', 'b'], cycles: 2 })).toBe(2)
    expect(roundCycles({ order: ['a', 'b'] })).toBe(cyclesFor(2))
    expect(roundCycles({ order: ['a', 'b', 'c'] })).toBe(cyclesFor(3))
    for (const bad of [0, 4, 1.5, '2', null]) expect(roundCycles({ order: ['a', 'b', 'c'], cycles: bad })).toBe(2)
    expect(roundCycles(null)).toBe(cyclesFor(0))

    expect(roundDrawBase({ drawBase: 45000 })).toBe(45000)
    expect(roundDrawBase({ drawBase: 120000 })).toBe(120000)
    for (const bad of [undefined, 0, 44999, 120001, '60000', 60000.5]) expect(roundDrawBase({ drawBase: bad })).toBe(DRAW_MS)

    expect(roundHintCount({ hintCount: 0 })).toBe(0)
    expect(roundHintCount({ hintCount: 1 })).toBe(1)
    for (const bad of [undefined, null, 3, -1, '1']) expect(roundHintCount({ hintCount: bad })).toBe(MAX_HINTS)
  })

  it('matchOver takes the stored cycle count, today\'s cyclesFor when absent', () => {
    expect(matchOver(['a', 'b', 'c'], 'c', 1, 1)).toBe(true)
    expect(matchOver(['a', 'b', 'c'], 'c', 1)).toBe(false)
    expect(matchOver(['a', 'b'], 'b', 2, 2)).toBe(true)
    expect(matchOver(['a', 'b'], 'b', 2)).toBe(false)
    expect(matchOver(['a', 'b', 'c'], 'b', 3, 3)).toBe(false) // not the last seat
  })

  it('plays exactly order × cycles rounds and carries the setup into every round', () => {
    for (const [order, cycles] of [[['a', 'b', 'c'], 1], [['a', 'b', 'c', 'd'], 3], [['a', 'b'], 1], [['a', 'b'], 2]]) {
      let round = { order, artist: order[0], cycle: 1, used: [], matchSeed: 's', options: [1, 2, 3], cycles, drawBase: 45000, hintCount: 1 }
      let rounds = 1
      for (;;) {
        const next = nextRoundState(round)
        if (next.finished) break
        rounds++
        expect(next.round).toMatchObject({ cycles, drawBase: 45000, hintCount: 1 })
        round = { ...next.round, options: [rounds * 3, rounds * 3 + 1, rounds * 3 + 2] }
        expect(rounds).toBeLessThanOrEqual(order.length * cycles)
      }
      expect(rounds).toBe(order.length * cycles)
    }
  })

  it('an older round with no snapshot keeps today\'s length and gains no setup keys', () => {
    const next = nextRoundState({ order: ['a', 'b'], artist: 'b', cycle: 2, used: [], options: [], matchSeed: 's' })
    expect(next.finished).toBe(false)
    expect(next.round.cycle).toBe(3)
    expect('cycles' in next.round).toBe(false)
    expect('drawBase' in next.round).toBe(false)
    expect('hintCount' in next.round).toBe(false)
    expect(Object.values(next.round).includes(undefined)).toBe(false)
  })

  it('hint count 1 publishes only the half-time hint, 0 publishes none', () => {
    const round = { phase: 'drawing', drawStartedAt: 1000, drawMs: 80000 }
    const word = 'rainbow'
    expect(hintBudget(word, 1)).toBe(1)
    expect(hintBudget(word, 0)).toBe(0)
    expect(hintBudget(word, 9)).toBe(hintBudget(word)) // off-menu reads as the default
    expect(planHints(word, 9, 1)).toEqual(planHints(word, 9).slice(0, 1))
    expect(planHints(word, 9, 0)).toEqual([])

    const one = { word, seed: 9, round: { ...round, hintCount: 1 }, now: 99999 }
    expect(nextHintToPublish({ ...one, published: [] })).toMatchObject({ n: 0 })
    expect(nextHintToPublish({ ...one, published: [{ n: 0, i: 0, c: 'r' }] })).toBeNull()
    expect(nextHintToPublish({ word, seed: 9, round: { ...round, hintCount: 0 }, published: [], now: 99999 })).toBeNull()
    expect(nextHintToPublish({ word, seed: 9, round: { ...round, hintCount: 2 }, published: [{ n: 0, i: 0, c: 'r' }], now: 99999 })).toMatchObject({ n: 1 })
  })

  it('hints follow a shorter drawing clock', () => {
    const round = { phase: 'drawing', drawStartedAt: 0, drawMs: 45000 }
    expect(hintDueAt(round, 0)).toBe(22500)
    expect(hintDueAt(round, 1)).toBe(33750)
  })
})

// ---------------------------------------------------------------------------
// Custom words (sketchWordsLogic): the round's `custom` snapshot rides along,
// and words in other scripts or with accents still get sensible blanks,
// hints and guess matching.
// ---------------------------------------------------------------------------
describe('custom words in the round', () => {
  const custom = { by: 'a', mode: 'mix', list: ['grandma', 'tuk tuk'] }

  it('carries the custom words into every next round', () => {
    const next = nextRoundState({ order: ['a', 'b', 'c'], artist: 'a', cycle: 1, used: [], options: [1, 280, 3], matchSeed: 's', custom })
    expect(next.round.custom).toEqual(custom)
    expect(next.round.used).toEqual([1, 280, 3])
    const plain = nextRoundState({ order: ['a', 'b', 'c'], artist: 'a', cycle: 1, used: [], options: [], matchSeed: 's' })
    expect('custom' in plain.round).toBe(false)
  })

  it('counts a letter and its combining marks as one blank', () => {
    expect(cells('cafe\u0301')).toEqual(['c', 'a', 'f', 'e\u0301'])
    expect(wordPattern('cafe\u0301')).toBe('4')
    expect(wordPattern('café')).toBe('4')
    expect(wordPattern('नमस्ते')).toBe('4') // न, म, स्, ते — each consonant with its own marks
    expect(wordPattern('crème brûlée')).toBe('5 6')
    expect(wordPattern('hot dog')).toBe('3 3') // plain words count as before
    for (const e of SKETCH_WORDS) expect(wordPattern(e.word)).toBe(e.word.trim().split(/\s+/).map(w => w.length).join(' '))
  })

  it('hints only single-character letters, at cell positions that match the blanks', () => {
    expect(letterPositions('cafe\u0301')).toEqual([0, 1, 2]) // the accented cell is never a hint
    expect(letterPositions('café')).toEqual([0, 1, 2, 3])
    const word = 'crème brûlée'
    const total = wordPattern(word).split(' ').reduce((n, t) => n + Number(t), 0)
    for (let seed = 0; seed < 20; seed++) {
      for (const h of planHints(word, seed)) {
        expect(h.i).toBeLessThan(total)
        expect(h.c.length).toBe(1)
        const flat = blankCells(wordPattern(word), [h]).flat()
        expect(flat[h.i]).toEqual({ ch: h.c, hint: true })
      }
    }
  })

  it('accepts folded forms of accented Latin words, exact matches for other scripts', async () => {
    expect(acceptedKeys({ word: 'crème brûlée' })).toEqual(['cremebrulee'])
    expect(isAcceptedGuess('creme brulee', { word: 'crème brûlée' })).toBe(true)
    // matchKey cannot read Devanagari: no accept hashes, the commitment's exact match decides
    expect(acceptedKeys({ word: 'नमस्ते' })).toEqual([])
    expect(acceptedKeys({ word: 'naïve 日本' })).toEqual([])
    expect(await acceptHashes({ word: 'नमस्ते' }, 'salt')).toEqual([])
    const { hash, salt } = await commit(normalize('नमस्ते'))
    expect(await deriveWord([{ word: 'नमस्ते', tier: 1 }], [0], { hash, salt })).toBe('नमस्ते')
  })
})
