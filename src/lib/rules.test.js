import { describe, it, expect, beforeAll } from 'vitest'
import { GAME_RULES } from './rules'

// games.js pulls in board components that touch `localStorage` at module
// load time — stub it before the dynamic import (see games.test.js).
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} }
}

let GAME_TYPES

beforeAll(async () => {
  ;({ GAME_TYPES } = await import('./games'))
})

describe('GAME_RULES coverage', () => {
  it('every registry game has complete rules', () => {
    for (const { type } of GAME_TYPES) {
      const rules = GAME_RULES[type]
      expect(rules, `missing rules for ${type}`).toBeTruthy()
      expect(rules.objective?.trim(), `${type} objective`).toBeTruthy()
      expect(rules.howToPlay?.length, `${type} howToPlay`).toBeGreaterThan(0)
      expect(rules.win?.trim(), `${type} win`).toBeTruthy()
    }
  })

  it('has no orphan rule keys outside the registry', () => {
    const registryTypes = new Set(GAME_TYPES.map(g => g.type))
    for (const type of Object.keys(GAME_RULES)) {
      expect(registryTypes.has(type), `orphan rules key: ${type}`).toBe(true)
    }
  })
})
