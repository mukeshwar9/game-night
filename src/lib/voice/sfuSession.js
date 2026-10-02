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
import { newAttemptId, newPullQueue, setWanted, nextStep, startStep, finishStep } from '../voiceLogic'

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

/**
 * Opens a voice session. Resolves once the microphone is published (or the
 * listen-only session exists). Callbacks:
 *  onTrack(uid, MediaStreamTrack)  a remote person's audio arrived
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
    let ok
    try {
      if (step.op === 'pull') {
        const res = await sfu({ op: 'pull', uids: step.uids, attempt })
        for (const t of res.tracks || []) uidByMid.set(t.mid, t.uid)
        if (res.sdp && !closed) {
          await pc.setRemoteDescription({ type: 'offer', sdp: res.sdp })
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          await sfu({ op: 'renegotiate', sdp: pc.localDescription.sdp, attempt })
        }
        // Everyone asked for counts as handled, granted or refused (blocked,
        // not publishing): asking again in a loop would only burn the call
        // budget. The directory publishes `on` only after a join succeeds.
      } else {
        await sfu({ op: 'close', uids: step.uids, attempt })
      }
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
    /** The local mic stream, for the self speaking ring (never sent anywhere else). */
    micStream: mic,
    listenOnly: !mic,
    async close() {
      if (closed) return
      closed = true
      try { await sfu({ op: 'leave' }) } catch { /* the SFU drops idle tracks itself */ }
      pc.close()
      mic?.getTracks().forEach(t => t.stop())
    },
  }
}
