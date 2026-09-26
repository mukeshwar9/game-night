// Background music: preferences, the current screen's scene, and starting /
// stopping the lazily loaded engine (musicEngine.js). Pure rules live in
// musicLogic.js.
//
// Music is on by default, but browsers only allow sound after a user gesture,
// so "on" means armed: the first tap or key anywhere resumes the shared
// AudioContext and fades the current screen's loop in. The player's choice is
// stored in localStorage ('music', 'musicVolume') next to the SFX keys.
// Music stops while the tab is hidden and while a blocker is set (the
// video-call layout). On iOS the context stays in the default 'ambient' audio
// session, so the silent switch mutes music and it mixes under other apps.

import { useEffect, useSyncExternalStore } from 'react'
import { getAudioContext, resumeAudio, setMusicDucker } from './audioContext'
import { getGameConfig } from './games'
import { getStoredTheme } from './theme'
import {
  DEFAULT_MUSIC_VOLUME, RESULTS_LOOPS, normalizeMusicVolume, resolveMusicOn, trackForScene,
} from './musicLogic'

const KEY = 'music'
const VOL_KEY = 'musicVolume'

const read = (key) => { try { return localStorage.getItem(key) } catch { return null } }
const write = (key, value) => { try { localStorage.setItem(key, value) } catch { /* storage blocked */ } }

let stored = read(KEY)
let volume = normalizeMusicVolume(read(VOL_KEY))
let snapshot = { on: resolveMusicOn(stored, read('sfx') === 'off'), volume }
const listeners = new Set()

let engine = null
let loading = null
let unlocked = false
let hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
const blocks = new Set()
const scenes = []          // stack of { id, scene, gameType }; the top one plays
let nextSceneId = 0
let resultsDone = false
let resultsTimer = null
let suspendTimer = null

function publish() {
  const on = resolveMusicOn(stored, read('sfx') === 'off')
  if (on !== snapshot.on || volume !== snapshot.volume) {
    snapshot = { on, volume }
    listeners.forEach(fn => fn())
  }
}

function currentTrack() {
  const top = scenes[scenes.length - 1]
  const cfg = top?.gameType ? getGameConfig(top.gameType) : null
  return trackForScene(top?.scene ?? 'lobby', {
    category: cfg?.category, music: cfg?.music, theme: getStoredTheme(), resultsDone,
  })
}

function loadEngine() {
  if (!loading) {
    loading = import('./musicEngine').then(({ createMusicEngine }) => {
      const ctx = getAudioContext()
      if (!ctx) return
      engine = createMusicEngine(ctx)
      engine.setVolume(volume)
      setMusicDucker((depth, hold) => engine.duck(depth, hold))
      apply()
    }).catch(() => { loading = null })
  }
}

// Brings the engine in line with the current state. Cheap; call freely.
function apply() {
  publish()
  const want = snapshot.on && unlocked && !hidden && blocks.size === 0 ? currentTrack() : null
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

// ─── Unlock + visibility ─────────────────────────────────────────────────────

// Any gesture: pointerup/touchend/click/keydown are the events browsers count
// as user activation (pointerdown on touch is not). Stays installed so a
// context iOS interrupted (a call, Siri) comes back on the next tap.
function onGesture() {
  if (!snapshot.on) return
  const ctx = resumeAudio()
  if (!ctx) return
  if (!unlocked) { unlocked = true; apply() }
}

if (typeof window !== 'undefined') {
  for (const type of ['pointerup', 'touchend', 'click', 'keydown']) {
    window.addEventListener(type, onGesture, { capture: true, passive: true })
  }
  document.addEventListener('visibilitychange', () => {
    hidden = document.visibilityState === 'hidden'
    clearTimeout(suspendTimer)
    apply()
    const ctx = unlocked && getAudioContext()
    if (!ctx) return
    // Hidden: fade out, then suspend so the audio device can sleep. Game
    // sounds resume it on their own if one plays in the background.
    if (hidden) suspendTimer = setTimeout(() => { if (hidden) ctx.suspend().catch(() => {}) }, 1500)
    else if (snapshot.on) ctx.resume().catch(() => {})
  })
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function getMusicState() { return snapshot }

export function subscribeMusic(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** `{ on, volume }`, re-rendering on change. */
export function useMusic() {
  return useSyncExternalStore(subscribeMusic, getMusicState, getMusicState)
}

// Call from the click/change handler itself: turning music on is a gesture,
// so the context is resumed right there.
export function setMusicOn(on) {
  stored = on ? 'on' : 'off'
  write(KEY, stored)
  if (on) {
    unlocked = !!resumeAudio()
  }
  apply()
}

export function toggleMusic() {
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

// Re-reads things other settings change (the SFX switch, the theme).
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
