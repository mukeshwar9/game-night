// WIRE CROSSED module: SWITCHBOARD. A row of toggles, each with a light (R, Y,
// G, B or dark) and a position (▲ up, ▼ down). The manual has three target
// rules read top to bottom (the first that matches the lights wins, the last is
// "otherwise"); the Tech must reach that target board. Short circuits are board
// states that are never allowed, not even on the way, and tier III adds a lock
// ("switch 5 is locked until switch 3 is ▲"), so the order of the flips matters.
//
// Tier I: 4 switches. Tier II: 5 switches, 2 short circuits. Tier III: 5
// switches, 3 short circuits and 1 lock.
//
// Switch `k` is 0-based; the manual and panel say "switch k+1". Progress is
// `mods[i] = { touched, sw }` where `sw` is a bitmask (bit k = switch k+1 is
// ▲). Firebase drops empty values, so an untouched module reads the start
// state from `device.start`, `touched` marks the rest, and a missing `sw` on a
// touched module reads as 0 (every switch ▼).
//
// Pure — no DOM, no Firebase, no React.
import { int, pick, sample, shuffle } from '../rng'
import { COLOR_NAMES } from '../shell'

export const SWITCH_COUNTS = { 1: 4, 2: 5, 3: 5 }
export const SHORT_COUNTS = { 1: 0, 2: 2, 3: 3 }
export const LIGHT_COLORS = ['red', 'yellow', 'green', 'blue']
/** Chance a generated light is dark. */
const DARK_ODDS = 0.25

const bit = (k) => 1 << k
const validSwitch = (k, n) => Number.isInteger(k) && k >= 0 && k < n
const popcount = (v) => { let c = 0; for (let x = v; x; x >>= 1) c += x & 1; return c }

/** Does target-rule condition `cond` hold for the lights of `module`? */
export function condHolds(cond, module) {
  const lights = module.device.lights
  if (cond.kind === 'colorCount') return lights.filter(l => cond.colors.includes(l)).length >= cond.min
  if (cond.kind === 'dark') return lights[cond.sw] == null
  if (cond.kind === 'color') return lights[cond.sw] === cond.color
  return false
}

/** The target board (bitmask): the first rule whose condition holds; the last rule is "otherwise". */
export function switchTarget(module) {
  const { rules } = module.manual
  const hit = rules.find(rule => rule.cond == null || condHolds(rule.cond, module))
  return hit.target
}

const listColors = (colors) => colors.map(c => COLOR_NAMES[c]).join(' or ')

export function describeCond(cond) {
  if (cond.kind === 'colorCount') return `two or more lights ${listColors(cond.colors)}`
  if (cond.kind === 'dark') return `light ${cond.sw + 1} dark`
  if (cond.kind === 'color') return `light ${cond.sw + 1} ${COLOR_NAMES[cond.color]}`
  return 'otherwise'
}

const arrow = (up) => (up ? '▲' : '▼')

/** "switches 3 and 4 both ▲", "switch 2 ▲ and switch 4 ▼", "switches 1, 2 and 5 all ▼". */
export function describeShort(short) {
  const ids = short.sw.map(k => k + 1)
  if (short.up.every(u => u === short.up[0])) {
    const head = ids.length === 2 ? `${ids[0]} and ${ids[1]} both` : `${ids.slice(0, -1).join(', ')} and ${ids[ids.length - 1]} all`
    return `switches ${head} ${arrow(short.up[0])}`
  }
  return short.sw.map((k, j) => `switch ${k + 1} ${arrow(short.up[j])}`).join(' and ')
}

export const describeLock = (lock) => `switch ${lock.sw + 1} is locked until switch ${lock.until + 1} is ▲`

const shortMask = (short) => short.sw.reduce((m, k) => m | bit(k), 0)
const shortValue = (short) => short.sw.reduce((v, k, j) => (short.up[j] ? v | bit(k) : v), 0)

/** True when board `state` matches a short circuit. */
export function isShort(module, state) {
  return (module.manual.shorts || []).some(s => (state & shortMask(s)) === shortValue(s))
}

/**
 * True when the lock blocks a flip. With `sw`, for that switch only; without,
 * for any switch.
 */
export function isLocked(module, state, sw) {
  const lock = module.manual.lock
  if (!lock) return false
  if (sw != null && sw !== lock.sw) return false
  return !(state & bit(lock.until))
}

const flipAllowed = (module, state, k) => !isLocked(module, state, k) && !isShort(module, state ^ bit(k))

/** Shortest legal flip sequence (switch indices) from `from` to `to`, or null. */
export function switchPath(module, from, to) {
  const n = module.device.lights.length
  if (from === to) return []
  const prev = new Map([[from, null]])
  const queue = [from]
  for (let head = 0; head < queue.length; head++) {
    const state = queue[head]
    for (let k = 0; k < n; k++) {
      if (!flipAllowed(module, state, k)) continue
      const next = state ^ bit(k)
      if (prev.has(next)) continue
      prev.set(next, [state, k])
      if (next === to) {
        const path = []
        for (let cur = next; prev.get(cur); cur = prev.get(cur)[0]) path.unshift(prev.get(cur)[1])
        return path
      }
      queue.push(next)
    }
  }
  return null
}

/**
 * Normalised board of module `i`. Falls back to the generator's start until the
 * module has been touched; a touched module with no `sw` reads 0 (Firebase may
 * drop it); out-of-range values read as the start state.
 */
export function switchState(wire, i, module) {
  const start = module.device.start
  const raw = wire?.mods?.[i]
  if (!raw?.touched) return start
  const n = module.device.lights.length
  const v = raw.sw == null ? 0 : Number(raw.sw)
  return Number.isInteger(v) && v >= 0 && v < 2 ** n ? v : start
}

/** Would flipping the differing switches left to right hit a short circuit or the lock? */
function naiveOrderFails(module, from, to) {
  const n = module.device.lights.length
  let state = from
  for (let k = 0; k < n; k++) {
    if (((state ^ to) & bit(k)) === 0) continue
    if (isLocked(module, state, k) || isShort(module, state ^ bit(k))) return true
    state ^= bit(k)
  }
  return false
}

function genCond(rng, n) {
  const r = rng()
  if (r < 0.4) return { kind: 'colorCount', colors: sample(rng, LIGHT_COLORS, 2), min: 2 }
  if (r < 0.7) return { kind: 'dark', sw: int(rng, 0, n - 1) }
  return { kind: 'color', sw: int(rng, 0, n - 1), color: pick(rng, LIGHT_COLORS) }
}

function genShort(rng, n) {
  const size = rng() < 0.7 ? 2 : 3
  const sw = sample(rng, Array.from({ length: n }, (_, k) => k), size).sort((a, b) => a - b)
  const same = rng() < 0.6
  const first = rng() < 0.5
  return { sw, up: sw.map(() => (same ? first : rng() < 0.5)) }
}

const boardText = (target, count) => Array.from({ length: count }, (_, k) => `${k + 1}${target >> k & 1 ? '▲' : '▼'}`).join(' ')
const ruleText = (rule, count) => `${rule.cond ? `If ${describeCond(rule.cond)}:` : 'Otherwise:'} ${boardText(rule.target, count)}`

/** Errata: `patch = { rule (1-based), target }` sets a new target board on one rule. */
function applyErrata(manual, patch) {
  return { ...manual, rules: manual.rules.map((r, k) => (k === patch.rule - 1 ? { ...r, target: patch.target } : r)) }
}

export default {
  type: 'switch',
  name: 'SWITCHBOARD',
  maxTier: 3,

  generate(rng, tier = 1) {
    const n = SWITCH_COUNTS[tier] ?? SWITCH_COUNTS[1]
    const shortCount = SHORT_COUNTS[tier] ?? 0
    const states = Array.from({ length: 2 ** n }, (_, s) => s)
    for (let attempt = 0; attempt < 2000; attempt++) {
      const lights = Array.from({ length: n }, () => (rng() < DARK_ODDS ? null : pick(rng, LIGHT_COLORS)))
      const [t1, t2, t3] = shuffle(rng, states)
      const c1 = genCond(rng, n)
      let c2 = genCond(rng, n)
      while (JSON.stringify(c2) === JSON.stringify(c1)) c2 = genCond(rng, n)
      const shorts = []
      while (shorts.length < shortCount) {
        const s = genShort(rng, n)
        if (!shorts.some(o => shortMask(o) === shortMask(s) && shortValue(o) === shortValue(s))) shorts.push(s)
      }
      let lock = null
      if (tier >= 3) {
        const [sw, until] = sample(rng, Array.from({ length: n }, (_, k) => k), 2)
        lock = { sw, until }
      }
      const start = int(rng, 0, 2 ** n - 1)
      const module = {
        type: 'switch',
        tier,
        device: { lights, start },
        manual: { rules: [{ cond: c1, target: t1 }, { cond: c2, target: t2 }, { cond: null, target: t3 }], shorts, lock },
      }
      const target = switchTarget(module)
      if (popcount(start ^ target) < 2) continue
      if (isShort(module, start) || isShort(module, target)) continue
      if (!switchPath(module, start, target)) continue
      if (tier >= 2 && !naiveOrderFails(module, start, target)) continue
      return module
    }
    /* c8 ignore next */
    throw new Error('switchboard generation failed')
  },

  applyErrata,

  /**
   * New targets that change the board the Tech must reach, and that stay
   * reachable: not a short circuit, at least one flip away, a legal path from
   * the start.
   */
  errataCandidates(rng, module) {
    const n = module.device.lights.length
    const { start } = module.device
    const before = switchTarget(module)
    const states = shuffle(rng, Array.from({ length: 2 ** n }, (_, s) => s))
    const out = []
    module.manual.rules.forEach((rule, r) => {
      let found = 0
      for (const target of states) {
        if (found >= 2) break
        if (target === rule.target || target === start) continue
        const patched = { ...module, manual: applyErrata(module.manual, { rule: r + 1, target }) }
        if (switchTarget(patched) === before || isShort(patched, target) || !switchPath(patched, start, target)) continue
        out.push({ rule: r + 1, target })
        found++
      }
    })
    return out
  },

  describeErrata(module, patch) {
    const count = module.device.lights.length
    const old = module.manual.rules[patch.rule - 1]
    return {
      where: `SWITCHBOARD, RULE ${patch.rule}`,
      was: ruleText(old, count),
      now: ruleText({ ...old, target: patch.target }, count),
    }
  },

  judge(module, bomb, wire, i, action) {
    const n = module.device.lights.length
    if (action.kind !== 'flip' || !validSwitch(action.sw, n)) return null
    const state = switchState(wire, i, module)
    if (isLocked(module, state, action.sw)) return null
    const save = (sw) => ({ touched: true, sw })
    const next = state ^ bit(action.sw)
    if (isShort(module, next)) {
      return {
        ok: false,
        solved: false,
        progress: save(state),
        text: `FLIPPED SWITCH ${action.sw + 1} — SHORT CIRCUIT`,
      }
    }
    return {
      ok: true,
      solved: next === switchTarget(module),
      progress: save(next),
      text: `FLIPPED SWITCH ${action.sw + 1} ${arrow(next & bit(action.sw))}`,
    }
  },

  solveNext(module, bomb, wire, i) {
    const state = switchState(wire, i, module)
    const path = switchPath(module, state, switchTarget(module))
    return { mod: i, kind: 'flip', sw: path[0] }
  },
}
