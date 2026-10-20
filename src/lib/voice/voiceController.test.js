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

function fakeIo({ birthYear = 2000, micDenied = false, cameraDenied = false } = {}) {
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
    openSession: vi.fn(async ({ listenOnly, onStatus }) => {
      io.onStatus = onStatus
      if (micDenied && !listenOnly) throw Object.assign(new Error('mic-denied'), { code: 'mic-denied' })
      const s = { listenOnly, wanted: [], muted: null, closed: false, micStream: null,
        want(u) { s.wanted = u }, setMuted(m) { s.muted = m }, close: async () => { s.closed = true },
        camera: null,
        startCamera: vi.fn(async (stream) => { s.camera = stream }),
        stopCamera: vi.fn(async () => { s.camera = null }),
        stats: { rttMs: 50, outKbps: 900, lossRatio: 0 },
        sampleStats: async () => s.stats }
      sessions.push(s)
      return s
    }),
    getCamera: vi.fn(async () => {
      if (cameraDenied) throw Object.assign(new Error('denied'), { name: 'NotAllowedError' })
      const track = { stop: vi.fn(), addEventListener: () => {} }
      return { getTracks: () => [track], getVideoTracks: () => [track], track }
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
    expect(f.io.published).toMatchObject({ on: true, muted: true })
    expect(f.io.music.voice).toBe(true)
    f.directory({ me: { on: true }, b: { on: true }, c: { on: true }, z: { on: true } })
    expect(f.sessions[0].wanted).toEqual(['b', 'c'])
    ctl.setBlocks({ c: { name: 'Cy' } })
    expect(f.sessions[0].wanted).toEqual(['b'])
  })

  it('lets music back in while the voice connection is failed or reconnecting, and blocks again once it recovers', async () => {
    const f = fakeIo()
    const ctl = createVoiceController({ gameId: 'G1', me: 'me', enabled: true, io: f.io })
    ctl.setRoom(room())
    await ctl.join()
    expect(f.io.music.voice).toBe(true)
    f.io.onStatus('reconnecting')
    expect(f.io.music.voice).toBe(false)
    f.io.onStatus('connected')
    expect(f.io.music.voice).toBe(true)
    f.io.onStatus('failed')
    expect(f.io.music.voice).toBe(false)
    expect(ctl.getState().status).toBe('failed')
    await ctl.leave()
    expect(f.io.music.voice).toBe(false)
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
    // The player is told why voice went quiet.
    expect(ctl.getState().notice).toBe('resumed')
    ctl.clearNotice()
    expect(ctl.getState().notice).toBeNull()
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

  it('opens muted on join; the mic opens only when the player taps it, and a resume keeps their choice', async () => {
    const f = fakeIo()
    const ctl = createVoiceController({ gameId: 'G1', me: 'me', enabled: true, io: f.io })
    ctl.setRoom(room())
    await ctl.join()
    expect(ctl.getState().muted).toBe(true)
    expect(f.sessions[0].muted).toBe(true)
    ctl.toggleMute()
    expect(f.io.published).toMatchObject({ muted: false })
    window.dispatchEvent(new Event('native-pause'))
    window.dispatchEvent(new Event('native-resume'))
    await flush()
    expect(f.sessions).toHaveLength(2)
    expect(f.sessions[1].muted).toBe(false)
    expect(ctl.getState().muted).toBe(false)
  })

  describe('camera', () => {
    async function joined(opts) {
      const f = fakeIo(opts)
      const ctl = createVoiceController({ gameId: 'G1', me: 'me', enabled: true, io: f.io })
      ctl.setRoom(room())
      await ctl.join()
      return { f, ctl }
    }

    it('is off by default and does nothing without a voice session', async () => {
      const f = fakeIo()
      const ctl = createVoiceController({ gameId: 'G1', me: 'me', enabled: true, io: f.io })
      ctl.setRoom(room())
      expect(ctl.getState().cam).toBe('off')
      await ctl.startCamera()
      expect(f.io.getCamera).not.toHaveBeenCalled()
      await ctl.join()
      expect(ctl.getState().cam).toBe('off')
      expect(f.io.published.cam).toBeUndefined()
    })

    it('turns on when asked, tells the room (cam, camAll), and turns off cleanly', async () => {
      const { f, ctl } = await joined()
      await ctl.startCamera({ everyone: true })
      expect(ctl.getState()).toMatchObject({ cam: 'on', camAll: true })
      expect(ctl.getState().localVideo).toBeTruthy()
      expect(f.sessions[0].startCamera).toHaveBeenCalled()
      expect(f.io.published).toMatchObject({ cam: true, camAll: true })
      const track = ctl.getState().localVideo.track
      await ctl.stopCamera()
      expect(ctl.getState().cam).toBe('off')
      expect(ctl.getState().localVideo).toBeNull()
      expect(track.stop).toHaveBeenCalled()
      expect(f.sessions[0].stopCamera).toHaveBeenCalled()
      expect(f.io.published.cam).toBe(false)
    })

    it('a blocked camera is an avatar and a note, never an error that breaks voice', async () => {
      const { ctl } = await joined({ cameraDenied: true })
      await ctl.startCamera()
      expect(ctl.getState()).toMatchObject({ cam: 'off', camError: 'cam-denied', status: 'connecting' })
      ctl.clearCamError()
      expect(ctl.getState().camError).toBeNull()
    })

    it('a server refusal turns the camera back off with its code', async () => {
      const { f, ctl } = await joined()
      f.sessions[0].startCamera.mockRejectedValueOnce(new Error('under-age'))
      await ctl.startCamera()
      expect(ctl.getState()).toMatchObject({ cam: 'off', camError: 'under-age' })
      expect(ctl.getState().localVideo).toBeNull()
    })

    it('refuses while the host has cameras off, and turns a running camera off when the host flips it', async () => {
      const { ctl } = await joined()
      ctl.setRoom(room({ camerasOff: true }))
      await ctl.startCamera()
      expect(ctl.getState()).toMatchObject({ cam: 'off', camError: 'cameras-off' })
      ctl.setRoom(room())
      ctl.clearCamError()
      await ctl.startCamera()
      expect(ctl.getState().cam).toBe('on')
      ctl.setRoom(room({ camerasOff: true }))
      await flush()
      expect(ctl.getState()).toMatchObject({ cam: 'off', camError: 'cameras-off' })
    })

    it('asks for the faces of members with a camera on, minus hidden ones, none when hiding all or paused', async () => {
      const { f, ctl } = await joined()
      f.directory({ me: { on: true }, b: { on: true, cam: true }, c: { on: true, cam: true, camAll: true } })
      expect(f.sessions[0].wanted).toEqual(['b', 'c', 'b#v', 'c#v+'])
      ctl.toggleHideVideo('b')
      expect(f.sessions[0].wanted).toEqual(['b', 'c', 'c#v+'])
      ctl.setHideAllVideo(true)
      expect(f.sessions[0].wanted).toEqual(['b', 'c'])
      ctl.setHideAllVideo(false)
      ctl.toggleHideVideo('b')
      expect(f.sessions[0].wanted).toEqual(['b', 'c', 'b#v', 'c#v+'])
      ctl.setBlocks({ c: { name: 'Cy' } })
      expect(f.sessions[0].wanted).toEqual(['b', 'b#v'])
    })

    it('the app going to the background turns the camera off, and it comes back on return with the same audience', async () => {
      const { f, ctl } = await joined()
      await ctl.startCamera({ everyone: true })
      const track = ctl.getState().localVideo.track
      window.dispatchEvent(new Event('native-pause'))
      await flush()
      expect(track.stop).toHaveBeenCalled()
      expect(ctl.getState().cam).toBe('off')
      window.dispatchEvent(new Event('native-resume'))
      await flush()
      expect(f.sessions).toHaveLength(2)
      expect(ctl.getState()).toMatchObject({ cam: 'on', camAll: true, camError: null })
      expect(f.sessions[1].startCamera).toHaveBeenCalled()
      expect(f.io.getCamera).toHaveBeenCalledTimes(2)
      expect(f.io.published).toMatchObject({ cam: true, camAll: true })
    })

    it('a camera that was off before the background stays off on return', async () => {
      const { f, ctl } = await joined()
      window.dispatchEvent(new Event('native-pause'))
      window.dispatchEvent(new Event('native-resume'))
      await flush()
      expect(f.sessions).toHaveLength(2)
      expect(ctl.getState().cam).toBe('off')
      expect(f.io.getCamera).not.toHaveBeenCalled()
    })

    it('leaving voice turns the camera off and it is not restored later', async () => {
      const { f, ctl } = await joined()
      await ctl.startCamera()
      await ctl.leave()
      window.dispatchEvent(new Event('native-pause'))
      window.dispatchEvent(new Event('native-resume'))
      await flush()
      expect(f.sessions).toHaveLength(1)
      expect(ctl.getState().cam).toBe('off')
      expect(f.io.getCamera).toHaveBeenCalledTimes(1)
    })

    it('keeps the mic choice while restoring the camera on return', async () => {
      const { f, ctl } = await joined()
      ctl.toggleMute()
      await ctl.startCamera()
      window.dispatchEvent(new Event('native-pause'))
      window.dispatchEvent(new Event('native-resume'))
      await flush()
      expect(ctl.getState()).toMatchObject({ cam: 'on', muted: false })
      expect(f.sessions[1].muted).toBe(false)
    })

    it('falls back to camera off with the camera error when it cannot restart on return', async () => {
      const { f, ctl } = await joined()
      await ctl.startCamera()
      f.io.getCamera.mockImplementationOnce(async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }) })
      window.dispatchEvent(new Event('native-pause'))
      window.dispatchEvent(new Event('native-resume'))
      await flush()
      expect(ctl.getState()).toMatchObject({ cam: 'off', camError: 'cam-denied', status: 'connecting' })
    })

    it('does not restore the camera when the host switched cameras off while away', async () => {
      const { f, ctl } = await joined()
      await ctl.startCamera()
      window.dispatchEvent(new Event('native-pause'))
      ctl.setRoom(room({ camerasOff: true }))
      window.dispatchEvent(new Event('native-resume'))
      await flush()
      expect(ctl.getState().cam).toBe('off')
      expect(f.io.getCamera).toHaveBeenCalledTimes(1)
    })

    it('a weak link pauses video (receiving and sending), keeps voice, and recovers receiving by itself', async () => {
      vi.useFakeTimers()
      try {
        const { f, ctl } = await joined()
        f.directory({ me: { on: true }, b: { on: true, cam: true } })
        await ctl.startCamera()
        f.sessions[0].stats = { rttMs: 900, outKbps: 50, lossRatio: 0.4 }
        await vi.advanceTimersByTimeAsync(8000)
        expect(ctl.getState()).toMatchObject({ videoPaused: 'weak', cam: 'off', status: 'connecting' })
        expect(f.sessions[0].wanted).toEqual(['b'])
        f.sessions[0].stats = { rttMs: 40, outKbps: 900, lossRatio: 0 }
        await vi.advanceTimersByTimeAsync(12000)
        expect(ctl.getState().videoPaused).toBeNull()
        expect(f.sessions[0].wanted).toEqual(['b', 'b#v'])
        expect(ctl.getState().cam).toBe('off')
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
