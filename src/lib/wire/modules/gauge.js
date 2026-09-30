// WIRE CROSSED module: PRESSURE GAUGE (docs/prds/wire-crossed-modes.md §4.9).
// Never drawn into a slot and never solved: generateBomb appends exactly one on
// the "+G" levels, after the slot modules. Pressure builds from 10% to 100% in
// 60 / 45 / 35 seconds (tier I / II / III); the Tech must vent it with the
// right valve while it is AMBER (50-79%) or RED (80-99%). Venting in GREEN or
// with the wrong valve is a strike and leaves the pressure alone. At 100% it
// bursts (applyGaugeBurst in wireLogic.js): a strike, and the needle restarts
// at 40%.
//
// State lives in `wire.gauge = { base, at, vents, fillMs }`, not in `wire.mods`
// (the module returns `gauge` from judge instead of `progress`). Pressure is
// computed, never stored: clamp(base + (now - at) / fillMs * 90).
//
// `fillMs` is written once by armWire, already scaled with `scaledMs(base,
// timerScale)` (or the unscaled base when the room's timers are off: the Gauge
// still runs), so both screens and every reducer agree on it without reading the
// room's `timerScale` again. It is optional on read: a missing or bad `fillMs`
// falls back to this module's unscaled `fillMs`.
//
// Pure — no DOM, no Firebase, no React.
import { pick, sample } from '../rng'
import { INDICATOR_LABELS, bombCondHolds, describeBombCond } from '../shell'
import { scaledMs } from '../../timerScale'

export const GAUGE_VALVES = ['A', 'B', 'C']
/** Fill time, 10% to 100%, per tier. */
export const GAUGE_FILL_MS = { 1: 60_000, 2: 45_000, 3: 35_000 }
export const GAUGE_START = 10
export const GAUGE_RESTART = 40
export const GAUGE_AMBER_AT = 50
export const GAUGE_RED_AT = 80
/** Pressure rises by this many points over one `fillMs`. */
export const GAUGE_SPAN = 90

const num = (v) => (v == null || v === '' ? NaN : Number(v))

/** Index of the Gauge in `bomb.modules`, or -1 on bombs without one. */
export const gaugeIndex = (bomb) => (bomb?.modules ? bomb.modules.findIndex(m => m.type === 'gauge') : -1)

/** Unscaled fill time for a tier, or scaled with the room's timer scale (unscaled when timers are off). */
export function gaugeFillMs(bomb, timerScale) {
  const module = bomb?.modules?.[gaugeIndex(bomb)]
  if (!module) return null
  return scaledMs(module.fillMs, timerScale) ?? module.fillMs
}

/**
 * The Gauge state read from the synced node, or null when there is none.
 * Firebase may hand numbers back as anything; a bad `fillMs` is dropped.
 */
export function normalizeGauge(wire) {
  const raw = wire?.gauge
  if (!raw || typeof raw !== 'object') return null
  const base = num(raw.base)
  const at = num(raw.at)
  if (!Number.isFinite(base) || !Number.isFinite(at)) return null
  const vents = num(raw.vents)
  const fillMs = num(raw.fillMs)
  return {
    base,
    at,
    vents: Number.isFinite(vents) && vents > 0 ? Math.floor(vents) : 0,
    ...(Number.isFinite(fillMs) && fillMs > 0 ? { fillMs } : {}),
  }
}

function fillOf(gauge, bomb) {
  const module = bomb?.modules?.[gaugeIndex(bomb)]
  return gauge.fillMs ?? module?.fillMs ?? GAUGE_FILL_MS[1]
}

/** The moment (ms, server clock) the needle reaches 100%, or null without a Gauge. */
export function gaugeBurstAt(wire, bomb) {
  const gauge = normalizeGauge(wire)
  if (!gauge || gaugeIndex(bomb) < 0) return null
  return Math.ceil(gauge.at + ((100 - gauge.base) / GAUGE_SPAN) * fillOf(gauge, bomb))
}

/** Pressure (0-100) at `now`. 0 when the bomb has no armed Gauge. */
export function gaugePressure(wire, bomb, now) {
  const gauge = normalizeGauge(wire)
  if (!gauge || gaugeIndex(bomb) < 0) return 0
  if (now >= gaugeBurstAt(wire, bomb)) return 100
  const rise = (Math.max(0, now - gauge.at) / fillOf(gauge, bomb)) * GAUGE_SPAN
  return Math.min(100, Math.max(0, gauge.base + rise))
}

/** 'green' below 50, 'amber' 50-79, 'red' from 80. */
export const gaugeZone = (pressure) => (pressure >= GAUGE_RED_AT ? 'red' : pressure >= GAUGE_AMBER_AT ? 'amber' : 'green')

export const GAUGE_ZONE_NAMES = { green: 'GREEN', amber: 'AMBER', red: 'RED' }

/** Does a valve-rule condition hold on this bomb? (`null` is "always".) */
export function gaugeCondHolds(cond, bomb) {
  if (!cond) return true
  if (cond.kind === 'serialVowel') return /[AEIOU]/.test(bomb.serial)
  return bombCondHolds(cond, bomb)
}

export function describeGaugeCond(cond) {
  if (cond?.kind === 'serialVowel') return 'the serial number has a vowel'
  return describeBombCond(cond)
}

/**
 * The valve that vents `zone` (amber or red) after `vents` earlier vents;
 * null in green. At tier III each vent moves the right valve on one step
 * (A to B to C to A).
 */
export function gaugeValve(module, bomb, zone, vents = 0) {
  if (zone !== 'amber' && zone !== 'red') return null
  const rule = module.manual[zone]
  const base = gaugeCondHolds(rule.cond, bomb) ? rule.yes : rule.no
  if (!module.manual.rotates) return base
  return GAUGE_VALVES[(GAUGE_VALVES.indexOf(base) + vents) % GAUGE_VALVES.length]
}

const twoValves = (rng) => sample(rng, GAUGE_VALVES, 2)

/** The venting line for one zone, as the Handbook prints it. */
export const describeGaugeRule = (rule) => (rule.cond
  ? `if ${describeGaugeCond(rule.cond)}, open VALVE ${rule.yes}. Otherwise open VALVE ${rule.no}.`
  : `open VALVE ${rule.yes}.`)

/** Errata: `patch = { zone: 'amber'|'red', branch: 'yes'|'no', valve }` changes one valve of a zone's line. */
function applyErrata(manual, patch) {
  return { ...manual, [patch.zone]: { ...manual[patch.zone], [patch.branch]: patch.valve } }
}

export default {
  type: 'gauge',
  name: 'GAUGE',
  maxTier: 3,

  generate(rng, tier = 1, ctx = {}) {
    const t = GAUGE_FILL_MS[tier] ? tier : 1
    const fillMs = GAUGE_FILL_MS[t]
    if (t === 1) {
      return {
        type: 'gauge',
        tier: t,
        fillMs,
        device: {},
        manual: {
          amber: { cond: { kind: 'serialVowel' }, yes: 'A', no: 'C' },
          red: { cond: null, yes: 'B', no: 'B' },
          rotates: false,
        },
      }
    }
    const labels = ctx.indicators?.length ? ctx.indicators.map(i => i.label) : INDICATOR_LABELS
    const [amberYes, amberNo] = twoValves(rng)
    const [redYes, redNo] = twoValves(rng)
    return {
      type: 'gauge',
      tier: t,
      fillMs,
      device: {},
      manual: {
        amber: { cond: { kind: 'lit', label: pick(rng, labels) }, yes: amberYes, no: amberNo },
        red: { cond: { kind: rng() < 0.5 ? 'serialOdd' : 'serialEven' }, yes: redYes, no: redNo },
        rotates: t >= 3,
      },
    }
  },

  applyErrata,

  /** A different valve for the branch of each zone that holds on this bomb. */
  errataCandidates(rng, module, bomb) {
    const out = []
    for (const zone of ['amber', 'red']) {
      const rule = module.manual[zone]
      const branch = gaugeCondHolds(rule.cond, bomb) ? 'yes' : 'no'
      for (const valve of GAUGE_VALVES) {
        if (valve !== rule[branch]) out.push({ zone, branch, valve })
      }
    }
    return sample(rng, out, 3)
  },

  describeErrata(module, patch) {
    const next = applyErrata(module.manual, patch)
    return {
      where: `GAUGE, ${patch.zone === 'amber' ? 'AMBER' : 'RED'} RULE`,
      was: describeGaugeRule(module.manual[patch.zone]),
      now: describeGaugeRule(next[patch.zone]),
    }
  },

  judge(module, bomb, wire, i, action, now) {
    if (action.kind !== 'vent' || !GAUGE_VALVES.includes(action.valve)) return null
    const gauge = normalizeGauge(wire)
    if (!gauge) return null
    const zone = gaugeZone(gaugePressure(wire, bomb, now))
    if (zone === 'green') {
      return { ok: false, solved: false, text: `VENTED VALVE ${action.valve} IN GREEN — NOTHING TO RELEASE` }
    }
    if (action.valve !== gaugeValve(module, bomb, zone, gauge.vents)) {
      return { ok: false, solved: false, text: `VENTED VALVE ${action.valve} IN ${GAUGE_ZONE_NAMES[zone]} — WRONG VALVE` }
    }
    return {
      ok: true,
      solved: false,
      gauge: { ...gauge, base: GAUGE_START, at: now, vents: gauge.vents + 1 },
      text: `VENTED VALVE ${action.valve} — PRESSURE DOWN`,
    }
  },

  /** A vent once the needle is in AMBER or RED; null while it is GREEN (wait). */
  solveNext(module, bomb, wire, i, now) {
    const gauge = normalizeGauge(wire)
    if (!gauge) return null
    const zone = gaugeZone(gaugePressure(wire, bomb, now))
    if (zone === 'green') return null
    return { mod: i, kind: 'vent', valve: gaugeValve(module, bomb, zone, gauge.vents) }
  },
}
