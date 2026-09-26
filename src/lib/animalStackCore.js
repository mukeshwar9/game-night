// animalStackCore.js — the planck-free part of ANIMAL STACK: match sizing,
// tower seeds, state hashing and the registry's startRound. Kept apart from
// animalStackLogic.js (which pulls in the ~46 KB physics engine) because
// games.js is in the entry bundle and must only import this file.

export const MAX_SEATS = 4

/** Hearts each player starts with: 3 in a duel, 2 with 3-4 players, 1 in CLIMB. */
export const heartsFor = (n) => (n <= 1 ? 1 : n === 2 ? 3 : 2)

/** Seed of tower `round` (1-based) in a match whose base seed is `baseSeed`. */
export function roundSeed(baseSeed, round) {
  return ((baseSeed | 0) + Math.imul(round | 0, 7919)) | 0
}

/** Next seat after `from` that still has hearts (or `from` if none). */
export function nextAlive(hearts, from) {
  const n = hearts.length
  for (let s = 1; s <= n; s++) {
    const j = (from + s) % n
    if (hearts[j] > 0) return j
  }
  return from
}

/** FNV-1a over a canonical tower state ([{k,x,y,a}]), as 8 hex chars. */
export function hashState(state) {
  const s = state.map(o => `${o.k},${o.x},${o.y},${o.a}`).join(';')
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * Registry `startRound`: deal seats in join order (online, max 4), hearts by
 * player count, first tower seeded from `base`. Everything lives in `stack`.
 */
export function startStackMatch(players, base) {
  const seats = Object.values(players || {})
    .filter(p => p && p.playerId && p.online !== false)
    .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0) || String(a.playerId).localeCompare(String(b.playerId)))
    .slice(0, MAX_SEATS)
  const order = seats.map(p => p.playerId)
  return {
    stack: {
      base: base | 0, round: 1, seed: roundSeed(base, 1),
      order, hearts: order.map(() => heartsFor(order.length)), turn: 0, phase: 'aim',
      cp: { n: 0, hash: hashState([]), poses: '' },
      drops: null, aim: null, result: null, miss: null, winner: null,
    },
  }
}
