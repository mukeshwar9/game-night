import { describe, it, expect } from 'vitest'
import {
  makeAttemptId, makeAttempt, normalizeAttempt, shouldFollowAttempt,
  initialConnState, connReducer, dropPrompt, claimAbandonedPatch, showRealtimeOverlay,
  DISCONNECT_GRACE_MS, NEGOTIATION_TIMEOUT_MS, MAX_AUTO_RETRIES, CLAIM_AFTER_MS,
} from './connectionLogic'

// Feed a list of events through the reducer, collecting every effect.
const run = (events, { isHost = false, from = initialConnState() } = {}) => {
  let state = from
  const effects = []
  for (const e of events) {
    const res = connReducer(state, e, { isHost })
    state = res.state
    effects.push(res.effects)
  }
  return { state, effects, last: effects[effects.length - 1] }
}
const connected = () => run([{ type: 'attempt' }, { type: 'channel-open' }]).state

describe('attempt ids', () => {
  it('are valid Firebase keys', () => {
    const id = makeAttemptId(1_700_000_000_000, 0.123456)
    expect(id).toMatch(/^a[0-9a-z]+$/)
    expect(id).not.toMatch(/[.$#[\]/]/)
  })

  it('differ across time and randomness', () => {
    expect(makeAttemptId(1000, 0.5)).not.toBe(makeAttemptId(1001, 0.5))
    expect(makeAttemptId(1000, 0.1)).not.toBe(makeAttemptId(1000, 0.2))
  })

  it('makeAttempt records who started it and when', () => {
    const a = makeAttempt('O', 5000, 0.3)
    expect(a).toEqual({ id: makeAttemptId(5000, 0.3), by: 'O', at: 5000 })
  })
})

describe('normalizeAttempt', () => {
  it('rejects absent and malformed values', () => {
    expect(normalizeAttempt(null)).toBeNull()
    expect(normalizeAttempt(undefined)).toBeNull()
    expect(normalizeAttempt('a123')).toBeNull()
    expect(normalizeAttempt({})).toBeNull()
    expect(normalizeAttempt({ id: '' })).toBeNull()
    expect(normalizeAttempt({ id: 42 })).toBeNull()
  })

  it('fills defaults for optional fields', () => {
    expect(normalizeAttempt({ id: 'a1' })).toEqual({ id: 'a1', by: null, at: 0 })
    expect(normalizeAttempt({ id: 'a1', by: 'Z', at: 'x' })).toEqual({ id: 'a1', by: null, at: 0 })
    expect(normalizeAttempt({ id: 'a1', by: 'X', at: 9 })).toEqual({ id: 'a1', by: 'X', at: 9 })
  })
})

describe('shouldFollowAttempt', () => {
  it('follows a new attempt id', () => {
    expect(shouldFollowAttempt(null, { id: 'a1' })).toBe(true)
    expect(shouldFollowAttempt('a1', { id: 'a2' })).toBe(true)
  })

  it('ignores the attempt it is already on', () => {
    expect(shouldFollowAttempt('a1', { id: 'a1', by: 'X' })).toBe(false)
  })

  it('keeps the current run when the attempt node was removed', () => {
    expect(shouldFollowAttempt('a1', null)).toBe(false)
    expect(shouldFollowAttempt('a1', { bogus: true })).toBe(false)
  })

  it('RETRY in either order converges: each side only follows the latest id', () => {
    // X retries (a2), then O retries (a3) before X's run connects.
    let x = 'a1', o = 'a1'
    for (const latest of ['a2', 'a3']) {
      if (shouldFollowAttempt(x, { id: latest })) x = latest
      if (shouldFollowAttempt(o, { id: latest })) o = latest
    }
    expect(x).toBe('a3')
    expect(o).toBe('a3')
  })
})

describe('connReducer — first connection', () => {
  it('start surfaces connecting at once, without arming a timer', () => {
    const { state, last } = run([{ type: 'start' }])
    expect(state.status).toBe('connecting')
    expect(last).toEqual({})
  })

  it('starts idle, goes connecting on the first attempt with a negotiation timer', () => {
    expect(initialConnState().status).toBe('idle')
    const { state, last } = run([{ type: 'attempt' }])
    expect(state.status).toBe('connecting')
    expect(last.timer).toBe(NEGOTIATION_TIMEOUT_MS)
  })

  it('connects when the data channel opens and clears the timer', () => {
    const { state, last } = run([{ type: 'attempt' }, { type: 'channel-open' }])
    expect(state.status).toBe('connected')
    expect(state.everConnected).toBe(true)
    expect(last.clearTimer).toBe(true)
  })

  it('pc "connected" alone (channel not yet open) does not claim connected', () => {
    const { state } = run([{ type: 'attempt' }, { type: 'pc', state: 'connected' }])
    expect(state.status).toBe('connecting')
  })

  it('guest negotiation timeout surfaces failed', () => {
    const { state } = run([{ type: 'attempt' }, { type: 'timeout' }])
    expect(state.status).toBe('failed')
  })
})

describe('connReducer — disconnect grace (F-47)', () => {
  it('ICE disconnected pauses immediately as reconnecting with the grace timer', () => {
    const { state, last } = run([{ type: 'pc', state: 'disconnected' }], { from: connected() })
    expect(state.status).toBe('reconnecting')
    expect(last.timer).toBe(DISCONNECT_GRACE_MS)
  })

  it('recovers to connected when ICE comes back within the grace window', () => {
    const { state, last } = run([
      { type: 'pc', state: 'disconnected' },
      { type: 'pc', state: 'connected' },
    ], { from: connected() })
    expect(state.status).toBe('connected')
    expect(last.clearTimer).toBe(true)
  })

  it('a closed data channel also pauses, and cannot recover via ICE alone', () => {
    const { state } = run([
      { type: 'channel-close' },
      { type: 'pc', state: 'connected' },
    ], { from: connected() })
    expect(state.status).toBe('reconnecting')
  })

  it('guest: grace expiry surfaces failed', () => {
    const { state, last } = run([{ type: 'pc', state: 'disconnected' }, { type: 'timeout' }], { from: connected() })
    expect(state.status).toBe('failed')
    expect(last.retry).toBeUndefined()
  })

  it('a late timeout after recovery is ignored', () => {
    const { state } = run([
      { type: 'pc', state: 'disconnected' },
      { type: 'pc', state: 'connected' },
      { type: 'timeout' },
    ], { from: connected() })
    expect(state.status).toBe('connected')
  })
})

describe('connReducer — heartbeat silence', () => {
  it('a silent peer pauses at once (closed tab: no clean channel close, ICE is ~5 s late)', () => {
    const { state, last } = run([{ type: 'silence' }], { from: connected() })
    expect(state.status).toBe('reconnecting')
    expect(last.timer).toBe(DISCONNECT_GRACE_MS)
  })

  it('resumes as soon as a frame is heard again', () => {
    const { state, last } = run([{ type: 'silence' }, { type: 'heard' }], { from: connected() })
    expect(state.status).toBe('connected')
    expect(last.clearTimer).toBe(true)
  })

  it('hearing a frame does not override a disconnected ICE path', () => {
    const { state } = run([{ type: 'pc', state: 'disconnected' }, { type: 'silence' }, { type: 'heard' }], { from: connected() })
    expect(state.status).toBe('reconnecting')
    const back = run([{ type: 'pc', state: 'connected' }], { from: state }).state
    expect(back.status).toBe('connected')
  })

  it('a second signal while already paused does not restart the grace timer', () => {
    const { last } = run([{ type: 'silence' }, { type: 'pc', state: 'disconnected' }], { from: connected() })
    expect(last).toEqual({})
  })

  it('silence then grace expiry fails (guest) / auto-retries (host)', () => {
    expect(run([{ type: 'silence' }, { type: 'timeout' }], { from: connected() }).state.status).toBe('failed')
    expect(run([{ type: 'silence' }, { type: 'timeout' }], { isHost: true, from: connected() }).last.retry).toBe(true)
  })

  it('a new attempt clears stale silence / ICE flags', () => {
    const paused = run([{ type: 'silence' }, { type: 'pc', state: 'disconnected' }], { from: connected() }).state
    const { state } = run([{ type: 'attempt' }, { type: 'channel-open' }], { from: paused })
    expect(state.status).toBe('connected')
  })

  it('failed stays failed on stray link events until a new attempt', () => {
    const failed = run([{ type: 'pc', state: 'failed' }], { from: connected() }).state
    for (const e of [{ type: 'heard' }, { type: 'channel-open' }, { type: 'pc', state: 'connected' }]) {
      expect(connReducer(failed, e).state.status).toBe('failed')
    }
  })
})

describe('connReducer — retries', () => {
  it('host auto-retries once (staying paused), then fails', () => {
    const host = { isHost: true }
    let { state, last } = run([{ type: 'pc', state: 'disconnected' }, { type: 'timeout' }], { ...host, from: connected() })
    expect(last.retry).toBe(true)
    expect(state.status).toBe('reconnecting')
    expect(state.autoRetries).toBe(1)
    ;({ state, last } = run([{ type: 'attempt' }, { type: 'timeout' }], { ...host, from: state }))
    expect(MAX_AUTO_RETRIES).toBe(1)
    expect(last.retry).toBeUndefined()
    expect(state.status).toBe('failed')
  })

  it('pc "failed" goes through the same path as a timeout', () => {
    expect(run([{ type: 'pc', state: 'failed' }], { from: connected() }).state.status).toBe('failed')
    const host = run([{ type: 'pc', state: 'failed' }], { isHost: true, from: connected() })
    expect(host.last.retry).toBe(true)
  })

  it('reconnecting after a successful link resets the auto-retry budget', () => {
    const host = { isHost: true }
    let { state } = run([{ type: 'pc', state: 'failed' }, { type: 'attempt' }, { type: 'channel-open' }], { ...host, from: connected() })
    expect(state.autoRetries).toBe(0)
    ;({ state } = run([{ type: 'pc', state: 'failed' }], { ...host, from: state }))
    expect(state.autoRetries).toBe(1)
  })

  it('a new attempt after having connected reads as reconnecting (sim stays frozen)', () => {
    const { state } = run([{ type: 'attempt' }], { from: connected() })
    expect(state.status).toBe('reconnecting')
  })

  it('manual RETRY from failed shows reconnecting and resets the budget', () => {
    const failed = run([{ type: 'pc', state: 'failed' }], { from: connected() }).state
    const { state } = run([{ type: 'manual-retry' }], { from: { ...failed, autoRetries: 1 } })
    expect(state.status).toBe('reconnecting')
    expect(state.autoRetries).toBe(0)
  })

  it('a remote attempt revives a failed peer', () => {
    const failed = run([{ type: 'attempt' }, { type: 'timeout' }]).state
    expect(failed.status).toBe('failed')
    expect(run([{ type: 'attempt' }], { from: failed }).state.status).toBe('connecting')
  })

  it('repeated failed events do not re-trigger retries', () => {
    const failed = run([{ type: 'pc', state: 'failed' }], { from: connected() }).state
    const { last } = run([{ type: 'pc', state: 'failed' }], { isHost: true, from: failed })
    expect(last.retry).toBeUndefined()
  })

  it('unknown events are no-ops', () => {
    const s = connected()
    expect(connReducer(s, { type: 'nope' }).state).toBe(s)
  })
})

describe('dropPrompt', () => {
  const base = { conn: 'reconnecting', opponentOnline: false, offlineSince: 1000, now: 1000 }

  it('hidden while connected or before any attempt', () => {
    expect(dropPrompt({ ...base, conn: 'connected' }).show).toBe(false)
    expect(dropPrompt({ ...base, conn: 'idle' }).show).toBe(false)
  })

  it('hidden while the opponent is still present (network problem → RETRY)', () => {
    expect(dropPrompt({ ...base, opponentOnline: true }).show).toBe(false)
    expect(dropPrompt({ ...base, opponentOnline: undefined }).show).toBe(false)
  })

  it('shows immediately, with the claim locked until CLAIM_AFTER_MS', () => {
    const p = dropPrompt(base)
    expect(p).toEqual({ show: true, canClaim: false, claimInMs: CLAIM_AFTER_MS })
    const mid = dropPrompt({ ...base, now: 1000 + CLAIM_AFTER_MS - 1 })
    expect(mid.canClaim).toBe(false)
    expect(mid.claimInMs).toBe(1)
  })

  it('unlocks the claim after the window, in failed as well as reconnecting', () => {
    expect(dropPrompt({ ...base, now: 1000 + CLAIM_AFTER_MS }).canClaim).toBe(true)
    expect(dropPrompt({ ...base, conn: 'failed', now: 1000 + CLAIM_AFTER_MS * 3 }).canClaim).toBe(true)
  })

  it('treats a missing offlineSince as "just went offline"', () => {
    expect(dropPrompt({ ...base, offlineSince: null }).canClaim).toBe(false)
  })
})

describe('claimAbandonedPatch', () => {
  const room = {
    status: 'playing',
    scores: { X: 1, O: 0 },
    presence: { X: { online: false }, O: { online: true } },
    pongScoreX: 3,
  }

  it('awards the round to the claimer when the opponent is offline', () => {
    const next = claimAbandonedPatch(room, 'O', 42)
    expect(next).toMatchObject({ winner: 'O', status: 'finished', scores: { X: 1, O: 1 }, lastActivityAt: 42, pongScoreX: 3 })
  })

  it('aborts when the opponent is back, the round is over, or the seat is bogus', () => {
    expect(claimAbandonedPatch({ ...room, presence: { X: { online: true } } }, 'O')).toBeUndefined()
    expect(claimAbandonedPatch({ ...room, presence: {} }, 'O')).toBeUndefined()
    expect(claimAbandonedPatch({ ...room, status: 'finished' }, 'O')).toBeUndefined()
    expect(claimAbandonedPatch(null, 'O')).toBeUndefined()
    expect(claimAbandonedPatch(room, null)).toBeUndefined()
  })

  it('does not let a player claim against themselves', () => {
    expect(claimAbandonedPatch(room, 'X')).toBeUndefined()
  })
})

describe('showRealtimeOverlay', () => {
  it('hides the overlay (and its dimming backdrop) only during live play', () => {
    expect(showRealtimeOverlay('connected', 0)).toBe(false)
    expect(showRealtimeOverlay('connected', 2)).toBe(true)
    for (const c of ['idle', 'connecting', 'reconnecting', 'failed', null]) {
      expect(showRealtimeOverlay(c, 0)).toBe(true)
    }
  })
})
