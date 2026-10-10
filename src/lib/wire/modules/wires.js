// WIRE CROSSED module: WIRES. The Tech sees coloured wires; the manual has a
// rule table per wire count. Tier I is 3-4 wires, three single-condition
// rules and an "otherwise" line. Tier II is 5-6 wires and 4 rules, where a
// condition may be an AND of two ({ all: [a, b] }). Tier III adds striped
// wires ([c1, c2], each counting as both colours) and a first rule that cuts
// every wire containing one colour, in order.
//
// Errata (a modifier): a patch replaces one rule of the table the device uses.
//
// Pure — no DOM, no Firebase, no React.
import { int, pick, sample } from '../rng'
import {
  COLOR_NAMES, WIRE_COLORS, bombCondHolds, describeBombCond, genBombCond,
} from '../shell'

const COLOR_CONDS = ['none', 'exactlyOne', 'many', 'lastIs', 'firstIs']
// Conditions that guarantee at least one wire of their colour.
const HAS_COLOR = new Set(['exactlyOne', 'many', 'lastIs', 'firstIs'])

export function genWireCond(rng) {
  if (rng() < 0.7) return { kind: pick(rng, COLOR_CONDS), color: pick(rng, WIRE_COLORS) }
  return genBombCond(rng)
}

/** A condition of `cond` that guarantees a wire of its colour (or undefined). */
const colorCondOf = (cond) => (cond.all ? cond.all.find(c => HAS_COLOR.has(c.kind)) : HAS_COLOR.has(cond.kind) ? cond : undefined)

export function genWireAction(rng, n, cond) {
  const cc = colorCondOf(cond)
  if (cc && rng() < 0.5) {
    return { kind: rng() < 0.5 ? 'firstOf' : 'lastOf', color: cc.color }
  }
  if (rng() < 0.2) return { kind: 'last' }
  return { kind: 'pos', n: int(rng, 1, n) }
}

/** A striped wire is `[c1, c2]` and counts as both colours everywhere. */
export const isStriped = (w) => Array.isArray(w)
export const wireHas = (w, color) => (Array.isArray(w) ? w.includes(color) : w === color)

export function wireCondHolds(cond, wires, bomb) {
  if (cond.all) return cond.all.every(c => wireCondHolds(c, wires, bomb))
  const count = wires.filter(w => wireHas(w, cond.color)).length
  switch (cond.kind) {
    case 'none': return count === 0
    case 'exactlyOne': return count === 1
    case 'many': return count > 1
    case 'lastIs': return wireHas(wires[wires.length - 1], cond.color)
    case 'firstIs': return wireHas(wires[0], cond.color)
    case 'striped': return wires.some(isStriped)
    default: return bombCondHolds(cond, bomb)
  }
}

export function resolveWireAction(action, wires) {
  if (action.kind === 'pos') return action.n - 1
  if (action.kind === 'last') return wires.length - 1
  if (action.kind === 'firstOf') return wires.findIndex(w => wireHas(w, action.color))
  if (action.kind === 'lastOf') return wires.reduce((last, w, i) => (wireHas(w, action.color) ? i : last), -1)
  if (action.kind === 'allOf') return wires.findIndex(w => wireHas(w, action.color))
  return -1
}

/** Every wire index an action asks for, in cut order (one, except `allOf`). */
export function resolveWireCuts(action, wires) {
  if (action.kind !== 'allOf') return [resolveWireAction(action, wires)]
  return wires.map((w, i) => (wireHas(w, action.color) ? i : -1)).filter(i => i >= 0)
}

/**
 * Which wire (0-based) the manual says to cut, and the rule that decided it
 * (1-based row, or 0 for the "otherwise" line).
 */
export function solveWires(module, bomb) {
  const { wires } = module.device
  const table = module.manual.tables[wires.length]
  for (let i = 0; i < table.rules.length; i++) {
    const { cond, action } = table.rules[i]
    if (wireCondHolds(cond, wires, bomb)) return { index: resolveWireAction(action, wires), rule: i + 1 }
  }
  return { index: resolveWireAction(table.otherwise, wires), rule: 0 }
}

/**
 * Every wire that must be cut, in order. One wire at tiers I-II; at tier III
 * the striped rule asks for every wire containing a colour.
 */
export function requiredCuts(module, bomb) {
  const { wires } = module.device
  const table = module.manual.tables[wires.length]
  for (const { cond, action } of table.rules) {
    if (wireCondHolds(cond, wires, bomb)) return resolveWireCuts(action, wires)
  }
  return resolveWireCuts(table.otherwise, wires)
}

/** Tier III: how many of the required cuts are done. */
export const cutsDone = (wire, i) => {
  const n = Number(wire?.mods?.[i]?.done)
  return Number.isInteger(n) && n > 0 ? n : 0
}

export function describeWireCond(cond) {
  if (cond.all) return cond.all.map(describeWireCond).join(' AND ')
  const c = COLOR_NAMES[cond.color]
  switch (cond.kind) {
    case 'striped': return 'any wire is striped (two letter tags)'
    case 'none': return `there are no ${c} wires`
    case 'exactlyOne': return `there is exactly one ${c} wire`
    case 'many': return `there is more than one ${c} wire`
    case 'lastIs': return `the last wire is ${c}`
    case 'firstIs': return `the first wire is ${c}`
    default: return describeBombCond(cond)
  }
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth']

export function describeWireAction(action) {
  if (action.kind === 'pos') return `cut the ${ORDINALS[action.n - 1]} wire`
  if (action.kind === 'last') return 'cut the last wire'
  if (action.kind === 'firstOf') return `cut the first ${COLOR_NAMES[action.color]} wire`
  if (action.kind === 'lastOf') return `cut the last ${COLOR_NAMES[action.color]} wire`
  if (action.kind === 'allOf') return `cut EVERY wire containing ${COLOR_NAMES[action.color]}, first to last`
  return ''
}

export const isCut = (wire, i, w) => !!wire?.mods?.[i]?.cut?.[w]

const TIER_III = 3
const RULES_PER_TABLE = { 2: 4, 3: 4 }

/** A tier II+ condition: one third of the time an AND of two different ones. */
function genRichCond(rng) {
  const first = genWireCond(rng)
  if (rng() >= 0.35) return first
  for (let attempt = 0; attempt < 20; attempt++) {
    const second = genWireCond(rng)
    if (second.kind !== first.kind) return { all: [first, second] }
  }
  return first
}

function genRichRule(rng, n) {
  const cond = genRichCond(rng)
  return { cond, action: genWireAction(rng, n, cond) }
}

/** 5-6 wires; at tier III 1-3 of them are striped. */
function genWideDevice(rng, tier) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const count = int(rng, 5, 6)
    const wires = Array.from({ length: count }, () => pick(rng, WIRE_COLORS))
    if (tier < TIER_III) return { wires }
    const striped = sample(rng, wires.map((_, i) => i), int(rng, 1, 3))
    for (const i of striped) wires[i] = [wires[i], pick(rng, WIRE_COLORS.filter(c => c !== wires[i]))]
    // A colour that sits in 2-3 wires, so the striped rule cuts a short list.
    const colors = WIRE_COLORS.filter(c => {
      const n = wires.filter(w => wireHas(w, c)).length
      return n >= 2 && n <= 3
    })
    if (colors.length) return { wires, stripedColor: pick(rng, colors) }
  }
  /* c8 ignore next */
  throw new Error('wires generation failed')
}

// Tier -> most wires on the device (tier I only; later tiers are 5-6).
const MAX_WIRES = { 1: 4 }

const ruleText = (rule) => `If ${describeWireCond(rule.cond)}, ${describeWireAction(rule.action)}.`

/** Errata: `patch = { n, rule (1-based), cond, action }` replaces one rule of the n-wire table. */
function applyErrata(manual, patch) {
  const table = manual.tables[patch.n]
  const rules = table.rules.map((r, k) => (k === patch.rule - 1 ? { cond: patch.cond, action: patch.action } : r))
  return { ...manual, tables: { ...manual.tables, [patch.n]: { ...table, rules } } }
}

const cutsKey = (module, bomb) => requiredCuts(module, bomb).join(',')

export default {
  type: 'wires',
  name: 'WIRES',
  maxTier: 3,

  generate(rng, tier = 1) {
    if (tier >= 2) {
      const { wires, stripedColor } = genWideDevice(rng, tier)
      const tables = {}
      for (const n of [5, 6]) {
        const rules = []
        if (tier >= TIER_III) {
          // The table the device uses gets the guaranteed colour; the other is a decoy.
          const color = n === wires.length ? stripedColor : pick(rng, WIRE_COLORS)
          rules.push({ cond: { kind: 'striped' }, action: { kind: 'allOf', color } })
        }
        while (rules.length < RULES_PER_TABLE[tier]) rules.push(genRichRule(rng, n))
        tables[n] = { rules, otherwise: rng() < 0.5 ? { kind: 'last' } : { kind: 'pos', n: int(rng, 1, n) } }
      }
      return { type: 'wires', tier, device: { wires }, manual: { tables } }
    }
    const maxWires = MAX_WIRES[tier] ?? MAX_WIRES[1]
    const tables = {}
    for (let n = 3; n <= 6; n++) {
      const rules = Array.from({ length: 3 }, () => {
        const cond = genWireCond(rng)
        return { cond, action: genWireAction(rng, n, cond) }
      })
      tables[n] = { rules, otherwise: rng() < 0.5 ? { kind: 'last' } : { kind: 'pos', n: int(rng, 1, n) } }
    }
    const count = int(rng, 3, maxWires)
    const wires = Array.from({ length: count }, () => pick(rng, WIRE_COLORS))
    return { type: 'wires', tier, device: { wires }, manual: { tables } }
  },

  applyErrata,

  /**
   * Patches that change which wire(s) to cut on this bomb, each still a valid
   * cut. The tier III striped rule (row 1) is never replaced.
   */
  errataCandidates(rng, module, bomb) {
    const n = module.device.wires.length
    const rules = module.manual.tables[n].rules
    const before = cutsKey(module, bomb)
    const out = []
    rules.forEach((_, r) => {
      if (module.tier >= TIER_III && r === 0) return
      let found = 0
      for (let attempt = 0; attempt < 30 && found < 2; attempt++) {
        const rule = module.tier >= 2 ? genRichRule(rng, n) : (() => {
          const cond = genWireCond(rng)
          return { cond, action: genWireAction(rng, n, cond) }
        })()
        const patch = { n, rule: r + 1, cond: rule.cond, action: rule.action }
        const next = { ...module, manual: applyErrata(module.manual, patch) }
        const cuts = requiredCuts(next, bomb)
        if (!cuts.length || cuts.some(c => c < 0 || c >= n) || cuts.join(',') === before) continue
        out.push(patch)
        found++
      }
    })
    return out
  },

  describeErrata(module, patch) {
    const old = module.manual.tables[patch.n].rules[patch.rule - 1]
    return { where: `WIRES, ${patch.n}-WIRE TABLE, RULE ${patch.rule}`, was: ruleText(old), now: ruleText(patch) }
  },

  judge(module, bomb, wire, i, action) {
    if (action.kind !== 'cut') return null
    const progress = wire?.mods?.[i] || {}
    const w = action.wire
    if (!Number.isInteger(w) || w < 0 || w >= module.device.wires.length || progress.cut?.[w]) return null
    if (module.tier >= TIER_III) {
      // Ordered multi-cut: only the next required wire is right, and a wrong
      // cut springs back (stays uncut) so the module can always be finished.
      const need = requiredCuts(module, bomb)
      const done = cutsDone(wire, i)
      const ok = w === need[done]
      const nextDone = ok ? done + 1 : done
      return {
        ok,
        solved: ok && nextDone === need.length,
        progress: ok ? { ...progress, cut: { ...(progress.cut || {}), [w]: true }, done: nextDone } : progress,
        text: `CUT WIRE ${w + 1}`,
      }
    }
    const ok = w === solveWires(module, bomb).index
    return {
      ok,
      solved: ok,
      progress: { ...progress, cut: { ...(progress.cut || {}), [w]: true } },
      text: `CUT WIRE ${w + 1}`,
    }
  },

  solveNext(module, bomb, wire, i) {
    if (module.tier >= TIER_III) {
      return { mod: i, kind: 'cut', wire: requiredCuts(module, bomb)[cutsDone(wire, i)] }
    }
    return { mod: i, kind: 'cut', wire: solveWires(module, bomb).index }
  },
}
