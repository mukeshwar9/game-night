import { describe, expect, it } from 'vitest'
import {
  ageFromBirthYear, voiceMembers, voiceAccess, isAudioOnlyOffer, allowedPulls, rateAllow,
  newPullQueue, setWanted, nextStep, startStep, finishStep, wantedFromDirectory,
  shouldRejoinAfterPause, newAttemptId, isSpeaking, voiceErrorText, VOICE_REJOIN_AFTER_MS,
} from './voiceLogic'

const NOW = new Date('2026-10-02T00:00:00Z')

const party = (over = {}) => ({
  gameType: 'party', partyRoom: true, partyCap: 4,
  players: {
    a: { name: 'Ann', playerId: 'a', joinedAt: 1 },
    b: { name: 'Bob', playerId: 'b', joinedAt: 2 },
    c: { name: 'Cy', playerId: 'c', joinedAt: 3 },
  },
  ...over,
})

const twoP = (over = {}) => ({
  gameType: 'connectfour', partyRoom: true, partyCap: 4,
  players: { X: { name: 'Ann', playerId: 'a', joinedAt: 1 }, O: { name: 'Bob', playerId: 'b', joinedAt: 2 } },
  queue: { c: { name: 'Cy', playerId: 'c', joinedAt: 3, at: 5 } },
  ...over,
})

describe('voiceAccess', () => {
  it('lets anyone holding a place in a party use voice, in either seat family', () => {
    for (const uid of ['a', 'b', 'c']) {
      expect(voiceAccess({ room: party(), uid, birthYear: 2000, now: NOW })).toBeNull()
      expect(voiceAccess({ room: twoP(), uid, birthYear: 2000, now: NOW })).toBeNull()
    }
  })

  it('refuses rooms that are not parties, public rooms, non-members and removed members', () => {
    expect(voiceAccess({ room: null, uid: 'a' })).toBe('room-not-found')
    expect(voiceAccess({ room: party({ partyRoom: false }), uid: 'a' })).toBe('not-party')
    expect(voiceAccess({ room: party({ visibility: 'public' }), uid: 'a' })).toBe('public-room')
    expect(voiceAccess({ room: party(), uid: 'z' })).toBe('not-member')
    expect(voiceAccess({ room: party({ removed: { b: true } }), uid: 'b' })).toBe('removed')
  })

  it('refuses members past the cap (a racing fifth joiner)', () => {
    const room = party({ partyCap: 2 })
    expect(voiceAccess({ room, uid: 'b' })).toBeNull()
    expect(voiceAccess({ room, uid: 'c' })).toBe('not-member')
  })

  it('requires the 13+ birth-year gate when the year is given (C3)', () => {
    expect(voiceAccess({ room: party(), uid: 'a', birthYear: null, now: NOW })).toBe('age-required')
    expect(voiceAccess({ room: party(), uid: 'a', birthYear: 2014, now: NOW })).toBe('under-age')
    expect(voiceAccess({ room: party(), uid: 'a', birthYear: 2013, now: NOW })).toBeNull()
    expect(voiceAccess({ room: party(), uid: 'a', birthYear: 2030, now: NOW })).toBe('age-required')
    expect(ageFromBirthYear(1.5, NOW)).toBeNull()
  })
})

describe('isAudioOnlyOffer', () => {
  const sdp = (...m) => ['v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', ...m.flatMap(x => [x, 'a=mid:0'])].join('\r\n')
  it('accepts one audio section', () => {
    expect(isAudioOnlyOffer(sdp('m=audio 9 UDP/TLS/RTP/SAVPF 111'))).toBe(true)
  })
  it('refuses video, data channels, extra audio and junk', () => {
    expect(isAudioOnlyOffer(sdp('m=video 9 UDP/TLS/RTP/SAVPF 96'))).toBe(false)
    expect(isAudioOnlyOffer(sdp('m=audio 9 UDP/TLS/RTP/SAVPF 111', 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel'))).toBe(false)
    expect(isAudioOnlyOffer(sdp('m=audio 9 X 111', 'm=audio 9 X 111'))).toBe(false)
    expect(isAudioOnlyOffer('hello')).toBe(false)
    expect(isAudioOnlyOffer(null)).toBe(false)
    expect(isAudioOnlyOffer(`v=0\r\n${'x'.repeat(20_001)}`)).toBe(false)
  })
})

describe('allowedPulls', () => {
  const published = { a: { sessionId: 's-a', trackName: 'mic-a' }, b: { sessionId: 's-b', trackName: 'mic-b' }, c: { sessionId: 's-c', trackName: 'mic-c' } }
  const none = () => false
  it('pulls current members with a published track, never yourself', () => {
    expect(allowedPulls({ room: party(), me: 'a', requested: ['a', 'b', 'c', 'z'], published, blocked: none })).toEqual(['b', 'c'])
  })
  it('refuses a block in either direction (both sides stop hearing each other)', () => {
    const blocks = { b: { a: true } }
    const blocked = (x, y) => !!blocks[x]?.[y]
    expect(allowedPulls({ room: party(), me: 'a', requested: ['b', 'c'], published, blocked })).toEqual(['c'])
    expect(allowedPulls({ room: party(), me: 'b', requested: ['a', 'c'], published, blocked })).toEqual(['c'])
  })
  it('refuses removed or unpublished members and junk requests', () => {
    expect(allowedPulls({ room: party({ removed: { c: true } }), me: 'a', requested: ['b', 'c'], published, blocked: none })).toEqual(['b'])
    expect(allowedPulls({ room: party(), me: 'a', requested: ['b'], published: {}, blocked: none })).toEqual([])
    expect(allowedPulls({ room: party(), me: 'a', requested: 'b', published, blocked: none })).toEqual([])
  })
})

describe('rateAllow', () => {
  it('allows up to the limit per window', () => {
    let h = []
    for (let i = 0; i < 3; i++) {
      const r = rateAllow(h, 1000 + i, 3)
      expect(r.ok).toBe(true)
      h = r.history
    }
    expect(rateAllow(h, 1010, 3).ok).toBe(false)
    expect(rateAllow(h, 70_000, 3).ok).toBe(true)
  })
})

describe('pull queue', () => {
  it('serializes changes: one batched step at a time, closes first', () => {
    let q = setWanted(newPullQueue('t1'), ['c', 'b'])
    expect(nextStep(q)).toEqual({ op: 'pull', uids: ['b', 'c'] })
    q = startStep(q)
    expect(nextStep(q)).toBeNull()
    q = setWanted(q, ['b', 'c', 'd'])
    expect(nextStep(q)).toBeNull()
    q = finishStep(q, { attempt: 't1', op: 'pull', uids: ['b', 'c'], ok: true })
    expect(nextStep(q)).toEqual({ op: 'pull', uids: ['d'] })
    q = setWanted(q, ['d'])
    expect(nextStep(q)).toEqual({ op: 'close', uids: ['b', 'c'] })
  })

  it('ignores late results from an older attempt and keeps a failed step pending', () => {
    let q = startStep(setWanted(newPullQueue('t2'), ['b']))
    q = finishStep(q, { attempt: 't1', op: 'pull', uids: ['b'], ok: true })
    expect(q.busy).toBe(true)
    q = finishStep(q, { attempt: 't2', op: 'pull', uids: ['b'], ok: false })
    expect(nextStep(q)).toEqual({ op: 'pull', uids: ['b'] })
  })

  it('wantedFromDirectory hears members in voice, minus self and blocked', () => {
    const directory = { a: { on: true }, b: { on: true }, c: { on: false }, z: { on: true } }
    expect(wantedFromDirectory({ room: party(), me: 'a', directory, myBlocks: {} })).toEqual(['b'])
    expect(wantedFromDirectory({ room: party(), me: 'a', directory, myBlocks: { b: true } })).toEqual([])
  })
})

describe('client helpers', () => {
  it('rejoins after a long pause only', () => {
    expect(shouldRejoinAfterPause(null, 10)).toBe(false)
    expect(shouldRejoinAfterPause(0, VOICE_REJOIN_AFTER_MS)).toBe(false)
    expect(shouldRejoinAfterPause(0, VOICE_REJOIN_AFTER_MS + 1)).toBe(true)
  })
  it('attempt ids differ; speaking threshold; error copy', () => {
    expect(newAttemptId(1, () => 0.1)).not.toBe(newAttemptId(1, () => 0.2))
    expect(isSpeaking(0.2)).toBe(true)
    expect(isSpeaking(0.01)).toBe(false)
    expect(voiceErrorText('under-age')).toBe('VOICE IS FOR 13 AND OVER')
    expect(voiceErrorText('weird')).toMatch(/TRY AGAIN/)
  })
  it('voiceMembers caps the party', () => {
    expect(voiceMembers(party({ partyCap: 2 })).map(m => m.uid)).toEqual(['a', 'b'])
    expect(voiceMembers(twoP()).map(m => m.uid)).toEqual(['a', 'b', 'c'])
  })
})
