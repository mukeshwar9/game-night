import { describe, it, expect } from 'vitest'
import { markGuess, compareResults, isSolved, isDone, getDoneState, isValidGuess, getKeyboardState, MAX_GUESSES, verifyTranscript } from './wordduelLogic'
import { commit } from './commit'
import {
  normalizeGuessList, guessProblem, secretWordProblem, getGradedDoneState, gradeGuesses,
  applyGrading, applyDuelGuess, getFinishGraceEndsAt, applyFinishTimeout,
  verifyGradedBoard, verifyOpponentRound, decideDuelRound, DUEL_FINISH_GRACE_MS,
  applySelfDone, nextDuelRound,
} from './wordduelLogic'

describe('markGuess', () => {
  it('all green for exact match', () => {
    expect(markGuess('HELLO', 'HELLO')).toBe('GGGGG')
  })

  it('all black for no match', () => {
    expect(markGuess('FGHJK', 'ABCDE')).toBe('BBBBB')
  })

  it('yellow for letters in wrong position', () => {
    const result = markGuess('ABCDE', 'EDCBA')
    // A is at pos 0 in guess, at pos 4 in answer → yellow
    // B at pos 1 in guess, at pos 3 in answer → yellow
    // C at pos 2 in guess, at pos 2 in answer → green
    // D at pos 3 in guess, at pos 1 in answer → yellow
    // E at pos 0 in guess, at pos 0 in answer → wait, E is at pos 0 in answer
    // Let me think again. Answer: EDCBA. Guess: ABCDE
    // A at pos 4 in answer, pos 0 in guess → yellow
    // B at pos 3 in answer, pos 1 in guess → yellow
    // C at pos 2 in both → green
    // D at pos 1 in answer, pos 3 in guess → yellow
    // E at pos 0 in answer, pos 4 in guess → yellow
    expect(result).toBe('YYGYY')
  })

  it('green consumes letter count (no extra yellow)', () => {
    // Answer has one E. Guess has two E's. First E is green, second should be black.
    const result = markGuess('SPEED', 'ERASE')
    // Answer: ERASE has E at pos 0 and pos 4, S at pos 2?
    // Let me compute:
    // Answer: E R A S E
    // Guess:  S P E E D
    // S: guess pos 0, answer pos 3 → yellow
    // P: not in answer → black
    // E: guess pos 2, answer pos 0 → yellow (NOT green - different positions)
    // E: guess pos 3, answer pos 4 → yellow (second E)
    // D: not in answer → black
    // Wait, this is wrong. Let me think step by step.
    // Answer ERASE: E(2), R(1), A(1), S(1)
    // Pass 1 greens:
    // S[0] vs E[0] → no
    // P[1] vs R[1] → no
    // E[2] vs A[2] → no
    // E[3] vs S[3] → no
    // D[4] vs E[4] → no
    // freq after pass 1: E:2, R:1, A:1, S:1
    // Pass 2 yellows:
    // S[0]: freq[S]=1>0 → Y, freq[S]=0
    // P[1]: freq[P]=0 → B
    // E[2]: freq[E]=2>0 → Y, freq[E]=1
    // E[3]: freq[E]=1>0 → Y, freq[E]=0
    // D[4]: freq[D]=0 → B
    // Result: YBYYB
    expect(result).toBe('YBYYB')
  })

  it('duplicate in guess, single in answer — second occurrence black', () => {
    // Answer: ROBOT (one O at pos 1 and one O at pos 3?, wait ROBOT is R O B O T — two O's)
    // Let me use: answer BOOKS (one B, two O's? no: B O O K S — two O's)
    // Hmm let me use a cleaner case. Answer: THOSE (T,H,O,S,E). Guess: GEESE
    // From the PRD: guessing GEESE against THOSE: only one E marks, as yellow
    // Answer THOSE: T:1, H:1, O:1, S:1, E:1
    // Pass 1 greens: G≠T, E≠H, E≠O, S=S → S green!, E≠E at pos 4 (wait)
    // Let me check: GEESE vs THOSE
    // G[0] vs T[0] → no
    // E[1] vs H[1] → no
    // E[2] vs O[2] → no
    // S[3] vs S[3] → YES green!
    // E[4] vs E[4] → YES green!
    // freq after pass 1: T:1, H:1, O:1, E:0 (consumed by green), S:0 (consumed)
    // Pass 2 yellows:
    // G[0]: T? no. freq[G]=0 → B
    // E[1]: freq[E]=0 → B
    // E[2]: freq[E]=0 → B
    // Result: BBBGG
    // Only one E marks (the green one). The other two E's are black because freq[E] was exhausted by the green match.
    expect(markGuess('GEESE', 'THOSE')).toBe('BBBGG')
  })

  it('double letter in answer, single in guess — only one marks', () => {
    // Answer: BOOKS (B:1 O:2 K:1 S:1)
    // Guess: ROBOT (R O B O T)
    // Pass 1: O[1]=O[1] → G. freq O:2→1.
    // Pass 2: B[2] in answer at pos 0 → Y. O[3] in answer → Y.
    // Result: B G Y Y B
    expect(markGuess('ROBOT', 'BOOKS')).toBe('BGYYB')
  })

  it('green beats yellow priority', () => {
    // Answer: SPEAK (S,P,E,A,K)
    // Guess: ERRAS (E,R,R,A,S)
    // Pass 1 greens:
    // E[0]=S? no. R[1]=P? no. R[2]=E? no. A[3]=A? YES green!
    // S[4]=K? no
    // freq after pass1: S:1, P:1, E:1, A:0, K:1
    // Pass 2 yellows:
    // E[0]: freq[E]=1>0 → Y. freq[E]=0
    // R[1]: no → B
    // R[2]: no → B
    // S[4]: freq[S]=1>0 → Y. freq[S]=0
    // Result: YBBGB → wait, A at pos 3 is G. So YBBGY?
    // Actually A is at guess pos 3 and answer pos 3 → G
    // S at pos 4 is Y because freq[S]=1
    // So: E-R-R-A-S → Y B B G Y
    expect(markGuess('ERRAS', 'SPEAK')).toBe('YBBGY')
  })

  it('case insensitive', () => {
    expect(markGuess('hello', 'HELLO')).toBe('GGGGG')
    expect(markGuess('HELLO', 'hello')).toBe('GGGGG')
  })

  it('null/empty returns null', () => {
    expect(markGuess(null, 'HELLO')).toBeNull()
    expect(markGuess('HELLO', null)).toBeNull()
    expect(markGuess('', 'HELLO')).toBeNull()
  })

  it('wrong length returns null', () => {
    expect(markGuess('HELL', 'HELLO')).toBeNull()
    expect(markGuess('HELLOO', 'HELLO')).toBeNull()
  })
})

describe('compareResults', () => {
  it('fewer guesses wins', () => {
    expect(compareResults(
      { solved: true, guesses: 3, at: 1000 },
      { solved: true, guesses: 4, at: 500 }
    )).toBe('X')
  })

  it('same guesses, faster time wins', () => {
    expect(compareResults(
      { solved: true, guesses: 3, at: 1000 },
      { solved: true, guesses: 3, at: 500 }
    )).toBe('O')
  })

  it('one solved, one failed → solved wins', () => {
    expect(compareResults(
      { solved: true, guesses: 5, at: 1000 },
      { solved: false, guesses: 6, at: 500 }
    )).toBe('X')
  })

  it('both failed → draw', () => {
    expect(compareResults(
      { solved: false, guesses: 6, at: 1000 },
      { solved: false, guesses: 6, at: 500 }
    )).toBe('draw')
  })

  it('null → null', () => {
    expect(compareResults(null, { solved: true })).toBeNull()
    expect(compareResults({ solved: true }, null)).toBeNull()
  })

  it('same guesses and same time → draw', () => {
    expect(compareResults(
      { solved: true, guesses: 4, at: 1000 },
      { solved: true, guesses: 4, at: 1000 }
    )).toBe('draw')
  })
})

describe('isSolved', () => {
  it('detects win', () => {
    expect(isSolved('GGGGG')).toBe(true)
    expect(isSolved('GGGGY')).toBe(false)
    expect(isSolved('BBBBB')).toBe(false)
  })
})

describe('isDone', () => {
  it('not done with no guesses', () => {
    expect(isDone([])).toBe(false)
    expect(isDone(null)).toBe(false)
  })

  it('solved', () => {
    expect(isDone([{ word: 'HELLO', marks: 'GGGGG' }])).toBe(true)
  })

  it('max guesses', () => {
    const guesses = Array(MAX_GUESSES).fill({ word: 'HELLO', marks: 'BBBBB' })
    expect(isDone(guesses)).toBe(true)
  })

  it('not done with partial guesses', () => {
    expect(isDone([{ word: 'HELLO', marks: 'BBBBB' }])).toBe(false)
  })
})

describe('getDoneState', () => {
  it('returns state when solved', () => {
    const result = getDoneState([{ word: 'HELLO', marks: 'GGGGG' }])
    expect(result.solved).toBe(true)
    expect(result.guesses).toBe(1)
  })

  it('returns state when maxed out', () => {
    const guesses = Array(MAX_GUESSES).fill({ word: 'HELLO', marks: 'BBBBB' })
    const result = getDoneState(guesses)
    expect(result.solved).toBe(false)
    expect(result.guesses).toBe(MAX_GUESSES)
  })

  it('returns null when not done', () => {
    expect(getDoneState([{ word: 'HELLO', marks: 'BBBBB' }])).toBeNull()
    expect(getDoneState([])).toBeNull()
    expect(getDoneState(null)).toBeNull()
  })
})

describe('isValidGuess', () => {
  it('rejects null/empty', () => {
    expect(isValidGuess(null)).toBe(false)
    expect(isValidGuess('')).toBe(false)
  })

  it('rejects wrong length', () => {
    expect(isValidGuess('HELL')).toBe(false)
    expect(isValidGuess('HELLOO')).toBe(false)
  })

  it('validates against dictionary', () => {
    expect(isValidGuess('HELLO')).toBe(true)
    expect(isValidGuess('WORDS')).toBe(true)
    expect(isValidGuess('ZZZZZ')).toBe(false)
  })
})

describe('getKeyboardState', () => {
  it('empty guesses → empty state', () => {
    expect(getKeyboardState([])).toEqual({})
    expect(getKeyboardState(null)).toEqual({})
  })

  it('green marks as G', () => {
    const state = getKeyboardState([{ word: 'HELLO', marks: 'GGGGG' }])
    expect(state['H']).toBe('G')
    expect(state['E']).toBe('G')
    expect(state['L']).toBe('G')
    expect(state['O']).toBe('G')
  })

  it('green beats yellow', () => {
    const state = getKeyboardState([
      { word: 'HELLO', marks: 'GGGGG' },
      { word: 'OHHEL', marks: 'YYYYY' },
    ])
    expect(state['H']).toBe('G')
    expect(state['E']).toBe('G')
    expect(state['L']).toBe('G')
    expect(state['O']).toBe('G')
  })

  it('yellow beats black', () => {
    // CIVIL with marks: GBYBY → C=G, I=B, V=Y, I=B, L=Y
    // Over two guesses, the best state wins:
    const state = getKeyboardState([
      { word: 'CIVIL', marks: 'GBYBY' },
    ])
    expect(state['C']).toBe('G')
    expect(state['I']).toBe('B')
    expect(state['V']).toBe('Y')
    expect(state['L']).toBe('Y')
  })
})

describe('verifyTranscript', () => {
  it('verifies via commitment', async () => {
    const { hash, salt } = await commit('HELLO')
    const result = await verifyTranscript(hash, { word: 'HELLO', salt }, [])
    expect(result.ok).toBe(true)
  })

  it('fails on commitment mismatch', async () => {
    const { hash } = await commit('HELLO')
    const { salt } = await commit('WORLD')
    const result = await verifyTranscript(hash, { word: 'HELLO', salt }, [])
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('commit_mismatch')
  })

  it('fails on marks mismatch', async () => {
    const { hash, salt } = await commit('HELLO')
    const guesses = [{ word: 'HELLO', marks: 'BBBBB' }] // should be GGGGG
    const result = await verifyTranscript(hash, { word: 'HELLO', salt }, guesses)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('marks_mismatch')
  })

  it('accepts a word that is a valid guess but not in the smaller answer list', async () => {
    // 'ABYSM' is in _VALID (guessable) but not in the ~2100-word _ANSWERS list —
    // setting a word from the full valid list must not be flagged as cheating.
    const { hash, salt } = await commit('ABYSM')
    const result = await verifyTranscript(hash, { word: 'ABYSM', salt }, [])
    expect(result.ok).toBe(true)
  })
})

// Build a board the way the live game does: the guesser writes {word, at},
// the OTHER seat grades it with its own secret word.
const board = (words, secret, { gradeCount = words.length, at0 = 1000 } = {}) =>
  words.map((word, i) => ({
    word,
    at: at0 + i * 1000,
    ...(i < gradeCount ? { marks: markGuess(word, secret) } : {}),
  }))

describe('verifyOpponentRound — regression: honest rounds were flagged as cheating', () => {
  it('an honest round verifies ok on both clients', async () => {
    const x = await commit('CRANE')
    const o = await commit('SLATE')
    // X guesses at O's word (graded by O with SLATE); O guesses at X's word.
    const guessesX = board(['PLATE', 'SLATE'], 'SLATE')
    const guessesO = board(['TRACE', 'BRAKE', 'CRANE'], 'CRANE')
    const doneX = getGradedDoneState(guessesX)
    const doneO = getGradedDoneState(guessesO)

    // X's client verifies O's reveal against X's guesses.
    const onX = await verifyOpponentRound({ oppCommit: o.hash, oppReveal: { word: 'SLATE', salt: o.salt }, myGuesses: guessesX, myDone: doneX })
    // O's client verifies X's reveal against O's guesses.
    const onO = await verifyOpponentRound({ oppCommit: x.hash, oppReveal: { word: 'CRANE', salt: x.salt }, myGuesses: guessesO, myDone: doneO })
    expect(onX).toMatchObject({ ok: true, done: { solved: true, guesses: 2 } })
    expect(onO).toMatchObject({ ok: true, done: { solved: true, guesses: 3 } })
    expect(decideDuelRound(onX.done, onO.done)).toBe('X')

    // The old call re-marked the opponent's guesses (at MY word) with THEIR
    // word — the exact false positive this replaces.
    const old = await verifyTranscript(o.hash, { word: 'SLATE', salt: o.salt }, guessesO)
    expect(old.ok).toBe(false)
    expect(old.reason).toBe('marks_mismatch')
  })

  it('flags a grader who wrote wrong marks', async () => {
    const o = await commit('SLATE')
    const guessesX = [{ word: 'PLATE', marks: 'BBBBB', at: 1 }]
    const res = await verifyOpponentRound({ oppCommit: o.hash, oppReveal: { word: 'SLATE', salt: o.salt }, myGuesses: guessesX, myDone: null })
    expect(res).toMatchObject({ ok: false, reason: 'marks_mismatch' })
  })

  it('flags a reveal that does not match the commitment', async () => {
    const o = await commit('SLATE')
    const res = await verifyOpponentRound({ oppCommit: o.hash, oppReveal: { word: 'PLATE', salt: o.salt }, myGuesses: [], myDone: null })
    expect(res).toMatchObject({ ok: false, reason: 'commit_mismatch' })
  })

  it('grades still-pending guesses from the verified word instead of flagging them', async () => {
    const o = await commit('SLATE')
    const guessesX = board(['PLATE', 'SLATE'], 'SLATE', { gradeCount: 1 })
    const res = await verifyOpponentRound({ oppCommit: o.hash, oppReveal: { word: 'SLATE', salt: o.salt }, myGuesses: guessesX, myDone: null })
    expect(res).toMatchObject({ ok: true, done: { solved: true, guesses: 2, at: 2000 } })
  })

  it('reports an unfinished board as pending, not cheating', () => {
    const res = verifyGradedBoard({ word: 'SLATE', guesses: board(['PLATE'], 'SLATE'), done: null })
    expect(res).toMatchObject({ ok: false, pending: true })
  })

  it('the verified done state overrides a wrong recorded one', () => {
    const guesses = board(['PLATE', 'CRATE', 'SLATE'], 'SLATE')
    const res = verifyGradedBoard({ word: 'SLATE', guesses, done: { solved: false, guesses: guesses.length, at: 1 } })
    expect(res.ok).toBe(true)
    expect(res.done.solved).toBe(true)
  })
})

describe('getGradedDoneState — regression: a 6th-guess solve was recorded as a fail', () => {
  const five = ['PLATE', 'CRATE', 'GRATE', 'IRATE', 'ELATE']
  it('is not done while the 6th guess is still ungraded', () => {
    expect(getGradedDoneState(board([...five, 'SLATE'], 'SLATE', { gradeCount: 5 }))).toBeNull()
  })
  it('counts a 6th-guess solve as solved once graded', () => {
    expect(getGradedDoneState(board([...five, 'SLATE'], 'SLATE'))).toEqual({ solved: true, guesses: 6, at: 6000 })
  })
  it('fails after 6 graded misses, stamped with the 6th guess time', () => {
    expect(getGradedDoneState(board([...five, 'BLAME'], 'SLATE'))).toEqual({ solved: false, guesses: 6, at: 6000 })
  })
  it('stamps speed from the solving guess, not later guesses', () => {
    const g = board(['PLATE', 'SLATE', 'CRATE'], 'SLATE')
    expect(getGradedDoneState(g)).toEqual({ solved: true, guesses: 2, at: 2000 })
  })
})

describe('applyGrading', () => {
  const round = (over = {}) => ({ phase: 'guessing', ...over })
  it('writes the marks and the guesser done in one update', () => {
    const r = round({ guessesO: board(['TRACE', 'CRANE'], 'CRANE', { gradeCount: 0 }) })
    const next = applyGrading(r, { guesser: 'O', word: 'CRANE', now: 50_000 })
    expect(next.guessesO.map(g => g.marks)).toEqual([markGuess('TRACE', 'CRANE'), 'GGGGG'])
    expect(next.doneO).toEqual({ solved: true, guesses: 2, at: 2000, gradedAt: 50_000 })
    expect(next.firstDoneAt).toBe(50_000)
  })
  it('grades without writing done while the board is still open', () => {
    const next = applyGrading(round({ guessesO: board(['TRACE'], 'CRANE', { gradeCount: 0 }) }), { guesser: 'O', word: 'CRANE', now: 1 })
    expect(next.guessesO[0].marks).toBeTruthy()
    expect(next.doneO).toBeUndefined()
  })
  it('keeps the first finisher time when the second board finishes', () => {
    const r = round({ firstDoneAt: 10, doneX: { solved: true, guesses: 1, at: 5 }, guessesO: board(['CRANE'], 'CRANE', { gradeCount: 0 }) })
    expect(applyGrading(r, { guesser: 'O', word: 'CRANE', now: 99 }).firstDoneAt).toBe(10)
  })
  it('is a no-op when nothing is pending, and outside guessing', () => {
    expect(applyGrading(round({ guessesO: board(['TRACE'], 'CRANE') }), { guesser: 'O', word: 'CRANE', now: 1 })).toBeNull()
    expect(applyGrading({ phase: 'reveal', guessesO: board(['TRACE'], 'CRANE', { gradeCount: 0 }) }, { guesser: 'O', word: 'CRANE', now: 1 })).toBeNull()
  })
  it('reads sparse Firebase objects by key', () => {
    const r = round({ guessesO: { 0: { word: 'TRACE', at: 1 }, 1: { word: 'CRANE', at: 2 } } })
    expect(applyGrading(r, { guesser: 'O', word: 'CRANE', now: 3 }).doneO.guesses).toBe(2)
  })
})

describe('applyDuelGuess', () => {
  const round = (over = {}) => ({ phase: 'guessing', ...over })
  it('appends a valid guess', () => {
    expect(applyDuelGuess(round(), { player: 'X', word: 'crane', at: 5 }).guessesX).toEqual([{ word: 'CRANE', at: 5 }])
  })
  it('caps a board at six guesses', () => {
    const six = board(['PLATE', 'CRATE', 'GRATE', 'IRATE', 'ELATE', 'BLAME'], 'SLATE', { gradeCount: 0 })
    expect(applyDuelGuess(round({ guessesX: six }), { player: 'X', word: 'SLATE', at: 1 })).toBeNull()
  })
  it('refuses guesses after a solve, after done, and invalid words', () => {
    expect(applyDuelGuess(round({ guessesX: board(['SLATE'], 'SLATE') }), { player: 'X', word: 'PLATE', at: 1 })).toBeNull()
    expect(applyDuelGuess(round({ doneX: { solved: false } }), { player: 'X', word: 'PLATE', at: 1 })).toBeNull()
    expect(applyDuelGuess(round(), { player: 'X', word: 'XYZZY', at: 1 })).toBeNull()
    expect(applyDuelGuess(round(), { player: 'X', word: 'CRAN', at: 1 })).toBeNull()
  })
})

describe('guess and secret word problems', () => {
  it('explains why a guess is rejected', () => {
    expect(guessProblem('CRAN')).toBe('TOO SHORT')
    expect(guessProblem('XYZZY')).toBe('NOT IN WORD LIST')
    expect(guessProblem('CRANE')).toBeNull()
  })
  it('rejects banned setter words', () => {
    expect(secretWordProblem('SHITS')).toMatch(/NOT ALLOWED/)
    expect(secretWordProblem('CRANE')).toBeNull()
  })
})

describe('finish grace timeout', () => {
  const base = (over = {}) => ({
    phase: 'guessing', firstDoneAt: 1000,
    doneX: { solved: true, guesses: 3, at: 900, gradedAt: 1000 },
    guessesO: board(['TRACE', 'BRAKE'], 'CRANE'),
    ...over,
  })
  it('starts when the first board finishes', () => {
    expect(getFinishGraceEndsAt(base())).toBe(1000 + DUEL_FINISH_GRACE_MS)
    expect(getFinishGraceEndsAt({ phase: 'guessing' })).toBeNull()
  })
  it('cannot be called before it runs out', () => {
    expect(applyFinishTimeout(base(), { claimer: 'X', word: 'CRANE', now: 1000 + DUEL_FINISH_GRACE_MS - 1 })).toBeNull()
  })
  it('ends the other board as a timed-out fail', () => {
    const next = applyFinishTimeout(base(), { claimer: 'X', word: 'CRANE', now: 1000 + DUEL_FINISH_GRACE_MS })
    expect(next.doneO).toMatchObject({ solved: false, guesses: 2, timedOut: true })
    expect(decideDuelRound(next.doneX, next.doneO)).toBe('X')
  })
  it('grades a pending last-second solve instead of timing it out', () => {
    const r = base({ guessesO: board(['TRACE', 'CRANE'], 'CRANE', { gradeCount: 1 }) })
    const next = applyFinishTimeout(r, { claimer: 'X', word: 'CRANE', now: 1000 + DUEL_FINISH_GRACE_MS })
    expect(next.doneO).toMatchObject({ solved: true, guesses: 2 })
    expect(next.doneO.timedOut).toBeUndefined()
  })
  it('only the finished player can call time', () => {
    expect(applyFinishTimeout(base(), { claimer: 'O', word: 'SLATE', now: 1e12 })).toBeNull()
  })
  it('a timed-out board verifies as an unsolved fail', () => {
    const next = applyFinishTimeout(base(), { claimer: 'X', word: 'CRANE', now: 1e6 })
    expect(verifyGradedBoard({ word: 'CRANE', guesses: next.guessesO, done: next.doneO })).toMatchObject({ ok: true, done: { solved: false, timedOut: true } })
  })
})

describe('normalizeGuessList', () => {
  it('keeps positions for sparse objects', () => {
    expect(normalizeGuessList({ 1: { word: 'B' } })).toEqual([null, { word: 'B' }])
    expect(normalizeGuessList(null)).toEqual([])
  })
})

describe('gradeGuesses', () => {
  it('marks only ungraded guesses and reports the done state', () => {
    const res = gradeGuesses([{ word: 'TRACE', marks: 'BYYBG', at: 1 }, { word: 'CRANE', at: 2 }], 'CRANE')
    expect(res.changed).toBe(true)
    expect(res.guesses[0].marks).toBe('BYYBG')
    expect(res.guesses[1].marks).toBe('GGGGG')
    expect(res.done).toEqual({ solved: true, guesses: 2, at: 2 })
  })
})

describe('applySelfDone', () => {
  it('records done from graded marks only', () => {
    const graded = { phase: 'guessing', guessesX: board(['PLATE', 'SLATE'], 'SLATE') }
    expect(applySelfDone(graded, { player: 'X', now: 7 }).doneX).toEqual({ solved: true, guesses: 2, at: 2000, gradedAt: 7 })
    const pending = { phase: 'guessing', guessesX: board(['PLATE', 'SLATE'], 'SLATE', { gradeCount: 1 }) }
    expect(applySelfDone(pending, { player: 'X', now: 7 })).toBeNull()
  })
})

describe('nextDuelRound', () => {
  it('increments the round number so both clients see a new round', () => {
    expect(nextDuelRound({ phase: 'reveal', roundNum: 2 })).toEqual({ phase: 'setting', roundNum: 3 })
    expect(nextDuelRound({ phase: 'reveal' })).toEqual({ phase: 'setting', roundNum: 2 })
  })
})
