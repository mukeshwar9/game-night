import { describe, it, expect } from 'vitest'
import {
  lateGuessers, roundGuessers, outsideOrder, orderAtWrap, matchStartedAt, joinedLate, lateJoinNotice,
} from './sketchLateJoinLogic'
import { nextRoundState, roundDeltas, GUESSER_BASE_PTS, SOLO_GUESSER_BASE_PTS } from './sketchLogic'

const seat = (id, joinedAt, online = true) => ({ playerId: id, name: id, joinedAt, online })
const players = {
  ivy: seat('ivy', 100), gus: seat('gus', 110),
  dee: seat('dee', 5000), // joined mid-match
  old: seat('old', 105, false), // seated before START, offline then
}
const round = { order: ['ivy', 'gus'], artist: 'ivy', cycle: 1, cycles: 2, startedAt: 6000, matchSeed: '1000:abc', used: [], options: [1, 2, 3] }

describe('who guesses a round', () => {
  it('adds seated players who were in before the round started', () => {
    expect(lateGuessers(round, players).sort()).toEqual(['dee', 'old'])
    expect(lateGuessers({ ...round, startedAt: 4000 }, players)).toEqual(['old'])
    expect(roundGuessers({ ...round, startedAt: 4000 }, players)).toEqual(['gus', 'old'])
  })

  it('keeps today\'s guessers for a round from an older coordinator (no startedAt)', () => {
    expect(lateGuessers({ ...round, startedAt: undefined }, players)).toEqual([])
    expect(roundGuessers({ ...round, startedAt: undefined }, players)).toEqual(['gus'])
  })

  it('lists everyone seated outside the order', () => {
    expect(outsideOrder(round, players).sort()).toEqual(['dee', 'old'])
  })
})

describe('drawing from the next cycle', () => {
  it('appends online late joiners at the wrap, in join order', () => {
    expect(orderAtWrap(round, players)).toEqual(['ivy', 'gus', 'dee'])
    const two = { ...players, eve: seat('eve', 4000) }
    expect(orderAtWrap(round, two)).toEqual(['ivy', 'gus', 'eve', 'dee'])
  })

  it('never grows the order without the match\'s stored cycle count', () => {
    expect(orderAtWrap({ ...round, cycles: undefined }, players)).toEqual(['ivy', 'gus'])
  })

  it('nextRoundState appends them only when the order wraps', () => {
    const mid = nextRoundState(round, players)
    expect(mid.round.order).toEqual(['ivy', 'gus'])
    expect(mid.round.artist).toBe('gus')
    const wrap = nextRoundState({ ...round, artist: 'gus' }, players)
    expect(wrap.round).toMatchObject({ cycle: 2, artist: 'ivy', order: ['ivy', 'gus', 'dee'] })
    // the last cycle then runs through the newcomer, and the match length holds
    const last = nextRoundState({ ...wrap.round, artist: 'gus', used: [], options: [] }, players)
    expect(last.round.artist).toBe('dee')
    expect(nextRoundState({ ...last.round, used: [], options: [] }, players)).toEqual({ finished: true })
  })

  it('joining in the last cycle: guess only, the match still ends on time', () => {
    const lastCycle = { ...round, cycle: 2, artist: 'gus' }
    expect(nextRoundState(lastCycle, players)).toEqual({ finished: true })
  })
})

describe('scoring follows the round\'s guessers', () => {
  it('a 2-player match that gains a third switches to the 3+ table', () => {
    const correct = { gus: { at: 1000 }, dee: { at: 2000 } }
    const solo = roundDeltas({ guesserIds: ['gus'], correct, artistId: 'ivy', endsAt: 75000, drawMs: 75000 })
    expect(solo.gus).toBeGreaterThanOrEqual(SOLO_GUESSER_BASE_PTS)
    const three = roundDeltas({ guesserIds: roundGuessers(round, players).filter(id => id !== 'old'), correct, artistId: 'ivy', endsAt: 75000 })
    expect(three.gus).toBe(GUESSER_BASE_PTS)
    expect(three.dee).toBe(GUESSER_BASE_PTS - 10)
  })
})

describe('JOINED LATE', () => {
  it('tags players seated after the match started', () => {
    expect(matchStartedAt(round)).toBe(1000)
    expect(joinedLate(round, players.dee)).toBe(true)
    expect(joinedLate(round, players.ivy)).toBe(false)
    expect(joinedLate({ matchSeed: '' }, players.dee)).toBe(false)
  })
})

describe('lateJoinNotice', () => {
  it('says when they guess and draw', () => {
    expect(lateJoinNotice({ cycle: 1, cycles: 2, canGrow: true })).toBe("YOU'RE IN · You guess from the next round and draw from cycle 2.")
    expect(lateJoinNotice({ cycle: 2, cycles: 2, canGrow: true })).toBe("YOU'RE IN — LAST CYCLE, SO YOU GUESS BUT DON'T DRAW")
    expect(lateJoinNotice({ cycle: 1, cycles: 2, canGrow: false })).toBe("YOU'RE IN · You guess from the next round.")
  })
})
