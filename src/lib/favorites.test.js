import { describe, it, expect, beforeAll, beforeEach } from 'vitest'

// games.js (imported transitively) pulls in board components that touch
// `localStorage` at module load (src/lib/sounds.js) — stub it with a real
// in-memory backing store before the dynamic import since this suite runs
// outside a DOM environment and favorites.js needs read/write round-trips.
if (typeof globalThis.localStorage === 'undefined') {
  let store = {}
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: (k) => { delete store[k] },
    clear: () => { store = {} },
  }
}

let getFavorites, isFavorite, toggleFavorite
beforeAll(async () => {
  ;({ getFavorites, isFavorite, toggleFavorite } = await import('./favorites'))
})

beforeEach(() => {
  globalThis.localStorage.clear()
})

describe('favorites', () => {
  it('returns an empty array when nothing is stored', () => {
    expect(getFavorites()).toEqual([])
  })

  it('toggleFavorite adds a game and returns true', () => {
    const result = toggleFavorite('tictactoe')
    expect(result).toBe(true)
    expect(getFavorites()).toEqual(['tictactoe'])
  })

  it('toggleFavorite removes an already-favorited game and returns false', () => {
    toggleFavorite('tictactoe')
    const result = toggleFavorite('tictactoe')
    expect(result).toBe(false)
    expect(getFavorites()).toEqual([])
  })

  it('isFavorite reflects current state', () => {
    expect(isFavorite('connectfour')).toBe(false)
    toggleFavorite('connectfour')
    expect(isFavorite('connectfour')).toBe(true)
  })

  it('supports multiple favorites, preserving insertion order', () => {
    toggleFavorite('tictactoe')
    toggleFavorite('connectfour')
    toggleFavorite('sos')
    expect(getFavorites()).toEqual(['tictactoe', 'connectfour', 'sos'])
  })

  it('filters out unknown/stale game types from storage', () => {
    globalThis.localStorage.setItem('gn-favs', JSON.stringify(['tictactoe', 'not-a-real-game']))
    expect(getFavorites()).toEqual(['tictactoe'])
  })

  it('ignores malformed JSON in storage', () => {
    globalThis.localStorage.setItem('gn-favs', '{not json')
    expect(getFavorites()).toEqual([])
  })

  it('ignores non-array JSON in storage', () => {
    globalThis.localStorage.setItem('gn-favs', JSON.stringify({ foo: 'bar' }))
    expect(getFavorites()).toEqual([])
  })
})
