import { describe, it, expect } from 'vitest'
import {
  MASK, DISPLAY_NAME_MAX, MUTED_CAP,
  moderateText, sanitizeDisplayName, NAME_REJECT_MESSAGES,
  parseMutedMap, toggleMutedMap, mutedList,
} from './moderationLogic'

describe('moderateText', () => {
  it('leaves clean text untouched', () => {
    expect(moderateText('good game, rematch?')).toEqual({ text: 'good game, rematch?', flagged: false })
  })

  it('masks a denied word and keeps the rest as typed', () => {
    expect(moderateText('what the fuck was that')).toEqual({ text: `what the ${MASK} was that`, flagged: true })
  })

  it('keeps surrounding punctuation', () => {
    expect(moderateText('Shit! lol')).toEqual({ text: `${MASK} lol`, flagged: true })
    expect(moderateText('ok,fuck,ok').text).toBe(`ok,${MASK},ok`)
  })

  it('masks every denied word, including look-alike spellings', () => {
    const { text, flagged } = moderateText('sh1t and b!tch and fuuuuck')
    expect(flagged).toBe(true)
    expect(text).toBe(`${MASK} and ${MASK} and ${MASK}`)
  })

  it('does not mask words that merely contain a denied term (Scunthorpe)', () => {
    for (const s of ['Scunthorpe', 'cocktail party', 'therapist', 'grape', 'spicy']) {
      expect(moderateText(s)).toEqual({ text: s, flagged: false })
    }
  })

  it('catches words spelled out with spaces or dots', () => {
    expect(moderateText('you f u c k')).toEqual({ text: `you ${MASK}`, flagged: true })
    expect(moderateText('f.u.c.k off').text).toBe(`${MASK} off`)
    expect(moderateText('a f u c k')).toEqual({ text: `a ${MASK}`, flagged: true })
  })

  it('does not flag harmless spelled-out runs', () => {
    expect(moderateText('i a m here')).toEqual({ text: 'i a m here', flagged: false })
    expect(moderateText('a b c d e f')).toEqual({ text: 'a b c d e f', flagged: false })
  })

  it('treats non-strings and empty input as empty', () => {
    expect(moderateText(null)).toEqual({ text: '', flagged: false })
    expect(moderateText(42)).toEqual({ text: '', flagged: false })
    expect(moderateText('')).toEqual({ text: '', flagged: false })
  })
})

describe('sanitizeDisplayName', () => {
  it('trims and collapses whitespace', () => {
    expect(sanitizeDisplayName('  Ada   Lovelace ')).toEqual({ name: 'Ada Lovelace', reason: null })
  })

  it('caps the length and re-trims', () => {
    const { name } = sanitizeDisplayName('a'.repeat(19) + ' bcdef')
    expect(name).toBe('a'.repeat(19))
    expect(sanitizeDisplayName('x'.repeat(40)).name).toHaveLength(DISPLAY_NAME_MAX)
  })

  it('strips invisible characters', () => {
    expect(sanitizeDisplayName('Bo\u200bb\u0007').name).toBe('Bob')
  })

  it('keeps emoji joiner sequences intact but rejects a joiner-only name', () => {
    expect(sanitizeDisplayName('Ana \u{1F62E}\u200D\u{1F4A8}').name).toBe('Ana \u{1F62E}\u200D\u{1F4A8}')
    expect(sanitizeDisplayName('\u200D\u200D')).toEqual({ name: null, reason: 'empty' })
  })

  it('rejects empty names', () => {
    expect(sanitizeDisplayName('   ')).toEqual({ name: null, reason: 'empty' })
    expect(sanitizeDisplayName('\u200b\u200b')).toEqual({ name: null, reason: 'empty' })
    expect(sanitizeDisplayName(undefined)).toEqual({ name: null, reason: 'empty' })
  })

  it('rejects denied words, spelled-out and run-together forms', () => {
    for (const raw of ['Big Dick', 'sh1t', 'F.U.C.K', 'FuckFace', 'f u c k']) {
      expect(sanitizeDisplayName(raw), raw).toEqual({ name: null, reason: 'denied' })
    }
  })

  it('accepts names that only contain a denied term', () => {
    expect(sanitizeDisplayName('Scunthorpe FC').name).toBe('Scunthorpe FC')
    expect(sanitizeDisplayName('Cocktail').name).toBe('Cocktail')
  })

  it('has a message for every rejection reason', () => {
    expect(NAME_REJECT_MESSAGES.empty).toBeTruthy()
    expect(NAME_REJECT_MESSAGES.denied).toBeTruthy()
  })
})

describe('mute map', () => {
  it('parses stored JSON tolerantly', () => {
    expect(parseMutedMap(null)).toEqual({})
    expect(parseMutedMap('not json')).toEqual({})
    expect(parseMutedMap('[1,2]')).toEqual({})
    expect(parseMutedMap('{"u1":{"name":"Bob","at":5},"u2":7}')).toEqual({
      u1: { name: 'Bob', at: 5 },
      u2: { name: '', at: 0 },
    })
  })

  it('toggles a uid on and off without mutating the input', () => {
    const empty = {}
    const on = toggleMutedMap(empty, 'u1', 'Bob', 10)
    expect(empty).toEqual({})
    expect(on).toEqual({ u1: { name: 'Bob', at: 10 } })
    expect(toggleMutedMap(on, 'u1')).toEqual({})
  })

  it('ignores a missing uid', () => {
    expect(toggleMutedMap({ a: { name: '', at: 1 } }, '')).toEqual({ a: { name: '', at: 1 } })
  })

  it('drops the oldest mutes past the cap', () => {
    let map = {}
    for (let i = 0; i < MUTED_CAP + 3; i++) map = toggleMutedMap(map, `u${i}`, '', i)
    expect(Object.keys(map)).toHaveLength(MUTED_CAP)
    expect(map.u0).toBeUndefined()
    expect(map.u2).toBeUndefined()
    expect(map.u3).toBeDefined()
  })

  it('lists muted players newest first', () => {
    const map = { a: { name: 'A', at: 1 }, b: { name: 'B', at: 3 }, c: { name: 'C', at: 2 } }
    expect(mutedList(map).map(m => m.uid)).toEqual(['b', 'c', 'a'])
    expect(mutedList(null)).toEqual([])
  })
})
