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

describe('isVoiceLive', () => {
  it('is true while a session exists or is being restored, false when off, joining or paused', async () => {
    const { isVoiceLive } = await import('./voiceLogic')
    for (const s of ['connecting', 'connected', 'reconnecting', 'failed']) expect(isVoiceLive(s)).toBe(true)
    for (const s of ['off', 'joining', 'paused', undefined]) expect(isVoiceLive(s)).toBe(false)
  })
})

describe('camera offers', () => {
  const sec = (kind) => `m=${kind} 9 UDP/TLS/RTP/SAVPF 96\r\na=mid:0`
  const sdp = (...kinds) => `v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n${kinds.map(sec).join('\r\n')}`

  it('counts media sections and rejects non-SDP', async () => {
    const { offerMedia } = await import('./voiceLogic')
    expect(offerMedia(sdp('audio', 'video'))).toEqual({ audio: 1, video: 1, other: 0, sendAudio: 1, sendVideo: 1 })
    expect(offerMedia('nope')).toBeNull()
    expect(offerMedia(`v=0\r\n${'x'.repeat(100_001)}`)).toBeNull()
  })

  it('ignores stopped (port 0) sections left by a camera turned off earlier', async () => {
    const { isCameraOffer } = await import('./voiceLogic')
    const stopped = 'm=video 0 UDP/TLS/RTP/SAVPF 96\r\na=mid:1'
    expect(isCameraOffer(`${sdp('audio')}\r\n${stopped}\r\n${sec('video')}`)).toBe(true)
  })

  it('accepts one camera, with or without the mic already in the connection', async () => {
    const { isCameraOffer } = await import('./voiceLogic')
    expect(isCameraOffer(sdp('video'))).toBe(true)
    expect(isCameraOffer(sdp('audio', 'video'))).toBe(true)
  })

  it('accepts a second participant turning the camera on over pulled remote voices and cameras', async () => {
    const { isCameraOffer } = await import('./voiceLogic')
    const dir = (kind, d) => `${sec(kind)}\r\na=${d}`
    const offer = (...parts) => `v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n${parts.join('\r\n')}`
    const mic = dir('audio', 'sendonly')
    const cam = dir('video', 'sendonly')
    const hear = dir('audio', 'recvonly')
    expect(isCameraOffer(offer(mic, hear, cam))).toBe(true)
    expect(isCameraOffer(offer(mic, hear, hear, hear, dir('video', 'recvonly'), dir('video', 'inactive'), cam))).toBe(true)
    expect(isCameraOffer(offer(mic, hear, dir('video', 'sendrecv')))).toBe(true)
  })

  it('refuses a second sending video, a second sending mic, or a data channel among pulls', async () => {
    const { isCameraOffer } = await import('./voiceLogic')
    const dir = (kind, d) => `${sec(kind)}\r\na=${d}`
    const offer = (...parts) => `v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n${parts.join('\r\n')}`
    const mic = dir('audio', 'sendonly')
    const cam = dir('video', 'sendonly')
    const hear = dir('audio', 'recvonly')
    expect(isCameraOffer(offer(mic, hear, cam, cam))).toBe(false)
    expect(isCameraOffer(offer(mic, mic, cam))).toBe(false)
    expect(isCameraOffer(offer(mic, hear, dir('video', 'recvonly')))).toBe(false)
    expect(isCameraOffer(offer(mic, hear, cam, dir('application', 'sendrecv')))).toBe(false)
  })

  it('takes a full party re-offer well past the old 20,000-character cap', async () => {
    const { isCameraOffer, MAX_OFFER_SDP } = await import('./voiceLogic')
    const codecs = '\r\na=rtpmap:96 VP8/90000'.repeat(120)
    const big = (kind, d) => `m=${kind} 9 UDP/TLS/RTP/SAVPF 96\r\na=mid:0\r\na=${d}${codecs}`
    const parts = [big('audio', 'sendonly'), big('video', 'sendonly')]
    for (let i = 0; i < 7; i++) parts.push(big('audio', 'recvonly'), big('video', 'recvonly'))
    const offer = `v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n${parts.join('\r\n')}`
    expect(offer.length).toBeGreaterThan(20_000)
    expect(offer.length).toBeLessThan(MAX_OFFER_SDP)
    expect(isCameraOffer(offer)).toBe(true)
  })

  it('refuses two cameras, no camera, two mics, or a data channel', async () => {
    const { isCameraOffer } = await import('./voiceLogic')
    expect(isCameraOffer(sdp('video', 'video'))).toBe(false)
    expect(isCameraOffer(sdp('audio'))).toBe(false)
    expect(isCameraOffer(sdp('audio', 'audio', 'video'))).toBe(false)
    expect(isCameraOffer(sdp('video', 'application'))).toBe(false)
  })
})

describe('cameraAccess', () => {
  it('follows voice access (private party, 13+) and adds the host switch', async () => {
    const { cameraAccess } = await import('./voiceLogic')
    expect(cameraAccess({ room: party(), uid: 'a', birthYear: 2000, now: NOW })).toBeNull()
    expect(cameraAccess({ room: party({ visibility: 'public' }), uid: 'a', birthYear: 2000, now: NOW })).toBe('public-room')
    expect(cameraAccess({ room: party(), uid: 'a', birthYear: 2016, now: NOW })).toBe('under-age')
    expect(cameraAccess({ room: party({ camerasOff: true }), uid: 'a', birthYear: 2000, now: NOW })).toBe('cameras-off')
  })
})

describe('allowedVideoPulls', () => {
  const sessions = {
    a: { sessionId: 'SA', cam: { trackName: 'cam-a' } },
    b: { sessionId: 'SB', cam: { trackName: 'cam-b' } },
    c: { sessionId: 'SC' }, // no camera published
  }
  const base = (over = {}) => ({
    room: party(), me: 'a', requested: ['b', 'c'], sessions,
    blocked: () => false, isFriend: () => true, showsEveryone: () => false, ...over,
  })

  it('gives video to friends of the sender who published a camera', async () => {
    const { allowedVideoPulls } = await import('./voiceLogic')
    expect(allowedVideoPulls(base())).toEqual(['b'])
  })

  it('friends first: a non-friend sees video only when the sender shows everyone', async () => {
    const { allowedVideoPulls } = await import('./voiceLogic')
    expect(allowedVideoPulls(base({ isFriend: () => false }))).toEqual([])
    expect(allowedVideoPulls(base({ isFriend: () => false, showsEveryone: (u) => u === 'b' }))).toEqual(['b'])
  })

  it('refuses blocked pairs in either direction, removed members, outsiders, itself and duplicates', async () => {
    const { allowedVideoPulls } = await import('./voiceLogic')
    expect(allowedVideoPulls(base({ blocked: (x, y) => x === 'b' && y === 'a' }))).toEqual([])
    expect(allowedVideoPulls(base({ room: party({ removed: { b: true } }) }))).toEqual([])
    expect(allowedVideoPulls(base({ requested: ['z', 'a', 'b', 'b'] }))).toEqual(['b'])
  })

  it('returns nothing while the host has cameras off', async () => {
    const { allowedVideoPulls } = await import('./voiceLogic')
    expect(allowedVideoPulls(base({ room: party({ camerasOff: true }) }))).toEqual([])
  })
})

describe('video pull keys', () => {
  it('keeps audio and video apart in one queue', async () => {
    const { videoKey, isVideoKey, uidOfKey, splitKeys } = await import('./voiceLogic')
    expect(videoKey('b')).toBe('b#v')
    expect(videoKey('b', true)).toBe('b#v+')
    expect(isVideoKey('b#v+')).toBe(true)
    expect(isVideoKey('b')).toBe(false)
    expect(uidOfKey('b#v+')).toBe('b')
    expect(splitKeys(['b', 'c#v', 'd#v+'])).toEqual({ audio: ['b'], video: ['c', 'd'] })
  })

  it('wants video only from members with a camera on, minus blocked, hidden, hide-all and cameras-off', async () => {
    const { wantedVideoFromDirectory } = await import('./voiceLogic')
    const directory = { a: { on: true, cam: true }, b: { on: true, cam: true, camAll: true }, c: { on: true, cam: false } }
    const input = { room: party(), me: 'a', directory, myBlocks: {} }
    expect(wantedVideoFromDirectory(input)).toEqual(['b#v+'])
    expect(wantedVideoFromDirectory({ ...input, myBlocks: { b: true } })).toEqual([])
    expect(wantedVideoFromDirectory({ ...input, hidden: { b: true } })).toEqual([])
    expect(wantedVideoFromDirectory({ ...input, hideAll: true })).toEqual([])
    expect(wantedVideoFromDirectory({ ...input, room: party({ camerasOff: true }) })).toEqual([])
  })

  it('the queue closes a changed key before pulling the new one', async () => {
    const { videoKey } = await import('./voiceLogic')
    const q = setWanted({ ...newPullQueue('x'), have: [videoKey('b')] }, [videoKey('b', true)])
    expect(nextStep(q)).toEqual({ op: 'close', uids: ['b#v'] })
  })
})

describe('link quality', () => {
  it('classifies a sample', async () => {
    const { classifyLink } = await import('./voiceLogic')
    expect(classifyLink({ rttMs: 80, outKbps: 900, lossRatio: 0.01 })).toBe('good')
    expect(classifyLink({ rttMs: 900 })).toBe('weak')
    expect(classifyLink({ outKbps: 60 })).toBe('weak')
    expect(classifyLink({ lossRatio: 0.3 })).toBe('weak')
    expect(classifyLink({})).toBe('good')
  })

  it('pauses video after two weak samples and returns after three good ones', async () => {
    const { nextLinkState, LINK_START } = await import('./voiceLogic')
    let s = LINK_START
    s = nextLinkState(s, 'weak')
    expect(s.paused).toBe(false)
    s = nextLinkState(s, 'weak')
    expect(s.paused).toBe(true)
    s = nextLinkState(s, 'good')
    s = nextLinkState(s, 'good')
    expect(s.paused).toBe(true)
    s = nextLinkState(s, 'good')
    expect(s.paused).toBe(false)
    s = nextLinkState(s, 'weak')
    s = nextLinkState(s, 'good')
    s = nextLinkState(s, 'weak')
    expect(s.paused).toBe(false)
  })

  it('has wording for the new refusals', () => {
    expect(voiceErrorText('cameras-off')).toMatch(/CAMERAS OFF/)
    expect(voiceErrorText('cam-denied')).toMatch(/CAMERA/)
  })
})
