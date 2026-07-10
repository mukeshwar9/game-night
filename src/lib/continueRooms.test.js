import { describe, it, expect } from 'vitest'
import { deriveChip, getOpponent } from './continueRooms'

const twoPlayerGame = (overrides = {}) => ({
  gameType: 'tictactoe',
  status: 'playing',
  currentTurn: 'X',
  players: {
    X: { name: 'Alice', playerId: 'uid-alice', avatar: 'robot' },
    O: { name: 'Bob', playerId: 'uid-bob', avatar: 'ghost' },
  },
  ...overrides,
})

const partyGame = (overrides = {}) => ({
  gameType: 'wavelength',
  status: 'playing',
  players: {
    'uid-me': { name: 'Me', avatar: 'invader' },
    'uid-alice': { name: 'Alice', avatar: 'robot' },
    'uid-bob': { name: 'Bob', avatar: 'ghost' },
  },
  ...overrides,
})

describe('deriveChip', () => {
  it('shows WAITING FOR OPPONENT when status is waiting', () => {
    const game = twoPlayerGame({ status: 'waiting' })
    expect(deriveChip(game, 'uid-alice', null)).toEqual({ text: 'WAITING FOR OPPONENT', tone: 'dim' })
  })

  it('shows FINISHED win tone when I won', () => {
    const game = twoPlayerGame({ status: 'finished', winner: 'X' })
    expect(deriveChip(game, 'uid-alice', null)).toEqual({ text: 'FINISHED', tone: 'win' })
  })

  it('shows FINISHED dim tone when I lost', () => {
    const game = twoPlayerGame({ status: 'finished', winner: 'O' })
    expect(deriveChip(game, 'uid-alice', null)).toEqual({ text: 'FINISHED', tone: 'dim' })
  })

  it('shows FINISHED dim tone for a draw', () => {
    const game = twoPlayerGame({ status: 'finished', winner: 'draw' })
    expect(deriveChip(game, 'uid-alice', null)).toEqual({ text: 'FINISHED', tone: 'dim' })
  })

  it('shows YOUR TURN when playing and it is my seat', () => {
    const game = twoPlayerGame({ status: 'playing', currentTurn: 'X' })
    expect(deriveChip(game, 'uid-alice', null)).toEqual({ text: 'YOUR TURN', tone: 'action' })
  })

  it('shows WAITING FOR OPPONENT when playing and it is not my turn', () => {
    const game = twoPlayerGame({ status: 'playing', currentTurn: 'O' })
    expect(deriveChip(game, 'uid-alice', null)).toEqual({ text: 'WAITING FOR OPPONENT', tone: 'dim' })
  })

  it('resolves seat via playerId match in game.players', () => {
    const game = twoPlayerGame({ status: 'playing', currentTurn: 'O' })
    expect(deriveChip(game, 'uid-bob', null)).toEqual({ text: 'YOUR TURN', tone: 'action' })
  })

  it('falls back to sessionSeat when playerId is not found in players', () => {
    const game = twoPlayerGame({ status: 'playing', currentTurn: 'O', players: { X: { name: 'Alice', playerId: 'uid-alice' } } })
    expect(deriveChip(game, 'uid-unknown', 'O')).toEqual({ text: 'YOUR TURN', tone: 'action' })
  })

  it('shows IN PROGRESS for an unknown seat', () => {
    const game = twoPlayerGame({ status: 'playing', players: { X: { name: 'Alice', playerId: 'uid-alice' } } })
    expect(deriveChip(game, 'uid-unknown', null)).toEqual({ text: 'IN PROGRESS', tone: 'dim' })
  })

  it('shows IN PROGRESS for party games while playing', () => {
    const game = partyGame({ status: 'playing' })
    expect(deriveChip(game, 'uid-me', null)).toEqual({ text: 'IN PROGRESS', tone: 'dim' })
  })
})

describe('getOpponent', () => {
  it('returns the other seat for a 2P game', () => {
    const game = twoPlayerGame()
    expect(getOpponent(game, 'uid-alice', null)).toEqual({ name: 'Bob', avatar: 'ghost' })
  })

  it('returns null when the opponent seat is absent', () => {
    const game = twoPlayerGame({ players: { X: { name: 'Alice', playerId: 'uid-alice' } } })
    expect(getOpponent(game, 'uid-alice', null)).toBeNull()
  })

  it('returns the first other player plus extra count for party games', () => {
    const game = partyGame()
    const opp = getOpponent(game, 'uid-me', null)
    expect(opp.name).toBeDefined()
    expect(opp.extra).toBe(1)
  })

  it('returns null for party games with no other players', () => {
    const game = partyGame({ players: { 'uid-me': { name: 'Me', avatar: 'invader' } } })
    expect(getOpponent(game, 'uid-me', null)).toBeNull()
  })

  it('resolves seat via sessionSeat fallback', () => {
    const game = twoPlayerGame({ players: { X: { name: 'Alice', playerId: 'uid-alice' }, O: { name: 'Bob', playerId: 'uid-bob' } } })
    expect(getOpponent(game, 'uid-unknown', 'X')).toEqual({ name: 'Bob', avatar: undefined })
  })
})
