import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The controller listens for the native shell's pause/resume on window.
beforeEach(() => {
  globalThis.window = new EventTarget()
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
})
afterEach(() => { delete globalThis.window })

const { createVoiceController } = await import('./voiceController')

const room = (over = {}) => ({
  gameType: 'party', partyRoom: true, partyCap: 4,
  players: {
    me: { name: 'Me', playerId: 'me', joinedAt: 1 },
    b: { name: 'Bob', playerId: 'b', joinedAt: 2 },
    c: { name: 'Cy', playerId: 'c', joinedAt: 3 },
  },
  ...over,
})

function fakeIo({ birthYear = 2000, micDenied = false } = {}) {
  const sessions = []
  let directoryCb = null
  const io = {
    hasDb: true,
    published: null,
    music: {},
    watchDirectory: (onData) => { directoryCb = onData; return () => { directoryCb = null } },
    publish: async (entry) => { io.published = entry },
    patch: async (fields) => { io.published = { ...io.published, ...fields } },
    unpublish: async () => { io.published = null },
    hostMute: vi.fn(async () => {}),
    getBirthYear: async () => birthYear,
    openSession: vi.fn(async ({ listenOnly }) => {
      if (micDenied && !listenOnly) throw Object.assign(new Error('mic-denied'), { code: 'mic-denied' })
      const s = { listenOnly, wanted: [], muted: null, closed: false, micStream: null,
        want(u) { s.wanted = u }, setMuted(m) { s.muted = m }, close: async () => { s.closed = true } }
      sessions.push(s)
      return s
    }),
    audioContext: () => null,
    resumeAudio: () => {},
    setMusicBlock: (reason, on) => { io.music[reason] = on },
  }
  return { io, sessions, directory: (d) => directoryCb?.(d) }
}

const flush = () => new Promise(r => setTimeout(r, 0))

describe('voice controller', () => {
  it('is unavailable outside party rooms and to non-members', () => {
    const { io } = fakeIo()
    const ctl = createVoiceController({ gameId: 'G1', me: 'me', enabled: true, io })
    ctl.setRoom(room({ partyRoom: false }))
    expect(ctl.getState().available).toBe(false)
    ctl.setRoom(room())
    expect(ctl.getState().available).toBe(true)
    const off = createVoiceController({ gameId: 'G1', me: 'me', enabled: false, io })
    off.setRoom(room())
    expect(off.getState().available).toBe(false)
  })

  it('joins after the age gate, publishes its entry, stops music, and hears members in voice except blocked ones', async () => {
    const f = fakeIo()
    const ctl = createVoiceController({ gameId: 'G1', me: 'me', enabled: true, io: f.io })
    ctl.setRoom(room())
    await ctl.join()
    expect(f.io.published).toMatchObject({ on: true, muted: false })
    expect(f.io.music.voice).toBe(true)
    f.directory({ me: { on: true }, b: { on: true }, c: { on: true }, z: { on: true } })
    expect(f.sessions[0].wanted).toEqual(['b', 'c'])
    ctl.setBlocks({ c: { name: 'Cy' } })
    expect(f.sessions[0].wanted).toEqual(['b'])
  })

  it('refuses under-13 and asks for the age check when no year is on file', async () => {
    const kid = fakeIo({ birthYear: 2016 })
    const a = createVoiceController({ gameId: 'G1', me: 'me', enabled: true, io: kid.io })
    a.setRoom(room())
    await a.join()
    expect(a.getState().error).toBe('under-age')
    expect(kid.io.openSession).not.toHaveBeenCalled()
    const none = fakeIo({ birthYear: null })
    const b = createVoiceController({ gameId: 'G1', me: 'me', enabled: true, io: none.io })
    b.setRoom(room())
    await b.join()
    expect(b.getState().error).toBe('age-required')
  })

  it('falls back to listen-only when the microphone is refused', async () => {
    const f = fakeIo({ micDenied: true })
    const ctl = createVoiceController({ gameId: 'G1', me: 'me', enabled: true, io: f.io })
    ctl.setRoom(room())
    await ctl.join()
    expect(ctl.getState()).toMatchObject({ error: 'mic-denied', listenOnly: true })
    expect(f.sessions).toHaveLength(1)
    expect(f.sessions[0].listenOnly).toBe(true)
  })

  it('keeps the same session across game switches and seat-family changes (B7)', async () => {
    const f = fakeIo()
    const ctl = createVoiceController({ gameId: 'G1', me: 'me', enabled: true, io: f.io })
    ctl.setRoom(room())
    await ctl.join()
    ctl.setRoom(room({ gameType: 'fibbage' }))
    ctl.setRoom({ gameType: 'connectfour', partyRoom: true, partyCap: 4,
      players: { X: { name: 'Me', playerId: 'me', joinedAt: 1 }, O: { name: 'Bob', playerId: 'b', joinedAt: 2 } },
      queue: { c: { name: 'Cy', playerId: 'c', joinedAt: 3, at: 4 } } })
    expect(f.io.openSession).toHaveBeenCalledTimes(1)
    expect(f.sessions[0].closed).toBe(false)
  })

  it('leaves when removed from the party', async () => {
    const f = fakeIo()
    const ctl = createVoiceController({ gameId: 'G1', me: 'me', enabled: true, io: f.io })
    ctl.setRoom(room())
    await ctl.join()
    ctl.setRoom(room({ removed: { me: true } }))
    await flush()
    expect(f.sessions[0].closed).toBe(true)
    expect(f.io.published).toBeNull()
    expect(ctl.getState().available).toBe(false)
  })

  it('C1: leaves on the app going to the background and rejoins with a fresh session on return', async () => {
    const f = fakeIo()
    const ctl = createVoiceController({ gameId: 'G1', me: 'me', enabled: true, io: f.io })
    ctl.setRoom(room())
    await ctl.join()
    window.dispatchEvent(new Event('native-pause'))
    await flush()
    expect(f.sessions[0].closed).toBe(true)
    expect(ctl.getState().status).toBe('paused')
    window.dispatchEvent(new Event('native-resume'))
    await flush()
    expect(f.sessions).toHaveLength(2)
    expect(f.sessions[1].closed).toBe(false)
    // LEAVE VOICE is remembered: no rejoin after a later pause/resume.
    await ctl.leave()
    window.dispatchEvent(new Event('native-pause'))
    window.dispatchEvent(new Event('native-resume'))
    await flush()
    expect(f.sessions).toHaveLength(2)
  })

  it('the host’s soft mute mutes the mic until the player unmutes', async () => {
    const f = fakeIo()
    const ctl = createVoiceController({ gameId: 'G1', me: 'me', enabled: true, io: f.io })
    ctl.setRoom(room())
    await ctl.join()
    f.directory({ me: { on: true, hostMuted: true } })
    expect(ctl.getState().muted).toBe(true)
    expect(f.sessions[0].muted).toBe(true)
    ctl.toggleMute()
    expect(ctl.getState().muted).toBe(false)
    expect(f.io.published).toMatchObject({ muted: false, hostMuted: null })
  })
})
