// The one AudioContext shared by game sounds (sounds.js) and background music
// (music.js), plus the hook that lets a sound effect dip the music under it.
//
// Browsers create a context 'suspended' until a user gesture; iOS can also
// leave it 'interrupted' after a call or Siri. resumeAudio() is safe to call
// from any gesture handler and from every note.

let ctx = null
let ducker = null

export function getAudioContext() {
  if (!ctx) {
    const Ctor = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
    if (!Ctor) return null
    ctx = new Ctor()
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

// Only the music engine registers; sounds.js calls duckMusic() on every cue.
export function setMusicDucker(fn) { ducker = fn }

export function duckMusic(depth, hold) {
  if (ducker) try { ducker(depth, hold) } catch { /* music unavailable */ }
}
