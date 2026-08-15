import { describe, it, expect } from 'vitest'
import { sha256hex, sha256fallback } from './sha256'

const EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

describe('sha256fallback', () => {
  it('matches NIST empty-string vector', () => {
    expect(sha256fallback('')).toBe(EMPTY)
  })

  it('matches NIST "abc" vector', () => {
    expect(sha256fallback('abc')).toBe(ABC)
  })
})

describe('sha256hex', () => {
  it('agrees with the pure-JS fallback', async () => {
    expect(await sha256hex('pig-commit:deadbeef')).toBe(sha256fallback('pig-commit:deadbeef'))
  })
})
