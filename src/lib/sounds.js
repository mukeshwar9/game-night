let _ctx = null

function ctx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (_ctx.state === 'suspended') _ctx.resume()
  return _ctx
}

let _muted = localStorage.getItem('sfx') === 'off'

// Haptics share the mute toggle (mute = fully quiet). Feature-detected.
function vibrate(pattern) {
  if (_muted) return
  try { navigator.vibrate?.(pattern) } catch { /* unsupported */ }
}

function note(freq, start, dur, type = 'square', vol = 0.11) {
  if (_muted) return
  try {
    const c = ctx()
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, start)
    // ~4ms attack ramp so square/saw beeps don't audibly click on start
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(vol, start + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
    osc.connect(gain)
    gain.connect(c.destination)
    osc.start(start)
    osc.stop(start + dur)
  } catch { /* audio unavailable */ }
}

function seq(notes) {
  if (_muted) return
  try {
    const t = ctx().currentTime
    // each entry: [freq, delay, dur, type?, vol?]
    notes.forEach(([freq, delay, dur, type, vol]) => {
      note(freq, t + delay, dur, type || 'square', vol || 0.11)
    })
  } catch { /* ignore */ }
}

// Classic four Simon tones: A4, E4, C5, G4
const SIMON_FREQS = [440, 330, 524, 392]

export const sounds = {
  simPad: (i) => { seq([[SIMON_FREQS[i] ?? 440, 0, 0.25, 'sine', 0.18]]); vibrate(6) },
  go:    ()    => { seq([[880, 0, 0.06, 'sine', 0.15]]); vibrate(22) },
  miss:  ()    => { seq([[180, 0, 0.08, 'sawtooth', 0.12], [130, 0.09, 0.18, 'sawtooth', 0.09], [90, 0.25, 0.22, 'sawtooth', 0.07]]); vibrate(120) },
  move:  (sym) => { seq([[sym === 'X' ? 440 : 330, 0, 0.07]]); vibrate(9) },
  bust:  ()    => { seq([[200, 0, 0.08, 'sawtooth', 0.13], [120, 0.09, 0.16, 'sawtooth', 0.11], [70, 0.22, 0.26, 'sawtooth', 0.09]]); vibrate([0, 40, 60, 50]) },
  // Short blip when the Pong ball bounces off a wall
  wall:  ()    => { seq([[300, 0, 0.04, 'square', 0.09]]); vibrate(5) },
  // Rising-pitch combo: pitch climbs with the streak (capped), reset by a miss elsewhere
  hit:   (streak = 0) => {
    const step = Math.min(streak, 10)
    seq([[600 + step * 60, 0, 0.08, 'square', 0.12]])
    vibrate(6 + Math.min(step, 6) * 2)
  },
  join:  ()    => { seq([[440, 0, 0.06], [880, 0.08, 0.12]]); vibrate([0, 15, 30, 25]) },
  win:   ()    => { seq([[523, 0, 0.1], [659, 0.12, 0.1], [784, 0.24, 0.1], [1047, 0.36, 0.35]]); vibrate([0, 40, 30, 70]) },
  // Bigger fanfare + longer rumble for clinching the whole match
  matchWin: () => {
    seq([[523, 0, 0.1], [659, 0.12, 0.1], [784, 0.24, 0.1], [1047, 0.36, 0.16], [784, 0.54, 0.1], [1047, 0.66, 0.5, 'square', 0.13]])
    vibrate([0, 60, 40, 60, 40, 140])
  },
  lose:  ()    => { seq([[330, 0, 0.12], [277, 0.14, 0.12], [220, 0.28, 0.35]]); vibrate(160) },
  draw:  ()    => { seq([[392, 0, 0.14], [392, 0.18, 0.14, 'triangle', 0.07]]); vibrate([0, 30, 40, 30]) },
  drop:  ()    => { seq([[70, 0, 0.06, 'square', 0.17], [45, 0.04, 0.32, 'sawtooth', 0.15]]); vibrate(35) },
  bell:  ()    => seq([[98, 0, 1.8, 'sine', 0.16], [196, 0, 1.4, 'sine', 0.08]]),
  // Soft two-note pop for emoji reactions
  emote: () => { seq([[660, 0, 0.05, 'sine', 0.1], [990, 0.05, 0.07, 'sine', 0.08]]); vibrate(8) },
  isMuted: ()  => _muted,
  toggle() {
    _muted = !_muted
    localStorage.setItem('sfx', _muted ? 'off' : 'on')
    return _muted
  },
}
