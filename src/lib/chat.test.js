import { describe, it, expect } from 'vitest'
import {
  CHAT_MAX_LENGTH,
  CHAT_LOG_CAP,
  sanitizeChatText,
  isValidChatMessage,
  normalizeChatLog,
  chatKeysToPrune,
  linkifyChatText,
  reportContextFor,
  REPORT_CONTEXT_LINES,
  REPORT_CONTEXT_MAX,
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

// ---------------------------------------------------------------------------
// linkifyChatText
// ---------------------------------------------------------------------------
describe('linkifyChatText', () => {
  it('returns [] for empty/non-string input', () => {
    expect(linkifyChatText('')).toEqual([])
    expect(linkifyChatText(null)).toEqual([])
    expect(linkifyChatText(undefined)).toEqual([])
    expect(linkifyChatText(42)).toEqual([])
  })

  it('keeps plain text as a single text segment', () => {
    expect(linkifyChatText('gg everyone')).toEqual([{ kind: 'text', text: 'gg everyone' }])
  })

  it('linkifies an https URL', () => {
    expect(linkifyChatText('see https://example.com/a')).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'link', text: 'https://example.com/a', href: 'https://example.com/a' },
    ])
  })

  it('linkifies http and bare www. hosts (https href)', () => {
    expect(linkifyChatText('try http://example.com')).toEqual([
      { kind: 'text', text: 'try ' },
      { kind: 'link', text: 'http://example.com', href: 'http://example.com' },
    ])
    expect(linkifyChatText('try www.example.com/x')).toEqual([
      { kind: 'text', text: 'try ' },
      { kind: 'link', text: 'www.example.com/x', href: 'https://www.example.com/x' },
    ])
  })

  it('trims trailing sentence punctuation off the link', () => {
    expect(linkifyChatText('see https://example.com/a.')).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'link', text: 'https://example.com/a', href: 'https://example.com/a' },
      { kind: 'text', text: '.' },
    ])
    expect(linkifyChatText('(https://example.com/a)')).toEqual([
      { kind: 'text', text: '(' },
      { kind: 'link', text: 'https://example.com/a', href: 'https://example.com/a' },
      { kind: 'text', text: ')' },
    ])
  })

  it('never emits a javascript:/data: href', () => {
    expect(linkifyChatText('x javascript:alert(1) y')).toEqual([
      { kind: 'text', text: 'x javascript:alert(1) y' },
    ])
  })

  it('handles multiple URLs in one message', () => {
    const segs = linkifyChatText('a https://one.com b www.two.com/c d')
    expect(segs.filter(s => s.kind === 'link').map(s => s.href)).toEqual([
      'https://one.com',
      'https://www.two.com/c',
    ])
  })
})

describe('reportContextFor', () => {
  const entry = (k, name, text) => [k, { by: name, name, text, ts: 1 }]
  const log = Array.from({ length: 12 }, (_, i) => entry(`k${i}`, i % 2 ? 'Bob' : 'Ann', `line ${i}`))

  it('returns the lines leading up to and including the reported one', () => {
    const out = reportContextFor(log, 'k10').split('\n')
    expect(out).toHaveLength(REPORT_CONTEXT_LINES)
    expect(out[out.length - 1]).toBe('Ann: line 10')
    expect(out[0]).toBe('Bob: line 3')
  })

  it('never includes lines after the reported one', () => {
    expect(reportContextFor(log, 'k1')).toBe('Ann: line 0\nBob: line 1')
  })

  it('is empty for an unknown key or a bad log', () => {
    expect(reportContextFor(log, 'nope')).toBe('')
    expect(reportContextFor(null, 'k1')).toBe('')
  })

  it('drops the oldest lines to stay under the size cap', () => {
    const long = Array.from({ length: 8 }, (_, i) => entry(`k${i}`, 'Bob', 'x'.repeat(200)))
    const out = reportContextFor(long, 'k7')
    expect(out.length).toBeLessThanOrEqual(REPORT_CONTEXT_MAX)
    expect(out.endsWith('x'.repeat(200))).toBe(true)
  })
})
