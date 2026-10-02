import { describe, it, expect } from 'vitest'
import {
  EMOTES_CAP, FLOAT_BASE_MS, FLOAT_MAX_MS, floatDurationMs, isValidEmote, normalizeEmotes,
  emoteKeysToPrune, newEmoteEntries, unreadCount, unreadBadge, floatAnchor, EMOTE_FLOAT_HEIGHT,
} from './chatUiLogic'

describe('floatDurationMs', () => {
  it('gives a reaction (no text) the base time', () => {
    expect(floatDurationMs('')).toBe(FLOAT_BASE_MS)
    expect(floatDurationMs(undefined)).toBe(FLOAT_BASE_MS)
  })
  it('adds reading time per character, so a long line outlasts a short one', () => {
    expect(floatDurationMs('nice opening, but watch the left column')).toBeGreaterThan(floatDurationMs('gg'))
  })
  it('caps very long lines', () => {
    expect(floatDurationMs('x'.repeat(80))).toBe(FLOAT_MAX_MS)
  })
  it('counts an emoji as one character', () => {
    expect(floatDurationMs('🔥')).toBe(floatDurationMs('a'))
  })
})

describe('reaction list', () => {
  const e = (by, glyph = '🔥', ts = 1) => ({ by, glyph, ts })

  it('validates the same shape the rules check', () => {
    expect(isValidEmote(e('X'))).toBe(true)
    expect(isValidEmote({ by: 'X', glyph: '', ts: 1 })).toBe(false)
    expect(isValidEmote({ by: 'X', glyph: 'x'.repeat(33), ts: 1 })).toBe(false)
    expect(isValidEmote({ by: '', glyph: '🔥', ts: 1 })).toBe(false)
    expect(isValidEmote({ by: 'X', glyph: '🔥' })).toBe(false)
    expect(isValidEmote(null)).toBe(false)
  })

  it('normalizes an object keyed by push id into key order, dropping junk', () => {
    const raw = { '-b': e('O', '😂', 5), '-a': e('X', '🔥', 9), '-c': { nope: true } }
    expect(normalizeEmotes(raw)).toEqual([['-a', e('X', '🔥', 9)], ['-b', e('O', '😂', 5)]])
    expect(normalizeEmotes(null)).toEqual([])
    expect(normalizeEmotes(undefined)).toEqual([])
  })

  it('keeps both of two simultaneous reactions (the old single slot kept one)', () => {
    const raw = { '-k1': e('X', '💀', 100), '-k2': e('O', '😎', 100) }
    expect(normalizeEmotes(raw).map(([, v]) => v.glyph)).toEqual(['💀', '😎'])
  })

  it('prunes the oldest keys down to the cap', () => {
    const entries = Array.from({ length: EMOTES_CAP + 3 }, (_, i) => [`-k${String(i).padStart(2, '0')}`, e('X')])
    expect(emoteKeysToPrune(entries)).toEqual(['-k00', '-k01', '-k02'])
    expect(emoteKeysToPrune(entries.slice(0, 2))).toEqual([])
  })

  it('finds only the entries not yet floated', () => {
    const entries = [['-a', e('X')], ['-b', e('O')], ['-c', e('X')]]
    expect(newEmoteEntries(entries, new Set(['-a', '-b'])).map(([k]) => k)).toEqual(['-c'])
  })
})

describe('unreadCount', () => {
  const m = (by, ts, extra = {}) => ['k' + ts, { by, ts, text: 'hi', ...extra }]
  it('counts other players’ messages newer than last seen', () => {
    const entries = [m('bob', 1), m('bob', 5), m('me', 6), m('bob', 7)]
    expect(unreadCount(entries, { lastSeenTs: 4, myUid: 'me' })).toBe(2)
  })
  it('skips blocked senders and moderation-hidden lines', () => {
    const entries = [m('bob', 5), m('eve', 6), m('bob', 7, { hidden: true })]
    expect(unreadCount(entries, { lastSeenTs: 0, myUid: 'me', muted: { eve: { name: 'Eve' } } })).toBe(1)
  })
  it('badge text caps at 9+', () => {
    expect(unreadBadge(0)).toBe('')
    expect(unreadBadge(3)).toBe('3')
    expect(unreadBadge(12)).toBe('9+')
  })
})

describe('floatAnchor', () => {
  const vp = { width: 390, height: 844 }
  const leftCard = { top: 120, bottom: 170, left: 16, right: 191 }
  const rightCard = { top: 120, bottom: 170, left: 199, right: 374 }

  it('puts a reaction over the sender’s card (its bottom low on the card)', () => {
    const a = floatAnchor(rightCard, vp, { kind: 'emote', side: 'right' })
    expect(a.left).toBeCloseTo(286.5)
    expect(a.top).toBe(160)
    expect(a.align).toBe('right')
    expect(a.onCard).toBe(true)
  })

  it('hangs a chat bubble just below the card', () => {
    const a = floatAnchor(leftCard, vp, { kind: 'chat', side: 'left' })
    expect(a.top).toBe(176)
    expect(a.align).toBe('left')
  })

  it('never lets a reaction leave the top of the screen', () => {
    expect(floatAnchor({ ...leftCard, top: 2, bottom: 52 }, vp, { kind: 'emote', side: 'left' }).top).toBe(12 + EMOTE_FLOAT_HEIGHT)
  })

  it('falls back to a top band on the sender’s side when the card is missing or scrolled away', () => {
    const none = floatAnchor(null, vp, { kind: 'emote', side: 'left' })
    expect(none.left).toBeCloseTo(78)
    expect(none.top).toBeLessThan(vp.height / 4)
    expect(none.onCard).toBe(false)
    const gone = floatAnchor({ top: -300, bottom: -250, left: 16, right: 191 }, vp, { kind: 'chat', side: 'right' })
    expect(gone.left).toBeCloseTo(312)
    expect(gone.align).toBe('right')
  })
})
