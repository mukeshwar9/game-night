// WIRE CROSSED: two-screen co-op defusal. The Tech holds the device, the
// Handbook holds a manual generated for this exact bomb, and neither screen
// is any use alone. Everything about a bomb — serial, indicators, modules,
// their solutions and the manual text — is derived from the room's `seed`,
// `level` and `mode`, so the only synced state is the `wire` node's progress,
// strikes and result (see src/pages/WireCrossedGame.jsx).
//
// This file is the entry point: it deals bombs and holds the reducers, and
// re-exports what pages, components and e2e specs import. The pieces live in
// src/lib/wire/ (rng, shell, modes, modifiers, legacy, modules/*). The design
// is docs/prds/wire-crossed-modes.md.
//
// Every rule and every manual line here is original to this game.
//
// Pure — no DOM, no Firebase, no React.
import { MODE_LEVELS, isWireMode, normalizeRun } from './wireMatchLogic'
import { makeRng, pick, sample, shuffle } from './wire/rng'
import { makeShell } from './wire/shell'
import { isMode, levelCount, levelPlan, tierFor } from './wire/modes'
import {
  drawModifiers, eligibleModifiers, fuseFor, makePageOrder, roleOf, strikePenaltyOf,
} from './wire/modifiers'
import { generateLegacyBomb } from './wire/legacy'
import { MODULES } from './wire/modules'
import { gaugeBurstAt, gaugeFillMs, gaugeIndex, normalizeGauge } from './wire/modules/gauge'

export { makeRng } from './wire/rng'
export {
  COLOR_LETTERS, COLOR_NAMES, INDICATOR_LABELS, WIRE_COLORS, isLit, serialLastDigit,
} from './wire/shell'
export {
  BLACKOUT_EVERY_MS, BLACKOUT_MS, MODIFIERS, SHIPPED_MODIFIERS, STRIKE_PENALTY_MS, SWAP_BANNER_MS,
  isBlackout, isSwapBanner, isSwapped, pageOrderOf, roleOf, strikePenaltyOf, urgentMsOf,
} from './wire/modifiers'
export { bombMsForLevel, moduleCountForLevel, BOMB_MS, BOMB_MS_HARD } from './wire/legacy'
export { MODULES, MODULE_NAMES, MODULE_TYPES } from './wire/modules'
export {
  describeWireAction, describeWireCond, isCut, isStriped, requiredCuts, solveWires, wireHas,
} from './wire/modules/wires'
export {
  GLYPH_COUNT, GLYPH_MIRROR_COUNT, GLYPH_MIRROR_FIRST, GLYPH_TOTAL, KEYPAD_COLUMNS, KEYPAD_COLUMN_LEN, KEYPAD_KEYS,
  isMirroredGlyph, keypadPage, pressedCount,
} from './wire/modules/keypad'
export {
  LEVER_COLORS, LEVER_LABELS, STRIP_COLORS, STRIP_SWITCH_MS, TAP_MAX_MS, describeLeverRule, solveLever,
} from './wire/modules/lever'
export {
  DIRS, MAZE_CELLS, MAZE_SIZE, cellName, cellRC, isOpen, mazeDistances, mazeMoves, mazePos, mazeSize,
  stepCell, valveBlocks,
} from './wire/modules/maze'
export {
  COLUMN_NAMES, columnIndex, coveredBy, crossings, patchRouting, patchState,
} from './wire/modules/patch'
export {
  LIGHT_COLORS, SHORT_COUNTS, SWITCH_COUNTS, describeCond, describeLock, describeShort, isLocked, isShort,
  switchPath, switchState, switchTarget,
} from './wire/modules/switch'

export {
  GAUGE_FILL_MS, GAUGE_VALVES, GAUGE_ZONE_NAMES, describeGaugeCond, gaugeBurstAt, gaugeFillMs, gaugeIndex,
  gaugePressure, gaugeValve, gaugeZone, normalizeGauge,
} from './wire/modules/gauge'

export const MAX_STRIKES = 3

/** Fixed text-only signals for players without voice. Stored by index. */
export const QUICK_PHRASES = [
  'READ AGAIN', 'SLOWER', 'WHICH MODULE?', 'HOW MANY?', 'GOT IT', 'WAIT…', 'STOP!', 'YES', 'NO', 'DONE ✓',
]

// ---------------------------------------------------------------------------
// Whole bomb

/**
 * Errata: pick one module that can take a slip and one of its patches, and
 * swap the patched manual into `modules` in place. Null when none can.
 */
function dealErrata(rng, modules, ctx) {
  const options = []
  modules.forEach((m, i) => {
    const def = MODULES[m.type]
    if (!def.errataCandidates) return
    const patches = def.errataCandidates(rng, m, ctx)
    if (patches.length) options.push({ i, patches })
  })
  if (!options.length) return null
  const { i, patches } = pick(rng, options)
  const patch = pick(rng, patches)
  const def = MODULES[modules[i].type]
  const text = def.describeErrata(modules[i], patch)
  modules[i] = { ...modules[i], manual: def.applyErrata(modules[i].manual, patch) }
  return { mod: i, patch, ...text }
}

/**
 * Derive the whole bomb — device and manual — from the room seed, level and
 * mode. Deterministic: both screens call this and must agree. One rng stream
 * is consumed in a fixed order: shell, modifiers (and page order), slot types,
 * slot tiers, then each module in slot order, then (only with Errata) the
 * errata draws, appended last so bombs without Errata derive as before.
 * A missing `mode` deals the frozen pre-modes bomb (src/lib/wire/legacy.js).
 *
 * Errata: `bomb.errata = { mod, patch, where, was, now }` and the module at
 * `mod` carries the patched manual, so every solver and judge uses the slip's
 * rule. When no module on the bomb can take a slip, Errata is swapped for
 * another distinct modifier of allowed severity (or dropped if none is left).
 */
export function generateBomb(seed, level = 1, mode = null) {
  if (!isMode(mode)) return generateLegacyBomb(seed, level)
  const lvl = Number.isInteger(level) && level >= 1 ? Math.min(level, levelCount(mode)) : 1
  const plan = levelPlan(mode, lvl)
  const rng = makeRng(`wirecrossed:${seed}`)
  const shell = makeShell(rng)
  let modifiers = drawModifiers(rng, plan.modifiers.count, plan.modifiers.max)
  // The Gauge (if any) keeps the last Handbook tab; only the slot pages scramble.
  const scramble = () => [...makePageOrder(rng, plan.tiers.length), ...(plan.gauge ? [plan.tiers.length] : [])]
  let pageOrder = modifiers.includes('scrambled') ? scramble() : null
  const types = sample(rng, plan.pool, plan.tiers.length)
  const tiers = shuffle(rng, plan.tiers)
  const ctx = { level: lvl, mode, serial: shell.serial, indicators: shell.indicators }
  const modules = types.map((type, i) => MODULES[type].generate(rng, tierFor(type, tiers[i]), ctx))
  // "+G" levels: one Pressure Gauge after the slot modules (never drawn into a slot).
  if (plan.gauge) modules.push(MODULES.gauge.generate(rng, plan.gauge, ctx))
  let errata = null
  if (modifiers.includes('errata')) {
    errata = dealErrata(rng, modules, ctx)
    if (!errata) {
      const swapIn = eligibleModifiers(plan.modifiers.max).filter(id => id !== 'errata' && !modifiers.includes(id))
      const id = swapIn.length ? pick(rng, swapIn) : null
      modifiers = modifiers.flatMap(m => (m !== 'errata' ? [m] : id ? [id] : []))
      if (id === 'scrambled') pageOrder = scramble()
    }
  }
  return {
    seed: String(seed),
    level: lvl,
    mode,
    ...shell,
    modules,
    durationMs: plan.clockMs,
    modifiers,
    ...(errata ? { errata } : {}),
    ...(pageOrder ? { pageOrder } : {}),
    ...fuseFor(modifiers),
  }
}

// ---------------------------------------------------------------------------
// Clock text

/** "m:ss", seconds rounded up so the display hits 0:00 only at the boom. */
export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * What the bomb's clock shows at `now`: time left when the bomb has a
 * deadline, time elapsed when the room's timers are off.
 */
export function clockText(wire, now) {
  if (!Number.isFinite(wire?.armedAt)) return formatClock(0)
  if (wire.endsAt) return formatClock(wire.endsAt - now)
  return formatClock(now - wire.armedAt)
}

// ---------------------------------------------------------------------------
// Synced state (`games/{id}/wire`) — reducers

export const isSolved = (wire, i) => !!wire?.solved?.[i]
export const modProgress = (wire, i) => wire?.mods?.[i] || {}

export function strikesOf(wire) {
  const n = Number(wire?.strikes)
  return Number.isFinite(n) && n > 0 ? Math.min(MAX_STRIKES, n) : 0
}

const nonNeg = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0)
const posOrNull = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : null)

/**
 * The match tally: bombs defused and blown, plus per-mode records —
 * `bestMs` (shortest cleared run), `fewestBooms` (in a cleared run) and
 * `clears`. Records replace the old streak/best and reset on NEW MATCH.
 */
export function normalizeWireStats(raw) {
  const records = {}
  for (const mode of Object.keys(MODE_LEVELS)) {
    const r = raw?.records?.[mode]
    const fewest = r?.fewestBooms == null ? NaN : Number(r.fewestBooms)
    records[mode] = {
      bestMs: posOrNull(r?.bestMs),
      fewestBooms: Number.isFinite(fewest) && fewest >= 0 ? Math.floor(fewest) : null,
      clears: nonNeg(r?.clears),
    }
  }
  return { defused: nonNeg(raw?.defused), booms: nonNeg(raw?.booms), records }
}

/** A bomb dealt before modes existed: no mode and no run. It plays as it always did. */
export const isLegacyWire = (wire) => !wire?.mode && !wire?.run

/**
 * Tech arms the bomb. `durationMs` null means the room's timers are off: no
 * deadline, the clock counts up instead. A modes-era bomb cannot be armed
 * until the players have agreed a mode. With `bomb` on a "+G" level it also
 * starts the Gauge at 10% with its fill time scaled by `timerScale` (the
 * unscaled time when timers are off: the Gauge always runs).
 */
export function armWire(wire, now, durationMs, bomb = null, timerScale = undefined) {
  if (!wire || wire.phase !== 'ready') return null
  if (!isWireMode(wire.mode) && !isLegacyWire(wire)) return null
  const armed = {
    ...wire,
    phase: 'armed',
    armedAt: now,
    endsAt: durationMs == null ? null : now + durationMs,
    strikes: 0,
    solved: null,
    mods: null,
    last: null,
    result: null,
  }
  // Swap: half of the base clock (also with timers off, when there is no deadline).
  const halfMs = (durationMs ?? bomb?.durationMs) / 2
  if (bomb?.modifiers?.includes('swap') && Number.isFinite(halfMs)) armed.swapAt = now + halfMs
  else delete armed.swapAt
  if (gaugeIndex(bomb) >= 0) armed.gauge = { base: 10, at: now, vents: 0, fillMs: gaugeFillMs(bomb, timerScale) }
  else delete armed.gauge
  return armed
}

function finish(wire, outcome, reason, now) {
  const stats = normalizeWireStats(wire.stats)
  const took = Number.isFinite(wire.armedAt) ? Math.max(0, now - wire.armedAt) : null
  const mode = isWireMode(wire.mode) ? wire.mode : null
  const cleared = !!mode && outcome === 'defused' && wire.level >= MODE_LEVELS[mode]
  const next = {
    ...wire,
    phase: 'over',
    result: {
      outcome,
      reason,
      at: now,
      left: wire.endsAt ? Math.max(0, wire.endsAt - now) : null,
      took,
      cleared,
    },
    stats: {
      defused: stats.defused + (outcome === 'defused' ? 1 : 0),
      booms: stats.booms + (outcome === 'boom' ? 1 : 0),
      records: stats.records,
    },
  }
  if (!mode) return next
  // The run's armed time counts every attempt, boomed or not; run.booms is
  // bumped when the next bomb is dealt (nextWireBomb).
  const run = normalizeRun(wire.run)
  next.run = { booms: run.booms, ms: run.ms + (took || 0) }
  if (cleared) {
    const rec = stats.records[mode]
    next.stats.records = {
      ...stats.records,
      [mode]: {
        bestMs: rec.bestMs == null ? next.run.ms : Math.min(rec.bestMs, next.run.ms),
        fewestBooms: rec.fewestBooms == null ? next.run.booms : Math.min(rec.fewestBooms, next.run.booms),
        clears: rec.clears + 1,
      },
    }
  }
  return next
}

/** The clock ran out: boom. Null when there is nothing to do. */
export function applyTimeout(wire, now) {
  if (!wire || wire.phase !== 'armed' || !wire.endsAt || now < wire.endsAt) return null
  return finish(wire, 'boom', 'time', now)
}

/**
 * Apply one Tech action to the synced `wire` node.
 *
 * @param {any} wire - live `wire` node
 * @param {ReturnType<typeof generateBomb>} bomb
 * @param {{ mod: number, kind: string, wire?: number, glyph?: number, clock?: string, dir?: string }} action
 * @param {number} now - server time
 * @param {'X'|'O'} [by]
 * @returns {{ wire: any, ok: boolean | null } | null} null when the action is
 *   not allowed (not armed, already solved/cut, bad index); `ok` null when
 *   the clock had already run out and the action turned into the boom.
 */
export function applyWireAction(wire, bomb, action, now, by) {
  if (!wire || wire.phase !== 'armed' || !action) return null
  // Only the current Tech may act; after a Swap that is the other seat.
  if ((by === 'X' || by === 'O') && roleOf(wire, by, now) !== 'tech') return null
  const timedOut = applyTimeout(wire, now)
  if (timedOut) return { wire: timedOut, ok: null }
  // A burst that is due beats whatever the Tech did after it (ok null, like the timeout).
  const burst = applyGaugeBurst(wire, bomb, now)
  if (burst) return { wire: burst, ok: null }
  const i = action.mod
  const module = bomb.modules[i]
  if (!module || isSolved(wire, i)) return null
  const verdict = MODULES[module.type]?.judge(module, bomb, wire, i, action, now)
  if (!verdict) return null

  const next = {
    ...wire,
    ...(verdict.progress !== undefined ? { mods: { ...(wire.mods || {}), [i]: verdict.progress } } : {}),
    ...(verdict.gauge ? { gauge: verdict.gauge } : {}),
    last: { by: by || null, mod: i, text: verdict.text, ok: verdict.ok, at: now },
  }
  if (verdict.solved) next.solved = { ...(wire.solved || {}), [i]: true }
  if (!verdict.ok) {
    const boomed = addStrike(next, wire, bomb, now)
    if (boomed) return { wire: boomed, ok: false }
  }
  // The Gauge is never solved and does not count toward the defuse.
  if (bomb.modules.every((m, k) => m.type === 'gauge' || isSolved(next, k))) {
    return { wire: finish(next, 'defused', 'solved', now), ok: verdict.ok }
  }
  return { wire: next, ok: verdict.ok }
}

/**
 * Charge one strike to `next` (built from `prev`): +1 strike, the bomb's
 * penalty off the clock. Returns the finished (boomed) wire on the third
 * strike or when the penalty empties the clock at `now`, else null.
 */
function addStrike(next, prev, bomb, now) {
  const strikes = strikesOf(prev) + 1
  next.strikes = strikes
  if (next.endsAt) next.endsAt = next.endsAt - strikePenaltyOf(bomb)
  if (strikes >= MAX_STRIKES) return finish(next, 'boom', 'strikes', now)
  if (next.endsAt && now >= next.endsAt) return finish(next, 'boom', 'time', now)
  return null
}

/**
 * The Gauge reached 100%: a strike, and the needle restarts at 40%. Pure and
 * idempotent: it returns null unless the pressure has reached 100 for the
 * current `gauge.at`, and the write moves `gauge.at` to the exact burst moment
 * (not `now`), so a second client applying it after the first finds the gauge
 * fresh and gets null. If the clock ran out before the burst, the boom is the
 * timeout. Applies one burst per call (the watchdog re-arms for the next).
 * @returns {any | null} the new wire node, or null when nothing is due
 */
export function applyGaugeBurst(wire, bomb, now) {
  if (!wire || wire.phase !== 'armed') return null
  const i = gaugeIndex(bomb)
  const gauge = normalizeGauge(wire)
  if (i < 0 || !gauge) return null
  const burstAt = gaugeBurstAt(wire, bomb)
  if (now < burstAt) return null
  if (wire.endsAt && burstAt >= wire.endsAt) return applyTimeout(wire, now)
  const next = {
    ...wire,
    gauge: { ...gauge, base: 40, at: burstAt },
    last: { by: null, mod: i, text: 'PRESSURE BURST', ok: false, at: burstAt },
  }
  return addStrike(next, wire, bomb, burstAt) || next
}

// ---------------------------------------------------------------------------
// Mode proposal (either seat proposes, the other confirms; docs/prds §3.4).
// Separate from the room-level `proposal`, so FIELD_NULLS.wire clears it on a
// game switch. Allowed only between bombs (`ready` or `over`).

const isSeat = (by) => by === 'X' || by === 'O'
const betweenBombs = (wire) => !!wire && (wire.phase === 'ready' || wire.phase === 'over')

/** Seat `by` proposes `mode`. Overwrites an earlier proposal. Null when not allowed. */
export function proposeMode(wire, mode, by, now) {
  if (!betweenBombs(wire) || !isSeat(by) || !isMode(mode) || mode === wire.mode) return null
  return { ...wire, modeProposal: { by, mode, at: now } }
}

/**
 * The other seat accepts: the mode is set and the run restarts at level 1
 * with `seed`. From a finished bomb the Tech flips and the bomb number climbs
 * like a normal next bomb; the records and match tally carry.
 */
export function acceptMode(wire, by, seed) {
  const proposal = wire?.modeProposal
  if (!betweenBombs(wire) || !isSeat(by) || !proposal || proposal.by === by || !isMode(proposal.mode)) return null
  const fromOver = wire.phase === 'over'
  return {
    seed: String(seed),
    level: 1,
    bombNo: (Number.isInteger(wire.bombNo) ? wire.bombNo : 0) + (fromOver ? 1 : 0),
    tech: fromOver ? (wire.tech === 'X' ? 'O' : 'X') : (wire.tech === 'O' ? 'O' : 'X'),
    phase: 'ready',
    strikes: 0,
    mode: proposal.mode,
    run: { booms: 0, ms: 0 },
    stats: wire.stats ?? null,
  }
}

/** Either seat clears the proposal (the proposer cancels, the other declines). */
export function cancelMode(wire, by) {
  if (!betweenBombs(wire) || !isSeat(by) || !wire.modeProposal) return null
  const { modeProposal: _gone, ...rest } = wire // eslint-disable-line no-unused-vars
  return rest
}
