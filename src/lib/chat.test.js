import { describe, it, expect } from 'vitest'
import {
  CHAT_MAX_LENGTH,
  CHAT_LOG_CAP,
  sanitizeChatText,
  isValidChatMessage,
  normalizeChatLog,
  chatKeysToPrune,
} from './chat'

// ---------------------------------------------------------------------------
// sanitizeChatText
// ---------------------------------------------------------------------------
describe('sanitizeChatText', () => {
  it('returns "" for whitespace-only input', () => {
    expect(sanitizeChatText('   ')).toBe('')
    expect(sanitizeChatText('\t\n  \t')).toBe('')
  })

  it('trims leading/trailing whitespace', () => {
    expect(sanitizeChatText('  hello  ')).toBe('hello')
  })

  it('collapses tabs and newlines into a single space', () => {
    expect(sanitizeChatText('hello\t\tworld\n\nfoo')).toBe('hello world foo')
  })

  it('collapses multiple internal spaces to one', () => {
    expect(sanitizeChatText('a     b')).toBe('a b')
  })

  it('keeps a message exactly at the 80-char boundary intact', () => {
    const exact = 'a'.repeat(CHAT_MAX_LENGTH)
    expect(sanitizeChatText(exact)).toBe(exact)
    expect(sanitizeChatText(exact).length).toBe(CHAT_MAX_LENGTH)
  })

  it('slices input over 80 chars down to CHAT_MAX_LENGTH', () => {
    const over = 'a'.repeat(CHAT_MAX_LENGTH + 20)
    const result = sanitizeChatText(over)
    expect(result.length).toBe(CHAT_MAX_LENGTH)
    expect(result).toBe('a'.repeat(CHAT_MAX_LENGTH))
  })

  it('returns "" for non-string inputs', () => {
    expect(sanitizeChatText(null)).toBe('')
    expect(sanitizeChatText(undefined)).toBe('')
    expect(sanitizeChatText(42)).toBe('')
    expect(sanitizeChatText({ text: 'hi' })).toBe('')
    expect(sanitizeChatText(['hi'])).toBe('')
  })

  it('masks denied words before the message is sent', () => {
    expect(sanitizeChatText('  gg   you   sh1t ')).toBe('gg you •••')
    expect(sanitizeChatText('cocktail party')).toBe('cocktail party')
  })

  it('masks a denied word that straddles the length cap instead of leaking its start', () => {
    const text = sanitizeChatText('a'.repeat(CHAT_MAX_LENGTH - 3) + ' fucking')
    expect(text).not.toMatch(/fu/)
    expect(text.length).toBeLessThanOrEqual(CHAT_MAX_LENGTH)
  })
})

// ---------------------------------------------------------------------------
// isValidChatMessage
// ---------------------------------------------------------------------------
describe('isValidChatMessage', () => {
  const base = { text: 'hi there', by: 'uid123', ts: 1000 }

  it('accepts a well-formed message', () => {
    expect(isValidChatMessage(base)).toBe(true)
  })

  it('accepts text at exactly CHAT_MAX_LENGTH', () => {
    expect(isValidChatMessage({ ...base, text: 'a'.repeat(CHAT_MAX_LENGTH) })).toBe(true)
  })

  it('rejects missing text', () => {
    const rest = { ...base }
    delete rest.text
    expect(isValidChatMessage(rest)).toBe(false)
  })

  it('rejects empty text without a sticker', () => {
    expect(isValidChatMessage({ ...base, text: '' })).toBe(false)
  })

  it('accepts empty text beside a valid sticker image', () => {
    const img = `data:image/webp;base64,${'A'.repeat(100)}`
    expect(isValidChatMessage({ ...base, text: '', img })).toBe(true)
    expect(isValidChatMessage({ ...base, text: 'nice', img })).toBe(true)
  })

  it('rejects invalid sticker images', () => {
    expect(isValidChatMessage({ ...base, text: '', img: 'https://example.com/a.png' })).toBe(false)
    expect(isValidChatMessage({ ...base, text: 'hi', img: 'junk' })).toBe(false)
  })

  it('rejects text over CHAT_MAX_LENGTH', () => {
    expect(isValidChatMessage({ ...base, text: 'a'.repeat(CHAT_MAX_LENGTH + 1) })).toBe(false)
  })

  it('rejects missing by', () => {
    const rest = { ...base }
    delete rest.by
    expect(isValidChatMessage(rest)).toBe(false)
  })

  it('rejects empty by', () => {
    expect(isValidChatMessage({ ...base, by: '' })).toBe(false)
  })

  it('rejects non-number ts', () => {
    expect(isValidChatMessage({ ...base, ts: '1000' })).toBe(false)
    expect(isValidChatMessage({ ...base, ts: null })).toBe(false)
  })

  it('rejects null/garbage', () => {
    expect(isValidChatMessage(null)).toBe(false)
    expect(isValidChatMessage(undefined)).toBe(false)
    expect(isValidChatMessage('not an object')).toBe(false)
    expect(isValidChatMessage(42)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// normalizeChatLog
// ---------------------------------------------------------------------------
describe('normalizeChatLog', () => {
  it('returns [] for undefined', () => {
    expect(normalizeChatLog(undefined)).toEqual([])
  })

  it('returns [] for null', () => {
    expect(normalizeChatLog(null)).toEqual([])
  })

  it('returns [] for {}', () => {
    expect(normalizeChatLog({})).toEqual([])
  })

  it('drops invalid entries and keeps valid ones, sorted ascending by ts', () => {
    const raw = {
      k3: { text: 'third', by: 'u1', ts: 300 },
      k1: { text: 'first', by: 'u1', ts: 100 },
      kBad: { text: '', by: 'u1', ts: 150 }, // invalid: empty text
      k2: { text: 'second', by: 'u1', ts: 200 },
      kBad2: { text: 'no ts', by: 'u1' }, // invalid: missing ts
    }
    const result = normalizeChatLog(raw)
    expect(result.map(([key]) => key)).toEqual(['k1', 'k2', 'k3'])
    expect(result.map(([, msg]) => msg.text)).toEqual(['first', 'second', 'third'])
  })

  it('preserves explicit key association (not Object.values order)', () => {
    const raw = {
      zKey: { text: 'z', by: 'u1', ts: 1 },
      aKey: { text: 'a', by: 'u1', ts: 2 },
    }
    const result = normalizeChatLog(raw)
    expect(result[0]).toEqual(['zKey', raw.zKey])
    expect(result[1]).toEqual(['aKey', raw.aKey])
  })
})

// ---------------------------------------------------------------------------
// chatKeysToPrune
// ---------------------------------------------------------------------------
describe('chatKeysToPrune', () => {
  function entriesOfLength(n) {
    return Array.from({ length: n }, (_, i) => [`k${i}`, { text: 'x', by: 'u', ts: i }])
  }

  it('returns [] when under cap', () => {
    expect(chatKeysToPrune(entriesOfLength(5), 30)).toEqual([])
  })

  it('returns [] when exactly at cap', () => {
    expect(chatKeysToPrune(entriesOfLength(CHAT_LOG_CAP), CHAT_LOG_CAP)).toEqual([])
  })

  it('returns the oldest keys beyond cap when over', () => {
    const entries = entriesOfLength(CHAT_LOG_CAP + 3)
    const pruned = chatKeysToPrune(entries, CHAT_LOG_CAP)
    expect(pruned).toEqual(['k0', 'k1', 'k2'])
  })

  it('defaults cap to CHAT_LOG_CAP', () => {
    const entries = entriesOfLength(CHAT_LOG_CAP + 2)
    expect(chatKeysToPrune(entries)).toEqual(['k0', 'k1'])
  })
})
