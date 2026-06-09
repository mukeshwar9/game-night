import { describe, it, expect } from 'vitest'
import { commit, verifyReveal } from './commit'

describe('commit', () => {
  it('produces a 64-char hex hash and 32-char hex salt', async () => {
    const { hash, salt } = await commit('HELLO')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(salt).toMatch(/^[0-9a-f]{32}$/)
  })

  it('two commits for the same secret produce different salts', async () => {
    const a = await commit('HELLO')
    const b = await commit('HELLO')
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
  })
})

describe('verifyReveal', () => {
  it('returns true for a matching commit-reveal round trip', async () => {
    const { hash, salt } = await commit('PLATFORM')
    expect(await verifyReveal(hash, 'PLATFORM', salt)).toBe(true)
  })

  it('returns false when the word is tampered', async () => {
    const { hash, salt } = await commit('PLATFORM')
    expect(await verifyReveal(hash, 'PLATFORMX', salt)).toBe(false)
  })

  it('returns false when the salt is tampered', async () => {
    const { hash, salt } = await commit('PLATFORM')
    const badSalt = salt.slice(0, -2) + 'ff'
    expect(await verifyReveal(hash, 'PLATFORM', badSalt)).toBe(false)
  })
})
