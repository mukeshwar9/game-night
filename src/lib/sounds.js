let _ctx = null

function ctx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (_ctx.state === 'suspended') _ctx.resume()
  return _ctx
}

let _muted = localStorage.getItem('sfx') === 'off'

// Haptics disabled — keep audio, kill vibration.
function vibrate(pattern) {
  return
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

// Short decaying noise burst — dice rattle / crash texture.
function noise(start, dur, vol = 0.08, freq = 1800) {
  if (_muted) return
  try {
    const c = ctx()
    const n = Math.max(1, Math.floor(c.sampleRate * dur))
    const buffer = c.createBuffer(1, n, c.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n)
    const src = c.createBufferSource()
    const filter = c.createBiquadFilter()
    const gain = c.createGain()
    src.buffer = buffer
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(freq, start)
    gain.gain.setValueAtTime(Math.max(0.0001, vol), start)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(c.destination)
    src.start(start)
    src.stop(start + dur)
  } catch { /* audio unavailable */ }
}

// Pig combo pitch: pentatonic that climbs a new octave every 5 safe rolls
// (same idea as chain-reaction `hit(wave)`, but octave-quantized).
function pigFreq(streak) {
  const pent = [0, 2, 4, 7, 9]
  const i = Math.max(0, Math.min((streak || 1) - 1, 14))
  return 196 * Math.pow(2, Math.floor(i / 5) + pent[i % 5] / 12)
}

function winFanfare() {
  seq([[523, 0, 0.1], [659, 0.12, 0.1], [784, 0.24, 0.1], [1047, 0.36, 0.35]])
}

function matchWinFanfare() {
  seq([[523, 0, 0.1], [659, 0.12, 0.1], [784, 0.24, 0.1], [1047, 0.36, 0.16], [784, 0.54, 0.1], [1047, 0.66, 0.5, 'square', 0.13]])
}

// Classic four Simon tones: A4, E4, C5, G4
const SIMON_FREQS = [440, 330, 524, 392]

export const sounds = {
  simPad: (i) => { seq([[SIMON_FREQS[i] ?? 440, 0, 0.25, 'sine', 0.18]]); vibrate(6) },
  go:    ()    => { seq([[880, 0, 0.06, 'sine', 0.15]]); vibrate(22) },
  miss:  ()    => { seq([[180, 0, 0.08, 'sawtooth', 0.12], [130, 0.09, 0.18, 'sawtooth', 0.09], [90, 0.25, 0.22, 'sawtooth', 0.07]]); vibrate(120) },
  // Flat held buzzer for a per-question timeout — distinct from miss()'s descending tone
  buzz:  ()    => { seq([[140, 0, 0.28, 'sawtooth', 0.13]]); vibrate([0, 60, 40, 60]) },
  move:  (sym) => { seq([[sym === 'X' ? 440 : 330, 0, 0.07]]); vibrate(9) },
  bust:  ()    => { seq([[200, 0, 0.08, 'sawtooth', 0.13], [120, 0.09, 0.16, 'sawtooth', 0.11], [70, 0.22, 0.26, 'sawtooth', 0.09]]); vibrate([0, 40, 60, 50]) },
  // Pig: each safe roll in a turn climbs a pentatonic (new octave every 5).
  // Distinct from `hit()` / `move()` — dice rattle + fifth ping.
  pigRoll: (streak = 1) => {
    if (_muted) return
    try {
      const t = ctx().currentTime
      const f = pigFreq(streak)
      noise(t, 0.045, 0.07, 1400 + Math.min(streak, 8) * 180)
      note(f, t + 0.03, 0.09, 'square', 0.13)
      note(f * 1.5, t + 0.07, 0.08, 'triangle', 0.07)
    } catch { /* ignore */ }
    vibrate(6 + Math.min(streak, 8) * 2)
  },
  // Pig bust: crash from the combo pitch down to a thud. Longer fall after a hot streak.
  pigBust: (streak = 0) => {
    if (_muted) return
    try {
      const t = ctx().currentTime
      const from = pigFreq(Math.max(1, streak))
      const fall = 0.18 + Math.min(streak, 8) * 0.03
      noise(t, 0.12, 0.14, 900)
      note(from, t, 0.08, 'sawtooth', 0.14)
      note(from * 0.5, t + 0.07, 0.12, 'sawtooth', 0.12)
      note(90, t + 0.14, fall, 'sawtooth', 0.11)
      note(48, t + 0.18, fall + 0.08, 'square', 0.08)
    } catch { /* ignore */ }
    vibrate([0, 40, 50, 80, 40, 50])
  },
  // Pig bank: satisfying cash-in, not a climb or a crash.
  pigBank: () => {
    if (_muted) return
    try {
      const t = ctx().currentTime
      noise(t, 0.03, 0.04, 2200)
      note(523, t, 0.07, 'square', 0.12)
      note(784, t + 0.07, 0.14, 'triangle', 0.11)
    } catch { /* ignore */ }
    vibrate([0, 12, 20, 18])
  },
  // Short blip when the Pong ball bounces off a wall
  wall:  ()    => { seq([[300, 0, 0.04, 'square', 0.09]]); vibrate(5) },
  // Rising-pitch combo: pitch climbs with the streak (capped), reset by a miss elsewhere
  hit:   (streak = 0) => {
    const step = Math.min(streak, 10)
    seq([[600 + step * 60, 0, 0.08, 'square', 0.12]])
    vibrate(6 + Math.min(step, 6) * 2)
  },
  join:  ()    => { seq([[440, 0, 0.06], [880, 0.08, 0.12]]); vibrate([0, 15, 30, 25]) },
  win:   ()    => { winFanfare(); vibrate([0, 40, 30, 70]) },
  // Bigger fanfare + longer rumble for clinching the whole match
  matchWin: () => {
    matchWinFanfare()
    vibrate([0, 60, 40, 60, 40, 140])
  },
  lose:  ()    => { seq([[330, 0, 0.12], [277, 0.14, 0.12], [220, 0.28, 0.35]]); vibrate(160) },
  draw:  ()    => { seq([[392, 0, 0.14], [392, 0.18, 0.14, 'triangle', 0.07]]); vibrate([0, 30, 40, 30]) },
  drop:  ()    => { seq([[70, 0, 0.06, 'square', 0.17], [45, 0.04, 0.32, 'sawtooth', 0.15]]); vibrate(35) },
  bell:  ()    => seq([[98, 0, 1.8, 'sine', 0.16], [196, 0, 1.4, 'sine', 0.08]]),
  // Soft two-note pop — default emoji reaction audio (haptics via reaction())
  emote: () => emoteAudio(),
  // Breathy descending hiss — shh reaction audio (haptics via reaction())
  shh:   () => shhAudio(),
  // Per-glyph reaction SFX + matched haptic pattern
  reaction(glyph) {
    playReactionAudio(glyph)
    playReactionHaptic(glyph)
  },
  // Quick-chat chip — short bright tick, distinct from emoji reaction
  chatChip() {
    seq([[900, 0, 0.04, 'square', 0.09], [1200, 0.04, 0.05, 'sine', 0.08]])
    vibrate(10)
  },
  isMuted: ()  => _muted,
  toggle() {
    _muted = !_muted
    localStorage.setItem('sfx', _muted ? 'off' : 'on')
    return _muted
  },
}

function emoteAudio() {
  seq([[660, 0, 0.05, 'sine', 0.1], [990, 0.05, 0.07, 'sine', 0.08]])
}

function shhAudio() {
  seq([[3200, 0, 0.22, 'sawtooth', 0.03], [2400, 0.02, 0.2, 'sawtooth', 0.025]])
}

const DEFAULT_REACTION_HAPTIC = [0, 8, 8]

// Distinct navigator.vibrate patterns per emoji — audio lives in REACTION_SOUNDS.
const REACTION_HAPTICS = {
  '🔥': [0, 5, 10, 15, 20],
  '😂': [0, 8, 50, 8, 50, 8],
  '😭': [0, 40, 30, 50],
  '😎': [12],
  '👏': [0, 12, 40, 12],
  '💀': [0, 60, 40, 50],
  '🤫': [5],
  '❤️': [0, 25, 55, 25],
  '🎉': [0, 10, 20, 10, 20, 10, 30],
  '🤔': [0, 15, 80, 12],
  '😱': [0, 10, 20, 30, 40, 50],
  '👍': [18],
  '🙏': [0, 15, 50, 15],
  '💪': [0, 30, 20, 35],
  '😤': [0, 25, 15, 20],
  '🎯': [10],
  '⚡': [0, 5, 8, 5, 15],
  '🥶': [0, 8, 35, 8, 35, 8],
  '🍀': [0, 6, 12, 6, 12, 6, 14],
}

function playReactionAudio(glyph) {
  const explicit = REACTION_SOUNDS[glyph]
  if (explicit) { explicit(); return }
  const arch = GLYPH_ARCHETYPE[glyph]
  const fn = arch && FACE_ARCHETYPE_AUDIO[arch]
  if (fn) { fn(); return }
  emoteAudio()
}

function playReactionHaptic(glyph) {
  if (REACTION_HAPTICS[glyph]) { vibrate(REACTION_HAPTICS[glyph]); return }
  const arch = GLYPH_ARCHETYPE[glyph]
  const pattern = arch && FACE_ARCHETYPE_HAPTIC[arch]
  vibrate(pattern ?? DEFAULT_REACTION_HAPTIC)
}

// Used by emotes.test.js — every picker glyph must return true.
export function hasReactionCoverage(glyph) {
  return !!(REACTION_SOUNDS[glyph] || GLYPH_ARCHETYPE[glyph])
}

const FACE_ARCHETYPE_AUDIO = {
  grin: () => seq([[523, 0, 0.07, 'sine', 0.1], [659, 0.06, 0.08, 'sine', 0.09]]),
  laugh: () => seq([[440, 0, 0.06, 'sine', 0.1], [523, 0.07, 0.06, 'sine', 0.1], [660, 0.14, 0.08, 'sine', 0.12]]),
  sweat_smile: () => seq([[480, 0, 0.08, 'sine', 0.1], [400, 0.08, 0.1, 'triangle', 0.08]]),
  upside_down: () => seq([[392, 0, 0.1, 'triangle', 0.08], [330, 0.1, 0.1, 'triangle', 0.07]]),
  wink: () => seq([[660, 0, 0.05, 'sine', 0.1], [880, 0.08, 0.04, 'square', 0.06]]),
  angel: () => seq([[784, 0, 0.1, 'sine', 0.09], [1047, 0.1, 0.12, 'sine', 0.08]]),
  love: () => seq([[523, 0, 0.08, 'sine', 0.1], [659, 0.08, 0.1, 'sine', 0.09], [784, 0.16, 0.12, 'sine', 0.1]]),
  bittersweet: () => seq([[440, 0, 0.1, 'sine', 0.09], [392, 0.12, 0.14, 'sine', 0.08]]),
  yum: () => seq([[550, 0, 0.08, 'sine', 0.1], [700, 0.06, 0.1, 'triangle', 0.08]]),
  silly: () => seq([[500, 0, 0.05, 'square', 0.1], [650, 0.05, 0.05, 'square', 0.09], [800, 0.08, 0.06, 'square', 0.08]]),
  money: () => seq([[880, 0, 0.06, 'square', 0.1], [1100, 0.06, 0.08, 'square', 0.09]]),
  hug: () => seq([[330, 0, 0.1, 'sine', 0.1], [440, 0.1, 0.12, 'sine', 0.09]]),
  think: () => seq([[220, 0, 0.2, 'triangle', 0.08]]),
  salute: () => seq([[440, 0, 0.06, 'square', 0.1], [523, 0.08, 0.08, 'square', 0.09]]),
  zip: () => seq([[180, 0, 0.15, 'sawtooth', 0.06]]),
  neutral: () => seq([[300, 0, 0.12, 'triangle', 0.07]]),
  smirk: () => seq([[280, 0, 0.1, 'sawtooth', 0.07], [350, 0.1, 0.08, 'sine', 0.06]]),
  unamused: () => seq([[250, 0, 0.14, 'sawtooth', 0.08], [200, 0.12, 0.16, 'sawtooth', 0.07]]),
  grimace: () => seq([[400, 0, 0.06, 'sawtooth', 0.08], [320, 0.08, 0.1, 'sawtooth', 0.07]]),
  exhale: () => seq([[350, 0, 0.18, 'sawtooth', 0.05], [280, 0.15, 0.2, 'sawtooth', 0.04]]),
  lie: () => seq([[300, 0, 0.08, 'triangle', 0.08], [260, 0.1, 0.12, 'triangle', 0.07]]),
  shake: () => {
    if (_muted) return
    try {
      const t = ctx().currentTime
      for (let i = 0; i < 4; i++) note(200 + i * 40, t + i * 0.04, 0.04, 'square', 0.08)
    } catch { /* ignore */ }
  },
  relieved: () => seq([[392, 0, 0.14, 'sine', 0.09], [440, 0.12, 0.16, 'sine', 0.08]]),
  pensive: () => seq([[350, 0, 0.14, 'sine', 0.09], [300, 0.14, 0.18, 'sine', 0.08]]),
  sleepy: () => seq([[280, 0, 0.2, 'sine', 0.07]]),
  drool: () => seq([[400, 0, 0.1, 'sine', 0.08], [350, 0.12, 0.14, 'triangle', 0.06]]),
  sleep: () => seq([[220, 0, 0.25, 'sine', 0.07]]),
  yawn: () => seq([[300, 0, 0.2, 'sawtooth', 0.06], [200, 0.2, 0.25, 'sawtooth', 0.05]]),
  mask: () => seq([[340, 0, 0.12, 'triangle', 0.08]]),
  sick: () => seq([[280, 0, 0.1, 'sawtooth', 0.08], [240, 0.12, 0.14, 'sawtooth', 0.07]]),
  nauseated: () => {
    if (_muted) return
    try {
      const t = ctx().currentTime
      noise(t, 0.1, 0.08, 500)
      note(180, t + 0.05, 0.15, 'sawtooth', 0.08)
    } catch { /* ignore */ }
  },
  sneeze: () => {
    if (_muted) return
    try {
      const t = ctx().currentTime
      noise(t, 0.04, 0.12, 2500)
      note(600, t + 0.03, 0.08, 'sine', 0.1)
    } catch { /* ignore */ }
  },
  hot: () => seq([[300, 0, 0.1, 'sawtooth', 0.09], [450, 0.08, 0.12, 'sawtooth', 0.08]]),
  woozy: () => seq([[400, 0, 0.12, 'sine', 0.08], [360, 0.1, 0.12, 'sine', 0.07], [320, 0.2, 0.14, 'sine', 0.06]]),
  dizzy: () => seq([[500, 0, 0.08, 'sine', 0.08], [450, 0.06, 0.08, 'sine', 0.07], [500, 0.12, 0.08, 'sine', 0.07], [450, 0.18, 0.1, 'sine', 0.06]]),
  explode: () => {
    if (_muted) return
    try {
      const t = ctx().currentTime
      noise(t, 0.06, 0.14, 1200)
      note(200, t, 0.1, 'sawtooth', 0.12)
      note(800, t + 0.05, 0.15, 'square', 0.1)
    } catch { /* ignore */ }
  },
  cowboy: () => seq([[196, 0, 0.12, 'square', 0.1], [784, 0.1, 0.06, 'square', 0.08]]),
  party: () => winFanfare(),
  disguise: () => seq([[330, 0, 0.08, 'square', 0.09], [440, 0.08, 0.08, 'square', 0.08], [330, 0.16, 0.1, 'square', 0.08]]),
  nerd: () => seq([[440, 0, 0.08, 'square', 0.09], [554, 0.08, 0.1, 'square', 0.08]]),
  monocle: () => seq([[350, 0, 0.1, 'triangle', 0.08], [280, 0.12, 0.14, 'triangle', 0.07]]),
  confused: () => seq([[320, 0, 0.1, 'triangle', 0.08], [380, 0.1, 0.1, 'triangle', 0.07]]),
  worried: () => seq([[380, 0, 0.12, 'sine', 0.09], [340, 0.12, 0.14, 'sine', 0.08]]),
  frown: () => seq([[320, 0, 0.14, 'sine', 0.09], [280, 0.14, 0.16, 'sine', 0.08]]),
  surprised: () => seq([[600, 0, 0.08, 'sine', 0.1], [750, 0.06, 0.1, 'sine', 0.09]]),
  flush: () => seq([[480, 0, 0.1, 'sine', 0.09], [520, 0.08, 0.12, 'sine', 0.08]]),
  pleading: () => seq([[440, 0, 0.12, 'sine', 0.1], [392, 0.14, 0.16, 'sine', 0.09]]),
  anguish: () => seq([[360, 0, 0.14, 'sawtooth', 0.08], [280, 0.14, 0.18, 'sawtooth', 0.07]]),
  fear: () => seq([[500, 0, 0.1, 'sawtooth', 0.08], [400, 0.12, 0.14, 'sawtooth', 0.07]]),
  anxious: () => seq([[450, 0, 0.08, 'sine', 0.09], [420, 0.08, 0.1, 'sine', 0.08], [380, 0.16, 0.12, 'sine', 0.07]]),
  sad_relief: () => seq([[420, 0, 0.12, 'sine', 0.09], [380, 0.14, 0.16, 'sine', 0.08]]),
  cry: () => seq([[500, 0, 0.12, 'sine', 0.1], [400, 0.1, 0.12, 'sine', 0.09], [300, 0.2, 0.2, 'sine', 0.08]]),
  confounded: () => seq([[300, 0, 0.1, 'sawtooth', 0.09], [250, 0.12, 0.14, 'sawtooth', 0.08]]),
  persevere: () => seq([[340, 0, 0.1, 'square', 0.09], [300, 0.12, 0.14, 'square', 0.08]]),
  disappointed: () => seq([[360, 0, 0.14, 'sine', 0.09], [300, 0.16, 0.18, 'sine', 0.08]]),
  sweat: () => seq([[400, 0, 0.1, 'triangle', 0.08], [350, 0.1, 0.12, 'triangle', 0.07]]),
  weary: () => seq([[280, 0, 0.16, 'sawtooth', 0.08], [220, 0.18, 0.2, 'sawtooth', 0.07]]),
  angry: () => {
    if (_muted) return
    try {
      const t = ctx().currentTime
      noise(t, 0.08, 0.1, 400)
      note(120, t, 0.12, 'sawtooth', 0.12)
      note(90, t + 0.1, 0.18, 'sawtooth', 0.1)
    } catch { /* ignore */ }
  },
  devil: () => seq([[180, 0, 0.12, 'sawtooth', 0.1], [140, 0.12, 0.2, 'square', 0.09]]),
  skull_bone: () => seq([[100, 0, 0.2, 'sawtooth', 0.09], [70, 0.15, 0.25, 'square', 0.08]]),
  poop: () => seq([[150, 0, 0.1, 'sawtooth', 0.08], [100, 0.12, 0.2, 'sawtooth', 0.09]]),
  clown: () => seq([[523, 0, 0.06], [659, 0.06, 0.06], [784, 0.1, 0.08], [523, 0.16, 0.08]]),
  monster: () => {
    if (_muted) return
    try {
      const t = ctx().currentTime
      note(80, t, 0.15, 'sawtooth', 0.12)
      noise(t + 0.05, 0.1, 0.1, 600)
    } catch { /* ignore */ }
  },
  ghost: () => seq([[1200, 0, 0.1, 'sine', 0.06], [800, 0.1, 0.2, 'sine', 0.05]]),
  alien: () => seq([[880, 0, 0.08, 'sine', 0.08], [660, 0.1, 0.1, 'sine', 0.07], [440, 0.2, 0.12, 'sine', 0.06]]),
  robot: () => seq([[440, 0, 0.05, 'square', 0.1], [440, 0.08, 0.05, 'square', 0.09], [554, 0.16, 0.08, 'square', 0.08]]),
  fog: () => seq([[600, 0, 0.2, 'sine', 0.05], [500, 0.15, 0.25, 'sine', 0.04]]),
  melt: () => seq([[450, 0, 0.14, 'triangle', 0.07], [350, 0.14, 0.2, 'triangle', 0.06]]),
}

const FACE_ARCHETYPE_HAPTIC = {
  grin: [0, 8, 8],
  laugh: [0, 8, 50, 8, 50, 8],
  sweat_smile: [0, 10, 20, 10],
  upside_down: [0, 12, 30, 12],
  wink: [12],
  angel: [0, 15, 40, 15],
  love: [0, 20, 40, 20],
  bittersweet: [0, 25, 35, 20],
  yum: [10],
  silly: [0, 6, 6, 6, 10],
  money: [0, 8, 12, 8],
  hug: [0, 20, 30, 20],
  think: [0, 15, 80, 12],
  salute: [18],
  zip: [8],
  neutral: [10],
  smirk: [12],
  unamused: [0, 20, 40, 15],
  grimace: [0, 8, 15, 8],
  exhale: [0, 30, 25, 20],
  lie: [0, 10, 50, 10],
  shake: [0, 5, 5, 5, 5, 5, 10],
  relieved: [0, 15, 25, 15],
  pensive: [0, 30, 40, 25],
  sleepy: [25],
  drool: [0, 12, 20, 12],
  sleep: [30],
  yawn: [0, 20, 30, 25],
  mask: [12],
  sick: [0, 15, 25, 20],
  nauseated: [0, 20, 30, 25],
  sneeze: [0, 5, 15, 10],
  hot: [0, 10, 15, 20],
  woozy: [0, 10, 20, 10, 20, 10],
  dizzy: [0, 6, 6, 6, 6, 6, 10],
  explode: [0, 10, 20, 30, 40],
  cowboy: [14],
  party: [0, 10, 20, 10, 20, 10, 30],
  disguise: [0, 8, 8, 8, 8],
  nerd: [0, 10, 15, 10],
  monocle: [0, 12, 50, 12],
  confused: [0, 15, 30, 15],
  worried: [0, 20, 30, 20],
  frown: [0, 25, 35, 25],
  surprised: [0, 10, 20, 30],
  flush: [0, 12, 25, 12],
  pleading: [0, 20, 40, 20],
  anguish: [0, 35, 40, 30],
  fear: [0, 15, 25, 35],
  anxious: [0, 10, 20, 10, 20],
  sad_relief: [0, 25, 30, 25],
  cry: [0, 40, 30, 50],
  confounded: [0, 20, 25, 20],
  persevere: [0, 15, 20, 15],
  disappointed: [0, 30, 40, 30],
  sweat: [0, 12, 20, 12],
  weary: [0, 35, 45, 35],
  angry: [0, 25, 20, 35],
  devil: [0, 20, 30, 25],
  skull_bone: [0, 50, 40, 45],
  poop: [0, 15, 25, 20],
  clown: [0, 8, 8, 8, 12],
  monster: [0, 30, 40, 30],
  ghost: [0, 8, 40, 8],
  alien: [0, 6, 12, 6, 12, 14],
  robot: [0, 5, 5, 5, 10],
  fog: [0, 20, 30, 20],
  melt: [0, 25, 35, 25],
}

// Maps every face emoji glyph to an expression archetype (audio + haptic).
const GLYPH_ARCHETYPE = {
  '😀': 'grin', '😃': 'grin', '😄': 'grin', '😁': 'grin', '🙂': 'grin', '😊': 'grin',
  '😆': 'laugh', '🤣': 'laugh',
  '😅': 'sweat_smile',
  '🙃': 'upside_down',
  '😉': 'wink',
  '😇': 'angel',
  '🥰': 'love', '😍': 'love', '🤩': 'love', '😘': 'love', '😗': 'love', '☺️': 'love', '😚': 'love', '😙': 'love',
  '🥲': 'bittersweet',
  '😋': 'yum',
  '😛': 'silly', '😜': 'silly', '🤪': 'silly', '😝': 'silly',
  '🤑': 'money',
  '🤗': 'hug',
  '🤭': 'zip',
  '🫡': 'salute',
  '🤐': 'zip',
  '🤨': 'monocle',
  '😐': 'neutral', '😑': 'neutral', '😶': 'neutral', '🫥': 'neutral',
  '😏': 'smirk',
  '😒': 'unamused', '🙄': 'unamused',
  '😬': 'grimace',
  '😮‍💨': 'exhale',
  '🤥': 'lie',
  '🫨': 'shake',
  '😌': 'relieved',
  '😔': 'pensive',
  '😪': 'sleepy',
  '🤤': 'drool',
  '😴': 'sleep',
  '🥱': 'yawn',
  '😷': 'mask',
  '🤒': 'sick', '🤕': 'sick',
  '🤢': 'nauseated', '🤮': 'nauseated',
  '🤧': 'sneeze',
  '🥵': 'hot',
  '🥴': 'woozy',
  '😵': 'dizzy', '😵‍💫': 'dizzy',
  '🤯': 'explode',
  '🤠': 'cowboy',
  '🥳': 'party',
  '🥸': 'disguise',
  '🤓': 'nerd',
  '🧐': 'monocle',
  '😕': 'confused',
  '😟': 'worried',
  '🙁': 'frown', '☹️': 'frown',
  '😮': 'surprised', '😯': 'surprised', '😲': 'surprised',
  '😳': 'flush',
  '🥺': 'pleading', '🥹': 'pleading',
  '😦': 'anguish', '😧': 'anguish',
  '😨': 'fear',
  '😰': 'anxious',
  '😥': 'sad_relief',
  '😢': 'cry',
  '😖': 'confounded',
  '😣': 'persevere',
  '😞': 'disappointed',
  '😓': 'sweat',
  '😩': 'weary', '😫': 'weary',
  '😡': 'angry', '😠': 'angry', '🤬': 'angry',
  '😈': 'devil', '👿': 'devil',
  '☠️': 'skull_bone',
  '💩': 'poop',
  '🤡': 'clown',
  '👹': 'monster', '👺': 'monster',
  '👻': 'ghost',
  '👽': 'alien', '👾': 'alien',
  '🤖': 'robot',
  '😶‍🌫️': 'fog',
  '🫠': 'melt',
}

// Synthesized one-shots matched to each emoji reaction (Web Audio only — no samples).
const REACTION_SOUNDS = {
  '🔥': () => {
    if (_muted) return
    try {
      const t = ctx().currentTime
      noise(t, 0.08, 0.1, 800)
      noise(t + 0.04, 0.06, 0.08, 1300)
      note(220, t + 0.02, 0.14, 'sawtooth', 0.06)
    } catch { /* ignore */ }
  },
  '😂': () => {
    seq([[440, 0, 0.06, 'sine', 0.1], [523, 0.07, 0.06, 'sine', 0.1], [660, 0.14, 0.08, 'sine', 0.12]])
  },
  '😭': () => {
    seq([[500, 0, 0.12, 'sine', 0.1], [400, 0.1, 0.12, 'sine', 0.09], [300, 0.2, 0.2, 'sine', 0.08]])
  },
  '😎': () => {
    seq([[110, 0, 0.15, 'sine', 0.12], [880, 0.12, 0.04, 'square', 0.06]])
  },
  '👏': () => {
    if (_muted) return
    try {
      const t = ctx().currentTime
      noise(t, 0.04, 0.14, 3000)
      noise(t + 0.08, 0.04, 0.12, 2800)
    } catch { /* ignore */ }
  },
  '💀': () => {
    seq([[80, 0, 0.3, 'sawtooth', 0.1], [60, 0.15, 0.35, 'square', 0.08]])
  },
  '🤫': () => shhAudio(),
  '❤️': () => {
    seq([[60, 0, 0.08, 'sine', 0.14], [50, 0.12, 0.1, 'sine', 0.1]])
  },
  '🎉': () => { winFanfare() },
  '🤔': () => {
    seq([[220, 0, 0.2, 'triangle', 0.08]])
  },
  '😱': () => {
    if (_muted) return
    try {
      const t = ctx().currentTime
      note(600, t, 0.15, 'sawtooth', 0.08)
      note(900, t + 0.08, 0.2, 'sawtooth', 0.1)
      note(1200, t + 0.18, 0.15, 'sawtooth', 0.09)
    } catch { /* ignore */ }
  },
  '👍': () => {
    seq([[784, 0, 0.1, 'sine', 0.12]])
  },
  '🙏': () => {
    seq([[392, 0, 0.2, 'sine', 0.1], [523, 0.05, 0.25, 'sine', 0.07]])
  },
  '💪': () => {
    if (_muted) return
    try {
      const t = ctx().currentTime
      note(80, t, 0.12, 'square', 0.14)
      note(160, t + 0.06, 0.15, 'square', 0.11)
      noise(t, 0.05, 0.06, 400)
    } catch { /* ignore */ }
  },
  '😤': () => {
    if (_muted) return
    try {
      const t = ctx().currentTime
      noise(t, 0.12, 0.06, 600)
      note(300, t, 0.15, 'sawtooth', 0.05)
    } catch { /* ignore */ }
  },
  '🎯': () => {
    seq([[1200, 0, 0.08, 'sine', 0.11], [1800, 0.04, 0.06, 'sine', 0.08]])
  },
  '⚡': () => {
    if (_muted) return
    try {
      const t = ctx().currentTime
      noise(t, 0.03, 0.12, 4000)
      note(1500, t, 0.05, 'square', 0.1)
      note(800, t + 0.04, 0.05, 'square', 0.08)
    } catch { /* ignore */ }
  },
  '🥶': () => {
    seq([[2000, 0, 0.15, 'sine', 0.06], [2400, 0.08, 0.2, 'sine', 0.05], [2800, 0.16, 0.2, 'sine', 0.04]])
  },
  '🍀': () => {
    seq([[880, 0, 0.06, 'sine', 0.08], [1100, 0.06, 0.06, 'sine', 0.07], [1320, 0.12, 0.08, 'sine', 0.06], [1760, 0.18, 0.1, 'sine', 0.08]])
  },
}
