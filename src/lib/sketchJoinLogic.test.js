import { describe, expect, it } from 'vitest'
import {
  lateJoiners, seatedBeforeRound, roundGuessers, activeRoundGuessers, guessesThisRound,
  nextSketchRound, joinedLate, joinBarState, waitingNote,
} from './sketchJoinLogic'
import { roundDeltas } from './sketchLogic'
import { getGameConfig } from './games'

const seat = (id, joinedAt, over = {}) => ({ playerId: id, name: id, joinedAt, online: true, ...over })
const players = (extra = {}) => ({ a: seat('a', 1), b: seat('b', 2), c: seat('c', 3), ...extra })
const round = (over = {}) => ({
  phase: 'drawing', cycle: 1, artist: 'a', order: ['a', 'b', 'c'], cycles: 2,
  used: [], options: [1, 2, 3], matchSeed: 's', startedAt: 1000, matchStartedAt: 100, ...over,
})

describe('lateJoiners', () => {
  it('lists seated players missing from the order, in join order', () => {
    const ps = players({ z: seat('z', 50), y: seat('y', 40), x: seat('x', 40) })
    expect(lateJoiners(ps, ['a', 'b', 'c'])).toEqual(['x', 'y', 'z'])
  })
  it('ignores entries that are not seats', () => {
    expect(lateJoiners({ a: seat('a', 1), junk: { name: 'n' }, nil: null }, [])).toEqual(['a'])
  })
})

describe('seatedBeforeRound', () => {
  it('compares the seat with the round start; unknown times count as no', () => {
    expect(seatedBeforeRound(seat('d', 999), { startedAt: 1000 })).toBe(true)
    expect(seatedBeforeRound(seat('d', 1000), { startedAt: 1000 })).toBe(true)
    expect(seatedBeforeRound(seat('d', 1001), { startedAt: 1000 })).toBe(false)
    expect(seatedBeforeRound(seat('d', 1), {})).toBe(false)
    expect(seatedBeforeRound({ playerId: 'd' }, { startedAt: 1000 })).toBe(false)
  })
})

describe('roundGuessers', () => {
  it('is the order minus the artist when nobody joined late', () => {
    expect(roundGuessers(round(), players())).toEqual(['b', 'c'])
  })
  it('leaves out a joiner seated after the round started', () => {
    expect(roundGuessers(round(), players({ d: seat('d', 1500) }))).toEqual(['b', 'c'])
  })
  it('counts a joiner seated before the round started, offline or not', () => {
    expect(roundGuessers(round(), players({ d: seat('d', 900, { online: false }) }))).toEqual(['b', 'c', 'd'])
  })
  it('counts a player who was offline at START and so left out of the order', () => {
    expect(roundGuessers(round({ order: ['a', 'b'] }), players())).toEqual(['b', 'c'])
  })
  it('is empty without a round', () => {
    expect(roundGuessers(null, players())).toEqual([])
  })
})

describe('activeRoundGuessers', () => {
  it('waits only on online guessers, joiners included', () => {
    const ps = players({ c: seat('c', 3, { online: false }), d: seat('d', 900) })
    expect(activeRoundGuessers(round(), ps)).toEqual(['b', 'd'])
  })
  it('falls back to every guesser when none are online', () => {
    const ps = { a: seat('a', 1), b: seat('b', 2, { online: false }) }
    expect(activeRoundGuessers(round({ order: ['a', 'b'] }), ps)).toEqual(['b'])
  })
})

describe('guessesThisRound', () => {
  it('is true for an order guesser and an eligible joiner, false for the artist and a new joiner', () => {
    const ps = players({ d: seat('d', 900), e: seat('e', 2000) })
    expect(guessesThisRound(round(), ps, 'b')).toBe(true)
    expect(guessesThisRound(round(), ps, 'd')).toBe(true)
    expect(guessesThisRound(round(), ps, 'a')).toBe(false)
    expect(guessesThisRound(round(), ps, 'e')).toBe(false)
    expect(guessesThisRound(round(), ps, null)).toBe(false)
  })
})

describe('scoring with a late joiner', () => {
  it('a 2-player round that gains a third guesser scores on the 3+ table', () => {
    const r = round({ order: ['a', 'b'], drawStartedAt: 0, drawMs: 75000 })
    const ps = { a: seat('a', 1), b: seat('b', 2), d: seat('d', 900) }
    const guesserIds = roundGuessers(r, ps)
    expect(guesserIds).toEqual(['b', 'd'])
    const deltas = roundDeltas({ guesserIds, correct: { d: { at: 10 }, b: { at: 20 } }, artistId: 'a', endsAt: 75000, drawMs: 75000 })
    expect(deltas).toEqual({ d: 100, b: 90, a: 50 })
  })
})

describe('nextSketchRound', () => {
  it('stamps the new round start and carries the match start', () => {
    const { finished, round: next } = nextSketchRound(round({ phase: 'reveal' }), players(), 5000)
    expect(finished).toBe(false)
    expect(next).toMatchObject({ artist: 'b', cycle: 1, startedAt: 5000, matchStartedAt: 100, order: ['a', 'b', 'c'] })
  })

  it('keeps the order within a cycle even with a joiner waiting', () => {
    const { round: next } = nextSketchRound(round({ phase: 'reveal' }), players({ d: seat('d', 1500) }), 5000)
    expect(next.order).toEqual(['a', 'b', 'c'])
  })

  it('appends online joiners at the wrap, in join order, so they draw this cycle', () => {
    const ps = players({ e: seat('e', 1600), d: seat('d', 1500), off: seat('off', 1400, { online: false }) })
    const { round: next } = nextSketchRound(round({ phase: 'reveal', artist: 'c' }), ps, 5000)
    expect(next).toMatchObject({ cycle: 2, artist: 'a', order: ['a', 'b', 'c', 'd', 'e'] })
  })

  it('a joiner appended at the wrap draws last in that cycle, then the match ends', () => {
    const ps = players({ d: seat('d', 1500) })
    let r = nextSketchRound(round({ phase: 'reveal', artist: 'c' }), ps, 5000).round
    const artists = [r.artist]
    for (let i = 0; i < 10; i++) {
      const res = nextSketchRound(r, ps, 6000 + i)
      if (res.finished) break
      r = res.round
      artists.push(r.artist)
    }
    expect(artists).toEqual(['a', 'b', 'c', 'd'])
  })

  it('a 2-player match keeps its three cycles after a third player joins', () => {
    const ps = { a: seat('a', 1), b: seat('b', 2), d: seat('d', 1500) }
    let r = round({ phase: 'reveal', order: ['a', 'b'], artist: 'a', cycles: 3 })
    const turns = [`${r.cycle}${r.artist}`]
    for (let i = 0; i < 20; i++) {
      const res = nextSketchRound(r, ps, 6000 + i)
      if (res.finished) break
      r = res.round
      turns.push(`${r.cycle}${r.artist}`)
    }
    expect(turns).toEqual(['1a', '1b', '2a', '2b', '2d', '3a', '3b', '3d'])
  })

  it('nobody is appended once the match is over', () => {
    expect(nextSketchRound(round({ phase: 'reveal', artist: 'c', cycle: 2 }), players({ d: seat('d', 1500) }), 5000)).toEqual({ finished: true })
  })

  it('omits the match start on rounds from before it existed', () => {
    const { round: next } = nextSketchRound(round({ phase: 'reveal', matchStartedAt: undefined }), players(), 5000)
    expect(next).not.toHaveProperty('matchStartedAt')
  })
})

describe('joinedLate', () => {
  it('tags seats taken after the match began', () => {
    expect(joinedLate(seat('d', 101), round())).toBe(true)
    expect(joinedLate(seat('d', 100), round())).toBe(false)
    expect(joinedLate(seat('d', 101), round({ matchStartedAt: undefined }))).toBe(false)
  })
})

describe('joinBarState', () => {
  it('passes the room offer through for a watcher', () => {
    expect(joinBarState({ round: round(), players: players(), uid: 'w', offer: 'open' })).toBe('open')
    expect(joinBarState({ round: round(), players: players(), uid: 'w', offer: 'full' })).toBe('full')
    expect(joinBarState({ round: round(), players: players(), uid: 'w', offer: null })).toBe(null)
  })
  it('says waiting for a seated joiner until their first round', () => {
    expect(joinBarState({ round: round(), players: players({ d: seat('d', 1500) }), uid: 'd' })).toBe('waiting')
    expect(joinBarState({ round: round(), players: players({ d: seat('d', 900) }), uid: 'd' })).toBe(null)
  })
  it('is hidden for players already in the order', () => {
    expect(joinBarState({ round: round(), players: players(), uid: 'a' })).toBe(null)
    expect(joinBarState({ round: round(), players: players(), uid: 'b' })).toBe(null)
  })
  it('is hidden without a round or a uid', () => {
    expect(joinBarState({ round: null, players: players(), uid: 'w', offer: 'open' })).toBe(null)
    expect(joinBarState({ round: round(), players: players(), uid: null, offer: 'open' })).toBe(null)
  })
})

describe('waitingNote', () => {
  it('names the cycle the joiner first draws in', () => {
    expect(waitingNote(round({ cycle: 1, cycles: 2 }))).toEqual({ title: "YOU'RE IN", body: 'You guess from the next round and draw from cycle 2.' })
  })
  it('says the last cycle is guess-only', () => {
    expect(waitingNote(round({ cycle: 2, cycles: 2 })).title).toBe("YOU'RE IN — LAST CYCLE, SO YOU GUESS BUT DON'T DRAW")
  })
})

describe('registry: Sketch takes players mid-match', () => {
  it('flags the game midJoin', () => {
    expect(getGameConfig('sketch').midJoin).toBe(true)
  })
  it('START stamps the round and the match with the server clock it is given', () => {
    const ps = { a: seat('a', 1), b: seat('b', 2) }
    const { round: first } = getGameConfig('sketch').startRound(ps, {}, { now: 4242 })
    expect(first).toMatchObject({ startedAt: 4242, matchStartedAt: 4242 })
    // a joiner seated after START waits for the next round
    expect(roundGuessers(first, { ...ps, d: seat('d', 5000) })).toEqual(['b'])
  })
})
