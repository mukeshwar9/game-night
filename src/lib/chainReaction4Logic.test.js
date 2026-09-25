import { describe, it, expect } from 'vitest'
import {
  dealtSymbols, seatOfSymbol, awayTurnOwner, skipAwayTurn,
} from './chainReaction4Logic'
import { applyChainReaction4Move, CR_CELL_COUNT } from './chainReactionLogic'

const on = (id) => ({ playerId: id, online: true })
const off = (id) => ({ playerId: id, online: false })

const room = (over = {}) => ({
  status: 'playing',
  currentTurn: 'X',
  crSeatSymbols: { ua: 'X', ub: 'O', uc: 'A', ud: 'B' },
  crEliminated: {},
  crPlaced: { X: true, O: true, A: true, B: true },
  ...over,
})

describe('dealtSymbols', () => {
  it('keeps only dealt colours, in turn order', () => {
    expect(dealtSymbols({ u2: 'O', u1: 'X' })).toEqual(['X', 'O'])
    expect(dealtSymbols({ u1: 'X', u3: 'A', u2: 'O' })).toEqual(['X', 'O', 'A'])
  })

  it('falls back to all four colours when nothing is dealt', () => {
    expect(dealtSymbols(null)).toEqual(['X', 'O', 'A', 'B'])
  })
})

describe('seatOfSymbol', () => {
  it('finds the uid holding a colour', () => {
    expect(seatOfSymbol({ ua: 'X', ub: 'O' }, 'O')).toBe('ub')
    expect(seatOfSymbol({ ua: 'X' }, 'B')).toBeNull()
  })
})

describe('2- and 3-player turn rotation (regression: undealt colours froze the game)', () => {
  it('passes the turn from O straight back to X in a 2-player match', () => {
    const board = Array(CR_CELL_COUNT).fill('')
    const game = { crMoves: 1, crPlaced: { X: true }, crEliminated: {} }
    const res = applyChainReaction4Move({ board, game, index: 9, symbol: 'O', symbols: dealtSymbols({ ua: 'X', ub: 'O' }) })
    expect(res.updates.currentTurn).toBe('X')
  })

  it('declares a winner in a 2-player match once one colour is wiped', () => {
    const board = Array(CR_CELL_COUNT).fill('')
    board[0] = 'X1' // corner, critical mass 2
    board[1] = 'O1' // O's only orb, next to the corner
    const game = { crMoves: 2, crPlaced: { X: true, O: true }, crEliminated: {} }
    const res = applyChainReaction4Move({ board, game, index: 0, symbol: 'X', symbols: dealtSymbols({ ua: 'X', ub: 'O' }) })
    expect(res.result).toEqual({ winner: 'X' })
  })
})

describe('awayTurnOwner', () => {
  it('is null while the player to move is online', () => {
    expect(awayTurnOwner(room(), { ua: on('ua') })).toBeNull()
  })

  it('treats missing presence as online', () => {
    expect(awayTurnOwner(room(), { ua: { playerId: 'ua' } })).toBeNull()
  })

  it('reports an offline or departed player to move', () => {
    expect(awayTurnOwner(room(), { ua: off('ua') })).toEqual({ symbol: 'X', uid: 'ua' })
    expect(awayTurnOwner(room(), {})).toEqual({ symbol: 'X', uid: 'ua' })
  })

  it('is null outside a live game', () => {
    expect(awayTurnOwner(room({ status: 'finished' }), { ua: off('ua') })).toBeNull()
    expect(awayTurnOwner(room({ winner: 'O' }), { ua: off('ua') })).toBeNull()
    expect(awayTurnOwner(room({ currentTurn: null }), { ua: off('ua') })).toBeNull()
  })
})

describe('skipAwayTurn', () => {
  const allOn = { ua: on('ua'), ub: on('ub'), uc: on('uc'), ud: on('ud') }

  it('does nothing while the player to move is online', () => {
    expect(skipAwayTurn(room(), allOn)).toBeNull()
  })

  it('passes an offline player\'s turn to the next online colour', () => {
    const res = skipAwayTurn(room(), { ...allOn, ua: off('ua') })
    expect(res.updates.currentTurn).toBe('O')
    expect(res.skipped).toEqual(['X'])
    expect(res.eliminated).toEqual([])
    expect(res.updates.crEliminated).toEqual({})
  })

  it('skips every consecutive offline colour at once', () => {
    const res = skipAwayTurn(room(), { ...allOn, ua: off('ua'), ub: off('ub') })
    expect(res.updates.currentTurn).toBe('A')
    expect(res.skipped).toEqual(['X', 'O'])
  })

  it('never lands on an eliminated colour', () => {
    const res = skipAwayTurn(room({ crEliminated: { O: true } }), { ...allOn, ua: off('ua') })
    expect(res.updates.currentTurn).toBe('A')
  })

  it('wraps around the dealt order', () => {
    const res = skipAwayTurn(room({ currentTurn: 'B' }), { ...allOn, ud: off('ud') })
    expect(res.updates.currentTurn).toBe('X')
  })

  it('eliminates a no-show who never placed an orb', () => {
    const game = room({ crPlaced: { O: true, A: true, B: true } })
    const res = skipAwayTurn(game, { ...allOn, ua: off('ua') })
    expect(res.eliminated).toEqual(['X'])
    expect(res.updates.crEliminated).toEqual({ X: true })
    expect(res.updates.currentTurn).toBe('O')
  })

  it('awards the win when the forfeit leaves one colour standing', () => {
    const game = room({
      crSeatSymbols: { ua: 'X', ub: 'O' },
      crPlaced: {},
    })
    const res = skipAwayTurn(game, { ua: off('ua'), ub: on('ub') })
    expect(res.updates).toMatchObject({ winner: 'O', status: 'finished', currentTurn: null })
  })

  it('only rotates within the dealt colours in a 2-player match', () => {
    const game = room({ currentTurn: 'O', crSeatSymbols: { ua: 'X', ub: 'O' }, crPlaced: { X: true, O: true } })
    const res = skipAwayTurn(game, { ua: on('ua'), ub: off('ub') })
    expect(res.updates.currentTurn).toBe('X')
  })

  it('keeps waiting when nobody online can take the turn', () => {
    expect(skipAwayTurn(room(), { ua: off('ua'), ub: off('ub'), uc: off('uc'), ud: off('ud') })).toBeNull()
  })

  it('CAS: no-op once the turn has moved on', () => {
    expect(skipAwayTurn(room(), { ...allOn, ua: off('ua') }, 'O')).toBeNull()
    expect(skipAwayTurn(room(), { ...allOn, ua: off('ua') }, 'X')).not.toBeNull()
  })
})
