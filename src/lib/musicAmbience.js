// Ambient soundscapes for the music engine: tracks that are not sequenced
// loops but a texture, played on the same bus as any track so the music
// switch, volume, ducking and hidden-tab rules all apply unchanged.
// Loaded with the engine (musicEngine.js), so none of it is in the entry
// bundle. The timing maths is pure and tested in beachLogic.js.
//
// 'shore' (SHORELINE theme menus): layered surf whose swell follows the
// backdrop's waves (one shared clock, see washPhase): a low rumble as each
// wave breaks, the rush of water up the sand, the foam hiss as it drains, a
// distant bed of sea that rises and falls in slow swells, and far-off gulls
// now and then. Only looping noise buffers, filters and gains: no script
// processing, so it costs almost nothing on the shared audio context.

import { WASH_SECONDS, gullDelay, nextWaveAt, seamlessLoop, surfEnvelope, waveStrength } from './beachLogic'

const LEVEL = 0.72        // overall surf level under the music bus
const SCHEDULE_AHEAD = 1.5
const PUMP_MS = 500
const SWELL_HZ = 1 / 23   // the distant sea's slow rise and fall
const GULL_LEVEL = 0.08

// Noise for one layer, made to loop without a click. `colour` picks white,
// pink (Paul Kellet's economy filter) or brown (integrated) noise. Each
// channel is drawn separately, so the sea is wide in stereo; layers use
// different lengths so their loops never line up into an audible pattern.
function noiseBuffer(ctx, seconds, colour) {
  const fade = Math.floor(ctx.sampleRate * 0.25)
  const n = Math.floor(ctx.sampleRate * seconds) + fade
  const buf = ctx.createBuffer(2, n - fade, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = new Float32Array(n)
    let b0 = 0, b1 = 0, b2 = 0, last = 0
    for (let i = 0; i < n; i++) {
      const r = Math.random() * 2 - 1
      if (colour === 'brown') { last = (last + 0.02 * r) / 1.02; d[i] = last * 3.5 }
      else if (colour === 'pink') {
        b0 = 0.99765 * b0 + r * 0.099046
        b1 = 0.963 * b1 + r * 0.2965164
        b2 = 0.57 * b2 + r * 1.0526913
        d[i] = (b0 + b1 + b2 + r * 0.1848) * 0.11
      } else d[i] = r
    }
    buf.copyToChannel(seamlessLoop(d, fade), ch)
  }
  return buf
}

function loop(ctx, buffer) {
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  src.start()
  return src
}

function filter(ctx, type, frequency, Q) {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = frequency
  if (Q != null) f.Q.value = Q
  return f
}

// Where the page clock (performance.now) is at the audio clock's `now`, so the
// surf lines up with the CSS waves started from the same clock.
function clockPair(ctx) {
  const ts = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null
  if (ts && ts.performanceTime > 0) return [ts.contextTime, ts.performanceTime]
  return [ctx.currentTime, typeof performance === 'undefined' ? 0 : performance.now()]
}

function createShore(ctx, out) {
  const nodes = []
  const chain = (...ns) => { for (let i = 1; i < ns.length; i++) ns[i - 1].connect(ns[i]); nodes.push(...ns.filter(n => n !== out)) }
  const t0 = ctx.currentTime

  // The breaking wave: brown noise through a low-pass that opens as it breaks.
  const body = filter(ctx, 'lowpass', 320, 0.5)
  const bodyGain = ctx.createGain()
  // The rush up the sand: pink noise in the middle of the band.
  const wash = filter(ctx, 'bandpass', 950, 0.55)
  const washGain = ctx.createGain()
  // The foam: white noise, high and airy, drifting across the stereo field.
  const fizzHp = filter(ctx, 'highpass', 2600, 0.5)
  const fizzLp = filter(ctx, 'lowpass', 9000, 0.3)
  const fizzGain = ctx.createGain()
  const fizzPan = ctx.createStereoPanner ? ctx.createStereoPanner() : null
  // The distant sea: a low bed that swells and settles over ~23 s.
  const bed = filter(ctx, 'lowpass', 240, 0.4)
  const bedGain = ctx.createGain()
  const swell = ctx.createOscillator()
  const swellDepth = ctx.createGain()

  const sources = [
    loop(ctx, noiseBuffer(ctx, 9.7, 'brown')),
    loop(ctx, noiseBuffer(ctx, 7.3, 'pink')),
    loop(ctx, noiseBuffer(ctx, 5.1, 'white')),
    loop(ctx, noiseBuffer(ctx, 11.3, 'brown')),
  ]
  chain(sources[0], body, bodyGain, out)
  chain(sources[1], wash, washGain, out)
  if (fizzPan) chain(sources[2], fizzHp, fizzLp, fizzGain, fizzPan, out)
  else chain(sources[2], fizzHp, fizzLp, fizzGain, out)
  chain(sources[3], bed, bedGain, out)
  bedGain.gain.setValueAtTime(0.22 * LEVEL, t0)
  swell.frequency.value = SWELL_HZ
  swellDepth.gain.value = 0.09 * LEVEL
  chain(swell, swellDepth)
  swellDepth.connect(bedGain.gain)
  swell.start()

  const rest = surfEnvelope(WASH_SECONDS)
  bodyGain.gain.setValueAtTime(rest.body[0].gain * LEVEL, t0)
  body.frequency.setValueAtTime(rest.body[0].cutoff, t0)
  washGain.gain.setValueAtTime(rest.wash[0].gain * LEVEL, t0)
  fizzGain.gain.setValueAtTime(0, t0)

  const [contextTime, performanceTime] = clockPair(ctx)
  let next = nextWaveAt(contextTime, performanceTime)
  function wave(start) {
    const env = surfEnvelope(WASH_SECONDS, waveStrength(Math.random()))
    for (const p of env.body) {
      bodyGain.gain.linearRampToValueAtTime(p.gain * LEVEL, start + p.at)
      body.frequency.exponentialRampToValueAtTime(p.cutoff, start + p.at)
    }
    for (const p of env.wash) washGain.gain.linearRampToValueAtTime(p.gain * LEVEL, start + p.at)
    for (const p of env.fizz) fizzGain.gain.linearRampToValueAtTime(p.gain * LEVEL, start + p.at)
    // Each wave's foam drains a little left or right of the last.
    if (fizzPan) fizzPan.pan.linearRampToValueAtTime(Math.random() * 0.8 - 0.4, start + env.fizz[1].at)
  }
  function pump() {
    while (next < ctx.currentTime + SCHEDULE_AHEAD) {
      wave(next)
      next += WASH_SECONDS
    }
  }
  pump()
  const pumpTimer = setInterval(pump, PUMP_MS)

  // Gulls, far off: softened by a low-pass and a short echo off the water,
  // shared by every call.
  const gullIn = filter(ctx, 'bandpass', 1800, 1.1)
  const gullSoft = filter(ctx, 'lowpass', 3200, 0.5)
  const gullOut = ctx.createGain()
  gullOut.gain.value = GULL_LEVEL
  const echo = ctx.createDelay(1)
  echo.delayTime.value = 0.19
  const echoBack = ctx.createGain()
  echoBack.gain.value = 0.28
  const echoTone = filter(ctx, 'lowpass', 1800, 0.4)
  chain(gullIn, gullSoft, gullOut, out)
  chain(gullSoft, echo, echoTone, echoBack, echo)
  echoBack.connect(gullOut)

  // One burst: 2-4 "kee-ow" calls, a glide up then a long fall with a
  // warble, from one spot in the sky.
  function gulls() {
    const t = ctx.currentTime + 0.05
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null
    const into = pan || gullIn
    if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; pan.connect(gullIn) }
    const calls = 2 + Math.floor(Math.random() * 3)
    let s = t
    for (let i = 0; i < calls; i++) {
      const d = 0.28 + Math.random() * 0.14
      const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain()
      const f = 1350 + Math.random() * 350
      o.type = 'triangle'
      o.frequency.setValueAtTime(f * 0.75, s)
      o.frequency.linearRampToValueAtTime(f * 1.3, s + d * 0.2)
      o.frequency.exponentialRampToValueAtTime(f * 0.62, s + d)
      lfo.frequency.value = 22 + Math.random() * 10
      depth.gain.value = 55
      lfo.connect(depth)
      depth.connect(o.frequency)
      const level = i ? 0.75 + Math.random() * 0.2 : 1
      g.gain.setValueAtTime(0.0001, s)
      g.gain.exponentialRampToValueAtTime(level, s + 0.04)
      g.gain.linearRampToValueAtTime(level * 0.6, s + d * 0.45)
      g.gain.exponentialRampToValueAtTime(0.0001, s + d)
      o.connect(g)
      g.connect(into)
      o.start(s)
      lfo.start(s)
      o.stop(s + d + 0.05)
      lfo.stop(s + d + 0.05)
      s += d + 0.06 + Math.random() * 0.12
    }
    // Let the panner go once the last call and its echo have died away.
    if (pan) setTimeout(() => pan.disconnect(), (s - ctx.currentTime + 2) * 1000)
  }
  let gullTimer = null
  const scheduleGulls = () => { gullTimer = setTimeout(() => { gulls(); scheduleGulls() }, gullDelay(Math.random()) * 1000) }
  scheduleGulls()

  return {
    // The engine has already faded the bus; release everything once silent.
    stop() {
      clearInterval(pumpTimer)
      clearTimeout(gullTimer)
      for (const s of [...sources, swell]) { try { s.stop() } catch { /* already stopped */ } }
      for (const n of nodes) n.disconnect()
    },
  }
}

/** Ambient track id -> factory(ctx, outputNode) -> { stop() }. */
export const AMBIENCES = { shore: createShore }
