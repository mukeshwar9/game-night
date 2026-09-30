import { describe, expect, it } from 'vitest'
import { attributionRecord, parseTouch } from './attribution'

const BASE = 'https://game-night-91464.web.app'

describe('parseTouch', () => {
  it('reads UTM parameters and the landing path', () => {
    const t = parseTouch(`${BASE}/solo/connectfour?utm_source=Instagram&utm_medium=paid&utm_campaign=Launch1&utm_content=reel_a`, '', 5)
    expect(t).toEqual({ source: 'instagram', medium: 'paid', campaign: 'launch1', content: 'reel_a', click: '', refHost: '', landing: '/solo/connectfour', at: 5 })
  })
  it('names the ad platform from a click id when there is no utm_source', () => {
    expect(parseTouch(`${BASE}/?fbclid=abc`).source).toBe('meta')
    expect(parseTouch(`${BASE}/?gclid=abc`).source).toBe('google')
    expect(parseTouch(`${BASE}/?ttclid=abc`).source).toBe('tiktok')
    expect(parseTouch(`${BASE}/?fbclid=abc`).click).toBe('fbclid')
  })
  it('falls back to referral, then direct', () => {
    expect(parseTouch(`${BASE}/`, 'https://www.reddit.com/r/games')).toMatchObject({ source: 'referral', refHost: 'www.reddit.com' })
    expect(parseTouch(`${BASE}/`, '')).toMatchObject({ source: 'direct', refHost: '' })
    expect(parseTouch(`${BASE}/`, `${BASE}/games`).source).toBe('direct')
  })
  it('reduces hostile values to key-safe slugs of at most 40 characters', () => {
    const t = parseTouch(`${BASE}/?utm_source=${encodeURIComponent('a/b.c$d[e]')}&utm_campaign=${'x'.repeat(100)}`)
    expect(t.source).toBe('abcde')
    expect(t.campaign).toHaveLength(40)
    expect(t.source).toMatch(/^[a-z0-9_-]+$/)
  })
  it('returns null for an unparseable URL', () => {
    expect(parseTouch('not a url')).toBe(null)
  })
})

describe('attributionRecord', () => {
  it('drops empty fields and passes null through', () => {
    const t = parseTouch(`${BASE}/?utm_source=x`, '', 1)
    expect(attributionRecord(t)).toEqual({ source: 'x', landing: '/', at: 1 })
    expect(attributionRecord(null)).toBe(null)
  })
})
