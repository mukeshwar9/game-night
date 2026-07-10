import { describe, it, expect, beforeAll } from 'vitest'

// games.js pulls in board components that touch `localStorage` at module
// load time (src/lib/sounds.js) — stub it before the dynamic import since
// this suite runs outside a DOM environment. See gameSearch.test.js.
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} }
}

let isNewGame

beforeAll(async () => {
  ;({ isNewGame } = await import('./games'))
})

describe('isNewGame', () => {
  it('is false when addedAt is absent', () => {
    expect(isNewGame({})).toBe(false)
  })

  it('is true within the 14-day window', () => {
    const now = new Date('2026-07-11')
    expect(isNewGame({ addedAt: '2026-07-04' }, now)).toBe(true)
  })

  it('is false once past the 14-day window', () => {
    const now = new Date('2026-07-11')
    expect(isNewGame({ addedAt: '2026-06-20' }, now)).toBe(false)
  })
})
