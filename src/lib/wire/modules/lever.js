// WIRE CROSSED module: LEVER. Tap it if a manual rule matches, else hold it
// and let go when the LAST digit of the clock shows the digit for the strip
// colour (release matches the ones digit of the seconds only, so a blind
// release rarely passes). Tier I has two tap rules. Tier II adds a third:
// tap if the serial contains the lever label's first letter. Tier III shows
// `strip` at first and swaps to `strip2` after 2000 ms of holding; only
// `strip2` counts, and a release carries `held` (ms), where held < 2000 is a
// strike.
//
// Pure — no DOM, no Firebase, no React.
import { pick, sample } from '../rng'
import { COLOR_NAMES, bombCondHolds, describeBombCond, genBombCond } from '../shell'

/** A lever held for less than this counts as a tap. */
export const TAP_MAX_MS = 600

export const LEVER_COLORS = ['red', 'blue', 'yellow', 'white']
export const LEVER_LABELS = ['PULL', 'VENT', 'PRIME', 'LOCK']
export const STRIP_COLORS = ['red', 'blue', 'yellow', 'white', 'green']
/** Tier III: how long the lever must be held before `strip2` shows. */
export const STRIP_SWITCH_MS = 2000

/** { tap: true } or { tap: false, digit } for this lever on this bomb. */
export function solveLever(module, bomb) {
  const { device, manual } = module
  const [byLabel, byColor, byLetter] = manual.tapRules
  if (device.label === byLabel.label) return { tap: true, rule: 1 }
  if (device.color === byColor.color && bombCondHolds(byColor.cond, bomb)) return { tap: true, rule: 2 }
  if (byLetter && String(bomb.serial).includes(device.label[0])) return { tap: true, rule: 3 }
  // Tier III: only the second strip counts.
  return { tap: false, digit: manual.stripDigits[device.strip2 ?? device.strip] }
}

export function describeLeverRule(rule, i) {
  if (i === 0) return `the lever reads ${rule.label}`
  if (i === 2) return "the serial contains the first letter of the lever's label"
  return `the lever is ${COLOR_NAMES[rule.color]} and ${describeBombCond(rule.cond)}`
}

const tapText = (rule, i) => `Tap it if ${describeLeverRule(rule, i)}.`

/**
 * Errata patches: `{ kind: 'tap', rule (1-based), rule: {...} }` replaces tap
 * line 1 or 2; `{ kind: 'digit', color, digit }` replaces a strip's digit.
 */
function applyErrata(manual, patch) {
  if (patch.kind === 'digit') return { ...manual, stripDigits: { ...manual.stripDigits, [patch.color]: patch.digit } }
  return { ...manual, tapRules: manual.tapRules.map((r, k) => (k === patch.line - 1 ? patch.next : r)) }
}

export default {
  type: 'lever',
  name: 'LEVER',
  maxTier: 3,

  generate(rng, tier = 1) {
    const tapRules = [
      { label: pick(rng, LEVER_LABELS) },
      { color: pick(rng, LEVER_COLORS), cond: genBombCond(rng) },
    ]
    const digits = sample(rng, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], STRIP_COLORS.length)
    const stripDigits = Object.fromEntries(STRIP_COLORS.map((c, i) => [c, digits[i]]))
    const device = {
      color: pick(rng, LEVER_COLORS),
      label: pick(rng, LEVER_LABELS),
      strip: pick(rng, STRIP_COLORS),
    }
    if (tier >= 2) tapRules.push({ serialLetter: true })
    if (tier >= 3) device.strip2 = pick(rng, STRIP_COLORS.filter(c => c !== device.strip))
    return { type: 'lever', tier, device, manual: { tapRules, stripDigits } }
  },

  applyErrata,

  /** Patches that change what the lever wants on this bomb (tap vs hold, or the release digit). */
  errataCandidates(rng, module, bomb) {
    const { device, manual } = module
    const before = solveLever(module, bomb)
    const same = (a, b) => a.tap === b.tap && a.digit === b.digit
    const out = []
    const consider = (patch) => {
      if (!same(before, solveLever({ ...module, manual: applyErrata(manual, patch) }, bomb))) out.push(patch)
    }
    for (const label of LEVER_LABELS) {
      if (label !== manual.tapRules[0].label) consider({ kind: 'tap', line: 1, next: { label } })
    }
    const second = manual.tapRules[1]
    for (const color of LEVER_COLORS) {
      const cond = genBombCond(rng)
      if (color !== second.color || JSON.stringify(cond) !== JSON.stringify(second.cond)) consider({ kind: 'tap', line: 2, next: { color, cond } })
    }
    const stripColor = device.strip2 ?? device.strip
    const used = new Set(Object.values(manual.stripDigits))
    const free = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter(d => !used.has(d))
    consider({ kind: 'digit', color: stripColor, digit: pick(rng, free) })
    return out
  },

  describeErrata(module, patch) {
    if (patch.kind === 'digit') {
      return {
        where: `LEVER, RELEASE DIGIT FOR ${COLOR_NAMES[patch.color]}`,
        was: `${COLOR_NAMES[patch.color]} strip: let go on ${module.manual.stripDigits[patch.color]}.`,
        now: `${COLOR_NAMES[patch.color]} strip: let go on ${patch.digit}.`,
      }
    }
    const i = patch.line - 1
    return { where: `LEVER, RULE ${patch.line}`, was: tapText(module.manual.tapRules[i], i), now: tapText(patch.next, i) }
  },

  judge(module, bomb, wire, i, action) {
    if (action.kind !== 'tap' && action.kind !== 'release') return null
    const progress = wire?.mods?.[i] || {}
    const sol = solveLever(module, bomb)
    const shown = String(action.clock ?? '')
    // F-04: only the last clock digit counts, not any digit in "m:ss".
    // Tier III: a release before the strip switches (held < 2000) is a strike.
    const heldLongEnough = !(module.tier >= 3) || Number(action.held) >= STRIP_SWITCH_MS
    const ok = action.kind === 'tap' ? sol.tap : !sol.tap && heldLongEnough && shown.slice(-1) === String(sol.digit)
    return {
      ok,
      solved: ok,
      progress,
      text: action.kind === 'tap' ? 'TAPPED THE LEVER' : `RELEASED AT ${shown || '?'}`,
    }
  },

  solveNext(module, bomb, wire, i) {
    const sol = solveLever(module, bomb)
    return sol.tap
      ? { mod: i, kind: 'tap' }
      : { mod: i, kind: 'release', clock: `0:0${sol.digit}`, ...(module.tier >= 3 ? { held: STRIP_SWITCH_MS } : {}) }
  },
}
