import { describe, it, expect } from 'vitest'
import { introPitch, introMeta, introSeats } from './introCardLogic'
import { GAME_TYPES } from './games'

describe('introPitch', () => {
  it('capitalises and ends the registry desc with a full stop', () => {
    expect(introPitch({ desc: 'four in a row wins' })).toBe('Four in a row wins.')
  })
  it('does not double up end punctuation', () => {
    expect(introPitch({ desc: 'Be quick!' })).toBe('Be quick.')
    expect(introPitch({ desc: 'wait...' })).toBe('Wait.')
  })
  it('is empty for a missing desc', () => {
    expect(introPitch({})).toBe('')
    expect(introPitch(null)).toBe('')
  })
  it('gives every registered game a non-empty pitch', () => {
    for (const g of GAME_TYPES) expect(introPitch(g), g.type).not.toBe('')
  })
})

describe('introMeta', () => {
  it('defaults to 2 players with the duration', () => {
    expect(introMeta({ durationMin: 4 })).toBe('2 players · about 4 min')
  })
  it('uses the registry range for party games', () => {
    expect(introMeta({ nPlayer: true, minPlayers: 3, maxPlayers: 8, durationMin: 10 })).toBe('3–8 players · about 10 min')
    expect(introMeta({ nPlayer: true, minPlayers: 2, maxPlayers: 2 })).toBe('2 players')
  })
  it('lets the actual seat count win, singular for one', () => {
    expect(introMeta({ nPlayer: true, minPlayers: 3, maxPlayers: 8 }, { players: 4 })).toBe('4 players')
    expect(introMeta({ durationMin: 1 }, { players: 1 })).toBe('1 player · about 1 min')
  })
  it('ignores a nonsense seat count and a missing duration', () => {
    expect(introMeta({}, { players: 0 })).toBe('2 players')
    expect(introMeta(undefined)).toBe('2 players')
  })
})

describe('introSeats', () => {
  it('puts you first in the P1 tone and the next seat in P2', () => {
    const seats = introSeats({ name: 'Fox', avatar: 'K1' }, [{ id: 'b1', name: 'Bot', avatar: 'K2' }])
    expect(seats.map(s => [s.key, s.tone, s.you])).toEqual([['you', 'p1', true], ['b1', 'p2', false]])
  })
  it('goes dim after the second seat and fills missing names', () => {
    const seats = introSeats({}, [{}, {}, {}])
    expect(seats.map(s => s.tone)).toEqual(['p1', 'p2', 'dim', 'dim'])
    expect(seats.map(s => s.name)).toEqual(['You', 'Player 2', 'Player 3', 'Player 4'])
    expect(new Set(seats.map(s => s.key)).size).toBe(4)
  })
  it('works with nobody else (solo)', () => {
    expect(introSeats({ name: 'Fox' })).toHaveLength(1)
  })
})
