import { describe, it, expect } from 'vitest'
import { GHOST_GRACE_MS, hasLiveConn, isGhost, isSeatOnline, presenceHeal, seatLeft } from './presenceLogic'

describe('isSeatOnline', () => {
  it('treats missing presence as online (legacy convention)', () => {
    expect(isSeatOnline(undefined)).toBe(true)
    expect(isSeatOnline(null)).toBe(true)
    expect(isSeatOnline({})).toBe(true)
  })

  it('falls back to the legacy flag when no conns are recorded', () => {
    expect(isSeatOnline({ online: true })).toBe(true)
    expect(isSeatOnline({ online: false })).toBe(false)
  })

  it('stays online while any connection exists, whatever the legacy flag says', () => {
    // Second tab closed / late onDisconnect: online:false but another conn is open.
    expect(isSeatOnline({ online: false, conns: { a: 1 } })).toBe(true)
    expect(isSeatOnline({ online: false, conns: { a: 1, b: 2 } })).toBe(true)
  })

  it('is offline once every connection is gone and the flag is false', () => {
    expect(isSeatOnline({ online: false, conns: {} })).toBe(false)
  })

  it('reads a LEAVE marker as offline until the seat reconnects', () => {
    expect(isSeatOnline({ online: true, leftAt: 5 })).toBe(false)
    expect(isSeatOnline({ online: true, leftAt: 5, conns: { a: 9 } })).toBe(true)
  })
})

describe('seatLeft', () => {
  it('needs the marker and no live connection', () => {
    expect(seatLeft({ leftAt: 1, online: false })).toBe(true)
    expect(seatLeft({ leftAt: 1, conns: { a: 2 } })).toBe(false)
    expect(seatLeft({ online: false })).toBe(false)
    expect(seatLeft(null)).toBe(false)
  })
})

describe('hasLiveConn', () => {
  it('only counts a non-empty conns map', () => {
    expect(hasLiveConn({ conns: { k: 1 } })).toBe(true)
    expect(hasLiveConn({ conns: {} })).toBe(false)
    expect(hasLiveConn({ conns: null })).toBe(false)
    expect(hasLiveConn(undefined)).toBe(false)
  })
})

describe('presenceHeal', () => {
  it('re-asserts online when my conn is registered but the flag was cleared', () => {
    expect(presenceHeal({ online: false, conns: { me: 1 } }, 'me')).toBe('online')
  })

  it('re-registers when my conn was wiped (old client overwrote the node)', () => {
    expect(presenceHeal({ online: true }, 'me')).toBe('register')
    expect(presenceHeal({ online: false, conns: { other: 1 } }, 'me')).toBe('register')
  })

  it('leaves a healthy seat alone', () => {
    expect(presenceHeal({ online: true, conns: { me: 1 } }, 'me')).toBe(null)
  })

  it('never undoes a LEAVE', () => {
    expect(presenceHeal({ online: false, leftAt: 3 }, 'me')).toBe(null)
    expect(presenceHeal({ online: false, leftAt: 3, conns: { me: 1 } }, 'me')).toBe(null)
  })

  it('does nothing without a conn key or node', () => {
    expect(presenceHeal({ online: false }, null)).toBe(null)
    expect(presenceHeal(null, 'me')).toBe(null)
  })
})

describe('isGhost', () => {
  const now = 1_000_000
  it('is never a ghost while online', () => {
    expect(isGhost({ online: true }, now)).toBe(false)
    expect(isGhost({ online: false, conns: { a: 1 } }, now)).toBe(false)
  })

  it('holds the seat through the grace window', () => {
    expect(isGhost({ online: false, offlineAt: now - 1000 }, now)).toBe(false)
    expect(isGhost({ online: false, offlineAt: now - GHOST_GRACE_MS }, now)).toBe(true)
  })

  it('treats an offline seat without offlineAt (old client) as a ghost', () => {
    expect(isGhost({ online: false }, now)).toBe(true)
  })
})
