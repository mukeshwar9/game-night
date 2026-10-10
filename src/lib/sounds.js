import { haptic, hapticNotify } from './haptics'
import { isNative } from './platform'
import { getWinFx } from './displayPrefs'
import { duckMusic, resumeAudio } from './audioContext'

let _volume = Number(localStorage.getItem('sfxVolume') ?? 1)
let _reactionMuted = localStorage.getItem('reactionSfx') === 'off'
let _reactionVolumeScale = 1
let _reactionPitchScale = 1

if (!Number.isFinite(_volume)) _volume = 1
_volume = Math.max(0, Math.min(1, _volume))

// Shared with background music (audioContext.js); resumed on every cue.
function ctx() {
  const c = resumeAudio()
  if (!c) throw new Error('Web Audio unavailable')
  return c
}

let _muted = localStorage.getItem('sfx') === 'off'

// Dips background music while a cue sounds: a light dip for blips (Pong
// walls, footsteps) so fast games don't pump, deeper for longer cues.
function duckUnder(c, start, dur) {
  if (_volume <= 0) return
  duckMusic(dur < 0.1 ? 0.7 : 0.55, Math.max(0, start - c.currentTime) + dur)
}

// Haptics go through the native shell only (src/lib/haptics.js); web
// vibration stays off. Both follow the player's HAPTICS switch, not the
// sound switch: muted players can still feel moves.
function vibrate(pattern) {
  if (isNative) haptic(pattern)
}

// Outcomes use the platform's notification haptics (success / warning / error).
function notice(type) {
  if (isNative) hapticNotify(type)
}

function note(freq, start, dur, type = 'square', vol = 0.11) {
  if (_muted) return
  try {
    const c = ctx()
    duckUnder(c, start, dur)
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq * _reactionPitchScale, start)
    // ~4ms attack ramp so square/saw beeps don't audibly click on start
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * _volume * _reactionVolumeScale), start + 0.004)
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

// Decaying noise buffers, cached per length: filling one with random samples
// was the top JS cost in Pong/Pac-Man profiles (a wall or paddle hit plays one
// every few frames). A few takes per length are rotated so repeats don't
// sound identical.
const NOISE_TAKES = 4
const _noise = new Map()

function noiseBuffer(c, n) {
  let entry = _noise.get(n)
  if (!entry) { entry = { takes: [], next: 0 }; _noise.set(n, entry) }
  const i = entry.next
  entry.next = (i + 1) % NOISE_TAKES
  if (!entry.takes[i]) {
    const buffer = c.createBuffer(1, n, c.sampleRate)
    const data = buffer.getChannelData(0)
    for (let k = 0; k < n; k++) data[k] = (Math.random() * 2 - 1) * (1 - k / n)
    entry.takes[i] = buffer
  }
  return entry.takes[i]
}

// Short decaying noise burst — dice rattle / crash texture.
function noise(start, dur, vol = 0.08, freq = 1800) {
  if (_muted) return
  try {
    const c = ctx()
    duckUnder(c, start, dur)
    const n = Math.max(1, Math.floor(c.sampleRate * dur))
    const buffer = noiseBuffer(c, n)
    const src = c.createBufferSource()
    const filter = c.createBiquadFilter()
    const gain = c.createGain()
    src.buffer = buffer
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(freq * _reactionPitchScale, start)
    gain.gain.setValueAtTime(Math.max(0.0001, vol * _volume * _reactionVolumeScale), start)
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
  if (!_muted && _volume > 0) duckMusic(0.3, 0.8)
  seq([[523, 0, 0.1], [659, 0.12, 0.1], [784, 0.24, 0.1], [1047, 0.36, 0.35]])
}

function matchWinFanfare() {
  if (!_muted && _volume > 0) duckMusic(0.3, 1.2)
  seq([[523, 0, 0.1], [659, 0.12, 0.1], [784, 0.24, 0.1], [1047, 0.36, 0.16], [784, 0.54, 0.1], [1047, 0.66, 0.5, 'square', 0.13]])
}

// Classic four Simon tones: A4, E4, C5, G4
const SIMON_FREQS = [440, 330, 524, 392]

export const sounds = {
  simPad: (i) => { seq([[SIMON_FREQS[i] ?? 440, 0, 0.25, 'sine', 0.18]]); vibrate(6) },
  go:    ()    => { seq([[880, 0, 0.06, 'sine', 0.15]]); vibrate(22) },
  miss:  ()    => { seq([[180, 0, 0.08, 'sawtooth', 0.12], [130, 0.09, 0.18, 'sawtooth', 0.09], [90, 0.25, 0.22, 'sawtooth', 0.07]]); vibrate(120) },
  // Flat held buzzer for a per-question timeout — distinct from miss()'s descending tone
  buzz:  ()    => { seq([[140, 0, 0.28, 'sawtooth', 0.13]]); notice('WARNING') },
  move:  (sym) => { seq([[sym === 'X' ? 440 : 330, 0, 0.07]]); vibrate(9) },
  // The finger's contact with a board whose piece lands later (landMs):
  // a light tick now, the move's sound and haptic when the piece lands.
  touch: ()    => { vibrate(6) },
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
  // Minigolf: the putt (pitch rises with power), bumper boing, splash,
  // portal sweep, lip-out rattle and the cup drop (longer run for a better score)
  putt:  (power = 0.5) => { seq([[220 + power * 380, 0, 0.05, 'square', 0.1]]); vibrate(8) },
  boing: ()    => { seq([[520, 0, 0.05, 'triangle', 0.12], [780, 0.05, 0.06, 'triangle', 0.1]]); vibrate(12) },
  splash: ()   => { try { noise(ctx().currentTime, 0.25, 0.07, 900) } catch { /* audio unavailable */ } seq([[180, 0, 0.08, 'sawtooth', 0.07]]); vibrate(120) },
  warp:  ()    => { seq([[400, 0, 0.05, 'sine', 0.1], [700, 0.05, 0.05, 'sine', 0.1], [1100, 0.1, 0.08, 'sine', 0.1]]); vibrate([0, 10, 30, 10]) },
  rattle: ()   => { seq([[900, 0, 0.03, 'square', 0.07], [700, 0.05, 0.03, 'square', 0.07]]); vibrate([0, 15, 20, 15]) },
  cup:   (good = false) => {
    seq([[160, 0, 0.08, 'sine', 0.14], ...[523, 659, 784, 1047].slice(0, good ? 4 : 2).map((f, i) => [f, 0.12 + i * 0.08, 0.09, 'square', 0.08])])
    vibrate([0, 30, 40, 60])
  },
  // Tiny soft footstep tick — Playground world movement, throttled by the caller
  step:  ()    => { seq([[1500, 0, 0.02, 'square', 0.06]]); vibrate(0) },
  // Punchy low thump — Playground ball kick, distinct from wall()'s bright blip
  kick:  ()    => { seq([[220, 0, 0.05, 'square', 0.12], [140, 0.04, 0.08, 'sawtooth', 0.09]]); vibrate(0) },
  // Rising-pitch combo: pitch climbs with the streak (capped), reset by a miss elsewhere
  hit:   (streak = 0) => {
    const step = Math.min(streak, 10)
    seq([[600 + step * 60, 0, 0.08, 'square', 0.12]])
    vibrate(6 + Math.min(step, 6) * 2)
  },
  // One explicit note of a melodic streak (Arrows); haptic matches hit()
  hitNote: (freq, streak = 0) => {
    seq([[freq, 0, 0.08, 'square', 0.1]])
    vibrate(6 + Math.min(streak, 6) * 2)
  },
  join:  ()    => { seq([[440, 0, 0.06], [880, 0.08, 0.12]]); vibrate([0, 15, 30, 25]) },
  win:   ()    => { if (!getWinFx()) return; winFanfare(); notice('SUCCESS') },
  // Bigger fanfare + longer rumble for clinching the whole match
  matchWin: () => {
    if (!getWinFx()) return
    matchWinFanfare()
    vibrate([0, 60, 40, 60, 40, 140])
  },
  // A loss is not an error: two soft taps, never the platform's ERROR haptic.
  lose:  ()    => { seq([[330, 0, 0.12], [277, 0.14, 0.12], [220, 0.28, 0.35]]); vibrate([0, 12, 90, 12]) },
  draw:  ()    => { seq([[392, 0, 0.14], [392, 0.18, 0.14, 'triangle', 0.07]]); vibrate([0, 30, 40, 30]) },
  drop:  ()    => { seq([[70, 0, 0.06, 'square', 0.17], [45, 0.04, 0.32, 'sawtooth', 0.15]]); vibrate(35) },
  bell:  ()    => seq([[98, 0, 1.8, 'sine', 0.16], [196, 0, 1.4, 'sine', 0.08]]),
  // Sumo Arena: a stomp per push, a body-slam thud scaled by impact, a
  // taiko heartbeat while someone teeters on the edge, the crowd, the
  // shrinking-ring warning, the opening gong and the ring-out (whoosh, crash,
  // roar). Mute, volume and native haptics all flow through seq/noise/vibrate.
  sumoStomp: () => { seq([[120, 0, 0.05, 'square', 0.08], [72, 0.03, 0.07, 'sawtooth', 0.06]]); vibrate(6) },
  sumoClash: (power = 0.5) => {
    const p = Math.max(0, Math.min(1, power))
    try { noise(ctx().currentTime, 0.1 + p * 0.12, 0.05 + p * 0.09, 420 + p * 260) } catch { /* audio unavailable */ }
    seq([[150 - p * 50, 0, 0.09 + p * 0.06, 'triangle', 0.1 + p * 0.06], [60, 0.01, 0.12 + p * 0.08, 'sawtooth', 0.05 + p * 0.07]])
    vibrate(10 + Math.round(p * 30))
  },
  sumoTension: (level = 0.5) => {
    const l = Math.max(0, Math.min(1, level))
    seq([[92, 0, 0.09, 'sine', 0.09 + l * 0.08], [78, 0.13, 0.11, 'sine', 0.07 + l * 0.07]])
    vibrate(l > 0.85 ? 12 : 0)
  },
  sumoOoh: () => {
    try {
      const t = ctx().currentTime
      noise(t, 0.45, 0.035, 520)
      noise(t + 0.08, 0.5, 0.03, 760)
    } catch { /* audio unavailable */ }
    seq([[311, 0, 0.22, 'sine', 0.04], [277, 0.18, 0.3, 'sine', 0.04]])
  },
  sumoCrowd: (big = false) => {
    try {
      const t = ctx().currentTime
      const n = big ? 5 : 3
      for (let i = 0; i < n; i++) noise(t + i * 0.09, 0.45 + i * 0.08, (big ? 0.05 : 0.035) - i * 0.004, [700, 1100, 560, 900, 1300][i])
    } catch { /* audio unavailable */ }
  },
  sumoShrink: () => { seq([[220, 0, 0.12, 'square', 0.07], [165, 0.15, 0.18, 'square', 0.07]]); vibrate([0, 20, 40, 20]) },
  sumoGong: () => {
    try { noise(ctx().currentTime, 0.08, 0.05, 2400) } catch { /* audio unavailable */ }
    seq([[110, 0, 1.6, 'sine', 0.13], [221, 0, 1.1, 'sine', 0.07], [332, 0, 0.6, 'triangle', 0.035]])
    vibrate(20)
  },
  sumoRingOut: () => {
    seq([
      [620, 0, 0.06, 'sawtooth', 0.06], [470, 0.05, 0.06, 'sawtooth', 0.06],
      [340, 0.1, 0.07, 'sawtooth', 0.06], [230, 0.16, 0.08, 'sawtooth', 0.06],
      [70, 0.26, 0.08, 'square', 0.16], [45, 0.3, 0.34, 'sawtooth', 0.14],
    ])
    try {
      const t = ctx().currentTime
      noise(t + 0.26, 0.3, 0.1, 380)
      for (let i = 0; i < 5; i++) noise(t + 0.34 + i * 0.1, 0.55 + i * 0.1, 0.05 - i * 0.005, [800, 1150, 600, 950, 1350][i])
    } catch { /* audio unavailable */ }
    vibrate([0, 30, 60, 90])
  },
  // FENDER BENDER: a shove (soft or hard), a traffic hit, a wreck, a splash off
  // the road and the horn. Mute, volume and native haptics flow through seq/noise.
  fenderBump: (hard = false) => {
    try { noise(ctx().currentTime, hard ? 0.16 : 0.09, hard ? 0.1 : 0.05, hard ? 900 : 1500) } catch { /* audio unavailable */ }
    seq([[hard ? 120 : 150, 0, hard ? 0.14 : 0.08, 'sine', hard ? 0.16 : 0.09]])
    vibrate(hard ? 26 : 8)
  },
  fenderCrash: () => {
    try { noise(ctx().currentTime, 0.28, 0.14, 700) } catch { /* audio unavailable */ }
    seq([[100, 0, 0.2, 'sine', 0.15], [70, 0.02, 0.16, 'sawtooth', 0.06]])
    vibrate([0, 30, 20, 30])
  },
  fenderWreck: () => {
    try {
      const t = ctx().currentTime
      noise(t, 0.7, 0.18, 380)
      noise(t + 0.05, 0.45, 0.08, 1100)
    } catch { /* audio unavailable */ }
    seq([[90, 0, 0.5, 'sine', 0.17], [50, 0.02, 0.45, 'sawtooth', 0.08]])
    vibrate([0, 60, 40, 90])
  },
  fenderSplash: () => {
    try { noise(ctx().currentTime, 0.5, 0.1, 1800) } catch { /* audio unavailable */ }
    seq([[300, 0, 0.12, 'sine', 0.05], [180, 0.08, 0.2, 'sine', 0.05]])
    vibrate(60)
  },
  fenderHorn: () => { seq([[392, 0, 0.26, 'square', 0.07], [494, 0, 0.26, 'square', 0.07]]); vibrate(15) },
  // Animal Stack: rotate tick, release blip, landing thud scaled by impact,
  // topple sting, and the last-5-seconds timer tick.
  stackRotate: () => { seq([[880, 0, 0.03, 'square', 0.04]]); vibrate(4) },
  stackRelease: () => { seq([[520, 0, 0.05, 'square', 0.06], [390, 0.04, 0.06, 'square', 0.05]]); vibrate(10) },
  stackLand: (speed = 0.5) => { seq([[140 + speed * 40, 0, 0.08, 'triangle', 0.08 + speed * 0.06], [60, 0, 0.12, 'sawtooth', 0.05 + speed * 0.06]]); vibrate(8 + Math.round(speed * 14)) },
  stackTopple: () => { seq([[440, 0, 0.14], [330, 0.11, 0.14], [247, 0.22, 0.14], [165, 0.33, 0.2]]); vibrate([0, 60, 40, 120]) },
  stackTick: () => { seq([[1200, 0, 0.02, 'square', 0.03]]) },
  // Lazy Susan: a piece taken (higher for the bun), a tap on nothing, a chili,
  // the plate reversing, the gold last bite, and the countdown tick.
  susanGrab: (value = 1) => { seq([[520 + value * 90, 0, 0.05, 'triangle', 0.1], [900 + value * 120, 0.04, 0.07, 'triangle', 0.08]]); vibrate(8) },
  susanBun: () => { seq([[660, 0, 0.08, 'triangle', 0.1], [990, 0.07, 0.14, 'triangle', 0.1]]); vibrate(14) },
  susanMiss: () => { seq([[170, 0, 0.1, 'square', 0.06], [100, 0.08, 0.1, 'square', 0.05]]); vibrate(25) },
  susanHot: () => { seq([[320, 0, 0.2, 'sawtooth', 0.06], [170, 0.15, 0.25, 'sawtooth', 0.06], [80, 0.35, 0.15, 'sawtooth', 0.05]]); vibrate([0, 40, 50, 60]) },
  susanTurn: () => { seq([[1320, 0, 0.5, 'sine', 0.07], [1980, 0.05, 0.6, 'sine', 0.03]]); vibrate(15) },
  susanLast: () => { seq([[880, 0, 0.1, 'triangle', 0.08], [1175, 0.09, 0.1, 'triangle', 0.08], [1568, 0.18, 0.25, 'triangle', 0.08]]); vibrate(10) },
  susanTick: () => { seq([[440, 0, 0.07, 'square', 0.05]]) },
  // BIRDSEYE: sling release, the bird's tap ability, impact thud scaled by
  // impulse, a block breaking (glass rings higher) and a scarecrow popping.
  birdLaunch: (power = 0.5) => { seq([[300 + power * 500, 0, 0.06, 'triangle', 0.1], [500 + power * 700, 0.05, 0.08, 'sine', 0.06]]); vibrate(10) },
  birdAbility: () => { seq([[660, 0, 0.04, 'square', 0.07], [990, 0.04, 0.06, 'square', 0.06]]); vibrate(6) },
  birdThud: (impulse = 10) => { const k = Math.min(1, impulse / 40); seq([[110 - k * 40, 0, 0.1, 'sawtooth', 0.06 + k * 0.08]]); vibrate(6 + Math.round(k * 20)) },
  blockBreak: (glass = false) => { try { noise(ctx().currentTime, glass ? 0.12 : 0.18, glass ? 0.06 : 0.08, glass ? 3200 : 700) } catch { /* audio unavailable */ } vibrate(8) },
  crowPop: () => { seq([[520, 0, 0.05, 'square', 0.09], [780, 0.05, 0.08, 'triangle', 0.08]]); vibrate([0, 20, 30, 20]) },
  // Sticky Fingers: a glove closing, loot into a safe (bigger for bills and
  // gems), a bill ripping, a coin slipping free, the dye pack going off, the
  // clock's last-seconds tick and the LAST CALL sting.
  stickyGrab: () => { seq([[520, 0, 0.04, 'square', 0.04]]); vibrate(6) },
  stickyCash: (big = false) => {
    seq(big ? [[880, 0, 0.07, 'square', 0.09], [1318, 0.06, 0.14, 'square', 0.09]] : [[880, 0, 0.06, 'square', 0.07], [1175, 0.05, 0.08, 'square', 0.06]])
    vibrate(big ? 14 : 8)
  },
  stickyRip: () => { try { noise(ctx().currentTime, 0.16, 0.08, 2400) } catch { /* audio unavailable */ } seq([[900, 0, 0.12, 'sawtooth', 0.05]]); vibrate(18) },
  stickySlip: () => { seq([[330, 0, 0.08, 'triangle', 0.07], [220, 0.05, 0.08, 'triangle', 0.05]]); vibrate(10) },
  stickyDye: () => { seq([[160, 0, 0.28, 'sawtooth', 0.11], [110, 0.1, 0.25, 'sawtooth', 0.08]]); vibrate([0, 40, 50, 40]) },
  stickyTick: () => { seq([[660, 0, 0.05, 'square', 0.05]]) },
  stickyLast: () => { seq([[660, 0, 0.07, 'square', 0.08], [990, 0.08, 0.14, 'square', 0.08]]); vibrate([0, 20, 40, 20]) },
  // Archery: draw, loose and hit taps (shell only, behind the HAPTICS switch).
  archeryDraw: () => { seq([[520, 0, 0.035, 'sine', 0.04]]); vibrate(4) },
  archeryLoose: () => { seq([[760, 0, 0.045, 'triangle', 0.08], [1120, 0.035, 0.06, 'sine', 0.05]]); vibrate(8) },
  archeryHit: (score = 0) => {
    if (score > 0) seq([[440 + score * 42, 0, 0.07, 'square', 0.1]])
    else seq([[180, 0, 0.08, 'sawtooth', 0.08]])
    vibrate(score > 8 ? 10 : 5)
  },
  // Darts: the throw's whoosh, the thud into the sisal, a miss off the board.
  dartThrow: () => { try { noise(ctx().currentTime, 0.16, 0.05, 2600) } catch { /* audio unavailable */ } vibrate(4) },
  dartThud: (big = false) => {
    try { noise(ctx().currentTime, 0.09, big ? 0.14 : 0.1, big ? 900 : 1500) } catch { /* audio unavailable */ }
    seq([[big ? 110 : 150, 0, 0.12, 'sine', 0.2]])
    vibrate(big ? 18 : 10)
  },
  dartMiss: () => {
    try { noise(ctx().currentTime, 0.12, 0.08, 500) } catch { /* audio unavailable */ }
    seq([[90, 0, 0.18, 'triangle', 0.12]])
    vibrate(30)
  },
  // Bamboozle: a wall rattles, the poles land, a dodger is hit or knocked out, cover cracks and lands.
  bzTick:  () => { seq([[760, 0, 0.04, 'triangle', 0.07]]) },
  bzWarn:  () => { seq([[520, 0, 0.07, 'triangle', 0.12], [500, 0.14, 0.07, 'triangle', 0.12]]); try { noise(ctx().currentTime, 0.25, 0.06, 500) } catch { /* audio unavailable */ } vibrate(6) },
  bzThunk: () => { seq([[130, 0, 0.22, 'sine', 0.3], [48, 0, 0.2, 'sine', 0.18]]); try { noise(ctx().currentTime, 0.16, 0.12, 900) } catch { /* audio unavailable */ } vibrate(12) },
  bzOuch:  () => { seq([[420, 0, 0.2, 'square', 0.12], [110, 0.08, 0.14, 'square', 0.08]]); vibrate([0, 40, 30, 40]) },
  bzOut:   () => { seq([[300, 0.1, 0.45, 'square', 0.12], [60, 0.2, 0.3, 'sawtooth', 0.08]]); vibrate([0, 60, 40, 120]) },
  bzCoin:  () => { seq([[880, 0, 0.06, 'square', 0.1], [1320, 0.06, 0.1, 'square', 0.1]]); vibrate(5) },
  bzHeal:  () => { seq([[520, 0.1, 0.12, 'triangle', 0.14], [780, 0.2, 0.12, 'triangle', 0.14], [1040, 0.3, 0.16, 'triangle', 0.14]]); vibrate([0, 15, 20, 25]) },
  bzCrack: () => { try { noise(ctx().currentTime, 0.3, 0.1, 1600) } catch { /* audio unavailable */ } seq([[210, 0, 0.1, 'sawtooth', 0.06]]); vibrate(14) },
  bzLand:  () => { seq([[90, 0, 0.15, 'sine', 0.3]]); vibrate(6) },
  bzGrab:  () => { seq([[180, 0, 0.08, 'square', 0.12], [360, 0.05, 0.08, 'square', 0.1]]); vibrate(10) },
  bzThrow: () => { try { noise(ctx().currentTime, 0.14, 0.1, 2400) } catch { /* audio unavailable */ } seq([[240, 0, 0.1, 'sawtooth', 0.08]]); vibrate(12) },
  // Soft two-note pop — default emoji reaction audio (haptics via reaction())
  emote: () => emoteAudio(),
  // Breathy descending hiss — shh reaction audio (haptics via reaction())
  shh:   () => shhAudio(),
  // Per-glyph reaction SFX + matched haptic pattern
  reaction(glyph, { volume = 1 } = {}) {
    if (_reactionMuted) return
    const previousVolumeScale = _reactionVolumeScale
    const previousPitchScale = _reactionPitchScale
    _reactionVolumeScale = Math.max(0, Math.min(1, Number(volume) || 1))
    _reactionPitchScale = 0.97 + Math.random() * 0.06
    try {
      playReactionAudio(glyph)
      playReactionHaptic(glyph)
    } finally {
      _reactionVolumeScale = previousVolumeScale
      _reactionPitchScale = previousPitchScale
    }
  },
  // Quick-chat chip — short bright tick, distinct from emoji reaction
  chatChip() {
    seq([[900, 0, 0.04, 'square', 0.09], [1200, 0.04, 0.05, 'sine', 0.08]])
    vibrate(10)
  },
  isMuted: ()  => _muted,
  isReactionMuted: () => _reactionMuted,
  toggleReactionMute() {
    _reactionMuted = !_reactionMuted
    localStorage.setItem('reactionSfx', _reactionMuted ? 'off' : 'on')
    return _reactionMuted
  },
  getVolume: () => _volume,
  setVolume(value) {
    _volume = Math.max(0, Math.min(1, Number(value) || 0))
    localStorage.setItem('sfxVolume', String(_volume))
    return _volume
  },
  toggle() {
    _muted = !_muted
    localStorage.setItem('sfx', _muted ? 'off' : 'on')
    return _muted
  },
  // Settings → Reset all: back to full volume, everything unmuted.
  resetAudioDefaults() {
    _muted = false
    _reactionMuted = false
    _volume = 1
    localStorage.setItem('sfx', 'on')
    localStorage.setItem('reactionSfx', 'on')
    localStorage.setItem('sfxVolume', '1')
  },
}

function emoteAudio() {
  seq([[660, 0, 0.05, 'sine', 0.1], [990, 0.05, 0.07, 'sine', 0.08]])
}

function shhAudio() {
  if (_muted) return
  try {
    const c = ctx()
    const start = c.currentTime
    const dur = 0.46
    const n = Math.max(1, Math.floor(c.sampleRate * dur))
    const buffer = c.createBuffer(1, n, c.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < n; i++) {
      const breath = 1 - i / n
      data[i] = (Math.random() * 2 - 1) * (0.55 + Math.random() * 0.45) * breath
    }

    const src = c.createBufferSource()
    const highpass = c.createBiquadFilter()
    const bandpass = c.createBiquadFilter()
    const gain = c.createGain()

    src.buffer = buffer
    highpass.type = 'highpass'
    highpass.frequency.setValueAtTime(1800 * _reactionPitchScale, start)
    bandpass.type = 'bandpass'
    bandpass.frequency.setValueAtTime(3600 * _reactionPitchScale, start)
    bandpass.Q.setValueAtTime(1.8, start)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.linearRampToValueAtTime(0.055 * _volume * _reactionVolumeScale, start + 0.025)
    gain.gain.setValueAtTime(0.045 * _volume * _reactionVolumeScale, start + 0.28)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)

    src.connect(highpass)
    highpass.connect(bandpass)
    bandpass.connect(gain)
    gain.connect(c.destination)
    src.start(start)
    src.stop(start + dur)
  } catch { /* audio unavailable */ }
}

const DEFAULT_REACTION_HAPTIC = [0, 8, 8]

// Distinct haptic patterns (navigator.vibrate syntax) per emoji — audio lives in REACTION_SOUNDS.
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
