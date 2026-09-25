import { describe, expect, it } from 'vitest'
import { PASSWORD_DECK } from './decks/password'
import { matchKey } from './textMatchLogic'
import { isFamilySafe } from './wordDenylist'
import {
  CLUE_MS, CLUE_POINTS, CLUE_SECONDS, GUESS_SECONDS, MAX_CLUES, PARTNER_OFFLINE_MS, MAX_ROUNDS, MAX_TEAM_SCORE, STAR_THRESHOLDS, TARGET_SCORE,
  advanceAfterReveal, applyClue, applyClueTimeout, applyGuess, applyGuessTimeout, bestRound,
  canEndForAbsence, createInitialRound, endMatchEarly, startCluePhase,
  SPELLING_VARIANTS, TYPO_MIN_LENGTH,
  getMatchWinner, guessSecondsForClueNumber, inflectionsOf, isCorrectGuess, nextRoles, normalizeText,
  pickWord, pickWordForRound, scoreForClueNumber, starRating, tierForRound, teamScoreOf, teamScoresFor, toList, validateClue,
} from './passwordLogic'

const deck = [{ word: 'planet', tier: 1 }, { word: 'chair', tier: 1 }, { word: 'secret', tier: 3 }]
const HINTS = ['orbit', 'space', 'moon', 'star', 'comet']

// Plays one round from its clue phase: misses `misses` clues, then solves on
// the next one (or never, when solveOn is null). Returns the reveal round.
function playRound(round, word, { solveOn = 1 } = {}) {
  let current = { ...round, phase: 'clue' }
  for (let clue = 1; clue <= MAX_CLUES; clue += 1) {
    current = applyClue({ ...current, word }, HINTS[clue - 1], clue * 10)
    const solved = solveOn != null && clue === solveOn
    current = applyGuess(current, solved ? word : 'nope', word, clue * 10 + 1)
    if (current.phase === 'reveal') return current
  }
  return current
}

// Plays a whole match, solving every round on `solveOn`; returns each
// advance result plus the final one.
function playMatch({ starter = 'X', solveOn = 1 } = {}) {
  const bigDeck = Array.from({ length: 20 }, (_, i) => ({ word: `word${String.fromCharCode(97 + i)}zz`, tier: 1 }))
  let round = createInitialRound({ starter, seed: 'm', wordIndex: 0, wordLength: 7 })
  const guessers = []
  let result = null
  for (let n = 0; n < MAX_ROUNDS + 2; n += 1) {
    guessers.push(round.guesser)
    const reveal = playRound(round, bigDeck[round.wordIndex].word, { solveOn })
    result = advanceAfterReveal(reveal, {}, bigDeck, 1000 * n)
    if (result.status === 'finished') break
    round = result.round
  }
  return { guessers, result }
}

describe('passwordLogic', () => {
  it('ships a large unique common-word deck', () => {
    const words = PASSWORD_DECK.map(entry => entry.word)
    expect(words.length).toBeGreaterThanOrEqual(400)
    expect(new Set(words).size).toBe(words.length)
    // No plural/singular or spacing near-duplicates either.
    expect(new Set(words.map(matchKey)).size).toBe(words.length)
    expect(PASSWORD_DECK.every(entry => [1, 2, 3].includes(entry.tier))).toBe(true)
    expect(words.every(word => /^[a-z]+$/.test(word))).toBe(true)
    for (const tier of [1, 2, 3]) {
      expect(PASSWORD_DECK.filter(entry => entry.tier === tier).length).toBeGreaterThanOrEqual(100)
    }
  })

  it('serves only family-safe words', () => {
    expect(PASSWORD_DECK.filter(entry => !isFamilySafe(entry.word)).map(entry => entry.word)).toEqual([])
  })

  it('keeps abstract filler out of the deck (regression: usual/enough/beyond/admit)', () => {
    const words = new Set(PASSWORD_DECK.map(entry => entry.word))
    for (const word of ['usual', 'enough', 'beyond', 'admit', 'certain', 'possible', 'together']) {
      expect(words.has(word)).toBe(false)
    }
  })

  it('maps rounds to an easy-to-hard tier curve', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(tierForRound)).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3])
    expect(tierForRound(0)).toBe(1)
    expect(tierForRound(99)).toBe(3)
  })

  it('picks seeded, unused words from the round tier', () => {
    const a = pickWordForRound(PASSWORD_DECK, 'seed-a', [], 6)
    expect(PASSWORD_DECK[a].tier).toBe(2)
    expect(pickWordForRound(PASSWORD_DECK, 'seed-a', [], 6)).toBe(a)
    expect(pickWordForRound(PASSWORD_DECK, 'seed-a', [a], 6)).not.toBe(a)
    const seeds = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(seed => pickWordForRound(PASSWORD_DECK, seed, [], 1)))
    expect(seeds.size).toBeGreaterThan(1)
    // Falls back to other tiers, then to the whole deck, rather than failing.
    const small = [{ word: 'apple', tier: 1 }, { word: 'eclipse', tier: 3 }]
    expect(pickWordForRound(small, 's', [], 5)).toBeGreaterThanOrEqual(0)
    expect(pickWordForRound(small, 's', [0, 1], 1)).toBeGreaterThanOrEqual(0)
    expect(pickWordForRound([], 's', [], 1)).toBe(-1)
  })

  it('deals a full match of 12 different words, easy to hard', () => {
    let round = createInitialRound({ starter: 'X', seed: 'curve', wordIndex: pickWordForRound(PASSWORD_DECK, 'curve', [], 1), wordLength: 5 })
    const dealt = [round.wordIndex]
    for (let n = 1; n < MAX_ROUNDS; n += 1) {
      round = advanceAfterReveal({ ...round, phase: 'reveal' }, {}, PASSWORD_DECK, n).round
      dealt.push(round.wordIndex)
    }
    expect(new Set(dealt).size).toBe(MAX_ROUNDS)
    expect(dealt.map(index => PASSWORD_DECK[index].tier)).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3])
    expect(round.used).toEqual(dealt)
  })

  it('normalizes punctuation, case, and whitespace', () => {
    expect(normalizeText('  Hello,   WORLD! ')).toBe('hello world')
    expect(isCorrectGuess(' PLANET! ', 'planet')).toBe(true)
  })

  describe('lenient guesses (regression: apples/theatre/glass all missed)', () => {
    it('accepts plurals and singulars', () => {
      expect(isCorrectGuess('apples', 'apple')).toBe(true)
      expect(isCorrectGuess('glass', 'glasses')).toBe(true)
      expect(isCorrectGuess('tomatoes', 'tomato')).toBe(true)
    })

    it('accepts US/UK spellings both ways', () => {
      expect(isCorrectGuess('theatre', 'theater')).toBe(true)
      expect(isCorrectGuess('theater', 'theatre')).toBe(true)
      expect(isCorrectGuess('colour', 'color')).toBe(true)
      expect(isCorrectGuess('grey', 'gray')).toBe(true)
      expect(isCorrectGuess('centre', 'center')).toBe(true)
      expect(isCorrectGuess('favourite', 'favorite')).toBe(true)
      expect(isCorrectGuess('organise', 'organize')).toBe(true)
      expect(isCorrectGuess('doughnuts', 'donut')).toBe(true)
      expect(SPELLING_VARIANTS.length).toBeGreaterThanOrEqual(20)
    })

    it('accepts spacing, hyphen and article variants', () => {
      expect(isCorrectGuess('birth day', 'birthday')).toBe(true)
      expect(isCorrectGuess('snow-man', 'snowman')).toBe(true)
      expect(isCorrectGuess('the rainbow', 'rainbow')).toBe(true)
    })

    it('forgives one typo only for passwords of 6+ letters', () => {
      expect(TYPO_MIN_LENGTH).toBe(6)
      expect(isCorrectGuess('elephnt', 'elephant')).toBe(true)
      expect(isCorrectGuess('elpehant', 'elephant')).toBe(true)
      expect(isCorrectGuess('aple', 'apple')).toBe(false)
      expect(isCorrectGuess('car', 'care')).toBe(false)
      expect(isCorrectGuess('elepant', 'elephant')).toBe(true)
      expect(isCorrectGuess('elepnt', 'elephant')).toBe(false)
    })

    it('still rejects blanks and different words', () => {
      expect(isCorrectGuess('', 'apple')).toBe(false)
      expect(isCorrectGuess('banana', 'apple')).toBe(false)
    })

    it('scores a lenient guess like an exact one', () => {
      const round = { ...createInitialRound({ starter: 'X', seed: 's', wordIndex: 0, wordLength: 8 }), phase: 'clue' }
      const guessing = applyClue({ ...round, word: 'elephant' }, 'trunk', 10)
      const solved = applyGuess(guessing, 'Elephnt', 'elephant', 20)
      expect(solved.phase).toBe('reveal')
      expect(solved.lastDelta).toEqual({ player: 'O', points: 5, clueNumber: 1 })
      expect(solved.guesses[0]).toMatchObject({ text: 'elephnt', correct: true })
    })
  })

  it('validates one-word clues and rejects leaks or repeats', () => {
    expect(validateClue({ clue: 'galaxy', word: 'planet' }).valid).toBe(true)
    expect(validateClue({ clue: 'two words', word: 'planet' }).valid).toBe(false)
    expect(validateClue({ clue: 'plan', word: 'planet' }).valid).toBe(false)
    expect(validateClue({ clue: 'planet', word: 'planet' }).valid).toBe(false)
    expect(validateClue({ clue: 'galaxy', word: 'planet', previousClues: ['Galaxy'] }).valid).toBe(false)
  })

  describe('clue rules', () => {
    const ok = (clue, word) => validateClue({ clue, word })
    const reason = (clue, word) => validateClue({ clue, word }).reason

    it('rejects clues under 3 letters (regression: ap/pl/le spelled out APPLE)', () => {
      for (const clue of ['a', 'ap', 'pl', 'le']) expect(reason(clue, 'apple')).toBe('CLUE MUST BE AT LEAST 3 LETTERS')
    })

    it('rejects digits, spaces, hyphens, blanks and over-long clues', () => {
      expect(reason('5', 'apple')).toBe('LETTERS ONLY — NO NUMBERS')
      expect(reason('r2d2', 'robot')).toBe('LETTERS ONLY — NO NUMBERS')
      expect(reason('ice-cream', 'apple')).toBe('ONE WORD ONLY — NO SPACES OR HYPHENS')
      expect(reason('fruit tree', 'apple')).toBe('ONE WORD ONLY — NO SPACES OR HYPHENS')
      expect(reason('   ', 'apple')).toBe('CLUE CANNOT BE BLANK')
      expect(reason('!!!', 'apple')).toBe('USE LETTERS A–Z')
      expect(reason('abcdefghijklmnopq', 'apple')).toBe('CLUE MUST BE 16 LETTERS OR LESS')
      expect(ok('Café', 'apple')).toEqual({ valid: true, value: 'cafe' })
    })

    it('rejects banned clues', () => {
      expect(reason('bullshit', 'apple')).toBe('THAT CLUE IS NOT ALLOWED')
    })

    it('rejects the password itself, its plurals and its inflections', () => {
      expect(reason('PLANET!', 'planet')).toBe('CLUE CANNOT BE THE PASSWORD')
      expect(reason('apples', 'apple')).toBe('CLUE CANNOT BE THE PASSWORD')
      expect(reason('glass', 'glasses')).toBe('CLUE CANNOT BE THE PASSWORD')
      expect(reason('doughnut', 'donut')).toBe('CLUE CANNOT BE THE PASSWORD')
      expect(reason('colour', 'color')).toBe('CLUE CANNOT BE THE PASSWORD')
      expect(reason('baking', 'bake')).toBe('NO FORMS OF THE PASSWORD (PLURALS, -ING, -ED…)')
      expect(reason('happier', 'happy')).toBe('NO FORMS OF THE PASSWORD (PLURALS, -ING, -ED…)')
      expect(reason('running', 'run')).toBe('NO FORMS OF THE PASSWORD (PLURALS, -ING, -ED…)')
      expect(reason('paint', 'painter')).toBe('NO FORMS OF THE PASSWORD (PLURALS, -ING, -ED…)')
    })

    it('rejects the password reversed (regression: elppa was accepted)', () => {
      expect(reason('elppa', 'apple')).toBe('NO SPELLING THE PASSWORD BACKWARDS')
      expect(reason('tenalp', 'planet')).toBe('NO SPELLING THE PASSWORD BACKWARDS')
    })

    it('rejects anything within one edit inside the word (regression: appel was accepted)', () => {
      expect(reason('appel', 'apple')).toBe('TOO CLOSE TO THE PASSWORD')
      expect(reason('aple', 'apple')).toBe('TOO CLOSE TO THE PASSWORD')
      expect(reason('ample', 'apple')).toBe('TOO CLOSE TO THE PASSWORD')
      expect(reason('plamet', 'planet')).toBe('TOO CLOSE TO THE PASSWORD')
    })

    it('rejects a clue sharing a 5+ letter stem', () => {
      expect(reason('plane', 'planet')).toBe('CLUE SHARES TOO MUCH OF THE PASSWORD')
      expect(reason('mounting', 'mountain')).toBe('CLUE SHARES TOO MUCH OF THE PASSWORD')
      expect(reason('birthmark', 'birthday')).toBe('CLUE SHARES TOO MUCH OF THE PASSWORD')
    })

    it('rejects parts of the password and clues containing it', () => {
      expect(reason('snow', 'snowman')).toBe('CLUE CANNOT BE PART OF THE PASSWORD')
      expect(reason('man', 'snowman')).toBe('CLUE CANNOT BE PART OF THE PASSWORD')
      expect(reason('ear', 'heart')).toBe('CLUE CANNOT BE PART OF THE PASSWORD')
      expect(reason('lemonade', 'lemon')).toBe('CLUE CANNOT CONTAIN THE PASSWORD')
      expect(reason('catch', 'cat')).toBe('CLUE CANNOT CONTAIN THE PASSWORD')
    })

    it('allows innocent overlaps the old substring check blocked (regression)', () => {
      expect(ok('car', 'care')).toEqual({ valid: true, value: 'car' })
      expect(ok('center', 'enter').valid).toBe(true)
      expect(ok('growl', 'grow').valid).toBe(true)
      expect(ok('ideal', 'idea').valid).toBe(true)
      expect(ok('orbit', 'planet').valid).toBe(true)
      expect(ok('newton', 'apple').valid).toBe(true)
    })

    it('treats a plural of an earlier clue as a repeat', () => {
      expect(validateClue({ clue: 'galaxies', word: 'planet', previousClues: [{ text: 'galaxy' }] }).reason).toBe('CLUE ALREADY USED')
      expect(validateClue({ clue: 'orbit', word: 'planet', previousClues: [{ text: '', timeout: true }] }).valid).toBe(true)
    })

    it('lists inflected forms with e-drop, y→i and doubled consonants', () => {
      expect([...inflectionsOf('bake')]).toEqual(expect.arrayContaining(['bakes', 'baked', 'baker', 'baking']))
      expect([...inflectionsOf('stop')]).toEqual(expect.arrayContaining(['stops', 'stopped', 'stopping']))
      expect([...inflectionsOf('happy')]).toEqual(expect.arrayContaining(['happier', 'happiest', 'happily']))
      expect(inflectionsOf('car').has('care')).toBe(false)
      expect(inflectionsOf('grow').has('growl')).toBe(false)
    })
  })

  it('maps clue number to 5-to-1 scoring', () => {
    expect(CLUE_POINTS).toEqual([5, 4, 3, 2, 1])
    expect(scoreForClueNumber(1)).toBe(5)
    expect(scoreForClueNumber(MAX_CLUES)).toBe(1)
    expect(scoreForClueNumber(0)).toBe(0)
    expect(scoreForClueNumber(6)).toBe(0)
  })

  it('alternates roles', () => {
    expect(nextRoles('X')).toEqual({ clueGiver: 'O', guesser: 'X' })
    expect(nextRoles('O')).toEqual({ clueGiver: 'X', guesser: 'O' })
  })

  it('picks deterministic unused words and changes with seed', () => {
    expect(pickWord(deck, 'seed-a', [])).toBe(pickWord(deck, 'seed-a', []))
    expect(pickWord(deck, 'seed-a', [pickWord(deck, 'seed-a', [])])).not.toBe(-1)
    expect(pickWord(deck, 'seed-a', [])).not.toBe(pickWord(deck, 'seed-b', []))
  })

  it('runs clue and guess phases', () => {
    const round = { ...createInitialRound({ starter: 'X', seed: 's', wordIndex: 0, wordLength: 6 }), phase: 'clue' }
    const withClue = applyClue({ ...round, word: 'planet' }, 'orbit', 10)
    expect(withClue.phase).toBe('guess')
    const withGuess = applyGuess(withClue, 'wrong', 'planet', 20)
    expect(withGuess.phase).toBe('clue')
    const secondClue = applyClue({ ...withGuess, word: 'planet' }, 'space', 25)
    const reveal = applyGuess(secondClue, 'PLANET!', 'planet', 30)
    expect(reveal.phase).toBe('reveal')
    expect(reveal.lastDelta).toEqual({ player: 'O', points: 4, clueNumber: 2 })
  })

  it('banks every solved round into one shared team total', () => {
    const round = createInitialRound({ starter: 'X', seed: 's', wordIndex: 0, wordLength: 6 })
    expect(round.teamScore).toBe(0)
    const reveal = playRound(round, 'planet', { solveOn: 2 })
    expect(reveal.teamScore).toBe(4)
    expect(reveal.history).toEqual([{ roundNum: 1, wordIndex: 0, clueGiver: 'X', guesser: 'O', points: 4, clueNumber: 2 }])
    const advanced = advanceAfterReveal(reveal, {}, deck, 100)
    expect(advanced.scores).toEqual({ X: 4, O: 4 })
    expect(advanced.round.teamScore).toBe(4)
    const second = playRound(advanced.round, deck[advanced.round.wordIndex].word, { solveOn: 1 })
    expect(second.teamScore).toBe(9)
    expect(second.history).toHaveLength(2)
    expect(second.history[1]).toMatchObject({ roundNum: 2, clueGiver: 'O', guesser: 'X', points: 5 })
  })

  it('records a missed round in the recap with zero points', () => {
    const reveal = playRound(createInitialRound({ starter: 'X', seed: 's', wordIndex: 0, wordLength: 6 }), 'planet', { solveOn: null })
    expect(reveal.teamScore).toBe(0)
    expect(reveal.lastDelta).toBeNull()
    expect(reveal.history).toEqual([{ roundNum: 1, wordIndex: 0, clueGiver: 'X', guesser: 'O', points: 0, clueNumber: 0 }])
  })

  it('plays a fixed 12 rounds — no early finish once the team passes 15', () => {
    const { guessers, result } = playMatch({ solveOn: 1 })
    expect(guessers).toHaveLength(MAX_ROUNDS)
    expect(result.status).toBe('finished')
    expect(result.winner).toBe('draw')
    expect(result.round.phase).toBe('finished')
    expect(result.round.teamScore).toBe(MAX_TEAM_SCORE)
    expect(result.scores).toEqual({ X: 60, O: 60 })
    expect(result.round.history).toHaveLength(MAX_ROUNDS)
  })

  it('gives each player the same six guessing turns from either starter', () => {
    for (const starter of ['X', 'O']) {
      const { guessers } = playMatch({ starter, solveOn: 3 })
      expect(guessers.filter(s => s === 'X')).toHaveLength(6)
      expect(guessers.filter(s => s === 'O')).toHaveLength(6)
      expect(guessers[0]).toBe(starter === 'X' ? 'O' : 'X')
      guessers.slice(1).forEach((s, i) => expect(s).not.toBe(guessers[i]))
    }
  })

  it('ends the match as a co-op draw only after the last round', () => {
    expect(getMatchWinner({ X: TARGET_SCORE, O: TARGET_SCORE }, MAX_ROUNDS - 1)).toBeNull()
    expect(getMatchWinner({ X: 7, O: 5 }, MAX_ROUNDS)).toBe('draw')
    expect(TARGET_SCORE).toBe(MAX_TEAM_SCORE)
    expect(MAX_TEAM_SCORE).toBe(60)
  })

  it('rates the team total with stars at the exported thresholds', () => {
    expect(STAR_THRESHOLDS).toEqual([20, 30, 40])
    expect(starRating(0)).toBe(0)
    expect(starRating(19)).toBe(0)
    expect(starRating(20)).toBe(1)
    expect(starRating(30)).toBe(2)
    expect(starRating(39)).toBe(2)
    expect(starRating(40)).toBe(3)
    expect(starRating(60)).toBe(3)
  })

  it('mirrors the team total onto both seats and reads it back', () => {
    expect(teamScoresFor(17)).toEqual({ X: 17, O: 17 })
    expect(teamScoresFor(undefined)).toEqual({ X: 0, O: 0 })
    expect(teamScoreOf({ teamScore: 12 }, { X: 99, O: 3 })).toBe(12)
    expect(teamScoreOf({ teamScore: 0 }, { X: 5, O: 5 })).toBe(0)
    expect(teamScoreOf({}, { X: 8, O: 8 })).toBe(8)
  })

  it('finds the best round of the recap, earliest on a tie', () => {
    const history = [
      { roundNum: 1, points: 3 }, { roundNum: 2, points: 5 }, { roundNum: 3, points: 5 }, { roundNum: 4, points: 0 },
    ]
    expect(bestRound(history).roundNum).toBe(2)
    expect(bestRound([{ roundNum: 1, points: 0 }])).toBeNull()
    expect(bestRound(undefined)).toBeNull()
  })

  it('normalizes sparse Firebase lists by key', () => {
    expect(toList(undefined)).toEqual([])
    expect(toList({ 1: 'b', 0: 'a', 10: 'c' })).toEqual(['a', 'b', 'c'])
    expect(toList(['a', 'b'])).toEqual(['a', 'b'])
  })

  it('ends after five misses and advances with a fresh non-repeating word', () => {
    let round = { ...createInitialRound({ starter: 'X', seed: 's', wordIndex: 0, wordLength: 6 }), phase: 'clue', word: 'planet' }
    for (let i = 0; i < MAX_CLUES; i += 1) {
      round = applyClue(round, HINTS[i], i)
      round = applyGuess(round, 'nope', 'planet', i)
    }
    expect(round.phase).toBe('reveal')
    const advanced = advanceAfterReveal(round, { X: 0, O: 0 }, deck, 100)
    expect(advanced.round.roundNum).toBe(2)
    expect(advanced.round.clueGiver).toBe('O')
    expect(advanced.round.used).toHaveLength(2)
  })

  it('times guesses 30/30/25/25/20 by clue number', () => {
    expect(GUESS_SECONDS).toEqual([30, 30, 25, 25, 20])
    expect(guessSecondsForClueNumber(1)).toBe(30)
    expect(guessSecondsForClueNumber(2)).toBe(30)
    expect(guessSecondsForClueNumber(3)).toBe(25)
    expect(guessSecondsForClueNumber(4)).toBe(25)
    expect(guessSecondsForClueNumber(5)).toBe(20)
    expect(guessSecondsForClueNumber(9)).toBe(20)
    expect(guessSecondsForClueNumber(0)).toBe(30)
  })

  it('arms the guess clock on every clue', () => {
    const round = { ...createInitialRound({ starter: 'X', seed: 's', wordIndex: 0, wordLength: 6 }), phase: 'clue', word: 'planet' }
    const first = applyClue(round, 'orbit', 1000)
    expect(first.endsAt).toBe(1000 + 30 * 1000)
    const second = applyClue({ ...applyGuess(first, 'nope', 'planet', 2000), word: 'planet' }, 'space', 3000)
    expect(second.endsAt).toBe(3000 + 30 * 1000)
  })

  it('rejects guesses after the clock and times the slot out instead', () => {
    const round = { ...createInitialRound({ starter: 'X', seed: 's', wordIndex: 0, wordLength: 6 }), phase: 'clue', word: 'planet' }
    const guessing = applyClue(round, 'orbit', 1000)
    expect(applyGuess(guessing, 'planet', 'planet', guessing.endsAt + 1)).toBeNull()
    const timedOut = applyGuessTimeout(guessing, guessing.endsAt + 1)
    expect(timedOut.phase).toBe('clue')
    expect(timedOut.guesses).toHaveLength(1)
    expect(timedOut.guesses[0]).toMatchObject({ correct: false, timeout: true })
    expect(timedOut.endsAt).toBe(guessing.endsAt + 1 + CLUE_MS)
    expect(applyGuessTimeout(guessing, guessing.endsAt)).toBeNull()
  })

  it('arms a 45 s clue clock when the intro ends and after every miss', () => {
    expect(CLUE_SECONDS).toBe(45)
    const intro = { ...createInitialRound({ starter: 'X', seed: 's', wordIndex: 0, wordLength: 6 }), endsAt: 2000 }
    expect(startCluePhase(intro, 1999)).toBeNull()
    const clue = startCluePhase(intro, 2000)
    expect(clue).toMatchObject({ phase: 'clue', endsAt: 2000 + CLUE_MS })
    expect(startCluePhase(clue, 99999)).toBeNull()
    const guessing = applyClue({ ...clue, word: 'planet' }, 'orbit', 3000)
    const missed = applyGuess(guessing, 'moon', 'planet', 4000)
    expect(missed).toMatchObject({ phase: 'clue', endsAt: 4000 + CLUE_MS })
  })

  it('burns a clue slot as a miss when the clue clock expires (regression: a stalled clue-giver froze the room)', () => {
    const clue = startCluePhase({ ...createInitialRound({ starter: 'X', seed: 's', wordIndex: 0, wordLength: 6 }), endsAt: 0 }, 0)
    expect(applyClueTimeout(clue, clue.endsAt)).toBeNull()
    const burned = applyClueTimeout(clue, clue.endsAt + 1)
    expect(burned.phase).toBe('clue')
    expect(burned.clues).toEqual([{ text: '', at: clue.endsAt + 1, timeout: true }])
    expect(burned.guesses).toHaveLength(1)
    expect(burned.guesses[0]).toMatchObject({ correct: false, timeout: true })
    expect(burned.endsAt).toBe(clue.endsAt + 1 + CLUE_MS)
    // The next real clue is clue 2, worth 4 points.
    const guessing = applyClue({ ...burned, word: 'planet' }, 'orbit', burned.endsAt - 1)
    const solved = applyGuess(guessing, 'planet', 'planet', burned.endsAt)
    expect(solved.lastDelta).toEqual({ player: 'O', points: 4, clueNumber: 2 })
  })

  it('reveals with no points when the clue clock burns the last slot', () => {
    let round = startCluePhase({ ...createInitialRound({ starter: 'X', seed: 's', wordIndex: 3, wordLength: 6 }), endsAt: 0 }, 0)
    for (let i = 0; i < MAX_CLUES; i += 1) round = applyClueTimeout(round, round.endsAt + 1)
    expect(round.phase).toBe('reveal')
    expect(round.clues).toHaveLength(MAX_CLUES)
    expect(round.guesses).toHaveLength(MAX_CLUES)
    expect(round.teamScore).toBe(0)
    expect(round.history).toEqual([{ roundNum: 1, wordIndex: 3, clueGiver: 'X', guesser: 'O', points: 0, clueNumber: 0 }])
  })

  it('rejects a clue sent after the clue clock ran out', () => {
    const clue = startCluePhase({ ...createInitialRound({ starter: 'X', seed: 's', wordIndex: 0, wordLength: 6 }), endsAt: 0 }, 0)
    expect(applyClue({ ...clue, word: 'planet' }, 'orbit', clue.endsAt + 1)).toBeNull()
    expect(applyClue({ ...clue, word: 'planet' }, 'orbit', clue.endsAt)).not.toBeNull()
  })

  it('offers END MATCH only after the partner is away 30 s, and ends with the team score', () => {
    expect(PARTNER_OFFLINE_MS).toBe(30_000)
    expect(canEndForAbsence(null, 50_000)).toBe(false)
    expect(canEndForAbsence(1000, 1000 + PARTNER_OFFLINE_MS - 1)).toBe(false)
    expect(canEndForAbsence(1000, 1000 + PARTNER_OFFLINE_MS)).toBe(true)
    const reveal = playRound(createInitialRound({ starter: 'X', seed: 's', wordIndex: 0, wordLength: 6 }), 'planet', { solveOn: 3 })
    const next = advanceAfterReveal(reveal, {}, deck, 100).round
    const ended = endMatchEarly(next, { X: 3, O: 3 })
    expect(ended).toMatchObject({ winner: 'draw', status: 'finished', scores: { X: 3, O: 3 } })
    expect(ended.round).toMatchObject({ phase: 'finished', endedEarly: true, teamScore: 3, endsAt: null })
    expect(ended.round.history).toHaveLength(1)
    expect(endMatchEarly(ended.round)).toBeNull()
  })

  it('a timeout on the last clue goes to reveal', () => {
    let round = { ...createInitialRound({ starter: 'X', seed: 's', wordIndex: 0, wordLength: 6 }), phase: 'clue', word: 'planet' }
    for (let i = 0; i < MAX_CLUES - 1; i += 1) {
      round = applyClue(round, HINTS[i], i)
      round = applyGuess(round, 'nope', 'planet', i)
    }
    round = applyClue(round, 'last', 50)
    const timedOut = applyGuessTimeout(round, round.endsAt + 1)
    expect(timedOut.phase).toBe('reveal')
    expect(timedOut.guesses).toHaveLength(MAX_CLUES)
  })
})
