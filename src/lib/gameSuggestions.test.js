import { describe, it, expect, beforeAll } from 'vitest'

// games.js pulls in board components that touch `localStorage` at module load
// (src/lib/sounds.js) — stub it before the dynamic import since this suite
// runs outside a DOM environment. See gameSearch.test.js for the same pattern.
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} }
}

let suggestGames
let GAME_TYPES
beforeAll(async () => {
  ;({ suggestGames } = await import('./gameSuggestions'))
  ;({ GAME_TYPES } = await import('./games'))
})

describe('suggestGames', () => {
  it('suggests the variant first for a base game', () => {
    const types = suggestGames('tictactoe').map(t => t.type)
    expect(types[0]).toBe('ultimatettt')
  })

  it('suggests the base game first for a variant', () => {
    const types = suggestGames('ultimatettt').map(t => t.type)
    expect(types[0]).toBe('tictactoe')
  })

  it('suggests the base game first for the other existing variant pair', () => {
    const types = suggestGames('connectfourpop').map(t => t.type)
    expect(types[0]).toBe('connectfour')
  })

  it('falls back to same-category picks when the game has no variants', () => {
    const wordTypes = new Set(GAME_TYPES.filter(t => t.category === 'word').map(t => t.type))
    // count: 2 — the 'word' category holds 3 games post-F-03 (hangwoman, twotruths,
    // wordduel; bluff moved to 'dicebluff'), so excluding the current game leaves
    // exactly 2 same-category siblings. A higher count would spill into the
    // any-other-category fallback and break the "all same category" assertion below.
    const types = suggestGames('hangwoman', { count: 2 }).map(t => t.type)
    expect(types.length).toBeGreaterThan(0)
    for (const type of types) expect(wordTypes.has(type)).toBe(true)
  })

  it('never suggests party (nPlayer) games', () => {
    for (const entry of GAME_TYPES) {
      const suggestions = suggestGames(entry.type, { count: 10 })
      expect(suggestions.some(t => t.nPlayer)).toBe(false)
    }
  })

  it('respects the requested count', () => {
    expect(suggestGames('tictactoe', { count: 2 })).toHaveLength(2)
    expect(suggestGames('tictactoe', { count: 1 })).toHaveLength(1)
  })

  it('never includes the current type', () => {
    for (const entry of GAME_TYPES) {
      const types = suggestGames(entry.type, { count: 10 }).map(t => t.type)
      expect(types).not.toContain(entry.type)
    }
  })
})
