// Party voice for one room, outside React: VoiceProvider owns one controller
// per gameId and reads its state through useSyncExternalStore.
//
// It runs the age gate (13+, the existing birth-year record), opens the SFU
// session (sfuSession.js), keeps the public directory entry
// voice/{gameId}/{me} = { on, muted, at } (removed by onDisconnect), pulls
// everyone in voice who is a member and not blocked (voiceLogic), plays their
// audio through Web Audio (per-person volume, speaking rings), honours the
// host's soft mute, silences music while in voice, and follows C1: leave on
// the native app's pause, rejoin on resume with a fresh session.
//
// Camera (video) rides the same session: off by default every session (nothing
// is remembered), started only by the player's tap, stopped on leave, in the
// background, when the host switches cameras off, and on a weak link (voice
// stays). Who may see it is decided on the server (friends first); this side
// only asks for the faces it wants and may hide any of them.

import { ref, onValue, set, update, remove, onDisconnect } from 'firebase/database'
import { db } from '../firebase'
import { getAudioContext, resumeAudio } from '../audioContext'
import { setMusicBlock } from '../music'
import { getBirthYear } from '../entitlements'
import {
  voiceAccess, wantedFromDirectory, wantedVideoFromDirectory, isSpeaking,
  classifyLink, nextLinkState, LINK_START,
} from '../voiceLogic'
import { openVoiceSession, voiceErrorCode, VIDEO_CONSTRAINTS } from './sfuSession'

const FIRST_USE_KEY = 'gn-voice-intro-seen'

const INITIAL = Object.freeze({
  available: false,
  status: 'off', // off | joining | connecting | connected | reconnecting | failed | paused
  error: null,
  // 'resumed' after voice dropped for the app going to the background and
  // came back by itself, so the player knows the gap was voice, not friends.
  notice: null,
  muted: false,
  listenOnly: false,
  directory: {},
  // Camera: 'off' | 'starting' | 'on'. `camError` is a code for the sheet to
  // explain ('cam-denied', 'cameras-off', …); `camAll` is SHOW MY VIDEO TO EVERYONE.
  cam: 'off',
  camError: null,
  camAll: false,
  localVideo: null, // MediaStream of my own camera, for my tile
  videos: {}, // uid -> MediaStream of a friend's camera
  hiddenVideo: {}, // per-viewer hide, by uid
  hideAllVideo: false, // data saver: receive no video at all
  // 'weak' while a poor link has paused video (voice carries on).
  videoPaused: null,
  speaking: {},
  volumes: {},
  localMutes: {},
  seenIntro: false,
})

// The controller's outside world, injectable for tests: the room's voice
// directory in Firebase, the age gate, the SFU session and the audio graph.
function defaultIo(gameId, me) {
  const myRef = () => ref(db, `voice/${gameId}/${me}`)
  return {
    hasDb: !!db,
    watchDirectory: (onData, onError) => onValue(ref(db, `voice/${gameId}`), snap => onData(snap.val() || {}), onError),
    publish: (entry) => {
      onDisconnect(myRef()).remove().catch(() => {})
      return set(myRef(), entry)
    },
    patch: (fields) => update(myRef(), fields),
    unpublish: () => remove(myRef()),
    hostMute: (uid) => set(ref(db, `voice/${gameId}/${uid}/hostMuted`), true),
    getBirthYear,
    openSession: openVoiceSession,
    getCamera: () => navigator.mediaDevices.getUserMedia(VIDEO_CONSTRAINTS),
    audioContext: getAudioContext,
    resumeAudio,
    setMusicBlock,
  }
}

export function createVoiceController({ gameId, me, enabled, io: ioOverride = null }) {
  const io = ioOverride || defaultIo(gameId, me)
  let state = { ...INITIAL, seenIntro: readIntro() }
  const listeners = new Set()
  let room = null
  let blocks = {}
  let session = null
  let unsubDirectory = null
  let speakTimer = null
  let micAnalyser = null
  let intent = null // { listenOnly } while the player wants to be in voice
  let camStream = null
  let linkTimer = null
  let link = LINK_START
  let pausedAt = null
  const nodes = new Map() // uid -> { source, gain, analyser, el }

  const emit = (patch) => {
    state = { ...state, ...patch }
    for (const fn of listeners) fn()
  }
  function readIntro() {
    try { return !!localStorage.getItem(FIRST_USE_KEY) } catch { return false }
  }

  function wanted() {
    return wantedFromDirectory({ room, me, directory: state.directory, myBlocks: blocks })
  }

  function wantedVideo() {
    if (state.videoPaused) return []
    return wantedVideoFromDirectory({ room, me, directory: state.directory, myBlocks: blocks, hidden: state.hiddenVideo, hideAll: state.hideAllVideo })
  }

  function syncPulls() {
    const want = wanted()
    const wantVideo = wantedVideo()
    session?.want([...want, ...wantVideo])
    for (const uid of [...nodes.keys()]) if (!want.includes(uid)) dropRemote(uid)
    const keep = wantVideo.map(k => k.split('#')[0])
    const gone = Object.keys(state.videos).filter(uid => !keep.includes(uid))
    if (gone.length) emit({ videos: Object.fromEntries(Object.entries(state.videos).filter(([uid]) => keep.includes(uid))) })
  }

  function applyGains() {
    for (const [uid, n] of nodes) n.gain.gain.value = state.localMutes[uid] ? 0 : (state.volumes[uid] ?? 1)
  }

  function dropRemote(uid) {
    const n = nodes.get(uid)
    if (!n) return
    try { n.source.disconnect(); n.gain.disconnect() } catch { /* already gone */ }
    if (n.el) { n.el.srcObject = null; n.el.remove() }
    nodes.delete(uid)
  }

  function onTrack(uid, track) {
    if (track.kind === 'video') {
      emit({ videos: { ...state.videos, [uid]: new MediaStream([track]) } })
      return
    }
    dropRemote(uid)
    const ctx = io.audioContext()
    if (!ctx) return
    const stream = new MediaStream([track])
    // Chromium only feeds a remote WebRTC track into Web Audio while a media
    // element is also consuming it: keep a muted, hidden one attached.
    const el = document.createElement('audio')
    el.muted = true
    el.autoplay = true
    el.srcObject = stream
    el.style.display = 'none'
    document.body.appendChild(el)
    const source = ctx.createMediaStreamSource(stream)
    const gain = ctx.createGain()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    source.connect(gain)
    gain.connect(ctx.destination)
    nodes.set(uid, { source, gain, analyser, el })
    applyGains()
  }

  function startSpeaking() {
    stopSpeaking()
    const buf = new Uint8Array(512)
    const level = (an) => {
      an.getByteTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v }
      return Math.sqrt(sum / buf.length)
    }
    speakTimer = setInterval(() => {
      const next = {}
      for (const [uid, n] of nodes) next[uid] = isSpeaking(level(n.analyser)) && !state.localMutes[uid]
      if (micAnalyser && !state.muted) next[me] = isSpeaking(level(micAnalyser))
      if (JSON.stringify(next) !== JSON.stringify(state.speaking)) emit({ speaking: next })
    }, 200)
  }

  function stopSpeaking() {
    if (speakTimer) clearInterval(speakTimer)
    speakTimer = null
  }


  // ---- Camera ----------------------------------------------------------------

  function publishCam(fields) {
    if (io.hasDb) io.patch({ ...fields, at: Date.now() }).catch(() => {})
  }

  function stopCameraTracks() {
    camStream?.getTracks().forEach(t => t.stop())
    camStream = null
  }

  async function stopCamera({ error = null, paused = null } = {}) {
    const s = session
    const had = state.cam !== 'off' || !!camStream
    stopCameraTracks()
    emit({ cam: 'off', localVideo: null, camError: error, ...(paused ? { videoPaused: paused } : {}) })
    if (had) publishCam({ cam: false })
    try { await s?.stopCamera?.() } catch { /* the SFU drops it itself */ }
  }

  async function startCamera({ everyone } = {}) {
    if (!session || state.cam !== 'off') return
    if (room?.camerasOff === true) { emit({ camError: 'cameras-off' }); return }
    emit({ cam: 'starting', camError: null, ...(typeof everyone === 'boolean' ? { camAll: everyone } : {}) })
    let stream
    try {
      stream = await io.getCamera()
    } catch (e) {
      const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError' || e?.name === 'PermissionDeniedError'
      emit({ cam: 'off', camError: denied ? 'cam-denied' : 'cam-failed' })
      return
    }
    if (!session) { stream.getTracks().forEach(t => t.stop()); emit({ cam: 'off' }); return }
    camStream = stream
    // The OS can end the camera (unplugged, taken by another app).
    stream.getVideoTracks()[0]?.addEventListener?.('ended', () => { if (camStream === stream) stopCamera() })
    try {
      await session.startCamera(stream)
    } catch (e) {
      stopCameraTracks()
      emit({ cam: 'off', camError: voiceErrorCode(e) })
      return
    }
    if (camStream !== stream) return // turned off while the SFU was answering
    emit({ cam: 'on', localVideo: stream })
    publishCam({ cam: true, camAll: state.camAll })
    startLinkMonitor()
  }

  function startLinkMonitor() {
    if (linkTimer || !session?.sampleStats) return
    linkTimer = setInterval(async () => {
      const s = session
      if (!s) return
      const next = nextLinkState(link, classifyLink(await s.sampleStats(state.cam === 'on')))
      const wasPaused = link.paused
      link = next
      if (next.paused === wasPaused) return
      if (next.paused) {
        // Video goes first; voice is never dropped for video. The camera is
        // not restarted by itself: it comes back only when the player taps it.
        emit({ videoPaused: 'weak' })
        syncPulls()
        if (state.cam !== 'off') stopCamera()
      } else {
        emit({ videoPaused: null })
        syncPulls()
      }
    }, 4000)
  }

  function stopLinkMonitor() {
    if (linkTimer) clearInterval(linkTimer)
    linkTimer = null
    link = LINK_START
  }

  function watchDirectory() {
    if (unsubDirectory || !io.hasDb || !state.available) return
    unsubDirectory = io.watchDirectory(directory => {
      const hostMuted = !!directory[me]?.hostMuted
      emit({ directory })
      if (hostMuted && session && !state.muted) setMicMuted(true)
      syncPulls()
    }, () => emit({ directory: {} }))
  }

  function unwatchDirectory() {
    unsubDirectory?.()
    unsubDirectory = null
  }

  function setMicMuted(muted, { clearHostMute = false } = {}) {
    if (!session) return
    emit({ muted })
    session.setMuted(muted)
    if (io.hasDb) io.patch({ muted, at: Date.now(), ...(clearHostMute ? { hostMuted: null } : {}) }).catch(() => {})
  }

  async function leave(nextStatus = 'off') {
    const s = session
    session = null
    for (const uid of [...nodes.keys()]) dropRemote(uid)
    micAnalyser = null
    stopSpeaking()
    stopLinkMonitor()
    stopCameraTracks()
    io.setMusicBlock('voice', false)
    try { if (navigator.audioSession) navigator.audioSession.type = 'auto' } catch { /* not supported */ }
    if (s && io.hasDb) io.unpublish().catch(() => {})
    emit({ status: nextStatus, speaking: {}, listenOnly: false, cam: 'off', localVideo: null, videos: {}, videoPaused: null, camError: null })
    await s?.close()
  }

  // Open mic, muted on join: a fresh join always starts muted and the player
  // taps the mic to talk. A rejoin after the app was in the background keeps
  // whatever the player had (`keepMute`), so a short app switch doesn't
  // silently mute someone mid-sentence or open a mic they had closed.
  async function join({ listenOnly = false, keepMute = false } = {}) {
    if (!state.available || session || state.status === 'joining') return
    emit({ error: null, status: 'joining' })
    io.resumeAudio()
    try {
      const year = await io.getBirthYear()
      const refusal = voiceAccess({ room, uid: me, birthYear: year })
      if (refusal) {
        emit({ status: 'off', error: refusal })
        return
      }
    } catch {
      emit({ status: 'off', error: 'age-required' })
      return
    }
    try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record' } catch { /* iOS 17+ only */ }
    // Connection changes before the session is ours are remembered, not lost.
    let pcStatus = 'connecting'
    // Music stays out of the way only while voice can carry audio: a failed or
    // reconnecting session would otherwise leave both silent.
    const onStatus = (status) => {
      pcStatus = status
      if (!session) return
      io.setMusicBlock('voice', status !== 'failed' && status !== 'reconnecting')
      emit({ status })
    }
    let s
    let error = null
    try {
      s = await io.openSession({ gameId, listenOnly, onTrack, onStatus })
    } catch (e) {
      if (e?.code !== 'mic-denied' || listenOnly) {
        emit({ status: 'off', error: e?.code || voiceErrorCode(e) })
        return
      }
      // The microphone was refused: listen only instead of a dead end.
      error = 'mic-denied'
      try { s = await io.openSession({ gameId, listenOnly: true, onTrack, onStatus }) } catch (e2) {
        emit({ status: 'off', error: voiceErrorCode(e2) })
        return
      }
    }
    if (!s) { emit({ status: 'off' }); return }
    session = s
    intent = { listenOnly: s.listenOnly }
    if (s.micStream) {
      const ctx = io.audioContext()
      if (ctx) {
        micAnalyser = ctx.createAnalyser()
        micAnalyser.fftSize = 512
        ctx.createMediaStreamSource(s.micStream).connect(micAnalyser)
      }
    }
    const muted = s.listenOnly || (keepMute ? state.muted : true)
    s.setMuted(muted)
    io.setMusicBlock('voice', pcStatus !== 'failed' && pcStatus !== 'reconnecting')
    try { localStorage.setItem(FIRST_USE_KEY, '1') } catch { /* private mode */ }
    emit({ listenOnly: s.listenOnly, muted, error, seenIntro: true, status: pcStatus })
    if (io.hasDb) io.publish({ on: true, muted, at: Date.now() }).catch(() => {})
    startSpeaking()
    startLinkMonitor()
    syncPulls()
  }

  const onPause = () => {
    if (!session) return
    pausedAt = Date.now()
    leave('paused')
  }
  const onResume = () => {
    const want = intent
    const was = pausedAt
    pausedAt = null
    // The old session was closed on pause, so even a quick return gets a
    // fresh one: never a session revived past the SFU's idle window.
    if (want && was !== null) {
      emit({ notice: 'resumed' })
      join({ listenOnly: want.listenOnly, keepMute: true })
    }
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('native-pause', onPause)
    window.addEventListener('native-resume', onResume)
  }

  return {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    getState() { return state },
    setRoom(next) {
      room = next
      if (next?.camerasOff === true && (state.cam !== 'off' || camStream)) stopCamera({ error: 'cameras-off' })
      const available = !!enabled && !!next && voiceAccess({ room: next, uid: me }) === null
      if (available !== state.available) emit({ available })
      if (available) watchDirectory()
      else {
        unwatchDirectory()
        if (session) { intent = null; leave() }
      }
      syncPulls()
    },
    setBlocks(next) { blocks = next || {}; syncPulls() },
    join,
    leave: () => { intent = null; return leave() },
    toggleMute: () => { if (session && !session.listenOnly) setMicMuted(!state.muted, { clearHostMute: state.muted }) },
    setVolume(uid, v) { emit({ volumes: { ...state.volumes, [uid]: Math.max(0, Math.min(1, v)) } }); applyGains() },
    toggleLocalMute(uid) { emit({ localMutes: { ...state.localMutes, [uid]: !state.localMutes[uid] } }); applyGains() },
    hostMute: (uid) => (io.hasDb ? io.hostMute(uid) : Promise.resolve()),
    startCamera,
    stopCamera: () => stopCamera(),
    setCamAll(v) { emit({ camAll: !!v }); if (state.cam === 'on') publishCam({ camAll: !!v }) },
    toggleHideVideo(uid) { emit({ hiddenVideo: { ...state.hiddenVideo, [uid]: !state.hiddenVideo[uid] } }); syncPulls() },
    setHideAllVideo(v) { emit({ hideAllVideo: !!v }); syncPulls() },
    clearCamError: () => emit({ camError: null }),
    clearError: () => emit({ error: null }),
    clearNotice: () => emit({ notice: null }),
    dispose() {
      if (typeof window !== 'undefined') {
        window.removeEventListener('native-pause', onPause)
        window.removeEventListener('native-resume', onResume)
      }
      unwatchDirectory()
      intent = null
      return leave()
    },
  }
}
