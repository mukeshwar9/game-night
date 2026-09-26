// DOCKING: a two-player co-op dice game. A Commander (X) and an Engineer (O)
// fly a capsule into a station port over a handful of burns. Each burn: talk
// freely, roll four private dice each, then place them one at a time in
// silence on a shared console. Pure logic: no DOM, no Firebase, no React.
//
// Console (per burn):
//   att   ATTITUDE  — one die each, required. Commander minus Engineer tilts the
//                     capsule; past ±MAX_TILT it spins out.
//   thr   THRUST    — one die each, required. The sum sets how far you close:
//                     ≤4 holds position, 5–8 closes 1, 9+ closes 2.
//   deb   DEBRIS    — two shared slots. A die equal to an uncleared debris
//                     marker's value clears it (nearest first).
//   sysN  SYSTEMS   — switches owned by one seat; the exact value arms it for
//                     good. Every armed switch raises the docking limit by 1.
//   cool  COOLANT   — one per seat. Any die banks a coolant token (max 3);
//                     a token nudges a die ±1 as you place it.
//   vent  VENT      — throw a die away (never allowed when the die is needed
//                     for your attitude or thrust slot).
// Dock: a burn that closes the last distance docks, if its thrust is within
// the docking limit and the capsule is level (tilt 0). Flying past uncleared
// debris, spinning out, docking too fast or tilted, or running out of burns
// loses.
//
// Round shape (games/{id}/round): phase 'talk' | 'place' | 'done', level,
// burn, maxBurns, start, distance, tilt, coolant, debris[{at,v,cleared}],
// systems[{owner,v,armed}], ready{X,O}, dice{X:[{v,used}],O:[…]},
// placed[{by,slot,v,die}], lead, turn, lastBurn, result.

export const LEVELS = {
  cadet: { label: 'CADET', desc: '6 out · 2 debris · 2 switches', distance: 6, debris: 2, systems: 2 },
  pilot: { label: 'PILOT', desc: '7 out · 3 debris · 4 switches', distance: 7, debris: 3, systems: 4 },
  ace: { label: 'ACE', desc: '8 out · 4 debris · 4 switches', distance: 8, debris: 4, systems: 4 },
}
export const MAX_BURNS = 6
export const DICE_PER_SEAT = 4
export const MAX_TILT = 3
export const MAX_COOLANT = 3
export const DEBRIS_SLOTS = 2
export const BASE_DOCK_LIMIT = 6
export const SEATS = ['X', 'O']
export const ROLE = { X: 'COMMANDER', O: 'ENGINEER' }
export const other = (seat) => (seat === 'X' ? 'O' : 'X')

export const moveFor = (thrust) => (thrust <= 4 ? 0 : thrust <= 8 ? 1 : 2)
export const rollDie = (rng = Math.random) => 1 + Math.floor(rng() * 6)

function pickDistinct(pool, count, rng) {
  const left = pool.slice()
  const out = []
  while (out.length < count && left.length) out.push(left.splice(Math.floor(rng() * left.length), 1)[0])
  return out
}

// A fresh approach at `level`. Debris sits between the start and the port;
// Commander switches take odd values, Engineer switches even ones.
export function newApproach({ level = 'cadet', starter = 'X', rng = Math.random } = {}) {
  const safe = LEVELS[level] ? level : 'cadet'
  const cfg = LEVELS[safe]
  const spots = Array.from({ length: cfg.distance - 1 }, (_, i) => i + 1)
  const debris = pickDistinct(spots, cfg.debris, rng)
    .sort((a, b) => b - a)
    .map(at => ({ at, v: rollDie(rng), cleared: false }))
  const odd = pickDistinct([1, 3, 5], cfg.systems / 2, rng)
  const even = pickDistinct([2, 4, 6], cfg.systems / 2, rng)
  const systems = []
  for (let i = 0; i < cfg.systems / 2; i++) {
    systems.push({ owner: 'X', v: odd[i], armed: false })
    systems.push({ owner: 'O', v: even[i], armed: false })
  }
  const lead = starter === 'O' ? 'O' : 'X'
  return {
    phase: 'talk', level: safe, burn: 1, maxBurns: MAX_BURNS,
    start: cfg.distance, distance: cfg.distance, tilt: 0, coolant: 0,
    debris, systems,
    ready: { X: false, O: false },
    dice: { X: [], O: [] },
    placed: [],
    lead, turn: lead,
    lastBurn: null, result: null,
  }
}

// Firebase drops empty arrays and may return numeric-keyed objects; rebuild
// by explicit key so indexes (die numbers, switch numbers) never shift.
function toArray(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(v => v != null)
  const out = []
  Object.entries(raw).forEach(([k, v]) => {
    const i = parseInt(k, 10)
    if (Number.isInteger(i) && i >= 0 && v != null) out[i] = v
  })
  return out.filter(v => v != null)
}

export function normalizeRound(raw) {
  if (!raw || !['talk', 'place', 'done'].includes(raw.phase)) return raw ? { ...raw } : null
  const num = (v, d = 0) => (Number.isFinite(v) ? v : d)
  return {
    ...raw,
    level: LEVELS[raw.level] ? raw.level : 'cadet',
    burn: num(raw.burn, 1),
    maxBurns: num(raw.maxBurns, MAX_BURNS),
    start: num(raw.start, 6),
    distance: num(raw.distance, 6),
    tilt: num(raw.tilt),
    coolant: num(raw.coolant),
    debris: toArray(raw.debris).map(d => ({ at: num(d.at), v: num(d.v, 1), cleared: !!d.cleared })),
    systems: toArray(raw.systems).map(s => ({ owner: s.owner === 'O' ? 'O' : 'X', v: num(s.v, 1), armed: !!s.armed })),
    ready: { X: !!raw.ready?.X, O: !!raw.ready?.O },
    dice: {
      X: toArray(raw.dice?.X).map(d => ({ v: num(d.v, 1), used: !!d.used })),
      O: toArray(raw.dice?.O).map(d => ({ v: num(d.v, 1), used: !!d.used })),
    },
    placed: toArray(raw.placed).map(p => ({ by: p.by === 'O' ? 'O' : 'X', slot: String(p.slot), v: num(p.v, 1), die: num(p.die) })),
    lead: raw.lead === 'O' ? 'O' : 'X',
    turn: raw.turn === 'O' ? 'O' : 'X',
    lastBurn: raw.lastBurn || null,
    result: raw.result || null,
  }
}

export const armedCount = (round) => round.systems.filter(s => s.armed).length
export const dockLimit = (round) => BASE_DOCK_LIMIT + armedCount(round)
export const slotValue = (round, seat, slot) => round.placed.find(p => p.by === seat && p.slot === slot)?.v ?? null
export const debrisUsed = (round) => round.placed.filter(p => p.slot === 'deb').length
export const diceLeft = (round, seat) => round.dice[seat].filter(d => !d.used).length

// Slots still waiting for this seat's die this burn.
export function openRequired(round, seat) {
  return ['att', 'thr'].filter(slot => slotValue(round, seat, slot) === null)
}

// The nearest uncleared debris marker with this value, or -1.
export function debrisTarget(round, value) {
  let best = -1
  round.debris.forEach((d, i) => {
    if (!d.cleared && d.v === value && (best < 0 || d.at > round.debris[best].at)) best = i
  })
  return best
}

// Why this placement is not allowed right now, or null when it is.
export function placeProblem(round, seat, { die, slot, adjust = 0 } = {}) {
  if (!round || round.phase !== 'place') return 'NOT PLACING'
  if (round.turn !== seat) return 'NOT YOUR TURN'
  const d = round.dice[seat][die]
  if (!d || d.used) return 'PICK A DIE'
  if (![-1, 0, 1].includes(adjust)) return 'BAD NUDGE'
  if (adjust && round.coolant <= 0) return 'NO COOLANT'
  const v = d.v + adjust
  if (v < 1 || v > 6) return 'DICE RUN 1 TO 6'
  const required = openRequired(round, seat)
  if (slot === 'att' || slot === 'thr') {
    return required.includes(slot) ? null : 'SLOT ALREADY FILLED'
  }
  // Every die you still hold beyond this one must be able to fill your
  // required slots: the last dice are forced onto attitude and thrust.
  if (diceLeft(round, seat) <= required.length) return 'THIS DIE MUST GO TO ATTITUDE OR THRUST'
  if (slot === 'cool') {
    if (slotValue(round, seat, 'cool') !== null) return 'COOLANT ALREADY USED THIS BURN'
    return null
  }
  if (slot === 'deb') {
    if (debrisUsed(round) >= DEBRIS_SLOTS) return 'DEBRIS SLOTS FULL'
    return debrisTarget(round, v) >= 0 ? null : `NO ${v} DEBRIS TO CLEAR`
  }
  if (/^sys\d$/.test(slot)) {
    const s = round.systems[Number(slot.slice(3))]
    if (!s) return 'NO SUCH SWITCH'
    if (s.owner !== seat) return `THAT SWITCH IS THE ${ROLE[s.owner]}'S`
    if (s.armed) return 'SWITCH ALREADY ARMED'
    return s.v === v ? null : `SWITCH NEEDS A ${s.v}`
  }
  if (slot === 'vent') return null
  return 'NO SUCH SLOT'
}

// Every slot this die could legally go to (for the UI's highlights).
export function legalSlots(round, seat, die, adjust = 0) {
  const slots = ['att', 'thr', 'deb', 'cool', ...round.systems.map((_, i) => `sys${i}`), 'vent']
  return slots.filter(slot => !placeProblem(round, seat, { die, slot, adjust }))
}

function clone(round) {
  return {
    ...round,
    debris: round.debris.map(d => ({ ...d })),
    systems: round.systems.map(s => ({ ...s })),
    ready: { ...round.ready },
    dice: { X: round.dice.X.map(d => ({ ...d })), O: round.dice.O.map(d => ({ ...d })) },
    placed: round.placed.map(p => ({ ...p })),
  }
}

// Toggle a seat's READY during the talk phase. When both are ready, both
// seats roll and the silent placement starts with this burn's lead.
export function applyReady(rawRound, seat, ready = true, rng = Math.random) {
  const round = normalizeRound(rawRound)
  if (!round || round.phase !== 'talk' || !SEATS.includes(seat)) return null
  const next = clone(round)
  next.ready[seat] = !!ready
  if (next.ready.X && next.ready.O) {
    next.dice = {
      X: Array.from({ length: DICE_PER_SEAT }, () => ({ v: rollDie(rng), used: false })),
      O: Array.from({ length: DICE_PER_SEAT }, () => ({ v: rollDie(rng), used: false })),
    }
    next.placed = []
    next.phase = 'place'
    next.turn = next.lead
  }
  return next
}

function finish(next, outcome, reason) {
  next.phase = 'done'
  next.result = { outcome, reason, burn: next.burn }
  return next
}

// Resolve the burn once all eight dice are down.
export function resolveBurn(round) {
  const next = clone(round)
  const attX = slotValue(next, 'X', 'att')
  const attO = slotValue(next, 'O', 'att')
  const thrust = (slotValue(next, 'X', 'thr') || 0) + (slotValue(next, 'O', 'thr') || 0)
  const move = moveFor(thrust)
  const tilt = next.tilt + (attX - attO)
  const target = next.distance - move
  const limit = dockLimit(next)
  next.tilt = tilt
  const passed = next.debris.filter(d => !d.cleared && d.at < next.distance && d.at >= Math.max(target, 1))
  next.lastBurn = { burn: next.burn, attX, attO, thrust, move, tilt, from: next.distance, to: Math.max(target, 0), limit }
  if (Math.abs(tilt) > MAX_TILT) return finish(next, 'loss', 'spin')
  if (passed.length) {
    next.distance = Math.max(passed[0].at, 0)
    return finish(next, 'loss', 'debris')
  }
  if (target <= 0) {
    next.distance = 0
    if (thrust > limit) return finish(next, 'loss', 'fast')
    if (tilt !== 0) return finish(next, 'loss', 'tilt')
    return finish(next, 'win', 'docked')
  }
  next.distance = target
  if (next.burn >= next.maxBurns) return finish(next, 'loss', 'window')
  next.burn += 1
  next.phase = 'talk'
  next.ready = { X: false, O: false }
  next.dice = { X: [], O: [] }
  next.placed = []
  next.lead = other(next.lead)
  next.turn = next.lead
  return next
}

// Place one die. Returns the next round, or null when illegal.
export function applyPlace(rawRound, seat, move) {
  const round = normalizeRound(rawRound)
  const { die, slot, adjust = 0 } = move || {}
  if (placeProblem(round, seat, { die, slot, adjust })) return null
  const next = clone(round)
  const v = next.dice[seat][die].v + adjust
  if (adjust) next.coolant -= 1
  next.dice[seat][die].used = true
  next.placed.push({ by: seat, slot, v, die })
  if (slot === 'deb') next.debris[debrisTarget(next, v)].cleared = true
  if (slot === 'cool') next.coolant = Math.min(MAX_COOLANT, next.coolant + 1)
  if (slot.startsWith('sys')) next.systems[Number(slot.slice(3))].armed = true
  if (diceLeft(next, 'X') + diceLeft(next, 'O') === 0) return resolveBurn(next)
  next.turn = diceLeft(next, other(seat)) > 0 ? other(seat) : seat
  return next
}

// A one-line forecast for the console: what this burn does with the dice
// already down (unknown dice count as not yet placed).
export function forecast(round) {
  const attX = slotValue(round, 'X', 'att')
  const attO = slotValue(round, 'O', 'att')
  const thrX = slotValue(round, 'X', 'thr')
  const thrO = slotValue(round, 'O', 'thr')
  const tilt = attX !== null && attO !== null ? round.tilt + attX - attO : null
  const thrust = thrX !== null && thrO !== null ? thrX + thrO : null
  return { tilt, thrust, move: thrust === null ? null : moveFor(thrust) }
}

export const LOSS_TEXT = {
  spin: 'The capsule tilted past 3 and spun out.',
  debris: 'You flew into uncleared debris.',
  fast: 'Too fast: you hit the port above the docking limit.',
  tilt: 'You reached the port tilted. It has to be level to dock.',
  window: 'Out of burns before reaching the port.',
}
