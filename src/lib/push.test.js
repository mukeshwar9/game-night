import { describe, it, expect } from 'vitest'
import { isPushSupported, permissionState, tokenHash, tokenRecord } from './push.js'

describe('push helpers', () => {
  it('detects support from navigator + window caps', () => {
    expect(isPushSupported(
      { serviceWorker: {} },
      { PushManager: {}, Notification: {} },
    )).toBe(true)
    expect(isPushSupported({}, {})).toBe(false)
    expect(isPushSupported(null, null)).toBe(false)
  })

  it('reads Notification.permission or unsupported', () => {
    expect(['default', 'granted', 'denied', 'unsupported']).toContain(permissionState())
  })

  it('hashes tokens to 32 hex chars, stable', async () => {
    const a = await tokenHash('fcm-token-abc-1234567890-long-enough-value')
    const b = await tokenHash('fcm-token-abc-1234567890-long-enough-value')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    const c = await tokenHash('different-token-value-1234567890-long')
    expect(c).not.toBe(a)
  })

  it('builds token records, rejects junk', () => {
    expect(tokenRecord('short')).toBe(null)
    expect(tokenRecord(null)).toBe(null)
    const r = tokenRecord('fcm-token-abc-1234567890-long-enough-value', 1234)
    expect(r.token).toContain('fcm-token')
    expect(r.at).toBe(1234)
  })
})
