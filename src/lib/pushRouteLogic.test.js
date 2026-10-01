import { describe, it, expect } from 'vitest'
import { isValidGameId, pathFromPushData } from './pushRouteLogic.js'

describe('isValidGameId', () => {
  it('accepts room-id shapes', () => {
    expect(isValidGameId('ABC123')).toBe(true)
    expect(isValidGameId('a_b-9')).toBe(true)
    expect(isValidGameId('x'.repeat(40))).toBe(true)
  })

  it('rejects empty, long, non-string and path-like ids', () => {
    for (const bad of ['', 'x'.repeat(41), 'a/b', 'a.b', '..', 'a b', 'a?b', 'a#b', '$x', null, undefined, 12, {}, ['A']]) {
      expect(isValidGameId(bad)).toBe(false)
    }
  })
})

describe('pathFromPushData', () => {
  it('routes by gameId', () => {
    expect(pathFromPushData({ gameId: 'ABC123' })).toBe('/game/ABC123')
  })

  it('falls back to the /game/ url sendInvitePush sends', () => {
    expect(pathFromPushData({ url: '/game/ABC123', kind: 'invite' })).toBe('/game/ABC123')
    expect(pathFromPushData({ url: '/game/ABC123/' })).toBe('/game/ABC123')
    expect(pathFromPushData({ url: '/game/ABC123?x=1#y' })).toBe('/game/ABC123')
  })

  it('prefers a valid gameId over the url', () => {
    expect(pathFromPushData({ gameId: 'AAA111', url: '/game/BBB222' })).toBe('/game/AAA111')
    expect(pathFromPushData({ gameId: '../x', url: '/game/BBB222' })).toBe('/game/BBB222')
  })

  it('opens nothing for a bare / link or a missing payload', () => {
    expect(pathFromPushData({ url: '/' })).toBe(null)
    expect(pathFromPushData({})).toBe(null)
    expect(pathFromPushData(null)).toBe(null)
    expect(pathFromPushData(undefined)).toBe(null)
    expect(pathFromPushData('/game/ABC123')).toBe(null)
    expect(pathFromPushData([])).toBe(null)
  })

  it('never returns an off-site or non-game path', () => {
    for (const url of [
      'https://evil.example/game/ABC', '//evil.example/game/ABC', 'javascript:alert(1)',
      '/friends', '/game/', '/game/../admin', '/game/a/b', '/games/ABC', 'game/ABC123',
    ]) {
      expect(pathFromPushData({ url })).toBe(null)
    }
    expect(pathFromPushData({ gameId: 'a/../b' })).toBe(null)
    expect(pathFromPushData({ gameId: 123 })).toBe(null)
  })
})
