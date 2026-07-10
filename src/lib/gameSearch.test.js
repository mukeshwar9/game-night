import { describe, it, expect, beforeAll } from 'vitest'

// games.js (imported transitively by gameSearch.js) pulls in board components
// that touch `localStorage` at module load (src/lib/sounds.js) — stub it
// before the dynamic import since this suite runs outside a DOM environment.
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} }
}

let searchGames
beforeAll(async () => {
  ;({ searchGames } = await import('./gameSearch'))
})

describe('searchGames', () => {
  it('matches by label substring across game types', () => {
    const types = searchGames('wor').map(t => t.type)
    expect(types).toContain('wordduel')
    expect(types).toContain('hangwoman')
  })

  it('returns variant entries as standalone results', () => {
    const types = searchGames('ultimate').map(t => t.type)
    expect(types).toContain('ultimatettt')
  })

  it('matches by category label', () => {
    const types = searchGames('memory').map(t => t.type)
    expect(types).toContain('simon')
    expect(types).toContain('numbermemory')
    expect(types).toContain('visualmemory')
  })

  it('returns empty array for empty or whitespace query', () => {
    expect(searchGames('')).toEqual([])
    expect(searchGames('   ')).toEqual([])
    expect(searchGames(undefined)).toEqual([])
  })

  it('applies excludePredicate to filter results', () => {
    const results = searchGames('duel', { excludePredicate: (t) => t.type === 'wordduel' })
    expect(results.map(t => t.type)).not.toContain('wordduel')
  })

  it('is case-insensitive', () => {
    const lower = searchGames('pig').map(t => t.type)
    const upper = searchGames('PIG').map(t => t.type)
    const mixed = searchGames('PiG').map(t => t.type)
    expect(lower).toEqual(upper)
    expect(lower).toEqual(mixed)
    expect(lower).toContain('dice')
  })
})
