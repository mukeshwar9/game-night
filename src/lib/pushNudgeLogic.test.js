import { describe, it, expect } from 'vitest'
import { NUDGE_SNOOZE_MS, shouldShowPushNudge } from './pushNudgeLogic'

const base = { available: true, enabled: false, permission: 'default', now: 1_000_000_000_000 }

describe('shouldShowPushNudge', () => {
  it('asks when push can work, is off and was never refused', () => {
    expect(shouldShowPushNudge(base)).toBe(true)
    expect(shouldShowPushNudge({ ...base, permission: 'granted' })).toBe(true)
  })

  it('stays quiet when push is on, unavailable, denied or unsupported', () => {
    expect(shouldShowPushNudge({ ...base, enabled: true })).toBe(false)
    expect(shouldShowPushNudge({ ...base, available: false })).toBe(false)
    expect(shouldShowPushNudge({ ...base, permission: 'denied' })).toBe(false)
    expect(shouldShowPushNudge({ ...base, permission: 'unsupported' })).toBe(false)
  })

  it('respects NOT NOW for two weeks, then asks again', () => {
    expect(shouldShowPushNudge({ ...base, dismissedAt: base.now - 1000 })).toBe(false)
    expect(shouldShowPushNudge({ ...base, dismissedAt: base.now - NUDGE_SNOOZE_MS - 1 })).toBe(true)
  })
})
