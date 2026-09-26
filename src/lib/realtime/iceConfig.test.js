import { describe, it, expect } from 'vitest'
import { parseTurnUrls, readTurnEnv, isTurnConfigured, buildIceConfig, PUBLIC_STUN } from './iceConfig'

const TURN = {
  turnUrls: ['turn:turn.example.com:3478', 'turns:turn.example.com:5349'],
  turnUsername: 'user',
  turnCredential: 'secret',
}

describe('parseTurnUrls', () => {
  it('splits, trims and keeps only turn:/turns: URLs', () => {
    expect(parseTurnUrls(' turn:a:3478 , turns:b:5349,stun:c:19302,, http://x '))
      .toEqual(['turn:a:3478', 'turns:b:5349'])
  })

  it('handles absent values', () => {
    expect(parseTurnUrls(undefined)).toEqual([])
    expect(parseTurnUrls('')).toEqual([])
  })
})

describe('readTurnEnv', () => {
  it('reads the three VITE_TURN_* vars', () => {
    expect(readTurnEnv({
      VITE_TURN_URLS: 'turn:a:3478',
      VITE_TURN_USERNAME: ' u ',
      VITE_TURN_CREDENTIAL: 'c',
    })).toEqual({ turnUrls: ['turn:a:3478'], turnUsername: 'u', turnCredential: 'c' })
  })

  it('defaults to nothing configured', () => {
    expect(readTurnEnv({})).toEqual({ turnUrls: [], turnUsername: '', turnCredential: '' })
    expect(readTurnEnv()).toEqual({ turnUrls: [], turnUsername: '', turnCredential: '' })
  })
})

describe('isTurnConfigured', () => {
  it('needs URLs, a username and a credential', () => {
    expect(isTurnConfigured(TURN)).toBe(true)
    expect(isTurnConfigured({ ...TURN, turnUrls: [] })).toBe(false)
    expect(isTurnConfigured({ ...TURN, turnUsername: '' })).toBe(false)
    expect(isTurnConfigured({ ...TURN, turnCredential: '' })).toBe(false)
    expect(isTurnConfigured()).toBe(false)
  })
})

describe('buildIceConfig', () => {
  it('without TURN: public STUN only, policy all (even for public rooms)', () => {
    for (const isPublic of [false, true]) {
      const cfg = buildIceConfig({ isPublic })
      expect(cfg.iceServers).toEqual(PUBLIC_STUN)
      expect(cfg.iceTransportPolicy).toBe('all')
    }
    expect(buildIceConfig()).toEqual({ iceServers: PUBLIC_STUN, iceTransportPolicy: 'all' })
  })

  it('private room with TURN: STUN + TURN fallback, policy all', () => {
    const cfg = buildIceConfig({ ...TURN, isPublic: false })
    expect(cfg.iceServers.slice(0, PUBLIC_STUN.length)).toEqual(PUBLIC_STUN)
    expect(cfg.iceServers[PUBLIC_STUN.length]).toEqual({
      urls: TURN.turnUrls, username: 'user', credential: 'secret',
    })
    expect(cfg.iceTransportPolicy).toBe('all')
  })

  it('public room with TURN: relay-only so strangers never see each other\'s IP', () => {
    const cfg = buildIceConfig({ ...TURN, isPublic: true })
    expect(cfg.iceTransportPolicy).toBe('relay')
    expect(cfg.iceServers.some(s => s.username === 'user')).toBe(true)
    expect(cfg.iceServers.slice(0, PUBLIC_STUN.length)).toEqual(PUBLIC_STUN)
  })

  it('half-configured TURN is ignored rather than crashing RTCPeerConnection', () => {
    const cfg = buildIceConfig({ ...TURN, turnCredential: '', isPublic: true })
    expect(cfg.iceServers).toEqual(PUBLIC_STUN)
    expect(cfg.iceTransportPolicy).toBe('all')
  })

  it('never mutates the shared STUN list', () => {
    const cfg = buildIceConfig(TURN)
    cfg.iceServers[0].urls = 'mutated'
    expect(PUBLIC_STUN[0].urls).toBe('stun:stun.l.google.com:19302')
  })
})
