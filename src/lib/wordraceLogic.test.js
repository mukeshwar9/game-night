import { describe, expect, it } from 'vitest'
import {
  DONE_GRACE_MS,
  FINISH_GRACE_MS,
  RACE_REVEAL_MS,
  advanceRaceRound,
  buildNextRaceRound,
  buildRaceRoundStart,
  getGraceEndsAt,
  getRoundAnswer,
  ghostSummary,
  raceProgress,
  resolveRaceRound,
  applyGuessForPlayer,
  compareRace,
  getDoneState,
  getRaceReason,
  markGuess,
  nextRound,
  pickAnswer,
  shouldReveal,
} from './wordraceLogic'

const baseRound = {
  phase: 'playing',
  roundNum: 1,
  used: [0],
  guessesX: [],
  guessesO: [],
  doneX: null,
  doneO: null,
}

describe('wordraceLogic', () => {
  it('picks deterministic answers and skips used indexes', () => {
    const words = ['apple', 'cabin', 'crown', 'dream']
    const first = pickAnswer(words, 'seed-1')
    expect(first).toBe(pickAnswer(words, 'seed-1'))
    expect(pickAnswer(words, 'seed-1', [first])).not.toBe(first)
  })

  it('marks a solving guess and records done state', () => {
    const next = applyGuessForPlayer(baseRound, 'X', 'crown', 'crown', 120)
    expect(next.guessesX[0]).toMatchObject({ word: 'crown', marks: 'GGGGG', at: 120 })
    expect(next.doneX).toEqual({ solved: true, guesses: 1, at: 120 })
  })

  it('marks sixth wrong guess as failed', () => {
    const guesses = Array.from({ length: 5 }, (_, i) => ({ word: `guess${i}`, marks: 'BBBBB', at: i }))
    const next = applyGuessForPlayer({ ...baseRound, guessesX: guesses }, 'X', 'apple', 'crown', 500)
    expect(next.doneX).toEqual({ solved: false, guesses: 6, at: 500 })
  })

  it('rejects invalid words and guesses after done', () => {
    expect(applyGuessForPlayer(baseRound, 'X', 'zzzzz', 'crown', 1)).toBeNull()
    expect(applyGuessForPlayer({ ...baseRound, doneX: { solved: true, guesses: 1, at: 1 } }, 'X', 'crown', 'crown', 2)).toBeNull()
  })

  it('compares solve, guess count, speed, and fail outcomes', () => {
    expect(compareRace({ solved: true, guesses: 3, at: 300 }, { solved: false, guesses: 6, at: 400 })).toBe('X')
    expect(compareRace({ solved: true, guesses: 3, at: 300 }, { solved: true, guesses: 4, at: 400 })).toBe('X')
    expect(compareRace({ solved: true, guesses: 3, at: 500 }, { solved: true, guesses: 3, at: 400 })).toBe('O')
    expect(compareRace({ solved: true, guesses: 3, at: 400 }, { solved: true, guesses: 3, at: 400 })).toBe('draw')
    expect(compareRace({ solved: false, guesses: 6, at: 500 }, { solved: false, guesses: 6, at: 400 })).toBe('draw')
    expect(getRaceReason({ solved: true, guesses: 3, at: 400 }, { solved: true, guesses: 3, at: 400 })).toBe('speed')
    expect(getRaceReason({ solved: false, guesses: 6, at: 400 }, { solved: false, guesses: 6, at: 400 })).toBe('fail')
  })

  it('waits for both done or the finish grace after a solve', () => {
    const solved = { solved: true, guesses: 2, at: 1_000 }
    expect(shouldReveal({ ...baseRound, doneX: solved }, 1_000 + FINISH_GRACE_MS - 1)).toBe(false)
    expect(shouldReveal({ ...baseRound, doneX: solved }, 1_000 + FINISH_GRACE_MS)).toBe(true)
    expect(shouldReveal({ ...baseRound, doneX: solved, doneO: { solved: false, guesses: 6, at: 1_100 } }, 1_100)).toBe(true)
  })

  it('regression: a failed player no longer waits forever on an idle opponent', () => {
    const failed = { solved: false, guesses: 6, at: 1_100 }
    expect(shouldReveal({ ...baseRound, doneO: failed }, 1_100 + DONE_GRACE_MS - 1)).toBe(false)
    expect(shouldReveal({ ...baseRound, doneO: failed }, 1_100 + DONE_GRACE_MS)).toBe(true)
    expect(getGraceEndsAt({ ...baseRound, doneO: failed })).toBe(1_100 + DONE_GRACE_MS)
    expect(getGraceEndsAt({ ...baseRound, doneX: { solved: true, guesses: 2, at: 50 } })).toBe(50 + FINISH_GRACE_MS)
    expect(getGraceEndsAt(baseRound)).toBeNull()
  })

  it('reuses Word Duel duplicate-letter marking', () => {
    expect(markGuess('GEESE', 'THOSE')).toBe('BBBGG')
    const next = applyGuessForPlayer(baseRound, 'X', 'geese', 'those', 50)
    expect(next.guessesX[0].marks).toBe('BBBGG')
  })

  it('starts a clean non-repeating next round', () => {
    const next = nextRound({ ...baseRound, roundNum: 2, used: [0, 2] }, 'seed-3', 4)
    expect(next).toMatchObject({ phase: 'playing', roundNum: 3, seed: 'seed-3', answerIndex: 4, startedAt: null })
    expect(next.used).toEqual([0, 2, 4])
    expect(getDoneState(next.guessesX, 1)).toBeNull()
  })

  it('pins the answer string and grades against it', () => {
    const list = ['apple', 'crane', 'plant']
    const round = buildRaceRoundStart({ stub: { used: [0] }, seed: 's', answerList: list, at: 10 })
    expect(round.answer).toBe(list[round.answerIndex])
    expect(round.used).toContain(round.answerIndex)
    // A client whose bundled list changed still grades the pinned word.
    expect(getRoundAnswer(round, ['zzzzz', 'yyyyy', 'xxxxx'])).toBe(round.answer)
    // Old rooms without a pinned string fall back to the list.
    expect(getRoundAnswer({ answerIndex: 1 }, list)).toBe('crane')
  })

  it('regression: roundNum comes from the rematch stub and increments within a match', () => {
    const list = ['apple', 'crane', 'plant', 'dream']
    expect(buildRaceRoundStart({ stub: { used: [0], roundNum: 4 }, seed: 's', answerList: list, at: 1 }).roundNum).toBe(4)
    expect(buildRaceRoundStart({ stub: null, seed: 's', answerList: list, at: 1 }).roundNum).toBe(1)
    const next = buildNextRaceRound({ round: { roundNum: 2, used: [0, 1] }, seed: 't', answerList: list, at: 5 })
    expect(next).toMatchObject({ roundNum: 3, phase: 'playing', startedAt: 5 })
    expect(next.answer).toBe(list[next.answerIndex])
    expect([0, 1]).not.toContain(next.answerIndex)
  })

  it('resolves a timed-out round, scores it and opens the reveal window', () => {
    const game = { status: 'playing', scores: { X: 0, O: 0 }, round: { ...baseRound, doneX: { solved: true, guesses: 3, at: 100 } } }
    expect(resolveRaceRound(game, 100 + FINISH_GRACE_MS - 1)).toBeNull()
    const next = resolveRaceRound(game, 100 + FINISH_GRACE_MS)
    expect(next.round).toMatchObject({ phase: 'reveal', result: { winner: 'X' }, revealEndsAt: 100 + FINISH_GRACE_MS + RACE_REVEAL_MS })
    expect(next.round.doneO).toMatchObject({ solved: false, timedOut: true })
    expect(next.scores).toEqual({ X: 1, O: 0 })
    expect(next.status).toBe('playing')
  })

  it('ends the match at the target', () => {
    const game = { status: 'playing', scores: { X: 2, O: 1 }, round: { ...baseRound, doneX: { solved: true, guesses: 2, at: 1 }, doneO: { solved: false, guesses: 6, at: 2 } } }
    const next = resolveRaceRound(game, 3, { matchTarget: 3 })
    expect(next).toMatchObject({ status: 'finished', winner: 'X', scores: { X: 3, O: 1 } })
  })

  it('auto-advances once the reveal window closes, exactly once per round', () => {
    const list = ['apple', 'crane', 'plant', 'dream']
    const game = { status: 'playing', round: { ...baseRound, phase: 'reveal', roundNum: 2, used: [0], result: { winner: 'X' }, revealEndsAt: 1_000 } }
    expect(advanceRaceRound(game, { at: 999, seed: 's', answerList: list, expectedRoundNum: 2 })).toBeNull()
    const next = advanceRaceRound(game, { at: 1_000, seed: 's', answerList: list, expectedRoundNum: 2 })
    expect(next.round).toMatchObject({ phase: 'playing', roundNum: 3 })
    expect(advanceRaceRound(next, { at: 2_000, seed: 's', answerList: list, expectedRoundNum: 2 })).toBeNull()
    expect(advanceRaceRound({ ...game, status: 'finished' }, { at: 5_000, seed: 's', answerList: list, expectedRoundNum: 2 })).toBeNull()
  })

  it('regression: the opponent ghost shows no positions — only rows, best greens, solved', () => {
    const guesses = [{ word: 'crane', marks: 'GYBBG' }, { word: 'crate', marks: 'GGGBB' }]
    expect(ghostSummary(guesses)).toEqual({ rows: 2, bestGreens: 3, solved: false })
    expect(ghostSummary([{ word: 'crown', marks: 'GGGGG' }]).solved).toBe(true)
    expect(ghostSummary(null)).toEqual({ rows: 0, bestGreens: 0, solved: false })
  })

  it('regression: the race meter measures closeness, not guesses spent', () => {
    const spent = Array.from({ length: 5 }, () => ({ marks: 'BBBBB' }))
    expect(raceProgress(spent)).toBe(0)
    expect(raceProgress([{ marks: 'GGYBB' }])).toBeCloseTo(0.5)
    expect(raceProgress([{ marks: 'GGYBB' }, { marks: 'BBBBB' }])).toBeCloseTo(0.5)
    expect(raceProgress([{ marks: 'GGGGG' }])).toBe(1)
  })
})
