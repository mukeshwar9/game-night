import { describe, it, expect } from 'vitest'
import { shouldShowOnboarding } from './onboarding'

describe('shouldShowOnboarding', () => {
  it('returns true for a fresh visitor (no signals)', () => {
    expect(shouldShowOnboarding({ onboarded: null, playerName: null, roomsCount: 0 })).toBe(true)
  })

  it('returns false when the onboarded flag is set', () => {
    expect(shouldShowOnboarding({ onboarded: '1', playerName: null, roomsCount: 0 })).toBe(false)
  })

  it('returns false when playerName is set', () => {
    expect(shouldShowOnboarding({ onboarded: null, playerName: 'Alice', roomsCount: 0 })).toBe(false)
  })

  it('returns false when rooms exist', () => {
    expect(shouldShowOnboarding({ onboarded: null, playerName: null, roomsCount: 2 })).toBe(false)
  })

  it('returns false when all signals are present', () => {
    expect(shouldShowOnboarding({ onboarded: '1', playerName: 'Alice', roomsCount: 3 })).toBe(false)
  })

  it('treats empty-string playerName as absent', () => {
    // localStorage returns '' for an unset-but-written key — treat as falsy
    expect(shouldShowOnboarding({ onboarded: null, playerName: '', roomsCount: 0 })).toBe(true)
  })
})
