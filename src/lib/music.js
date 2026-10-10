// Background music: preferences, the current screen's scene, and starting /
// stopping the lazily loaded engine (musicEngine.js). Pure rules live in
// musicLogic.js.
//
// Music is on by default, but browsers only allow sound after a user gesture,
// so "on" means armed: the first tap or key anywhere resumes the shared
// AudioContext and fades the current screen's loop in, whatever the stored
// preference says, so turning music on later needs no second tap. The player's
// choice is stored in localStorage ('music', 'musicVolume'); the game-sounds
// mute does not touch it. The loop only plays while the context is actually
// running: a suspended or interrupted context (lock, call, tab switch) is
// re-armed on statechange, pageshow, focus, native-resume and the next gesture,
// and the snapshot's `status` says when a tap is needed. Music stops while the
// tab is hidden and while a blocker is set (video-call layout, voice chat).
// On iOS the context stays in the default 'ambient' audio session, so the
// silent switch mutes music and it mixes under other apps.

import { useEffect, useSyncExternalStore } from 'react'
import { getAudioContext, isAudioRunning, onAudioStateChange, resumeAudio, setMusicDucker } from './audioContext'
import { getGameConfig } from './games'
import { getStoredTheme } from './theme'
import {
  DEFAULT_MUSIC_VOLUME, REVIVE_TAP_MS, RESULTS_LOOPS, engineRetryDelay, musicStatus,
  normalizeMusicVolume, resolveMusicOn, trackForScene,
} from './musicLogic'

const KEY = 'music'
const VOL_KEY = 'musicVolume'

const read = (key) => { try { return localStorage.getItem(key) } catch { return null } }
const write = (key, value) => { try { localStorage.setItem(key, value) } catch { /* storage blocked */ } }

let stored = read(KEY)
let volume = normalizeMusicVolume(read(VOL_KEY))
const listeners = new Set()

let engine = null
let loading = null
let unlocked = false
let engineFailures = 0
let engineFailed = false   // retries used up: surfaced on the toggle, retried on the next tap
let lastRevive = 0         // when a tap last started or re-armed the music
let hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
const blocks = new Set()
const scenes = []          // stack of { id, scene, gameType }; the top one plays
let nextSceneId = 0
let resultsDone = false
let resultsTimer = null
let suspendTimer = null
let settleTimer = null

function computeSnapshot() {
  const on = resolveMusicOn(stored)
  const blocked = [...blocks]
  const status = musicStatus({ on, blocked, failed: engineFailed, running: unlocked && isAudioRunning() })
  return { on, volume, status, blocked }
}

let snapshot = computeSnapshot()

function publish() {
  const next = computeSnapshot()
  const same = next.on === snapshot.on && next.volume === snapshot.volume && next.status === snapshot.status
    && next.blocked.join() === snapshot.blocked.join()
  if (same) return
  snapshot = next
  listeners.forEach(fn => fn())
}

function currentTrack() {
  const top = scenes[scenes.length - 1]
  const cfg = top?.gameType ? getGameConfig(top.gameType) : null
  return trackForScene(top?.scene ?? 'lobby', {
    category: cfg?.category, music: cfg?.music, theme: getStoredTheme(), resultsDone,
  })
}

function loadEngine() {
  if (loading || engineFailed) return
  loading = import('./musicEngine').then(({ createMusicEngine }) => {
    loading = null
    const ctx = getAudioContext()
    if (!ctx) return
    engineFailures = 0
    engine = createMusicEngine(ctx)
    engine.setVolume(volume)
    setMusicDucker((depth, hold) => engine.duck(depth, hold))
    apply()
  }).catch(err => {
    // A stale shell after a deploy (404 chunk) or a flaky connection: retry
    // with backoff, then show the failure instead of staying silently silent.
    loading = null
    const delay = engineRetryDelay(engineFailures++)
    if (delay === null) {
      engineFailed = true
      console.warn('[music] engine failed to load', err)
      apply()
      return
    }
    setTimeout(apply, delay)
  })
}

function retryEngine() {
  if (!engineFailed) return false
  engineFailed = false
  engineFailures = 0
  apply()
  return true
}

// Brings the engine in line with the current state. Cheap; call freely.
function apply() {
  publish()
  const want = snapshot.on && unlocked && !hidden && blocks.size === 0 && isAudioRunning() ? currentTrack() : null
  if (!engine) {
    if (want) loadEngine()
    return
  }
  const before = engine.current
  engine.play(want)
  if (want === 'score' && before !== 'score') {
    clearTimeout(resultsTimer)
    resultsTimer = setTimeout(() => { resultsDone = true; apply() }, engine.seconds('score') * RESULTS_LOOPS * 1000)
  }
}

// Scene changes arrive as an unmount + mount in one commit; applying once
// afterwards avoids briefly starting the scene underneath.
let queued = false
function applySoon() {
  if (queued) return
  queued = true
  queueMicrotask(() => { queued = false; apply() })
}

// ─── Unlock + lifecycle ──────────────────────────────────────────────────────

// Resuming from a lifecycle event is not a user gesture, so iOS may refuse it;
// the state then stays suspended/interrupted (status 'needs-tap') and the next
// tap, which is a gesture, finishes the job. Re-checks once the resume settles
// in case the browser reports it without a statechange event.
function applyAfterResume() {
  clearTimeout(settleTimer)
  settleTimer = setTimeout(apply, 300)
}

// Any gesture: pointerup/touchend/click/keydown are the events browsers count
// as user activation (pointerdown on touch is not). Stays installed so a
// context iOS interrupted (a call, Siri) comes back on the next tap. The first
// gesture unlocks audio even while music is off, so switching it on later
// plays immediately.
function onGesture() {
  const wasSilent = !unlocked || !isAudioRunning()
  const ctx = resumeAudio()
  if (!ctx) return
  if (snapshot.on && blocks.size === 0 && wasSilent) lastRevive = Date.now()
  if (retryEngine()) lastRevive = Date.now()
  unlocked = true
  apply()
  if (wasSilent) applyAfterResume()
}

// Back in the foreground / bfcache restore / native app resume.
function recover() {
  if (typeof document !== 'undefined') hidden = document.visibilityState === 'hidden'
  if (hidden) return
  clearTimeout(suspendTimer)
  if (unlocked) resumeAudio()
  apply()
  applyAfterResume()
}

if (typeof window !== 'undefined') {
  for (const type of ['pointerup', 'touchend', 'click', 'keydown']) {
    window.addEventListener(type, onGesture, { capture: true, passive: true })
  }
  document.addEventListener('visibilitychange', () => {
    hidden = document.visibilityState === 'hidden'
    clearTimeout(suspendTimer)
    if (!hidden) return recover()
    apply()
    const ctx = unlocked && getAudioContext()
    if (!ctx) return
    // Hidden: fade out, then suspend so the audio device can sleep. Game
    // sounds resume it on their own if one plays in the background.
    suspendTimer = setTimeout(() => { if (hidden) ctx.suspend().catch(() => {}) }, 1500)
  })
  for (const type of ['pageshow', 'focus', 'native-resume']) window.addEventListener(type, recover)
  // The OS or browser moved the context on its own (call, Siri, lock screen,
  // or a resume finishing): re-evaluate, and try to win it back if we're visible.
  onAudioStateChange(state => {
    apply()
    if (state !== 'running' && unlocked && !hidden) resumeAudio()
  })
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function getMusicState() { return snapshot }

export function subscribeMusic(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * `{ on, volume, status, blocked }`, re-rendering on change. `status` is
 * 'off' | 'blocked' | 'failed' | 'needs-tap' | 'playing' (see musicStatus);
 * `blocked` lists the reasons music is held back ('videoCall', 'voice').
 */
export function useMusic() {
  return useSyncExternalStore(subscribeMusic, getMusicState, getMusicState)
}

// Call from the click/change handler itself: turning music on is a gesture,
// so the context is resumed right there.
export function setMusicOn(on) {
  stored = on ? 'on' : 'off'
  write(KEY, stored)
  if (on && resumeAudio()) unlocked = true
  apply()
}

// A tap on the toggle is also a gesture: the capture handler above has already
// started (or re-armed) the music by the time this runs, so toggling now would
// switch it straight back off. Treat that tap as "start the music" instead.
export function toggleMusic() {
  if (snapshot.on && Date.now() - lastRevive < REVIVE_TAP_MS) return snapshot.on
  setMusicOn(!snapshot.on)
  return snapshot.on
}

export function setMusicVolume(value) {
  volume = normalizeMusicVolume(value)
  write(VOL_KEY, String(volume))
  engine?.setVolume(volume)
  publish()
  return volume
}

// Settings → Reset all.
export function resetMusicDefaults() {
  setMusicVolume(DEFAULT_MUSIC_VOLUME)
  setMusicOn(true)
}

// Re-reads things other settings change (the theme).
export function syncMusic() { apply() }

// A reason music must stay silent regardless of the preference.
export function setMusicBlock(reason, blocked) {
  if (blocked) blocks.add(reason)
  else blocks.delete(reason)
  apply()
}

/**
 * Declares the screen's music scene while the component is mounted:
 * 'lobby' | 'wait' | 'game' | 'results'. For 'game', pass the game type so
 * the registry picks the track. A null scene leaves the previous one playing.
 */
export function useMusicScene(scene, gameType = null) {
  useEffect(() => {
    if (!scene) return
    const entry = { id: nextSceneId++, scene, gameType }
    scenes.push(entry)
    resultsDone = false
    applySoon()
    return () => {
      const i = scenes.indexOf(entry)
      if (i >= 0) scenes.splice(i, 1)
      if (scene === 'results') { resultsDone = false; clearTimeout(resultsTimer) }
      applySoon()
    }
  }, [scene, gameType])
}
