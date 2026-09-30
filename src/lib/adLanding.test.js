import { describe, it, expect } from 'vitest'
import { HEADLINE_GAMES, DEFAULT_LANDING_GAME, isHeadlineGame, landingPath, isAdVisit } from './adLanding'
import { GAME_TYPES } from './games'

describe('HEADLINE_GAMES', () => {
  it('is a short list of unique, solo-playable registry games', () => {
    expect(HEADLINE_GAMES.length).toBeGreaterThanOrEqual(5)
    expect(HEADLINE_GAMES.length).toBeLessThanOrEqual(8)
    expect(new Set(HEADLINE_GAMES.map(g => g.type)).size).toBe(HEADLINE_GAMES.length)
    for (const { type, pitch } of HEADLINE_GAMES) {
      const cfg = GAME_TYPES.find(t => t.type === type)
      expect(cfg, type).toBeTruthy()
      expect(cfg.solo, `${type} needs a solo mode`).toBe(true)
      expect(cfg.variantOf, `${type} must not be a variant`).toBeUndefined()
      expect(pitch.length).toBeGreaterThan(10)
    }
  })
  it('keeps real-time peer-to-peer games out', () => {
    for (const { type } of HEADLINE_GAMES) {
      expect(GAME_TYPES.find(t => t.type === type).p2p, type).toBeFalsy()
    }
  })
})

describe('landingPath', () => {
  it('sends a headline game to its solo page and keeps the query', () => {
    expect(landingPath('battleship', '?utm_source=tiktok&utm_campaign=a')).toBe('/solo/battleship?utm_source=tiktok&utm_campaign=a')
    expect(landingPath('battleship')).toBe('/solo/battleship')
    expect(landingPath('battleship', '?')).toBe('/solo/battleship')
  })
  it('falls back to the default game for unknown or non-headline types', () => {
    expect(landingPath('nonsense', '?utm_source=x')).toBe(`/solo/${DEFAULT_LANDING_GAME}?utm_source=x`)
    expect(landingPath(undefined)).toBe(`/solo/${DEFAULT_LANDING_GAME}`)
    expect(isHeadlineGame('pong')).toBe(false)
  })
})

describe('isAdVisit', () => {
  it('is true for campaign parameters or the /play redirect state', () => {
    expect(isAdVisit('?utm_source=meta')).toBe(true)
    expect(isAdVisit('?fbclid=abc')).toBe(true)
    expect(isAdVisit('', { landing: true })).toBe(true)
  })
  it('is false for ordinary visits', () => {
    expect(isAdVisit('')).toBe(false)
    expect(isAdVisit('?foo=bar')).toBe(false)
    expect(isAdVisit('', null)).toBe(false)
  })
})
