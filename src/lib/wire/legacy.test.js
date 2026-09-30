import { describe, expect, it } from 'vitest'
import { generateLegacyBomb } from './legacy'
import { generateBomb } from '../wireLogic'
import snapshot from './legacy.snapshot.json'

// cyrb53 string hash, used only to fingerprint a bomb compactly.
function hash(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

// legacy.snapshot.json holds the hash of JSON.stringify(generateBomb(seed, level))
// from the code before modes existed (20 seeds x levels 1-6). Any change here
// would deal a different bomb to a screen mid-deploy.
describe('legacy generator', () => {
  it('is identical to the pre-modes generateBomb for 20 seeds x levels 1-6', () => {
    expect(Object.keys(snapshot)).toHaveLength(120)
    for (const [key, expected] of Object.entries(snapshot)) {
      const [seed, level] = key.split(':')
      expect(hash(JSON.stringify(generateLegacyBomb(seed, Number(level))))).toBe(expected)
    }
  })

  it('is what generateBomb deals when no mode is given', () => {
    for (const key of Object.keys(snapshot).slice(0, 12)) {
      const [seed, level] = key.split(':')
      expect(generateBomb(seed, Number(level))).toEqual(generateLegacyBomb(seed, Number(level)))
      expect(generateBomb(seed, Number(level), null)).toEqual(generateLegacyBomb(seed, Number(level)))
    }
  })

  it('carries no mode fields', () => {
    const bomb = generateLegacyBomb('legacy-0', 3)
    expect(bomb.mode).toBeUndefined()
    expect(bomb.modifiers).toBeUndefined()
    expect(bomb.strikePenaltyMs).toBeUndefined()
  })
})
