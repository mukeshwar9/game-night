import { describe, it, expect } from 'vitest'
import {
  validateWord,
  wordStructure,
  applyGuess,
  isWordGuessed,
  countWrong,
  verifyRoundConsistency,
  deriveRoundResult,
  MAX_WRONG,
  PENDING,
  pendingLetters,
  hasPendingGuess,
  canQueueGuess,
  gradePending,
  AUTO_ADVANCE_MS,
  PRESENCE_GRACE_MS,
  SETTING_DEADLINE_MS,
  GRADING_STALL_MS,
  GUESSER_IDLE_MS,
  getRoundClaim,
  revealRoundWinner,
  canAdvanceReveal,
  autoAdvanceAt,
  buildNextRound,
  WORD_RULE_DICTIONARY,
  WORD_RULE_ANY,
  wordRuleFor,
  validateSetterWord,
  hintRevealsWord,
  normalizeTurns,
  getHangwomanMatchWinner,
  isSuddenDeath,
  roundNumber,
} from './hangmanLogic'

describe('validateWord', () => {
  it('accepts 3–12 uppercase letters', () => {
    expect(validateWord('CAT')).toBe('CAT')
    expect(validateWord('PROGRAMMING')).toBe('PROGRAMMING')
    expect(validateWord('cat')).toBe('CAT')
  })

  it('rejects words with fewer than 3 letters (no spaces)', () => {
    expect(validateWord('AB')).toBeNull()
    expect(validateWord('')).toBeNull()
    expect(validateWord(null)).toBeNull()
  })

  it('rejects non-alpha characters (digits, punctuation)', () => {
    expect(validateWord('H3LLO')).toBeNull()
    expect(validateWord('CAFÉ')).toBeNull()
  })

  it('accepts multi-word phrases', () => {
    expect(validateWord('ice cream')).toBe('ICE CREAM')
    expect(validateWord('ICE CREAM')).toBe('ICE CREAM')
  })

  it('collapses multiple and edge spaces in phrases', () => {
    expect(validateWord('  ice   cream ')).toBe('ICE CREAM')
  })

  it('rejects phrases whose letter count exceeds 30', () => {
    // 31 letters total
    expect(validateWord('ABCDEFGHIJ ABCDEFGHIJ ABCDEFGHIJK')).toBeNull()
  })

  it('rejects strings with digits or punctuation even in phrases', () => {
    expect(validateWord('ICE 2 CREAM')).toBeNull()
    expect(validateWord('ICE-CREAM')).toBeNull()
  })
})

describe('wordStructure', () => {
  it('returns word lengths for a single word', () => {
    expect(wordStructure('BANANA')).toEqual([6])
  })

  it('returns per-word lengths for a phrase', () => {
    expect(wordStructure('ICE CREAM')).toEqual([3, 5])
  })
})

describe('applyGuess', () => {
  it('returns all positions of the letter', () => {
    expect(applyGuess('BANANA', 'A')).toEqual([1, 3, 5])
    expect(applyGuess('BANANA', 'B')).toEqual([0])
    expect(applyGuess('BANANA', 'N')).toEqual([2, 4])
  })

  it('returns empty array for a miss', () => {
    expect(applyGuess('BANANA', 'Z')).toEqual([])
    expect(applyGuess('HELLO', 'X')).toEqual([])
  })

  it('returns full-string indices (including the space) for a phrase', () => {
    // 'ICE CREAM' indices: I=0,C=1,E=2, =3,C=4,R=5,E=6,A=7,M=8
    expect(applyGuess('ICE CREAM', 'C')).toEqual([1, 4])
    expect(applyGuess('ICE CREAM', 'E')).toEqual([2, 6])
  })
})

describe('isWordGuessed', () => {
  it('returns true when all distinct letters are guessed', () => {
    const guesses = { B: [0], A: [1, 3, 5], N: [2, 4] }
    expect(isWordGuessed('BANANA', guesses)).toBe(true)
  })

  it('returns false when a letter is missing', () => {
    const guesses = { B: [0], A: [1, 3, 5] }
    expect(isWordGuessed('BANANA', guesses)).toBe(false)
  })

  it('returns false when a guess is still pending', () => {
    const guesses = { B: [0], A: [1, 3, 5], N: 'pending' }
    expect(isWordGuessed('BANANA', guesses)).toBe(false)
  })

  it('returns false when a required letter was a miss (false)', () => {
    const guesses = { B: [0], A: false, N: [2, 4] }
    expect(isWordGuessed('BANANA', guesses)).toBe(false)
  })

  it('works with repeated letters — one guess covers all occurrences', () => {
    const guesses = { H: [0], E: [1], L: [2, 3], O: [4] }
    expect(isWordGuessed('HELLO', guesses)).toBe(true)
  })

  it('ignores spaces when checking phrase completeness', () => {
    // 'ICE CREAM' — distinct letters: I,C,E,R,A,M (space ignored)
    const guesses = { I: [0], C: [1, 4], E: [2, 7], R: [5], A: [6], M: [8] }
    expect(isWordGuessed('ICE CREAM', guesses)).toBe(true)
  })

  it('returns false for a phrase when any letter (across words) is missing', () => {
    // Missing 'M'
    const guesses = { I: [0], C: [1, 4], E: [2, 7], R: [5], A: [6] }
    expect(isWordGuessed('ICE CREAM', guesses)).toBe(false)
  })
})

describe('countWrong', () => {
  it('counts only false entries', () => {
    const guesses = { A: [0], B: false, C: false, D: [2] }
    expect(countWrong(guesses)).toBe(2)
  })

  it('returns 0 for empty guesses', () => {
    expect(countWrong({})).toBe(0)
    expect(countWrong(null)).toBe(0)
  })
})

describe('MAX_WRONG', () => {
  it('is 6', () => {
    expect(MAX_WRONG).toBe(6)
  })
})

describe('verifyRoundConsistency', () => {
  it('returns true when all guesses match the word', () => {
    const guesses = { B: [0], A: [1, 3, 5], N: [2, 4], Z: false }
    expect(verifyRoundConsistency('BANANA', guesses)).toBe(true)
  })

  it('returns false when a hit is recorded as a miss', () => {
    const guesses = { B: false }
    expect(verifyRoundConsistency('BANANA', guesses)).toBe(false)
  })

  it('returns false when a miss is recorded as a hit', () => {
    const guesses = { Z: [0] }
    expect(verifyRoundConsistency('BANANA', guesses)).toBe(false)
  })

  it('returns false when positions are wrong', () => {
    const guesses = { A: [0, 2, 4] }
    expect(verifyRoundConsistency('BANANA', guesses)).toBe(false)
  })

  it('ignores pending entries', () => {
    const guesses = { B: 'pending' }
    expect(verifyRoundConsistency('BANANA', guesses)).toBe(true)
  })

  it('accepts firebase object form for positions', () => {
    // Firebase returns { '0': 1, '1': 3, '2': 5 } instead of [1,3,5]
    const guesses = { A: { 0: 1, 1: 3, 2: 5 }, B: [0], N: [2, 4] }
    expect(verifyRoundConsistency('BANANA', guesses)).toBe(true)
  })

  it('stays consistent for a phrase using full-string indices', () => {
    // 'ICE CREAM': C at indices 1,4; space is at index 3 (not a letter)
    const guesses = { C: [1, 4], E: [2, 6], I: [0], R: [5], A: [7], M: [8] }
    expect(verifyRoundConsistency('ICE CREAM', guesses)).toBe(true)
  })
})

describe('deriveRoundResult', () => {
  it("returns 'guessed' when every distinct letter was hit", () => {
    const guesses = { B: [0], A: [1, 3, 5], N: [2, 4], Z: false }
    expect(deriveRoundResult('BANANA', guesses)).toBe('guessed')
  })

  it("returns 'hanged' when wrong guesses reach MAX_WRONG", () => {
    const guesses = { Q: false, W: false, Z: false, J: false, K: false, V: false, B: [0] }
    expect(deriveRoundResult('BANANA', guesses)).toBe('hanged')
  })

  it('returns null when the round is not actually over', () => {
    const guesses = { B: [0], A: [1, 3, 5], Z: false }
    expect(deriveRoundResult('BANANA', guesses)).toBeNull()
  })

  it('returns null when a required letter is still pending', () => {
    const guesses = { B: [0], A: [1, 3, 5], N: 'pending' }
    expect(deriveRoundResult('BANANA', guesses)).toBeNull()
  })

  it("prioritizes 'guessed' when the word is complete even at MAX_WRONG misses", () => {
    const guesses = {
      C: [0], A: [1], T: [2],
      Q: false, W: false, Z: false, J: false, K: false, V: false,
    }
    expect(deriveRoundResult('CAT', guesses)).toBe('guessed')
  })

  it('accepts firebase object form for positions', () => {
    // Firebase returns { '0': 1, '1': 3, '2': 5 } instead of [1,3,5]
    const guesses = { B: [0], A: { 0: 1, 1: 3, 2: 5 }, N: { 0: 2, 1: 4 } }
    expect(deriveRoundResult('BANANA', guesses)).toBe('guessed')
  })

  it('ignores spaces when deriving a phrase result', () => {
    const guesses = { I: [0], C: [1, 4], E: [2, 6], R: [5], A: [7], M: [8] }
    expect(deriveRoundResult('ICE CREAM', guesses)).toBe('guessed')
  })

  it('returns null for empty guesses', () => {
    expect(deriveRoundResult('BANANA', {})).toBeNull()
    expect(deriveRoundResult('BANANA', null)).toBeNull()
  })
})

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

describe('one pending guess at a time', () => {
  it('pendingLetters lists pending letters in alphabetical (grading) order', () => {
    expect(pendingLetters({ Z: PENDING, A: [0], C: PENDING, B: false })).toEqual(['C', 'Z'])
    expect(pendingLetters(null)).toEqual([])
  })

  it('hasPendingGuess is true only while a guess waits for the word-keeper', () => {
    expect(hasPendingGuess({ A: [0], B: false })).toBe(false)
    expect(hasPendingGuess({ A: [0], B: PENDING })).toBe(true)
  })

  it('canQueueGuess refuses a second pending guess', () => {
    expect(canQueueGuess({}, 'A')).toBe(true)
    expect(canQueueGuess({ A: PENDING }, 'B')).toBe(false)
    expect(canQueueGuess({ A: [0] }, 'B')).toBe(true)
  })

  it('canQueueGuess refuses repeated or non-letter guesses', () => {
    expect(canQueueGuess({ A: false }, 'A')).toBe(false)
    expect(canQueueGuess({ A: [1] }, 'A')).toBe(false)
    expect(canQueueGuess({}, 'a')).toBe(false)
    expect(canQueueGuess({}, '1')).toBe(false)
    expect(canQueueGuess({}, 'AB')).toBe(false)
  })
})

describe('gradePending', () => {
  it('grades a single pending hit and reports it as the last guess', () => {
    const r = gradePending('BANANA', { B: [0], A: PENDING })
    expect(r.guesses).toEqual({ B: [0], A: [1, 3, 5] })
    expect(r.graded).toEqual(['A'])
    expect(r.discarded).toEqual([])
    expect(r.wrongCount).toBe(0)
    expect(r.result).toBeNull()
    expect(r.lastGuess).toEqual({ letter: 'A', hits: 3 })
  })

  it('grades a pending miss as false', () => {
    const r = gradePending('BANANA', { Z: PENDING })
    expect(r.guesses).toEqual({ Z: false })
    expect(r.wrongCount).toBe(1)
    expect(r.lastGuess).toEqual({ letter: 'Z', hits: 0 })
  })

  it('ends the round as guessed when the pending letter completes the word', () => {
    const r = gradePending('BANANA', { B: [0], A: [1, 3, 5], N: PENDING })
    expect(r.result).toBe('guessed')
  })

  it('ends the round as hanged on the sixth miss', () => {
    const r = gradePending('CAT', { Q: false, W: false, Z: false, J: false, K: false, V: PENDING })
    expect(r.result).toBe('hanged')
    expect(r.wrongCount).toBe(MAX_WRONG)
  })

  it('accepts firebase object form for already-graded positions', () => {
    const r = gradePending('BANANA', { A: { 0: 1, 1: 3, 2: 5 }, B: PENDING })
    expect(r.guesses.A).toEqual([1, 3, 5])
    expect(r.guesses.B).toEqual([0])
  })

  it('regression: all 26 letters queued against JAZZ no longer wins after 23 misses', () => {
    // The old setter graded the whole queue in one batch and let "guessed"
    // beat "hanged": JAZZ was scored guessed with 23 wrong.
    const batch = {}
    for (const letter of ALPHABET) {
      const positions = applyGuess('JAZZ', letter)
      batch[letter] = positions.length ? positions : false
    }
    expect(countWrong(batch)).toBe(23)
    expect(deriveRoundResult('JAZZ', batch)).toBe('guessed')

    // Graded in order, the round stops at the sixth miss (G): hanged.
    const queued = Object.fromEntries(ALPHABET.map(letter => [letter, PENDING]))
    const r = gradePending('JAZZ', queued)
    expect(r.result).toBe('hanged')
    expect(r.wrongCount).toBe(MAX_WRONG)
    expect(r.graded).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
    expect(r.discarded).toHaveLength(19)
    expect(Object.keys(r.guesses).sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
    // The guesser's reveal checks agree with the setter's verdict.
    expect(verifyRoundConsistency('JAZZ', r.guesses)).toBe(true)
    expect(deriveRoundResult('JAZZ', r.guesses)).toBe('hanged')
  })

  it('stops grading once the word is complete, discarding later letters', () => {
    const r = gradePending('ABE', { A: PENDING, B: PENDING, E: PENDING, Z: PENDING })
    expect(r.result).toBe('guessed')
    expect(r.graded).toEqual(['A', 'B', 'E'])
    expect(r.discarded).toEqual(['Z'])
    expect(r.wrongCount).toBe(0)
  })

  it('discards every pending letter when the round was already decided', () => {
    const r = gradePending('CAT', { C: [0], A: [1], T: [2], Q: PENDING })
    expect(r.result).toBe('guessed')
    expect(r.graded).toEqual([])
    expect(r.discarded).toEqual(['Q'])
    expect(r.lastGuess).toBeNull()
  })
})

describe('getRoundClaim', () => {
  const T = 1_000_000

  it('lets the guesser claim once the word-keeper misses the setting deadline', () => {
    const round = { phase: 'setting', setter: 'X', settingStartedAt: T }
    expect(getRoundClaim(round, 'guesser', { now: T + 1000 })).toEqual({
      reason: 'no-word', at: T + SETTING_DEADLINE_MS, ready: false,
    })
    expect(getRoundClaim(round, 'guesser', { now: T + SETTING_DEADLINE_MS }).ready).toBe(true)
    expect(getRoundClaim(round, 'setter', { now: T + SETTING_DEADLINE_MS })).toBeNull()
  })

  it('lets the guesser claim a guess left ungraded for the stall window', () => {
    const round = { phase: 'guessing', guesses: { A: PENDING }, pendingAt: T, guessingStartedAt: T - 5000 }
    const early = getRoundClaim(round, 'guesser', { now: T + GRADING_STALL_MS - 1 })
    expect(early).toEqual({ reason: 'grading', at: T + GRADING_STALL_MS, ready: false })
    expect(getRoundClaim(round, 'guesser', { now: T + GRADING_STALL_MS }).ready).toBe(true)
    // The setter has nothing to claim while a guess is waiting on them.
    expect(getRoundClaim(round, 'setter', { now: T + 10 * GUESSER_IDLE_MS })).toBeNull()
  })

  it('lets the setter claim when the guesser stops guessing, counted from the last grade', () => {
    const round = { phase: 'guessing', guesses: { A: [0] }, guessingStartedAt: T, gradedAt: T + 30_000 }
    const claim = getRoundClaim(round, 'setter', { now: T + GUESSER_IDLE_MS })
    expect(claim).toEqual({ reason: 'idle', at: T + 30_000 + GUESSER_IDLE_MS, ready: false })
    expect(getRoundClaim(round, 'setter', { now: T + 30_000 + GUESSER_IDLE_MS }).ready).toBe(true)
    expect(getRoundClaim(round, 'guesser', { now: T + 10 * GUESSER_IDLE_MS })).toBeNull()
  })

  it('counts guesser idleness from the start of guessing before any grade', () => {
    const round = { phase: 'guessing', guessingStartedAt: T }
    expect(getRoundClaim(round, 'setter', { now: T + GUESSER_IDLE_MS }).ready).toBe(true)
  })

  it('offers a disconnect claim only after the presence grace', () => {
    const round = { phase: 'guessing', guesses: {}, guessingStartedAt: T }
    const off = T + 1000
    const during = getRoundClaim(round, 'guesser', { now: off + PRESENCE_GRACE_MS - 1, opponentOfflineSince: off })
    expect(during).toEqual({ reason: 'offline', at: off + PRESENCE_GRACE_MS, ready: false })
    expect(getRoundClaim(round, 'guesser', { now: off + PRESENCE_GRACE_MS, opponentOfflineSince: off }).ready).toBe(true)
    expect(getRoundClaim(round, 'setter', { now: off + PRESENCE_GRACE_MS, opponentOfflineSince: off }).reason).toBe('offline')
  })

  it('lets the guesser claim when the word-keeper drops during setting', () => {
    const round = { phase: 'setting', settingStartedAt: T }
    const claim = getRoundClaim(round, 'guesser', { now: T + PRESENCE_GRACE_MS + 1, opponentOfflineSince: T })
    expect(claim.reason).toBe('offline')
    expect(claim.ready).toBe(true)
  })

  it('never lets the word-keeper claim before locking a word', () => {
    const round = { phase: 'setting', settingStartedAt: T }
    expect(getRoundClaim(round, 'setter', { now: T + 10 * SETTING_DEADLINE_MS, opponentOfflineSince: T })).toBeNull()
  })

  it('has nothing to claim in the reveal or for spectators', () => {
    expect(getRoundClaim({ phase: 'reveal', revealAt: T }, 'guesser', { now: T * 2 })).toBeNull()
    expect(getRoundClaim({ phase: 'guessing', guessingStartedAt: T }, null, { now: T * 2 })).toBeNull()
  })

  it('treats a legacy round with no anchors as unclaimable (except offline)', () => {
    expect(getRoundClaim({ phase: 'guessing' }, 'setter', { now: T })).toBeNull()
    expect(getRoundClaim({ phase: 'guessing', guesses: { A: PENDING } }, 'guesser', { now: T })).toBeNull()
  })
})

describe('revealRoundWinner', () => {
  it('awards a guessed word to the guesser and a hanging to the setter', () => {
    expect(revealRoundWinner({ setter: 'X', result: 'guessed' })).toBe('O')
    expect(revealRoundWinner({ setter: 'X', result: 'hanged' })).toBe('X')
    expect(revealRoundWinner({ setter: 'O', result: 'hanged' })).toBe('O')
  })

  it('awards a cheat to the guesser whatever the written result', () => {
    expect(revealRoundWinner({ setter: 'X', result: 'hanged', cheatDetected: true })).toBe('O')
    expect(revealRoundWinner({ setter: 'X', result: 'hanged' }, { cheat: true })).toBe('O')
  })

  it('returns null without a result', () => {
    expect(revealRoundWinner({ setter: 'X' })).toBeNull()
  })
})

describe('canAdvanceReveal', () => {
  it('lets the guesser advance any reveal', () => {
    expect(canAdvanceReveal({ phase: 'reveal' }, 'guesser')).toBe(true)
  })

  it('lets the word-keeper advance once the reveal is verified, flagged, or the guesser left', () => {
    expect(canAdvanceReveal({ phase: 'reveal' }, 'setter')).toBe(false)
    expect(canAdvanceReveal({ phase: 'reveal', verified: true }, 'setter')).toBe(true)
    expect(canAdvanceReveal({ phase: 'reveal', cheatDetected: true }, 'setter')).toBe(true)
    expect(canAdvanceReveal({ phase: 'reveal' }, 'setter', { guesserGone: true })).toBe(true)
  })

  it('never advances outside the reveal or for spectators', () => {
    expect(canAdvanceReveal({ phase: 'guessing' }, 'guesser')).toBe(false)
    expect(canAdvanceReveal({ phase: 'reveal', verified: true }, null)).toBe(false)
  })
})

describe('autoAdvanceAt', () => {
  it('is AUTO_ADVANCE_MS after a verified reveal', () => {
    expect(autoAdvanceAt({ phase: 'reveal', verified: true, revealAt: 5000 })).toBe(5000 + AUTO_ADVANCE_MS)
  })

  it('waits for verification and never auto-advances a cheat', () => {
    expect(autoAdvanceAt({ phase: 'reveal', revealAt: 5000 })).toBeNull()
    expect(autoAdvanceAt({ phase: 'reveal', verified: true, cheatDetected: true, revealAt: 5000 })).toBeNull()
    expect(autoAdvanceAt({ phase: 'reveal', verified: true })).toBeNull()
  })
})

describe('buildNextRound', () => {
  it('scores the round winner and hands the word to the other player', () => {
    const next = buildNextRound({ scores: { X: 1, O: 0 }, round: { setter: 'X', phase: 'reveal', turns: { X: 1, O: 1 } } }, 'O')
    expect(next.scores).toEqual({ X: 1, O: 1 })
    expect(next.round).toEqual({ setter: 'O', phase: 'setting', wrongCount: 0, turns: { X: 2, O: 1 } })
    expect(next.proposal).toBeNull()
    expect(next.status).toBeUndefined()
  })

  it('can end a round with no score', () => {
    const next = buildNextRound({ scores: { X: 1, O: 2 }, round: { setter: 'O' } }, null)
    expect(next.scores).toEqual({ X: 1, O: 2 })
    expect(next.round.setter).toBe('X')
  })
})

describe('validateSetterWord', () => {
  const dictionary = { has: (w) => ['jazz', 'cat', 'platform', 'banana'].includes(String(w).toLowerCase()) }
  const dict = (raw) => validateSetterWord(raw, { rule: WORD_RULE_DICTIONARY, dictionary })
  const any = (raw) => validateSetterWord(raw, { rule: WORD_RULE_ANY })

  it('maps the house-rule flag to a rule', () => {
    expect(wordRuleFor(true)).toBe(WORD_RULE_ANY)
    expect(wordRuleFor(false)).toBe(WORD_RULE_DICTIONARY)
    expect(wordRuleFor(undefined)).toBe(WORD_RULE_DICTIONARY)
  })

  it('accepts a dictionary word of 4+ letters, uppercased', () => {
    expect(dict('platform')).toEqual({ ok: true, word: 'PLATFORM' })
    expect(dict(' Jazz ')).toEqual({ ok: true, word: 'JAZZ' })
  })

  it('regression: gibberish like QXZ and ZZZZ is refused by default', () => {
    expect(dict('QXZ')).toMatchObject({ ok: false, reason: 'short' })
    expect(dict('ZZZZ')).toMatchObject({ ok: false, reason: 'dictionary' })
  })

  it('refuses dictionary words under 4 letters', () => {
    expect(dict('cat')).toMatchObject({ ok: false, reason: 'short', message: 'AT LEAST 4 LETTERS' })
  })

  it('refuses phrases by default and explains the house rule', () => {
    const r = dict('ICE CREAM')
    expect(r).toMatchObject({ ok: false, reason: 'phrase' })
    expect(r.message).toMatch(/ANY WORD/)
  })

  it('refuses non-letters', () => {
    expect(dict('H3LLO')).toMatchObject({ ok: false, reason: 'letters' })
    expect(any('ICE-CREAM')).toMatchObject({ ok: false, reason: 'letters' })
    expect(dict('')).toMatchObject({ ok: false, reason: 'empty' })
  })

  it('reports loading while the dictionary is not ready', () => {
    expect(validateSetterWord('PLATFORM', { rule: WORD_RULE_DICTIONARY, dictionary: null }))
      .toMatchObject({ ok: false, reason: 'loading' })
  })

  it('refuses banned words under both rules', () => {
    const banned = { has: () => true }
    expect(validateSetterWord('SHITS', { rule: WORD_RULE_DICTIONARY, dictionary: banned }))
      .toMatchObject({ ok: false, reason: 'banned' })
    expect(any('BIG SHIT')).toMatchObject({ ok: false, reason: 'banned' })
    expect(any('FU CK')).toMatchObject({ ok: false, reason: 'banned' })
  })

  it('ANY WORD keeps the old free-form rules: 3–30 letters and phrases', () => {
    expect(any('QXZ')).toEqual({ ok: true, word: 'QXZ' })
    expect(any('  ice   cream ')).toEqual({ ok: true, word: 'ICE CREAM' })
    expect(any('AB')).toMatchObject({ ok: false, reason: 'short', message: 'AT LEAST 3 LETTERS' })
    expect(any('ABCDEFGHIJ ABCDEFGHIJ ABCDEFGHIJK')).toMatchObject({ ok: false, reason: 'long' })
  })
})

describe('hintRevealsWord', () => {
  it('flags a hint containing the word, case-insensitively', () => {
    expect(hintRevealsWord('all that jazz', 'JAZZ')).toBe(true)
    expect(hintRevealsWord('Jazzy music', 'JAZZ')).toBe(true)
    expect(hintRevealsWord('a music genre', 'JAZZ')).toBe(false)
  })

  it('flags a hint containing any word of a phrase', () => {
    expect(hintRevealsWord('cold cream', 'ICE CREAM')).toBe(true)
    expect(hintRevealsWord('icecream!', 'ICE CREAM')).toBe(true)
    expect(hintRevealsWord('Ice-Cream', 'ICE CREAM')).toBe(true)
    expect(hintRevealsWord('frozen dessert', 'ICE CREAM')).toBe(false)
  })

  it('lets a hint repeat short function words from a phrase', () => {
    expect(hintRevealsWord('the best film', 'THE GODFATHER')).toBe(false)
    expect(hintRevealsWord('a film', 'A FEW GOOD MEN')).toBe(false)
  })

  it('accepts an empty hint', () => {
    expect(hintRevealsWord('', 'JAZZ')).toBe(false)
    expect(hintRevealsWord(null, 'JAZZ')).toBe(false)
  })
})

describe('getHangwomanMatchWinner (first to 3, equal setter turns)', () => {
  it('reads sparse turn counts', () => {
    expect(normalizeTurns(undefined)).toEqual({ X: 0, O: 0 })
    expect(normalizeTurns({ X: 2 })).toEqual({ X: 2, O: 0 })
  })

  it('ends at 3 when both players have set the same number of rounds', () => {
    expect(getHangwomanMatchWinner({ X: 3, O: 1 }, { X: 2, O: 2 })).toBe('X')
    expect(getHangwomanMatchWinner({ X: 2, O: 3 }, { X: 3, O: 3 })).toBe('O')
  })

  it('ends early when the trailing player cannot catch up in their owed setter turn', () => {
    // X set rounds 1 and 3, O set round 2: 3–0 can't be caught in one round.
    expect(getHangwomanMatchWinner({ X: 3, O: 0 }, { X: 2, O: 1 })).toBe('X')
    expect(getHangwomanMatchWinner({ X: 3, O: 1 }, { X: 3, O: 2 })).toBe('X')
  })

  it('regression: the first setter no longer wins 3–2 before the other player sets round 6', () => {
    expect(getHangwomanMatchWinner({ X: 3, O: 2 }, { X: 3, O: 2 })).toBeNull()
  })

  it('goes to sudden death on a tie after equal turns', () => {
    expect(getHangwomanMatchWinner({ X: 3, O: 3 }, { X: 3, O: 3 })).toBeNull()
    expect(isSuddenDeath({ X: 3, O: 3 })).toBe(true)
    // Mid-pair: one ahead, other still owed a setter turn.
    expect(getHangwomanMatchWinner({ X: 4, O: 3 }, { X: 4, O: 3 })).toBeNull()
    expect(isSuddenDeath({ X: 4, O: 3 })).toBe(true)
    // First lead after equal turns wins.
    expect(getHangwomanMatchWinner({ X: 4, O: 3 }, { X: 4, O: 4 })).toBe('X')
  })

  it('never ends below the target', () => {
    expect(getHangwomanMatchWinner({ X: 2, O: 0 }, { X: 1, O: 1 })).toBeNull()
    expect(isSuddenDeath({ X: 2, O: 2 })).toBe(false)
  })

  it('honours another target', () => {
    expect(getHangwomanMatchWinner({ X: 2, O: 0 }, { X: 1, O: 1 }, 2)).toBe('X')
  })

  it('numbers rounds from the turns taken', () => {
    expect(roundNumber(undefined)).toBe(1)
    expect(roundNumber({ X: 3, O: 2 })).toBe(6)
  })

  it('plays out a whole match through buildNextRound: O sets first, 3–2 goes to round 6', () => {
    let game = { scores: { X: 0, O: 0 }, round: { setter: 'O', phase: 'reveal' } }
    // Round winners in order: O sets rounds 1/3/5, X sets 2/4/6.
    for (const w of ['O', 'X', 'O', 'X', 'O']) {
      const next = buildNextRound(game, w)
      game = { ...game, ...next }
    }
    expect(game.scores).toEqual({ X: 2, O: 3 })
    expect(game.round.turns).toEqual({ X: 2, O: 3 })
    expect(game.status).toBeUndefined()
    expect(game.round.setter).toBe('X')
    const last = buildNextRound(game, 'X')
    expect(last.scores).toEqual({ X: 3, O: 3 })
    expect(last.status).toBeUndefined()
    const sd1 = buildNextRound({ ...game, ...last }, 'O')
    expect(sd1.status).toBeUndefined()
    const sd2 = buildNextRound({ ...game, ...last, ...sd1 }, 'O')
    expect(sd2).toMatchObject({ status: 'finished', winner: 'O', scores: { X: 3, O: 5 } })
  })
})
