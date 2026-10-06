// The one AudioContext shared by game sounds (sounds.js) and background music
// (music.js), plus the hook that lets a sound effect dip the music under it.
//
// Browsers create a context 'suspended' until a user gesture; iOS can also
// leave it 'interrupted' after a call or Siri. resumeAudio() is safe to call
// from any gesture handler and from every note.

let ctx = null
let ducker = null
let hasUserGesture = false
const stateListeners = new Set()

// Fires when the browser or OS changes the context's state on its own (iOS
// 'interrupted' after a call or Siri, a lock-screen suspend) or a resume lands.
export function onAudioStateChange(fn) {
  stateListeners.add(fn)
  return () => stateListeners.delete(fn)
}

export function isAudioRunning() {
  return ctx?.state === 'running'
}

export function getAudioContext() {
  if (!hasUserGesture) return null
  if (!ctx) {
    const Ctor = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
    if (!Ctor) return null
    ctx = new Ctor()
    ctx.onstatechange = () => stateListeners.forEach(fn => { try { fn(ctx.state) } catch { /* listener failed */ } })
  }
  return ctx
}

// Resumes the context if it isn't running. Must run synchronously inside the
// gesture handler the first time (iOS ignores a resume after an await).
export function resumeAudio() {
  const c = getAudioContext()
  if (c && c.state !== 'running' && c.state !== 'closed') c.resume().catch(() => {})
  return c
}

// Create/resume only inside browser-recognized user activation. Sound cues can
// also fire from automatic state changes, which must not create the context.
if (typeof window !== 'undefined') {
  const unlock = () => {
    hasUserGesture = true
    resumeAudio()
  }
  for (const type of ['pointerup', 'touchend', 'click', 'keydown']) {
    window.addEventListener(type, unlock, { capture: true, passive: true })
  }
}

// Only the music engine registers; sounds.js calls duckMusic() on every cue.
export function setMusicDucker(fn) { ducker = fn }

export function duckMusic(depth, hold) {
  if (ducker) try { ducker(depth, hold) } catch { /* music unavailable */ }
}
