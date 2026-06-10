let _ctx = null

function ctx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (_ctx.state === 'suspended') _ctx.resume()
  return _ctx
}

let _muted = localStorage.getItem('sfx') === 'off'

function note(freq, start, dur, type = 'square', vol = 0.11) {
  if (_muted) return
  try {
    const c = ctx()
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, start)
    gain.gain.setValueAtTime(vol, start)
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur)
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
  simPad: (i) => seq([[SIMON_FREQS[i] ?? 440, 0, 0.25, 'sine', 0.18]]),
  miss:  ()    => seq([[180, 0, 0.08, 'sawtooth', 0.12], [130, 0.09, 0.18, 'sawtooth', 0.09], [90, 0.25, 0.22, 'sawtooth', 0.07]]),
  move:  (sym) => seq([[sym === 'X' ? 440 : 330, 0, 0.07]]),
  join:  ()    => seq([[440, 0, 0.06], [880, 0.08, 0.12]]),
  win:   ()    => seq([[523, 0, 0.1], [659, 0.12, 0.1], [784, 0.24, 0.1], [1047, 0.36, 0.35]]),
  lose:  ()    => seq([[330, 0, 0.12], [277, 0.14, 0.12], [220, 0.28, 0.35]]),
  draw:  ()    => seq([[392, 0, 0.14], [392, 0.18, 0.14, 'triangle', 0.07]]),
  drop:  ()    => seq([[70, 0, 0.06, 'square', 0.17], [45, 0.04, 0.32, 'sawtooth', 0.15]]),
  bell:  ()    => seq([[98, 0, 1.8, 'sine', 0.16], [196, 0, 1.4, 'sine', 0.08]]),
  isMuted: ()  => _muted,
  toggle() {
    _muted = !_muted
    localStorage.setItem('sfx', _muted ? 'off' : 'on')
    return _muted
  },
}
