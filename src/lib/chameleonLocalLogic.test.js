import { describe, it, expect } from 'vitest'
import {
  clampLocalCount, cleanLocalName, buildLocalPlayers, dealLocalRound, secretWordOf, secretFor,
  nextAfterVote, settleLocalRound, LOCAL_NAME_MAX,
} from './chameleonLocalLogic'
import { CHAMELEON_CARDS } from './decks/chameleon'
import {
  CHAMELEON_MIN_PLAYERS, CHAMELEON_MAX_PLAYERS, CHAMELEON_MATCH_POINTS, POINTS_ESCAPED, POINTS_STOLEN, POINTS_CAUGHT,
} from './chameleonLogic'

const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length] }

describe('table setup', () => {
  it('clamps the player count to the game range', () => {
    expect(clampLocalCount(1)).toBe(CHAMELEON_MIN_PLAYERS)
    expect(clampLocalCount(99)).toBe(CHAMELEON_MAX_PLAYERS)
    expect(clampLocalCount('5')).toBe(5)
    expect(clampLocalCount(NaN)).toBe(CHAMELEON_MIN_PLAYERS)
  })

  it('cleans names: trims, upper-cases, caps, falls back to the seat number', () => {
    expect(cleanLocalName('  ben   x ', 0)).toBe('BEN X')
    expect(cleanLocalName('', 2)).toBe('P3')
    expect(cleanLocalName(null, 0)).toBe('P1')
    expect(cleanLocalName('a'.repeat(40), 0)).toHaveLength(LOCAL_NAME_MAX)
  })

  it('builds seats with stable ids and disambiguates duplicate names', () => {
    const ps = buildLocalPlayers(['ben', 'BEN', 'cy'], 3)
    expect(ps.map(p => p.id)).toEqual(['p0', 'p1', 'p2'])
    expect(new Set(ps.map(p => p.name)).size).toBe(3)
    expect(ps[2].name).toBe('CY')
  })

  it('fills missing names with defaults', () => {
    expect(buildLocalPlayers([], 4).map(p => p.name)).toEqual(['P1', 'P2', 'P3', 'P4'])
  })
})

describe('dealLocalRound', () => {
  const players = buildLocalPlayers([], 4)

  it('picks exactly one Chameleon among the seats and a valid word slot', () => {
    const d = dealLocalRound({ players, rng: seq(0.5, 0.5) })
    expect(players.map(p => p.id)).toContain(d.chameleonId)
    expect(d.secretIndex).toBeGreaterThanOrEqual(0)
    expect(d.secretIndex).toBeLessThan(16)
    expect(CHAMELEON_CARDS[d.cardIndex]).toBeTruthy()
  })

  it('never repeats the previous card', () => {
    for (let i = 0; i < 40; i++) {
      const d = dealLocalRound({ players, prevCardIndex: 3, rng: Math.random })
      expect(d.cardIndex).not.toBe(3)
    }
  })

  it('rotates who gives the first clue each round', () => {
    const a = dealLocalRound({ players, roundNo: 0 }).order
    const b = dealLocalRound({ players, roundNo: 1 }).order
    expect(a[0]).toBe('p0')
    expect(b[0]).toBe('p1')
    expect([...b].sort()).toEqual([...a].sort())
  })

  it('tells the Chameleon nothing but its role, and everyone else the word', () => {
    const d = dealLocalRound({ players })
    const mine = secretFor(d.chameleonId, d)
    expect(mine).toEqual({ chameleon: true })
    const other = players.find(p => p.id !== d.chameleonId)
    const theirs = secretFor(other.id, d)
    expect(theirs.chameleon).toBe(false)
    expect(theirs.word).toBe(secretWordOf(d))
    expect(theirs.word).toBe(CHAMELEON_CARDS[d.cardIndex].words[d.secretIndex])
  })
})

describe('vote → result', () => {
  const players = buildLocalPlayers([], 4)
  const deal = { cardIndex: 0, secretIndex: 5, chameleonId: 'p2', order: ['p0', 'p1', 'p2', 'p3'] }
  const zero = { p0: 0, p1: 0, p2: 0, p3: 0 }

  it('sends a caught Chameleon to the guess and ends the round otherwise', () => {
    expect(nextAfterVote('p2', deal)).toBe('guess')
    expect(nextAfterVote('p1', deal)).toBe('result')
    expect(nextAfterVote(null, deal)).toBe('result')
  })

  it('scores an escape for the Chameleon alone', () => {
    const r = settleLocalRound({ players, scores: zero, deal, accusedId: 'p1' })
    expect(r.outcome).toBe('escaped')
    expect(r.delta).toEqual({ p0: 0, p1: 0, p2: POINTS_ESCAPED, p3: 0 })
  })

  it('treats a tie (nobody accused) as an escape', () => {
    expect(settleLocalRound({ players, scores: zero, deal, accusedId: null }).outcome).toBe('escaped')
  })

  it('gives a point for a stolen round when the guess hits', () => {
    const r = settleLocalRound({ players, scores: zero, deal, accusedId: 'p2', guessIndex: 5 })
    expect(r.outcome).toBe('stolen')
    expect(r.delta.p2).toBe(POINTS_STOLEN)
  })

  it('pays everyone else when the Chameleon is caught and guesses wrong', () => {
    const r = settleLocalRound({ players, scores: zero, deal, accusedId: 'p2', guessIndex: 6 })
    expect(r.outcome).toBe('caught')
    expect(r.delta).toEqual({ p0: POINTS_CAUGHT, p1: POINTS_CAUGHT, p2: 0, p3: POINTS_CAUGHT })
  })

  it('reports match winners at the target score', () => {
    const near = { ...zero, p2: CHAMELEON_MATCH_POINTS - 1 }
    const r = settleLocalRound({ players, scores: near, deal, accusedId: null })
    expect(r.winners).toEqual(['p2'])
    expect(settleLocalRound({ players, scores: zero, deal, accusedId: null }).winners).toEqual([])
  })
})
