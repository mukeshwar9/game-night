// One client's voice connection to the Cloudflare Realtime SFU, driven
// through the voiceSfu Cloud Function (functions/voice.js). One
// RTCPeerConnection and one SFU session per attempt carry the microphone up
// and everyone else's audio down. Track changes are serialized by the pull
// queue (src/lib/voiceLogic.js): the SFU refuses a second change while an
// offer/answer is still in flight.
//
// Browser-only glue: the decisions it follows are the pure functions in
// voiceLogic.js. Muting sets track.enabled = false, so Opus keeps sending
// silence and the SFU never garbage-collects the track (it drops tracks
// after 30 s without packets).

import { getApp, getApps } from 'firebase/app'
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions'
import { usingEmulators } from '../firebase'
import { newAttemptId, newPullQueue, setWanted, nextStep, startStep, finishStep, splitKeys, CAMERA_LIMITS } from '../voiceLogic'

let functions = null
function voiceCallable() {
  if (!getApps().length) throw new Error('Firebase is not configured')
  if (!functions) {
    functions = getFunctions(getApp())
    if (usingEmulators) connectFunctionsEmulator(functions, '127.0.0.1', Number(import.meta.env.VITE_EMULATOR_FUNCTIONS_PORT) || 5001)
  }
  // A voice step that takes this long has failed: say so instead of a
  // JOINING… that waits out the SDK's 70 s default.
  return httpsCallable(functions, 'voiceSfu', { timeout: 10_000 })
}

/** The refusal code from a voiceSfu error ('under-age', 'voice-not-configured', …). */
export function voiceErrorCode(err) {
  const msg = String(err?.message || '')
  return msg.replace(/^.*?:\s*/, '').trim() || 'sfu-error'
}

const AUDIO_CONSTRAINTS = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }

/** The camera request: a small 240p-class picture at 15 fps, front camera. */
export const VIDEO_CONSTRAINTS = {
  video: {
    facingMode: 'user',
    width: { ideal: CAMERA_LIMITS.width },
    height: { ideal: CAMERA_LIMITS.height },
    frameRate: { ideal: CAMERA_LIMITS.frameRate, max: CAMERA_LIMITS.frameRate },
  },
}

/**
 * Opens a voice session. Resolves once the microphone is published (or the
 * listen-only session exists). Callbacks:
 *  onTrack(uid, MediaStreamTrack)  a remote person's audio or video arrived (track.kind)
 *  onStatus('connecting' | 'connected' | 'reconnecting' | 'failed')
 * Throws with a voiceSfu code on refusal, or 'mic-denied' when the browser or
 * the OS refused the microphone (callers fall back to listen-only).
 */
export async function openVoiceSession({ gameId, listenOnly = false, onTrack, onStatus = () => {}, call = null }) {
  const sfu = call || ((data) => voiceCallable()({ gameId, ...data }).then(r => r.data))
  const attempt = newAttemptId()
  let closed = false
  let queue = newPullQueue(attempt)
  const uidByMid = new Map()
  let camTx = null
  // The SFU answers 406 when a second change arrives before the previous
  // offer/answer finished, so every negotiation (pulls, camera on/off) runs
  // one at a time.
  let lock = Promise.resolve()
  const exclusive = (fn) => {
    const run = lock.then(fn, fn)
    lock = run.catch(() => {})
    return run
  }
  // Last inbound-video counters, for a loss ratio between two samples.
  let lastVideo = { received: 0, lost: 0 }

  let mic = null
  if (!listenOnly) {
    try {
      mic = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS)
    } catch {
      const e = new Error('mic-denied')
      e.code = 'mic-denied'
      throw e
    }
  }

  let iceServers
  try {
    iceServers = (await sfu({ op: 'ice' })).iceServers
  } catch (err) {
    mic?.getTracks().forEach(t => t.stop())
    throw err
  }
  const pc = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle' })
  pc.onconnectionstatechange = () => {
    const s = pc.connectionState
    onStatus(s === 'connected' ? 'connected' : s === 'failed' ? 'failed' : s === 'disconnected' ? 'reconnecting' : 'connecting')
  }
  pc.ontrack = (ev) => {
    const uid = uidByMid.get(ev.transceiver?.mid)
    if (uid && ev.track) onTrack?.(uid, ev.track)
  }

  try {
    if (mic) {
      const track = mic.getAudioTracks()[0]
      const tx = pc.addTransceiver(track, { direction: 'sendonly' })
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const res = await sfu({ op: 'join', sdp: pc.localDescription.sdp, mid: tx.mid, attempt })
      if (closed) return null
      await pc.setRemoteDescription({ type: 'answer', sdp: res.sdp })
    } else {
      await sfu({ op: 'join', listen: true, attempt })
    }
  } catch (err) {
    pc.close()
    mic?.getTracks().forEach(t => t.stop())
    throw err
  }
  onStatus('connecting')

  // One step at a time; changes arriving mid-step run next.
  let running = false
  async function pump() {
    if (running || closed) return
    const step = nextStep(queue)
    if (!step) return
    running = true
    queue = startStep(queue)
    const keys = step.uids
    const { audio, video } = splitKeys(keys)
    let ok
    try {
      await exclusive(async () => {
        if (step.op === 'pull') {
          const res = await sfu({ op: 'pull', uids: audio, videoUids: video, attempt })
          for (const t of res.tracks || []) uidByMid.set(t.mid, t.uid)
          if (res.sdp && !closed) {
            await pc.setRemoteDescription({ type: 'offer', sdp: res.sdp })
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            await sfu({ op: 'renegotiate', sdp: pc.localDescription.sdp, attempt })
          }
          // Everyone asked for counts as handled, granted or refused (blocked,
          // not publishing, not a friend): asking again in a loop would only
          // burn the call budget. The directory publishes `on` only after a
          // join succeeds.
        } else {
          await sfu({ op: 'close', uids: audio, videoUids: video, attempt })
        }
      })
      ok = true
    } catch { ok = false }
    queue = finishStep(queue, { attempt, op: step.op, uids: step.uids, ok })
    running = false
    if (ok) pump()
  }

  return {
    attempt,
    /** Who should be heard now (from the voice directory). */
    want(uids) {
      queue = setWanted(queue, uids)
      pump()
    },
    setMuted(muted) {
      mic?.getAudioTracks().forEach(t => { t.enabled = !muted })
    },
    /**
     * Publish a camera stream (one video track, 240p-class) through the
     * voiceSfu `camOn` op. Rejects with the server's refusal code
     * ('cameras-off', 'under-age', …).
     */
    startCamera(stream) {
      return exclusive(async () => {
        if (closed) return
        const track = stream.getVideoTracks()[0]
        const tx = pc.addTransceiver(track, {
          direction: 'sendonly',
          sendEncodings: [{ maxBitrate: CAMERA_LIMITS.maxBitrate, maxFramerate: CAMERA_LIMITS.frameRate }],
        })
        try {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          const res = await sfu({ op: 'camOn', sdp: pc.localDescription.sdp, mid: tx.mid, attempt })
          await pc.setRemoteDescription({ type: 'answer', sdp: res.sdp })
          camTx = tx
        } catch (err) {
          try { tx.stop() } catch { /* already stopped */ }
          throw err
        }
      })
    },
    /** Stop publishing the camera: the SFU closes the track and the section is retired. */
    stopCamera() {
      return exclusive(async () => {
        const tx = camTx
        camTx = null
        try { if (!closed) await sfu({ op: 'camOff', attempt }) } catch { /* the SFU drops it itself */ }
        if (tx) {
          try { tx.sender.replaceTrack(null) } catch { /* gone */ }
          try { tx.stop() } catch { /* already stopped */ }
        }
      })
    },
    /** One link-quality sample for the video fallback: { rttMs, outKbps (only while `sending`), lossRatio }. */
    async sampleStats(sending = false) {
      let rttMs = null
      let outKbps = null
      let lossRatio = null
      try {
        const report = await pc.getStats()
        report.forEach((r) => {
          if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') {
            if (typeof r.currentRoundTripTime === 'number') rttMs = r.currentRoundTripTime * 1000
            // The bandwidth estimate only means something while video is going out.
            if (sending && typeof r.availableOutgoingBitrate === 'number') outKbps = r.availableOutgoingBitrate / 1000
          }
          if (r.type === 'inbound-rtp' && r.kind === 'video') {
            const received = r.packetsReceived || 0
            const lost = r.packetsLost || 0
            const dr = received - lastVideo.received
            const dl = lost - lastVideo.lost
            if (dr + dl > 20) lossRatio = Math.max(0, dl) / (dr + dl)
            lastVideo = { received, lost }
          }
        })
      } catch { /* stats unavailable: treat the link as fine */ }
      return { rttMs, outKbps, lossRatio }
    },
    /** The local mic stream, for the self speaking ring (never sent anywhere else). */
    micStream: mic,
    listenOnly: !mic,
    async close() {
      if (closed) return
      closed = true
      camTx = null
      try { await sfu({ op: 'leave' }) } catch { /* the SFU drops idle tracks itself */ }
      pc.close()
      mic?.getTracks().forEach(t => t.stop())
    },
  }
}
