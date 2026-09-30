// WIRE CROSSED module: PULSE. A lamp flashes a colour pattern, pauses, and
// repeats. The manual is a codebook that maps patterns to frequencies; the
// Tech tunes the dial to the matching frequency and presses TX.
//
// Tier I: 8 entries of 4 flashes, no two sharing a 2-flash prefix. Tier II: 12
// entries with shared prefixes, and the lamp's pattern has a rotation that is
// also in the codebook (the mid-loop trap: start reading late and you land on
// the wrong entry). Tier III: 12 entries of 5 flashes, and the lamp uses long
// flashes. A long flash counts as two of that colour ("R— B G" = R R B G). The
// manual lists the expanded forms; the device shows long and short flashes.
//
// The flash timeline is a pure function of (module, armedAt, now): the caller
// passes server time so both screens (and spectators) agree. One loop is
// PAUSE_MS of dark, then the flashes. The pause marks the start of a pattern.
//
// Progress is `mods[i] = { touched, last }` (the last frequency sent). A right
// frequency solves the module; a wrong one is a strike.
//
// Pure — no DOM, no Firebase, no React.
import { int, sample, shuffle } from '../rng'
import { COLOR_LETTERS } from '../shell'

export const PULSE_COLORS = ['red', 'blue', 'green', 'yellow']
export const PULSE_ENTRIES = { 1: 8, 2: 12, 3: 12 }
/** Expanded pattern length (a long flash counts as two). */
export const PULSE_LENGTH = { 1: 4, 2: 4, 3: 5 }
export const SHORT_ON_MS = 450
export const LONG_ON_MS = 1000
export const OFF_MS = 250
export const PAUSE_MS = 1600
const PREFIX = 2

const LETTERS = PULSE_COLORS.map(c => COLOR_LETTERS[c])
const COLOR_OF = Object.fromEntries(PULSE_COLORS.map(c => [COLOR_LETTERS[c], c]))

const rand = (rng, n) => Array.from({ length: n }, () => LETTERS[Math.floor(rng() * LETTERS.length)]).join('')
const rotate = (s, k) => s.slice(k) + s.slice(0, k)

/** Expanded letters of a flash list: a long flash counts as two. */
export const expandFlashes = (flashes) => flashes.map(f => COLOR_LETTERS[f.color].repeat(f.long ? 2 : 1)).join('')

/** Flash list for an expanded pattern. With `allowLong`, adjacent equal letters pair up into long flashes. */
export function toFlashes(pattern, allowLong = false) {
  const out = []
  for (let k = 0; k < pattern.length; k++) {
    const long = allowLong && pattern[k + 1] === pattern[k]
    out.push({ color: COLOR_OF[pattern[k]], long })
    if (long) k++
  }
  return out
}

/** Length of one loop: the pause, then every flash with a gap between flashes. */
export const cycleMs = (module) => {
  const flashes = module.device.flashes
  return PAUSE_MS + flashes.reduce((sum, f) => sum + (f.long ? LONG_ON_MS : SHORT_ON_MS), 0) + OFF_MS * Math.max(0, flashes.length - 1)
}

const DARK = { pause: false, on: false, color: null, long: false, index: -1 }

/**
 * The lamp at server time `now` for a module armed at `armedAt`.
 * `{ pause: true, ... }` during the pause. Otherwise `index` is the flash in
 * progress (or the one that just ended, when `on` is false).
 */
export function flashAt(module, armedAt, now) {
  const flashes = module.device.flashes
  const cycle = cycleMs(module)
  const elapsed = Number.isFinite(armedAt) && Number.isFinite(now) ? Math.max(0, now - armedAt) : 0
  let t = elapsed % cycle
  if (t < PAUSE_MS) return { ...DARK, pause: true }
  t -= PAUSE_MS
  for (let index = 0; index < flashes.length; index++) {
    const { color, long } = flashes[index]
    const on = long ? LONG_ON_MS : SHORT_ON_MS
    if (t < on) return { pause: false, on: true, color, long, index }
    t -= on
    if (index < flashes.length - 1) {
      if (t < OFF_MS) return { pause: false, on: false, color, long, index }
      t -= OFF_MS
    }
  }
  /* c8 ignore next */
  return { ...DARK, pause: true }
}

const byNumber = (a, b) => Number(a) - Number(b)

function genPatterns(rng, tier) {
  const length = PULSE_LENGTH[tier] ?? PULSE_LENGTH[1]
  const count = PULSE_ENTRIES[tier] ?? PULSE_ENTRIES[1]
  if (tier <= 1) {
    const prefixes = sample(rng, LETTERS.flatMap(a => LETTERS.map(b => a + b)), count)
    const patterns = prefixes.map(p => p + rand(rng, length - PREFIX))
    return { patterns, target: patterns[Math.floor(rng() * patterns.length)] }
  }
  for (let attempt = 0; attempt < 500; attempt++) {
    let target = rand(rng, length)
    if (tier >= 3) {
      const at = int(rng, 0, length - 2)
      target = target.slice(0, at + 1) + target[at] + target.slice(at + 2)
    }
    const twin = rotate(target, int(rng, 1, length - 1))
    if (twin === target) continue
    const set = new Set([target, twin])
    for (let k = 0; k < 2; k++) {
      for (let tries = 0; tries < 20; tries++) {
        const sibling = target.slice(0, PREFIX) + rand(rng, length - PREFIX)
        if (!set.has(sibling)) { set.add(sibling); break }
      }
    }
    while (set.size < count) set.add(rand(rng, length))
    return { patterns: shuffle(rng, [...set]), target }
  }
  /* c8 ignore next */
  throw new Error('pulse pattern generation failed')
}

function genFrequencies(rng, n) {
  const seen = new Set()
  while (seen.size < n) seen.add((int(rng, 300, 999) / 100).toFixed(2))
  return [...seen]
}

export default {
  type: 'pulse',
  name: 'PULSE',
  maxTier: 3,

  generate(rng, tier = 1) {
    const { patterns, target } = genPatterns(rng, tier)
    const freqs = genFrequencies(rng, patterns.length)
    const entries = patterns.map((pattern, k) => ({ pattern, freq: freqs[k] }))
    const answer = entries.find(e => e.pattern === target).freq
    const device = { flashes: toFlashes(target, tier >= 3), freqs: [...freqs].sort(byNumber) }
    return { type: 'pulse', tier, device, manual: { entries }, answer }
  },

  judge(module, bomb, wire, i, action) {
    if (action.kind !== 'tx') return null
    const freq = String(action.freq)
    if (!module.device.freqs.includes(freq)) return null
    const ok = freq === module.answer
    return {
      ok,
      solved: ok,
      progress: { touched: true, last: freq },
      text: ok ? `TRANSMITTED ${freq} MHZ` : `TRANSMITTED ${freq} MHZ — WRONG FREQUENCY`,
    }
  },

  solveNext(module, bomb, wire, i) {
    return { mod: i, kind: 'tx', freq: module.answer }
  },
}
