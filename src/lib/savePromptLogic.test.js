import { describe, it, expect } from 'vitest'
import { shouldOfferSave, saveCountsLine, snoozeUntil, SNOOZE_MS } from './savePromptLogic'

const base = { isAnonymous: true, canSave: true, now: 1000 }

describe('shouldOfferSave', () => {
  it('never for permanent users or without a provider', () => {
    expect(shouldOfferSave({ ...base, surface: 'profile', isAnonymous: false })).toBe(false)
    expect(shouldOfferSave({ ...base, surface: 'profile', canSave: false })).toBe(false)
  })
  it('profile always shows for guests, ignoring caps', () => {
    expect(shouldOfferSave({ ...base, surface: 'profile', shownThisSession: true, snoozedUntil: 9999 })).toBe(true)
  })
  it('match-end needs a finished match', () => {
    expect(shouldOfferSave({ ...base, surface: 'match-end', counts: { matches: 0 } })).toBe(false)
    expect(shouldOfferSave({ ...base, surface: 'match-end', counts: { matches: 1 } })).toBe(true)
  })
  it('home needs something to lose', () => {
    expect(shouldOfferSave({ ...base, surface: 'home', counts: { matches: 2, stars: 19 } })).toBe(false)
    expect(shouldOfferSave({ ...base, surface: 'home', counts: { matches: 3 } })).toBe(true)
    expect(shouldOfferSave({ ...base, surface: 'home', counts: { friends: 1 } })).toBe(true)
    expect(shouldOfferSave({ ...base, surface: 'home', counts: { stars: 20 } })).toBe(true)
  })
  it('friends needs a friend', () => {
    expect(shouldOfferSave({ ...base, surface: 'friends', counts: {} })).toBe(false)
    expect(shouldOfferSave({ ...base, surface: 'friends', counts: { friends: 1 } })).toBe(true)
  })
  it('one capped prompt per session', () => {
    expect(shouldOfferSave({ ...base, surface: 'match-end', counts: { matches: 5 }, shownThisSession: true })).toBe(false)
  })
  it('snooze hides a surface until it expires', () => {
    const p = { ...base, surface: 'home', counts: { matches: 5 } }
    expect(shouldOfferSave({ ...p, snoozedUntil: 2000 })).toBe(false)
    expect(shouldOfferSave({ ...p, snoozedUntil: 1000 })).toBe(true)
  })
  it('unknown surface is refused', () => {
    expect(shouldOfferSave({ ...base, surface: 'x', counts: { matches: 9 } })).toBe(false)
  })
})

describe('saveCountsLine', () => {
  it('omits zeros and pluralises', () => {
    expect(saveCountsLine({ matches: 3, friends: 1, stars: 24 })).toBe('3 MATCHES · 1 FRIEND · 24 STARS')
    expect(saveCountsLine({ matches: 1, stars: 1 })).toBe('1 MATCH · 1 STAR')
  })
  it('falls back when empty', () => {
    expect(saveCountsLine({})).toMatch(/PROFILE/)
  })
})

it('snoozeUntil is 7 days out', () => {
  expect(snoozeUntil(0)).toBe(SNOOZE_MS)
})
