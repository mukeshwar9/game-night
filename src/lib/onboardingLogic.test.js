import { describe, it, expect } from 'vitest'
import {
  NAME_MAX, isGuestStyleName, validateName, suggestName, suggestNames, initialName,
} from './onboardingLogic'
import { NAME_REJECT_MESSAGES } from './moderationLogic'

// Deterministic rand from a fixed sequence (cycles).
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length] }

describe('isGuestStyleName', () => {
  it('matches the ensureProfile placeholder in any case', () => {
    expect(isGuestStyleName('Guest-7F3A')).toBe(true)
    expect(isGuestStyleName('guest-abcd')).toBe(true)
    expect(isGuestStyleName(' Guest-7F3A ')).toBe(true)
  })
  it('rejects real names and near-misses', () => {
    expect(isGuestStyleName('Guest')).toBe(false)
    expect(isGuestStyleName('Guest-7F3A1')).toBe(false)
    expect(isGuestStyleName('Sam')).toBe(false)
    expect(isGuestStyleName(null)).toBe(false)
  })
})

describe('validateName', () => {
  it('accepts a normal name unchanged', () => {
    expect(validateName('Sam')).toEqual({ ok: true, name: 'Sam', error: null })
  })
  it('rejects names the moderation denylist blocks', () => {
    const r = validateName('sh1t')
    expect(r.ok).toBe(false)
    expect(r.error).toBe(NAME_REJECT_MESSAGES.denied)
  })
  it('trims and collapses whitespace', () => {
    expect(validateName('  Pixel    Panda ')).toMatchObject({ ok: true, name: 'Pixel Panda' })
  })
  it('strips zero-width and bidi control characters', () => {
    expect(validateName('S​a‮m')).toMatchObject({ ok: true, name: 'Sam' })
  })
  it('caps at NAME_MAX code points without splitting an emoji', () => {
    const r = validateName('A'.repeat(19) + '🎮🎮')
    expect(r.ok).toBe(true)
    expect([...r.name].length).toBe(NAME_MAX)
    expect(r.name.endsWith('🎮')).toBe(true)
  })
  it('rejects empty and whitespace-only input with a hint', () => {
    expect(validateName('')).toMatchObject({ ok: false, name: '' })
    expect(validateName('   ​ ').ok).toBe(false)
    expect(validateName(undefined).error).toMatch(/DICE/)
  })
  it('rejects a single character', () => {
    expect(validateName('A')).toMatchObject({ ok: false, error: 'AT LEAST 2 CHARACTERS' })
  })
  it('rejects names with no letter or number', () => {
    expect(validateName('!!!')).toMatchObject({ ok: false, error: 'ADD A LETTER OR NUMBER' })
  })
  it('accepts non-Latin letters and digits', () => {
    expect(validateName('Zoë').ok).toBe(true)
    expect(validateName('李雷').ok).toBe(true)
    expect(validateName('42').ok).toBe(true)
  })
})

describe('suggestName / suggestNames', () => {
  it('is deterministic for a fixed rand and always valid', () => {
    expect(suggestName(seq(0, 0))).toBe('Pixel Panda')
    expect(suggestName(seq(0.99, 0.99))).toBe('Retro Fox')
    for (let i = 0; i < 200; i++) expect(validateName(suggestName()).ok).toBe(true)
  })
  it('returns distinct suggestions that skip `avoid`', () => {
    const names = suggestNames(3, Math.random, 'Pixel Panda')
    expect(names).toHaveLength(3)
    expect(new Set(names).size).toBe(3)
    expect(names).not.toContain('Pixel Panda')
  })
  it('gives up instead of looping forever on a stuck rand', () => {
    expect(suggestNames(3, () => 0)).toEqual(['Pixel Panda'])
  })
})

describe('initialName', () => {
  it('prefers a real profile name', () => {
    expect(initialName({ profileName: 'Sam', accountName: 'Samuel Q', suggestion: 'Turbo Taco' })).toBe('Sam')
  })
  it('skips a Guest-XXXX placeholder in favour of the Google name', () => {
    expect(initialName({ profileName: 'Guest-7F3A', accountName: 'Samuel Q', suggestion: 'Turbo Taco' })).toBe('Samuel Q')
  })
  it('falls back to the suggestion when nothing usable exists', () => {
    expect(initialName({ profileName: 'Guest-7F3A', accountName: '', suggestion: 'Turbo Taco' })).toBe('Turbo Taco')
    expect(initialName({ suggestion: 'Turbo Taco' })).toBe('Turbo Taco')
  })
  it('trims an over-long account name to NAME_MAX', () => {
    expect(initialName({ accountName: 'A Very Long Google Account Name', suggestion: 'x' })).toHaveLength(NAME_MAX)
  })
})
