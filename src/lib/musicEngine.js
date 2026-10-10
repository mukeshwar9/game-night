// Background-music engine: a small lookahead step sequencer on WebAudio,
// playing the procedural loops in musicTracks.js. Loaded lazily by music.js
// the first time music starts, so none of it is in the entry bundle.
//
// Graph: voices -> track bus (A/B crossfade) -> duck (dips under SFX)
//        -> compressor -> music gain (player volume) -> destination
// Tracks with `delay` add an echo send on their own bus. Ambient tracks
// (musicAmbience.js, e.g. SHORELINE's surf) have no sequence: they play a
// texture into an ordinary bus, so they crossfade, duck and follow the
// volume like any loop.
//
// Same oscillator vocabulary as sounds.js (NES-style pulse, triangle, noise),
// so music and SFX sound like one console.

import TRACKS from './musicTracks'
import { AMBIENCES } from './musicAmbience'
import { chordTones, hz, volumeToGain } from './musicLogic'

const LOOKAHEAD = 0.2   // seconds scheduled ahead of the audio clock
const TICK_MS = 50      // scheduler wake-up interval

export function createMusicEngine(ctx) {
  const music = ctx.createGain()
  const duck = ctx.createGain()
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -18
  comp.ratio.value = 3
  duck.connect(comp)
  comp.connect(music)
  music.connect(ctx.destination)
  music.gain.value = 0

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

  // NES-style pulse widths as Fourier series, built on first use.
  const pulses = {}
  const pulse = (duty) => {
    if (!pulses[duty]) {
      const n = 32, re = new Float32Array(n), im = new Float32Array(n)
      for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty)
      pulses[duty] = ctx.createPeriodicWave(re, im)
    }
    return pulses[duty]
  }

  function tone(bus, { f, t, dur, wave = 'square', duty, vol = 0.1, a = 0.005, r = 0.06, cutoff, send }) {
    const o = ctx.createOscillator(), g = ctx.createGain()
    if (duty) o.setPeriodicWave(pulse(duty))
    else o.type = wave
    o.frequency.setValueAtTime(f, t)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + a)
    g.gain.setValueAtTime(vol, t + Math.max(a, dur - r))
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    let node = o
    if (cutoff) {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = cutoff
      lp.Q.value = 2
      o.connect(lp)
      node = lp
    }
    node.connect(g)
    g.connect(bus.gain)
    if (send && bus.delay) g.connect(bus.delay)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  function drum(bus, kind, t, amount) {
    if (kind === 'kick') {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'sine'
      o.frequency.setValueAtTime(140, t)
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12)
      g.gain.setValueAtTime(0.5 * amount, t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
      o.connect(g)
      g.connect(bus.gain)
      o.start(t)
      o.stop(t + 0.2)
      return
    }
    const hat = kind === 'hat'
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain()
    const dur = hat ? 0.035 : 0.12
    src.buffer = noise
    f.type = hat ? 'highpass' : 'bandpass'
    f.frequency.value = hat ? 7000 : 1800
    g.gain.setValueAtTime((hat ? 0.07 : 0.18) * amount, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f)
    f.connect(g)
    g.connect(bus.gain)
    src.start(t, Math.random() * 0.5)
    src.stop(t + dur + 0.01)
  }

  function playStep(tr, bus, step, t, sd) {
    const bar = Math.floor(step / 16) % tr.bars
    const i = step % 16
    // Four-pass arrangement so a short loop doesn't wear thin: two plain
    // passes, one with the lead up an octave on a thin pulse, one without the
    // lead (a breakdown), then around again.
    const pass = Math.floor(step / (16 * tr.bars)) % 4
    const ch = chordTones(tr.chords[bar % tr.chords.length])
    const root = ch[0]

    const bass = (m, len = 1, vol = 0.16) => tone(bus, { f: hz(m), t, dur: sd * len * 0.95, wave: 'triangle', vol, r: 0.03 })
    switch (tr.bass) {
      case 'oct8': if (i % 2 === 0) bass(root - 12 + (i % 4 === 2 ? 12 : 0), 1.8); break
      case 'half': if (i % 8 === 0) bass(root - 12, 7.5, 0.14); break
      case 'whole': if (i === 0) bass(root - 12, 15, 0.12); break
      case 'drive16': bass(root - 12 + (i % 4 === 3 ? 12 : 0), 0.9, 0.15); break
      case 'pulse8': if (i % 2 === 0) tone(bus, { f: hz(root - 12), t, dur: sd * 1.6, duty: 0.5, vol: 0.07, cutoff: 600 }); break
      case 'bounce': if (i % 4 === 0) bass(root - 12, 1.5); else if (i % 4 === 2) bass(root - 5, 1.5, 0.13); break
    }

    const tones = ch.concat(ch.map(m => m + 12))
    switch (tr.arp) {
      case 'up16soft': tone(bus, { f: hz(tones[i % tones.length] + 12), t, dur: sd * 0.8, duty: 0.125, vol: 0.022 }); break
      case 'bell8': if (i % 2 === 0) tone(bus, { f: hz(tones[(i / 2) % tones.length] + 12), t, dur: sd * 2.5, wave: 'sine', vol: 0.05, r: 0.2, send: true }); break
      case 'slow8': if (i % 4 === 2) tone(bus, { f: hz(tones[(i / 2 + bar) % tones.length] + 12), t, dur: sd * 3, wave: 'triangle', vol: 0.05, r: 0.25, send: true }); break
      case 'saw16': tone(bus, { f: hz(tones[[0, 1, 2, 3, 2, 1][i % 6]] + 12), t, dur: sd * 0.7, wave: 'sawtooth', vol: 0.03, cutoff: 1800 + 900 * Math.sin(step / 11), send: true }); break
      case 'stab': if (i % 4 === 2) ch.forEach(m => tone(bus, { f: hz(m + 12), t, dur: sd * 0.9, duty: 0.25, vol: 0.022 })); break
    }
    if (tr.pad && i === 0) {
      const saw = tr.wave === 'sawtooth'
      ch.forEach(m => tone(bus, { f: hz(m + 12), t, dur: sd * 16, wave: saw ? 'sawtooth' : 'sine', vol: saw ? 0.018 : 0.025, a: sd * 3, r: sd * 3, cutoff: 1100 }))
    }

    const n = pass === 3 ? null : tr.lines[bar % tr.lines.length][i]
    if (n) {
      const up = pass === 2 && !tr.wave
      tone(bus, {
        f: hz(n.m + (up ? 12 : 0)), t, dur: sd * n.len * 0.92,
        duty: tr.wave ? undefined : (up ? 0.125 : tr.lead),
        wave: tr.wave || 'square',
        vol: tr.wave === 'triangle' ? 0.1 : tr.wave === 'sawtooth' ? 0.045 : (up ? 0.035 : 0.05),
        cutoff: tr.wave === 'sawtooth' ? 2400 : undefined,
        send: !!tr.delay,
      })
    }

    for (const [kind, hits] of Object.entries(tr.hits)) if (hits[i]) drum(bus, kind, t, hits[i])
  }

  function makeBus(tr) {
    const gain = ctx.createGain()
    gain.gain.value = 0.0001
    gain.connect(duck)
    const bus = { gain, delay: null }
    if (tr.delay) {
      const d = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain()
      d.delayTime.value = tr.delay
      fb.gain.value = 0.32
      wet.gain.value = 0.45
      d.connect(fb)
      fb.connect(d)
      d.connect(wet)
      wet.connect(gain)
      bus.delay = d
    }
    return bus
  }

  let current = null   // { id, bus, step, next }
  let fading = []      // players fading out: { ..., stopAt }
  let timer = null
  const ducked = { depth: 1, until: 0 }

  function tick() {
    const now = ctx.currentTime
    for (const p of current ? [current, ...fading] : fading) {
      if (p.ambience) continue
      const tr = TRACKS[p.id], sd = 60 / tr.bpm / 4
      // After a stall (hidden tab, long frame) skip ahead instead of
      // machine-gunning every missed step at once.
      if (p.next < now - 0.1) {
        const missed = Math.ceil((now - p.next) / sd)
        p.step += missed
        p.next += missed * sd
      }
      while (p.next < now + LOOKAHEAD && (!p.stopAt || p.next < p.stopAt)) {
        const swing = p.step % 2 === 1 ? tr.swing * sd : 0
        playStep(tr, p.bus, p.step, p.next + swing, sd)
        p.step++
        p.next += sd
      }
    }
    fading = fading.filter(p => {
      if (p.stopAt > now) return true
      setTimeout(() => { p.ambience?.stop(); p.bus.gain.disconnect() }, 500)
      return false
    })
    if (!current && fading.length === 0) {
      clearInterval(timer)
      timer = null
    }
  }

  return {
    get current() { return current?.id ?? null },
    // Loop length in seconds (without the four-pass arrangement).
    seconds: (id) => TRACKS[id]?.seconds ?? 0,
    // Crossfades to `id` (null = silence). Same track: keeps playing.
    play(id, { fade = 1.2 } = {}) {
      if ((current?.id ?? null) === (id ?? null)) return
      if (id && !TRACKS[id] && !AMBIENCES[id]) return
      const now = ctx.currentTime
      if (current) {
        const g = current.bus.gain.gain
        g.cancelScheduledValues(now)
        g.setValueAtTime(Math.max(0.0001, g.value), now)
        g.exponentialRampToValueAtTime(0.0001, now + fade)
        current.stopAt = now + fade
        fading.push(current)
        current = null
      }
      if (id) {
        const bus = makeBus(TRACKS[id] ?? {})
        bus.gain.gain.setValueAtTime(0.0001, now)
        bus.gain.gain.exponentialRampToValueAtTime(1, now + fade)
        const ambience = AMBIENCES[id] ? AMBIENCES[id](ctx, bus.gain) : null
        current = { id, bus, ambience, step: 0, next: now + 0.06 }
      }
      if (!timer && (current || fading.length)) timer = setInterval(tick, TICK_MS)
      tick()
    },
    setVolume(v) {
      music.gain.setTargetAtTime(volumeToGain(v), ctx.currentTime, 0.05)
    },
    // Dip to `depth` (0..1 of full) for `hold` seconds, then recover. A
    // lighter or shorter dip during a deeper one (a move blip inside the win
    // fanfare) leaves the deeper one alone.
    duck(depth, hold) {
      const t = ctx.currentTime
      if (t < ducked.until) {
        if (depth >= ducked.depth && t + hold <= ducked.until) return
        depth = Math.min(depth, ducked.depth)
        hold = Math.max(hold, ducked.until - t)
      }
      ducked.depth = depth
      ducked.until = t + 0.03 + hold
      const g = duck.gain
      g.cancelScheduledValues(t)
      g.setValueAtTime(g.value, t)
      g.linearRampToValueAtTime(depth, t + 0.03)
      g.setValueAtTime(depth, ducked.until)
      g.linearRampToValueAtTime(1, ducked.until + 0.4)
    },
  }
}
