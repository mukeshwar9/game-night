// Ambient soundscapes for the music engine: tracks that are not sequenced
// loops but a texture, played on the same bus as any track so the music
// switch, volume, ducking and hidden-tab rules all apply unchanged.
// Loaded with the engine (musicEngine.js), so none of it is in the entry
// bundle. The timing maths is pure and tested in beachLogic.js.
//
// 'shore' (SHORELINE theme menus): surf whose swell follows the backdrop's
// waves (one shared clock, see washPhase), plus gull calls now and then.

import { WASH_SECONDS, gullDelay, nextWaveAt, surfEnvelope } from './beachLogic'

const LEVEL = 0.55        // overall surf level under the music bus
const SCHEDULE_AHEAD = 1.5
const PUMP_MS = 500

function noiseBuffer(ctx, seconds, brown) {
  const n = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(2, n, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let last = 0
    for (let i = 0; i < n; i++) {
      const r = Math.random() * 2 - 1
      if (brown) { last = (last + 0.02 * r) / 1.02; d[i] = last * 3.5 } else d[i] = r
    }
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

// Where the page clock (performance.now) is at the audio clock's `now`, so the
// surf lines up with the CSS waves started from the same clock.
function clockPair(ctx) {
  const ts = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null
  if (ts && ts.performanceTime > 0) return [ts.contextTime, ts.performanceTime]
  return [ctx.currentTime, typeof performance === 'undefined' ? 0 : performance.now()]
}

function createShore(ctx, out) {
  const body = ctx.createBiquadFilter()
  body.type = 'lowpass'
  body.Q.value = 0.4
  const bodyGain = ctx.createGain()
  const fizz = ctx.createBiquadFilter()
  fizz.type = 'bandpass'
  fizz.frequency.value = 4200
  fizz.Q.value = 0.6
  const fizzGain = ctx.createGain()
  const sources = [loop(ctx, noiseBuffer(ctx, 4, true)), loop(ctx, noiseBuffer(ctx, 2, false))]
  sources[0].connect(body)
  body.connect(bodyGain)
  bodyGain.connect(out)
  sources[1].connect(fizz)
  fizz.connect(fizzGain)
  fizzGain.connect(out)

  const env = surfEnvelope(WASH_SECONDS)
  const rest = env.body[0]
  bodyGain.gain.setValueAtTime(rest.gain * LEVEL, ctx.currentTime)
  body.frequency.setValueAtTime(rest.cutoff, ctx.currentTime)
  fizzGain.gain.setValueAtTime(0, ctx.currentTime)

  const [contextTime, performanceTime] = clockPair(ctx)
  let next = nextWaveAt(contextTime, performanceTime)
  function wave(t0) {
    for (const p of env.body) {
      bodyGain.gain.linearRampToValueAtTime(p.gain * LEVEL, t0 + p.at)
      body.frequency.exponentialRampToValueAtTime(p.cutoff, t0 + p.at)
    }
    for (const p of env.fizz) fizzGain.gain.linearRampToValueAtTime(p.gain * LEVEL, t0 + p.at)
  }
  function pump() {
    while (next < ctx.currentTime + SCHEDULE_AHEAD) {
      wave(next)
      next += WASH_SECONDS
    }
  }
  pump()
  const pumpTimer = setInterval(pump, PUMP_MS)

  // A burst of 2-4 gull calls: a gliding, warbling triangle, panned at random.
  function gulls() {
    const t = ctx.currentTime + 0.05
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1900
    bp.Q.value = 1.2
    if (pan) { pan.pan.value = Math.random() * 1.4 - 0.7; bp.connect(pan); pan.connect(out) } else bp.connect(out)
    const calls = 2 + Math.floor(Math.random() * 3)
    for (let i = 0; i < calls; i++) {
      const s = t + i * (0.32 + Math.random() * 0.12), d = 0.24 + Math.random() * 0.1
      const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain()
      const f = 1500 + Math.random() * 300
      o.type = 'triangle'
      o.frequency.setValueAtTime(f * 0.8, s)
      o.frequency.linearRampToValueAtTime(f * 1.35, s + d * 0.25)
      o.frequency.exponentialRampToValueAtTime(f * 0.7, s + d)
      lfo.frequency.value = 28
      depth.gain.value = 70
      lfo.connect(depth)
      depth.connect(o.frequency)
      g.gain.setValueAtTime(0.0001, s)
      g.gain.linearRampToValueAtTime(0.1 * (i ? 0.8 : 1), s + 0.03)
      g.gain.exponentialRampToValueAtTime(0.0001, s + d)
      o.connect(g)
      g.connect(bp)
      o.start(s)
      lfo.start(s)
      o.stop(s + d + 0.05)
      lfo.stop(s + d + 0.05)
    }
  }
  let gullTimer = null
  const scheduleGulls = () => { gullTimer = setTimeout(() => { gulls(); scheduleGulls() }, gullDelay(Math.random()) * 1000) }
  scheduleGulls()

  return {
    // The engine has already faded the bus; release everything once silent.
    stop() {
      clearInterval(pumpTimer)
      clearTimeout(gullTimer)
      for (const s of sources) { try { s.stop() } catch { /* already stopped */ } }
      bodyGain.disconnect()
      fizzGain.disconnect()
    },
  }
}

/** Ambient track id -> factory(ctx, outputNode) -> { stop() }. */
export const AMBIENCES = { shore: createShore }
