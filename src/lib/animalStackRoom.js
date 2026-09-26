// animalStackRoom.js — ANIMAL STACK online room rules (games/{id}/stack).
// Pure — no DOM/Firebase/React; the page wraps these in runTransaction on the
// whole room node.
//
// Flow per drop (Artillery-style replay, RTDB only — no WebRTC):
//   aim      the seat at order[turn] aims (ghost `aim` mirrored ≤6 Hz) and
//            appends drops/dNNN {by, x cm, r}  → phase 'settle'
//   settle   EVERY client simulates that drop from checkpoint `cp`; the first
//            to finish writes the outcome (CAS on cp.n). Stand → cp advances,
//            next seat aims. Topple → heart lost, phase 'roundover' (or 'over').
//   roundover  after a short pause any seated client starts the next tower.
// The piece is derived from the tower seed, never sent. `cp` (hash + poses)
// lets late joiners draw the tower at once and exposes any desync.
import {
  hashState, encodePoses, decodePoses, nextAlive, normalizeDrop, pieceAt, roundSeed,
} from './animalStackLogic'

export const AWAY_GRACE_MS = 12000 // seat offline this long on its turn → auto-drop
export const IDLE_GRACE_MS = 25000 // turn open this long (timer should have fired) → auto-drop
export const ROUNDOVER_MS = 3500 // TOPPLE! pause before the next tower
export { MAX_SEATS, startStackMatch } from './animalStackCore'

export const dropKey = (n) => `d${String(n).padStart(3, '0')}`

/** Array-shaped Firebase field → dense array, mapped by explicit key. */
function arr(raw) {
  if (Array.isArray(raw)) return raw.slice()
  const out = []
  if (raw && typeof raw === 'object') {
    for (const [key, v] of Object.entries(raw)) {
      const i = parseInt(key, 10)
      if (Number.isInteger(i) && i >= 0) out[i] = v
    }
  }
  return out
}

/** Normalized read of the stack node (sparse/missing fields filled in). */
export function readStack(raw) {
  if (!raw || typeof raw !== 'object') return null
  const order = arr(raw.order).filter(u => typeof u === 'string')
  const hearts = order.map((_, i) => Number(arr(raw.hearts)[i]) || 0)
  const drops = Object.entries(raw.drops || {})
    .filter(([key]) => /^d\d{3}$/.test(key))
    .map(([key, d]) => ({ n: parseInt(key.slice(1), 10), by: d?.by ?? null, x: Number(d?.x) || 0, r: Number(d?.r) || 0, auto: !!d?.auto }))
    .sort((a, b) => a.n - b.n)
  const cp = { n: Number(raw.cp?.n) || 0, hash: raw.cp?.hash ?? hashState([]), poses: raw.cp?.poses ?? '' }
  return {
    base: raw.base | 0, round: Number(raw.round) || 1, seed: raw.seed | 0,
    order, hearts, turn: Number(raw.turn) || 0, phase: raw.phase || 'aim',
    cp, drops, aim: raw.aim ?? null, result: raw.result ?? null, miss: raw.miss || {},
    winner: raw.winner ?? null,
  }
}

/** Tower drawn from the checkpoint. */
export const cpState = (stack) => decodePoses(stack?.cp?.poses)

/** The drop waiting to be settled (phase 'settle'), with its derived piece. */
export function pendingDrop(stack) {
  if (!stack) return null
  const d = stack.drops.find(x => x.n === stack.cp.n)
  if (!d) return null
  return { n: d.n, by: d.by, auto: d.auto, ...normalizeDrop({ k: pieceAt(stack.seed, d.n), x: d.x, r: d.r }) }
}

/** uid whose turn it is (null when no one is aiming). */
export const turnUid = (stack) => (stack && stack.phase === 'aim' ? stack.order[stack.turn] ?? null : null)

function raw(g) { return g?.stack && typeof g.stack === 'object' ? g.stack : null }

/**
 * Append the current seat's drop. `uid` must hold the turn unless `auto`
 * (a stand-in drop for an away seat, written by any seated client).
 * Returns the new room node, or null when it is not that seat's drop.
 */
export function applyDrop(g, uid, aim, { auto = false, expectedN } = {}) {
  const s = readStack(raw(g))
  if (!g || g.status !== 'playing' || !s || s.phase !== 'aim') return null
  const owner = s.order[s.turn]
  if (!owner || (!auto && owner !== uid)) return null
  if (expectedN != null && s.cp.n !== expectedN) return null
  if (s.drops.some(d => d.n === s.cp.n)) return null
  const d = normalizeDrop({ k: 0, x: aim?.x ?? 0, r: aim?.r ?? 0 })
  const drop = { by: owner, x: d.x, r: d.r, ...(auto ? { auto: true } : {}) }
  const miss = { ...(raw(g).miss || {}) }
  if (auto) miss[owner] = (miss[owner] || 0) + 1
  else miss[owner] = 0
  return {
    ...g,
    stack: { ...raw(g), phase: 'settle', aim: null, miss, drops: { ...(raw(g).drops || {}), [dropKey(s.cp.n)]: drop } },
    lastActivityAt: Date.now(),
  }
}

/**
 * Fold the simulated outcome of drop `n` into the room. `result` is
 * runDrop's `{ fell, state }`. CAS: only while that drop is still pending.
 */
export function applySettle(g, n, result) {
  const r0 = raw(g)
  const s = readStack(r0)
  if (!g || g.status !== 'playing' || !s || s.phase !== 'settle' || s.cp.n !== n) return null
  if (!s.drops.some(d => d.n === n)) return null
  if (!result.fell) {
    return {
      ...g,
      stack: {
        ...r0,
        cp: { n: n + 1, hash: hashState(result.state), poses: encodePoses(result.state) },
        turn: nextAlive(s.hearts, s.turn), phase: 'aim', aim: null,
      },
      lastActivityAt: Date.now(),
    }
  }
  const hearts = s.hearts.map((h, i) => (i === s.turn ? Math.max(0, h - 1) : h))
  const alive = hearts.map((h, i) => (h > 0 ? i : -1)).filter(i => i >= 0)
  const result2 = { toppler: s.order[s.turn], round: s.round, n }
  if (alive.length <= 1) {
    const winner = s.order[alive[0]] ?? null
    return {
      ...g,
      stack: { ...r0, hearts, phase: 'over', result: result2, winner },
      status: 'finished', ...(winner ? { winner } : {}),
      lastActivityAt: Date.now(),
    }
  }
  return { ...g, stack: { ...r0, hearts, phase: 'roundover', result: result2 }, lastActivityAt: Date.now() }
}

/** Start the next tower after a topple (CAS on round). Toppler starts if alive. */
export function applyNextTower(g, round) {
  const r0 = raw(g)
  const s = readStack(r0)
  if (!g || g.status !== 'playing' || !s || s.phase !== 'roundover' || s.round !== round) return null
  const tIdx = s.order.indexOf(s.result?.toppler)
  const from = tIdx >= 0 ? tIdx : s.turn
  const next = s.hearts[from] > 0 ? from : nextAlive(s.hearts, from)
  return {
    ...g,
    stack: {
      ...r0, round: round + 1, seed: roundSeed(s.base, round + 1), turn: next, phase: 'aim',
      cp: { n: 0, hash: hashState([]), poses: '' }, drops: null, aim: null,
    },
    lastActivityAt: Date.now(),
  }
}

/**
 * The seat to move has gone quiet (offline, or its timer never fired).
 * First miss: drop for them at their last ghost aim (or centre). A second
 * miss in a row while offline: they are out; the turn moves on, and the last
 * seat standing wins. CAS on the uid expected to be aiming and the drop count.
 */
export function applyAway(g, expectedUid, expectedN) {
  const r0 = raw(g)
  const s = readStack(r0)
  if (!g || g.status !== 'playing' || !s || s.phase !== 'aim') return null
  const owner = s.order[s.turn]
  if (owner !== expectedUid || s.cp.n !== expectedN) return null
  const offline = g.players?.[owner]?.online === false || !g.players?.[owner]
  if ((s.miss[owner] || 0) >= 1 && offline) {
    const hearts = s.hearts.map((h, i) => (i === s.turn ? 0 : h))
    const alive = hearts.map((h, i) => (h > 0 ? i : -1)).filter(i => i >= 0)
    if (alive.length <= 1) {
      const winner = s.order[alive[0]] ?? null
      return { ...g, stack: { ...r0, hearts, phase: 'over', winner }, status: 'finished', ...(winner ? { winner } : {}), lastActivityAt: Date.now() }
    }
    return { ...g, stack: { ...r0, hearts, turn: nextAlive(hearts, s.turn), aim: null }, lastActivityAt: Date.now() }
  }
  const aim = s.aim ? { x: Math.round((Number(s.aim.x) || 0) * 100), r: Number(s.aim.r) || 0 } : { x: 0, r: 0 }
  return applyDrop(g, null, aim, { auto: true, expectedN })
}
