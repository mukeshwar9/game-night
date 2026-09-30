import { describe, it, expect } from 'vitest'
import { resolveAuthDomain } from './authDomainLogic'

const CONFIGURED = 'game-night-91464.firebaseapp.com'

describe('resolveAuthDomain', () => {
  it('keeps the configured domain unless enabled', () => {
    expect(resolveAuthDomain(CONFIGURED, 'game-night-91464.web.app', false)).toBe(CONFIGURED)
    expect(resolveAuthDomain(CONFIGURED, 'game-night-91464.web.app', undefined)).toBe(CONFIGURED)
  })
  it('follows a Firebase Hosting host when enabled', () => {
    expect(resolveAuthDomain(CONFIGURED, 'game-night-91464.web.app', true)).toBe('game-night-91464.web.app')
    expect(resolveAuthDomain(CONFIGURED, 'game-night-91464.firebaseapp.com', true)).toBe('game-night-91464.firebaseapp.com')
  })
  it('never follows localhost, IPs, custom or lookalike domains', () => {
    for (const host of ['localhost', '127.0.0.1', 'example.com', 'evil.web.app.example.com', undefined, null]) {
      expect(resolveAuthDomain(CONFIGURED, host, true)).toBe(CONFIGURED)
    }
  })
})
