import { describe, it, expect } from 'vitest'
import { commit, verifyReveal } from './commit'
import {
  STATEMENT_COUNT, MIN_STATEMENT_LENGTH, MAX_STATEMENT_LENGTH, DEFAULT_MATCH_TARGET, WRITING_DEADLINE_MS,
  otherSymbol, normalizeStatements, cleanStatement, isValidLieIndex, findBannedWord,
  validateStatements, validateEntry, lieSecret, secretStorageKey, buildStoredSecret, parseStoredSecret,
  getMatchWinner,
  GUESSING_DEADLINE_MS, REVEAL_DEADLINE_MS, SYMBOLS,
  normalizeRound, toFirebaseRound, freshRound, anchorRound, lockEntry, lockGuess, submitReveal,
  canEndWriting, canEndGuessing, canForfeitOpponentReveal, revealKey, verifyRoundReveals,
  judgeRound, finishRevealedRound, endStalledRound, applyRoundScores,
  settleRevealedGame, settleStalledGame, advanceGame,
} from './twoTruthsLogic'

const GOOD = ['I have been to Peru', 'I can juggle five balls', 'I once met a famous chef']

describe('constants', () => {
  it('match the rules text', () => {
    expect(STATEMENT_COUNT).toBe(3)
    expect(MIN_STATEMENT_LENGTH).toBe(3)
    expect(MAX_STATEMENT_LENGTH).toBe(80)
    expect(DEFAULT_MATCH_TARGET).toBe(3)
    expect(WRITING_DEADLINE_MS).toBe(180_000)
  })
})

describe('otherSymbol', () => {
  it('flips seats', () => {
    expect(otherSymbol('X')).toBe('O')
    expect(otherSymbol('O')).toBe('X')
  })
})

describe('normalizeStatements', () => {
  it('pads missing input to three empty strings', () => {
    expect(normalizeStatements(null)).toEqual(['', '', ''])
    expect(normalizeStatements(undefined)).toEqual(['', '', ''])
  })

  it('maps a sparse numeric-keyed object by key, not by order', () => {
    expect(normalizeStatements({ 2: 'c', 0: 'a' })).toEqual(['a', '', 'c'])
  })

  it('keeps a full array and drops extra or non-string entries', () => {
    expect(normalizeStatements(['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c'])
    expect(normalizeStatements(['a', 5, null])).toEqual(['a', '', ''])
  })
})

describe('cleanStatement', () => {
  it('trims and collapses whitespace including newlines', () => {
    expect(cleanStatement('  I   like\n\ncats  ')).toBe('I like cats')
    expect(cleanStatement(null)).toBe('')
  })
})

describe('isValidLieIndex', () => {
  it('accepts only 0, 1, 2', () => {
    expect([0, 1, 2].every(isValidLieIndex)).toBe(true)
    expect([-1, 3, 1.5, '1', null, undefined].some(isValidLieIndex)).toBe(false)
  })
})

describe('validateStatements', () => {
  it('accepts three distinct, clean statements and returns them cleaned', () => {
    const r = validateStatements(['  I have been to Peru ', 'I can juggle', 'I met a chef'])
    expect(r).toEqual({ ok: true, statements: ['I have been to Peru', 'I can juggle', 'I met a chef'] })
  })

  it('requires exactly three statements', () => {
    expect(validateStatements(['a b c', 'd e f']).ok).toBe(false)
    expect(validateStatements(null).ok).toBe(false)
    expect(validateStatements([...GOOD, 'extra']).ok).toBe(false)
  })

  it('rejects an empty or whitespace-only statement and names it', () => {
    const r = validateStatements(['I have been to Peru', '   ', 'I met a chef'])
    expect(r.ok).toBe(false)
    expect(r.index).toBe(1)
    expect(r.error).toMatch(/STATEMENT 2 IS EMPTY/)
  })

  it('rejects statements shorter than 3 characters after trimming', () => {
    const r = validateStatements(['  ab  ', 'I can juggle', 'I met a chef'])
    expect(r.ok).toBe(false)
    expect(r.index).toBe(0)
    expect(r.error).toMatch(/TOO SHORT/)
    expect(validateStatements(['abc', 'I can juggle', 'I met a chef']).ok).toBe(true)
  })

  it('rejects statements longer than 80 characters', () => {
    const long = 'x'.repeat(MAX_STATEMENT_LENGTH + 1)
    const r = validateStatements(['I have been to Peru', 'I can juggle', long])
    expect(r.ok).toBe(false)
    expect(r.index).toBe(2)
    expect(r.error).toMatch(/TOO LONG/)
    expect(validateStatements(['I have been to Peru', 'I can juggle', 'x'.repeat(80)]).ok).toBe(true)
  })

  it('rejects two statements that differ only by case, spacing or punctuation', () => {
    const r = validateStatements(['I can juggle', 'I have been to Peru', '  i CAN   juggle! '])
    expect(r.ok).toBe(false)
    expect(r.error).toBe('STATEMENTS 1 AND 3 ARE THE SAME')
    expect(r.index).toBe(2)
  })

  it('rejects a statement containing a banned word with a clear message', () => {
    const r = validateStatements(['I have been to Peru', 'I said fuck at school', 'I met a chef'])
    expect(r.ok).toBe(false)
    expect(r.index).toBe(1)
    expect(r.error).toMatch(/STATEMENT 2 HAS A WORD THAT ISN'T ALLOWED/)
  })

  it('does not reject innocent words that share letters with banned ones', () => {
    expect(validateStatements(['I love Dickens', 'I play bass', 'I own a spice rack']).ok).toBe(true)
  })
})

describe('findBannedWord', () => {
  it('finds a banned word regardless of case and punctuation', () => {
    expect(findBannedWord('What the FUCK!')).toBe('fuck')
    expect(findBannedWord('A totally normal sentence')).toBeNull()
  })
})

describe('validateEntry', () => {
  it('requires a marked lie', () => {
    const r = validateEntry(GOOD, null)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('MARK WHICH ONE IS THE LIE')
  })

  it('reports statement problems before a missing lie', () => {
    expect(validateEntry(['', 'b c d', 'e f g'], null).error).toMatch(/STATEMENT 1 IS EMPTY/)
  })

  it('returns cleaned statements and the lie index', () => {
    expect(validateEntry(GOOD, 2)).toEqual({ ok: true, statements: GOOD, lieIndex: 2 })
  })
})

describe('commitment payloads', () => {
  it('commits and reveals the lie index as a string', async () => {
    const { hash, salt } = await commit(lieSecret(1))
    expect(await verifyReveal(hash, lieSecret(1), salt)).toBe(true)
    expect(await verifyReveal(hash, lieSecret(2), salt)).toBe(false)
    expect(lieSecret(0)).toBe('0')
  })

  it('keys the stored secret by room', () => {
    expect(secretStorageKey('abc')).toBe('twotruths-abc')
  })

  it('round-trips a stored secret that opens the current commitment', () => {
    const stored = JSON.stringify(buildStoredSecret({ roundNum: 4, commitment: 'h1', lieIndex: 2, salt: 's' }))
    expect(JSON.parse(stored).roundNum).toBe(4)
    expect(parseStoredSecret(stored, 'h1')).toEqual({ lieIndex: 2, salt: 's' })
  })

  it('ignores a stale secret from a different commitment', () => {
    const stored = JSON.stringify(buildStoredSecret({ commitment: 'old', lieIndex: 0, salt: 's' }))
    expect(parseStoredSecret(stored, 'new')).toBeNull()
  })

  it('rejects malformed stored values', () => {
    expect(parseStoredSecret('not json', 'h')).toBeNull()
    expect(parseStoredSecret(null, 'h')).toBeNull()
    expect(parseStoredSecret(JSON.stringify({ lieIndex: 5, salt: 's' }))).toBeNull()
    expect(parseStoredSecret(JSON.stringify({ lieIndex: 1, salt: '' }))).toBeNull()
  })
})

describe('getMatchWinner', () => {
  it('is null below the target', () => {
    expect(getMatchWinner({ X: 2, O: 1 })).toBeNull()
    expect(getMatchWinner(null)).toBeNull()
  })

  it('declares whoever reaches the target with the lead', () => {
    expect(getMatchWinner({ X: 3, O: 1 })).toBe('X')
    expect(getMatchWinner({ X: 2, O: 3 })).toBe('O')
  })

  it('keeps playing on a tie at or above the target', () => {
    expect(getMatchWinner({ X: 3, O: 3 })).toBeNull()
    expect(getMatchWinner({ X: 4, O: 4 })).toBeNull()
    expect(getMatchWinner({ X: 5, O: 4 })).toBe('X')
  })

  it('honours a custom target', () => {
    expect(getMatchWinner({ X: 2, O: 0 }, 2)).toBe('X')
  })
})

// --- Simultaneous rounds ----------------------------------------------------

const X_STMTS = ['I have been to Peru', 'I can juggle', 'I met a chef']
const O_STMTS = ['I own a boat', 'I speak Welsh', 'I was born in May']

// Plays a round up to 'revealing' with real commitments. Returns the round
// plus each side's secret so tests can reveal honestly or cheat.
async function playToReveal({ xLie = 0, oLie = 1, xGuess = 1, oGuess = 0 } = {}) {
  const cx = await commit(lieSecret(xLie))
  const co = await commit(lieSecret(oLie))
  let r = normalizeRound({ roundNum: 1, phase: 'writing', startedAt: 0 })
  r = lockEntry(r, 'X', { statements: X_STMTS, commitment: cx.hash }, 10)
  r = lockEntry(r, 'O', { statements: O_STMTS, commitment: co.hash }, 20)
  r = lockGuess(r, 'X', xGuess, 30)
  r = lockGuess(r, 'O', oGuess, 40)
  return { round: r, secrets: { X: { lieIndex: xLie, salt: cx.salt }, O: { lieIndex: oLie, salt: co.salt } } }
}

function revealBoth(round, secrets, overrides = {}) {
  let r = submitReveal(round, 'X', overrides.X ?? secrets.X)
  r = submitReveal(r, 'O', overrides.O ?? secrets.O)
  return r
}

describe('deadline constants', () => {
  it('writing 180 s, guessing 60 s, reveal grace 20 s', () => {
    expect(WRITING_DEADLINE_MS).toBe(180_000)
    expect(GUESSING_DEADLINE_MS).toBe(60_000)
    expect(REVEAL_DEADLINE_MS).toBe(20_000)
    expect(SYMBOLS).toEqual(['X', 'O'])
  })
})

describe('normalizeRound', () => {
  it('treats a missing round as a fresh round 1 in writing', () => {
    const r = normalizeRound(undefined)
    expect(r.roundNum).toBe(1)
    expect(r.phase).toBe('writing')
    expect(r.entries).toEqual({ X: null, O: null })
    expect(r.guesses).toEqual({ X: null, O: null })
    expect(r.reveals).toEqual({ X: null, O: null })
    expect(r.result).toBeNull()
  })

  it('treats the legacy { setter, phase } round (room creation / first mover) as a fresh round', () => {
    const r = normalizeRound({ setter: 'O', phase: 'writing' })
    expect(r.phase).toBe('writing')
    expect(r.roundNum).toBe(1)
    expect(r.startedAt).toBeNull()
  })

  it('falls back to writing when a legacy storyteller round is mid-guess', () => {
    const r = normalizeRound({ setter: 'X', phase: 'guessing', statements: ['a', 'b', 'c'], commitment: 'h' })
    expect(r.phase).toBe('writing')
  })

  it('falls back when a later phase lacks its prerequisites', () => {
    expect(normalizeRound({ phase: 'done' }).phase).toBe('writing')
    const entries = { X: { statements: X_STMTS, commitment: 'a' }, O: { statements: O_STMTS, commitment: 'b' } }
    expect(normalizeRound({ phase: 'revealing', entries }).phase).toBe('guessing')
    expect(normalizeRound({ phase: 'revealing', entries, guesses: { X: 0, O: 2 } }).phase).toBe('revealing')
  })

  it('keeps a guess of 0 and drops out-of-range guesses', () => {
    const r = normalizeRound({ guesses: { X: 0, O: 7 } })
    expect(r.guesses).toEqual({ X: 0, O: null })
  })

  it('normalizes sparse statements inside an entry', () => {
    const r = normalizeRound({ entries: { X: { statements: { 0: 'abc', 2: 'ghi' }, commitment: 'h' } } })
    expect(r.entries.X.statements).toEqual(['abc', '', 'ghi'])
  })
})

describe('toFirebaseRound / freshRound', () => {
  it('omits null and empty pieces so Firebase stores a compact node', () => {
    expect(toFirebaseRound(normalizeRound({ roundNum: 2 }))).toEqual({ roundNum: 2, phase: 'writing' })
    expect(freshRound(3, 1000)).toEqual({ roundNum: 3, phase: 'writing', startedAt: 1000 })
  })

  it('round-trips a full round through normalize', async () => {
    const { round, secrets } = await playToReveal()
    const r = revealBoth(round, secrets)
    expect(normalizeRound(toFirebaseRound(r))).toEqual(r)
  })
})

describe('anchorRound', () => {
  it('stamps the writing clock once', () => {
    const r = anchorRound(normalizeRound({}), 500)
    expect(r.startedAt).toBe(500)
    expect(anchorRound(r, 900)).toBeNull()
  })
})

describe('lockEntry', () => {
  it('locks one side and stays in writing until both have locked', () => {
    let r = normalizeRound({ startedAt: 0 })
    r = lockEntry(r, 'O', { statements: O_STMTS, commitment: 'co' }, 5)
    expect(r.phase).toBe('writing')
    expect(r.entries.O).toEqual({ statements: O_STMTS, commitment: 'co', lockedAt: 5 })
    r = lockEntry(r, 'X', { statements: X_STMTS, commitment: 'cx' }, 9)
    expect(r.phase).toBe('guessing')
    expect(r.guessStartedAt).toBe(9)
  })

  it('refuses a second lock by the same player (statements are final)', () => {
    const r = lockEntry(normalizeRound({}), 'X', { statements: X_STMTS, commitment: 'cx' }, 1)
    expect(lockEntry(r, 'X', { statements: O_STMTS, commitment: 'other' }, 2)).toBeNull()
  })

  it('refuses invalid statements, a missing commitment or a spectator seat', () => {
    const r = normalizeRound({})
    expect(lockEntry(r, 'X', { statements: ['a', 'b', 'c'], commitment: 'cx' }, 1)).toBeNull()
    expect(lockEntry(r, 'X', { statements: X_STMTS, commitment: '' }, 1)).toBeNull()
    expect(lockEntry(r, null, { statements: X_STMTS, commitment: 'cx' }, 1)).toBeNull()
  })
})

describe('lockGuess', () => {
  it('moves to revealing only once both have guessed', async () => {
    const cx = await commit('0')
    let r = normalizeRound({})
    r = lockEntry(r, 'X', { statements: X_STMTS, commitment: cx.hash }, 1)
    r = lockEntry(r, 'O', { statements: O_STMTS, commitment: cx.hash }, 2)
    r = lockGuess(r, 'X', 2, 3)
    expect(r.phase).toBe('guessing')
    expect(lockGuess(r, 'X', 1, 4)).toBeNull() // one locked guess per player
    r = lockGuess(r, 'O', 0, 5)
    expect(r.phase).toBe('revealing')
    expect(r.revealStartedAt).toBe(5)
    expect(r.guesses).toEqual({ X: 2, O: 0 })
  })

  it('refuses guesses before both have locked statements', () => {
    expect(lockGuess(normalizeRound({}), 'X', 0, 1)).toBeNull()
  })
})

describe('submitReveal', () => {
  it('is only accepted while revealing and once per player', async () => {
    const { round, secrets } = await playToReveal()
    const r = submitReveal(round, 'X', secrets.X)
    expect(r.reveals.X).toEqual(secrets.X)
    expect(submitReveal(r, 'X', secrets.X)).toBeNull()
    expect(submitReveal(normalizeRound({}), 'X', secrets.X)).toBeNull()
  })

  it('accepts a forfeit', async () => {
    const { round } = await playToReveal()
    expect(submitReveal(round, 'O', { forfeit: true }).reveals.O).toEqual({ forfeit: true })
  })
})

describe('verifyRoundReveals + finishRevealedRound (scoring)', () => {
  it('both catch the lie: +1 each', async () => {
    const { round, secrets } = await playToReveal({ xLie: 0, oLie: 1, xGuess: 1, oGuess: 0 })
    const r = revealBoth(round, secrets)
    const v = await verifyRoundReveals(r, verifyReveal)
    expect(v.X.ok && v.O.ok).toBe(true)
    const done = finishRevealedRound(r, v, 99)
    expect(done.phase).toBe('done')
    expect(done.doneAt).toBe(99)
    expect(done.result.reason).toBe('reveal')
    expect(done.result.X).toEqual({ points: 1, caught: true, guess: 1, lieIndex: 0, fault: null })
    expect(done.result.O).toEqual({ points: 1, caught: true, guess: 0, lieIndex: 1, fault: null })
  })

  it('only the player who caught the lie scores', async () => {
    const { round, secrets } = await playToReveal({ xLie: 2, oLie: 1, xGuess: 1, oGuess: 0 })
    const r = revealBoth(round, secrets)
    const done = finishRevealedRound(r, await verifyRoundReveals(r, verifyReveal), 1)
    expect(done.result.X.points).toBe(1)
    expect(done.result.O).toMatchObject({ points: 0, caught: false })
  })

  it('a cheater (reveal does not open the commitment) gets 0 and the opponent +1', async () => {
    // X committed lie 0 but reveals 2 to make O's guess of 0 look wrong.
    const { round, secrets } = await playToReveal({ xLie: 0, oLie: 1, xGuess: 1, oGuess: 0 })
    const r = revealBoth(round, secrets, { X: { lieIndex: 2, salt: secrets.X.salt } })
    const v = await verifyRoundReveals(r, verifyReveal)
    expect(v.X.ok).toBe(false)
    expect(v.O.ok).toBe(true)
    const done = finishRevealedRound(r, v, 1)
    expect(done.result.X).toMatchObject({ points: 0, fault: 'cheat', lieIndex: null })
    expect(done.result.O).toMatchObject({ points: 1, fault: null, caught: null })
  })

  it('a forfeited reveal (lost secret) counts like a cheat', async () => {
    const { round, secrets } = await playToReveal({ xLie: 0, oLie: 1, xGuess: 1, oGuess: 2 })
    const r = revealBoth(round, secrets, { O: { forfeit: true } })
    const done = finishRevealedRound(r, await verifyRoundReveals(r, verifyReveal), 1)
    expect(done.result.O).toMatchObject({ points: 0, fault: 'forfeit' })
    expect(done.result.X).toMatchObject({ points: 1, fault: null })
  })

  it('both cheat: nobody scores', async () => {
    const { round, secrets } = await playToReveal()
    const r = revealBoth(round, secrets, { X: { lieIndex: 1, salt: 'bad' }, O: { lieIndex: 0, salt: 'bad' } })
    const done = finishRevealedRound(r, await verifyRoundReveals(r, verifyReveal), 1)
    expect(done.result.X.points + done.result.O.points).toBe(0)
  })

  it('refuses a verification that does not match the current reveals', async () => {
    const { round, secrets } = await playToReveal()
    const r = revealBoth(round, secrets)
    const v = await verifyRoundReveals(r, verifyReveal)
    const tampered = { ...r, reveals: { ...r.reveals, X: { lieIndex: 2, salt: secrets.X.salt } } }
    expect(finishRevealedRound(tampered, v, 1)).toBeNull()
    expect(finishRevealedRound(round, v, 1)).toBeNull() // reveals not in yet
  })

  it('judgeRound applies the validity map directly', async () => {
    const { round, secrets } = await playToReveal({ xLie: 0, oLie: 1, xGuess: 1, oGuess: 0 })
    const r = revealBoth(round, secrets)
    const res = judgeRound(r, { X: true, O: false })
    expect(res.X.points).toBe(1)
    expect(res.O).toMatchObject({ points: 0, fault: 'cheat' })
  })

  it('revealKey distinguishes forfeits and different reveals', () => {
    expect(revealKey(null)).toBe('')
    expect(revealKey({ forfeit: true })).toBe('forfeit')
    expect(revealKey({ lieIndex: 1, salt: 'a' })).not.toBe(revealKey({ lieIndex: 2, salt: 'a' }))
  })
})

describe('deadlines', () => {
  const base = () => lockEntry(normalizeRound({ startedAt: 0 }), 'X', { statements: X_STMTS, commitment: 'cx' }, 5)

  it('lets the locked player end writing only after the deadline, +1 to them', () => {
    const r = base()
    expect(canEndWriting(r, 'X', WRITING_DEADLINE_MS - 1)).toBe(false)
    expect(canEndWriting(r, 'X', WRITING_DEADLINE_MS)).toBe(true)
    expect(canEndWriting(r, 'O', WRITING_DEADLINE_MS)).toBe(false) // O never locked
    const done = endStalledRound(r, 'X', WRITING_DEADLINE_MS)
    expect(done.result.reason).toBe('writingTimeout')
    expect(done.result.X.points).toBe(1)
    expect(done.result.O).toMatchObject({ points: 0, fault: 'noStatements' })
    expect(endStalledRound(r, 'O', WRITING_DEADLINE_MS)).toBeNull()
  })

  it('has no writing deadline until the clock is anchored', () => {
    const r = lockEntry(normalizeRound({}), 'X', { statements: X_STMTS, commitment: 'cx' }, 5)
    expect(canEndWriting(r, 'X', 10 ** 12)).toBe(false)
  })

  it('lets the player who guessed end guessing after 60 s', () => {
    let r = lockEntry(base(), 'O', { statements: O_STMTS, commitment: 'co' }, 100)
    r = lockGuess(r, 'O', 1, 200)
    expect(canEndGuessing(r, 'O', 100 + GUESSING_DEADLINE_MS - 1)).toBe(false)
    expect(canEndGuessing(r, 'O', 100 + GUESSING_DEADLINE_MS)).toBe(true)
    expect(canEndGuessing(r, 'X', 100 + GUESSING_DEADLINE_MS)).toBe(false)
    const done = endStalledRound(r, 'O', 100 + GUESSING_DEADLINE_MS)
    expect(done.result.reason).toBe('guessingTimeout')
    expect(done.result.O).toMatchObject({ points: 1, guess: 1 })
    expect(done.result.X).toMatchObject({ points: 0, fault: 'noGuess' })
  })

  it('lets the player who revealed forfeit a missing reveal after the grace', async () => {
    const { round, secrets } = await playToReveal()
    const r = submitReveal(round, 'X', secrets.X)
    expect(canForfeitOpponentReveal(r, 'X', 40 + REVEAL_DEADLINE_MS - 1)).toBe(false)
    expect(canForfeitOpponentReveal(r, 'X', 40 + REVEAL_DEADLINE_MS)).toBe(true)
    expect(canForfeitOpponentReveal(r, 'O', 40 + REVEAL_DEADLINE_MS)).toBe(false)
  })
})

describe('applyRoundScores', () => {
  it('adds each side\'s points', () => {
    expect(applyRoundScores({ X: 2 }, { X: { points: 1 }, O: { points: 1 } })).toEqual({ X: 3, O: 1 })
    expect(applyRoundScores(undefined, null)).toEqual({ X: 0, O: 0 })
  })
})

describe('game transactions', () => {
  it('settleRevealedGame scores the round and finishes the match on a lead at the target', async () => {
    const { round, secrets } = await playToReveal({ xLie: 0, oLie: 1, xGuess: 1, oGuess: 2 })
    const r = revealBoth(round, secrets)
    const v = await verifyRoundReveals(r, verifyReveal)
    const game = { status: 'playing', scores: { X: 2, O: 2 }, round: toFirebaseRound(r), players: { X: {}, O: {} } }
    const next = settleRevealedGame(game, v, { now: 5, matchTarget: 3 })
    expect(next.scores).toEqual({ X: 3, O: 2 })
    expect(next.status).toBe('finished')
    expect(next.winner).toBe('X')
    expect(next.players).toBe(game.players)
    expect(normalizeRound(next.round).phase).toBe('done')
  })

  it('keeps playing after a round that ends level at or above the target', async () => {
    const { round, secrets } = await playToReveal({ xLie: 0, oLie: 1, xGuess: 1, oGuess: 0 })
    const r = revealBoth(round, secrets)
    const v = await verifyRoundReveals(r, verifyReveal)
    const next = settleRevealedGame({ status: 'playing', scores: { X: 2, O: 2 }, round: toFirebaseRound(r) }, v, { now: 5 })
    expect(next.scores).toEqual({ X: 3, O: 3 })
    expect(next.status).toBe('playing')
    expect(next.winner).toBeUndefined()
  })

  it('does nothing once the match is finished (e.g. CLAIM WIN) or already settled', async () => {
    const { round, secrets } = await playToReveal()
    const r = revealBoth(round, secrets)
    const v = await verifyRoundReveals(r, verifyReveal)
    expect(settleRevealedGame({ status: 'finished', scores: {}, round: toFirebaseRound(r) }, v, { now: 1 })).toBeNull()
    const settled = settleRevealedGame({ status: 'playing', scores: {}, round: toFirebaseRound(r) }, v, { now: 1 })
    expect(settleRevealedGame(settled, v, { now: 2 })).toBeNull() // no double scoring
  })

  it('settleStalledGame awards the locked player and can end the match', () => {
    const r = lockEntry(normalizeRound({ startedAt: 0 }), 'O', { statements: O_STMTS, commitment: 'co' }, 5)
    const game = { status: 'playing', scores: { X: 1, O: 2 }, round: toFirebaseRound(r) }
    expect(settleStalledGame(game, 'O', { now: 10 })).toBeNull() // too early
    const next = settleStalledGame(game, 'O', { now: WRITING_DEADLINE_MS })
    expect(next.scores).toEqual({ X: 1, O: 3 })
    expect(next.winner).toBe('O')
    expect(next.status).toBe('finished')
  })

  it('advanceGame starts the next round once, guarded by round number', () => {
    const done = { ...normalizeRound({ roundNum: 2 }), phase: 'done', result: { reason: 'reveal', X: { points: 0 }, O: { points: 1 } } }
    const game = { status: 'playing', scores: { X: 0, O: 1 }, round: toFirebaseRound(done), proposal: { action: 'switch' } }
    const next = advanceGame(game, 2, 777)
    expect(next.round).toEqual({ roundNum: 3, phase: 'writing', startedAt: 777 })
    expect(next.proposal).toBeNull()
    expect(advanceGame(next, 2, 778)).toBeNull() // second NEXT ROUND is a no-op
    expect(advanceGame({ ...game, status: 'finished' }, 2, 1)).toBeNull()
  })
})
