// WIRE CROSSED bomb modifiers (docs/prds/wire-crossed-modes.md §3.2, §5). All
// of them derive from the bomb seed. Only the shipped ones are ever drawn, so
// a mode's modifier count is met from the shipped set until the rest land.
//
// Pure — no DOM, no Firebase, no React.
import { sample, shuffle } from './rng'

export const STRIKE_PENALTY_MS = 15_000
export const SHORT_FUSE_PENALTY_MS = 25_000
/** The clock turns to the alarm colour at this many ms left. */
export const URGENT_MS = 30_000
export const SHORT_FUSE_URGENT_MS = 45_000

export const SEVERITY_RANK = { mild: 1, medium: 2, severe: 3 }

export const MODIFIERS = {
  scrambled: {
    name: 'SCRAMBLED PAGES', severity: 'mild',
    desc: 'The Handbook tabs come in a different order from the device.',
  },
  errata: {
    name: 'ERRATA', severity: 'mild',
    desc: 'A red slip on one manual page replaces one rule. Use the slip, not the printed rule.',
  },
  shortFuse: {
    name: 'SHORT FUSE', severity: 'medium',
    desc: 'A strike costs 25 seconds and the clock turns red at 45.',
  },
  blackout: {
    name: 'BLACKOUT', severity: 'medium',
    desc: 'The device panel goes dark for 3 seconds every 25 seconds. You can still act; the clock and colour tags stay.',
  },
  swap: {
    name: 'SWAP', severity: 'severe',
    desc: 'At half time the Tech and the Handbook swap roles, once.',
  },
}

/** Modifiers the game deals: every one in MODIFIERS. */
export const SHIPPED_MODIFIERS = ['scrambled', 'errata', 'shortFuse', 'blackout', 'swap']

/** Blackout: dark for BLACKOUT_MS at every multiple of BLACKOUT_EVERY_MS after arming. */
export const BLACKOUT_EVERY_MS = 25_000
export const BLACKOUT_MS = 3_000
/** How long the SWAP! banner shows after `swapAt`. */
export const SWAP_BANNER_MS = 3_000

/** Ids from `pool` whose severity is at most `max`, in declaration order. */
export function eligibleModifiers(max, pool = SHIPPED_MODIFIERS) {
  const cap = SEVERITY_RANK[max] ?? 0
  return Object.keys(MODIFIERS).filter(id => pool.includes(id) && SEVERITY_RANK[MODIFIERS[id].severity] <= cap)
}

/**
 * `count` distinct modifiers no more severe than `max`. Fewer when the pool
 * has fewer eligible (the table stays valid while modifiers are unshipped).
 */
export function drawModifiers(rng, count, max, pool = SHIPPED_MODIFIERS) {
  if (!count) return []
  return sample(rng, eligibleModifiers(max, pool), count)
}

/** A permutation of 0..n-1 that is never the identity when n >= 2. */
export function makePageOrder(rng, n) {
  const order = shuffle(rng, Array.from({ length: n }, (_, i) => i))
  if (n >= 2 && order.every((v, i) => v === i)) order.push(order.shift())
  return order
}

/** Strike cost and urgent-clock threshold for a modifier list. */
export function fuseFor(modifiers) {
  const short = modifiers?.includes('shortFuse')
  return {
    strikePenaltyMs: short ? SHORT_FUSE_PENALTY_MS : STRIKE_PENALTY_MS,
    urgentMs: short ? SHORT_FUSE_URGENT_MS : URGENT_MS,
  }
}

// Legacy bombs carry neither field: they use the base values.
export const strikePenaltyOf = (bomb) => bomb?.strikePenaltyMs ?? STRIKE_PENALTY_MS
export const urgentMsOf = (bomb) => bomb?.urgentMs ?? URGENT_MS

/** The module index shown at each Handbook tab position (identity when unscrambled). */
export function pageOrderOf(bomb) {
  const n = bomb?.modules?.length ?? 0
  const order = bomb?.pageOrder
  if (Array.isArray(order) && order.length === n) return order
  return Array.from({ length: n }, (_, i) => i)
}

// ---------------------------------------------------------------------------
// Blackout and Swap (rendering + role helpers; both read the synced wire node)

/**
 * Blackout: is the Tech's panel dark at `now`? Dark for 3 s starting 25 s,
 * 50 s, 75 s ... after `armedAt`. Only an armed bomb goes dark. The caller
 * checks that the bomb carries the modifier; this only reads the clock.
 */
export function isBlackout(wire, now) {
  if (wire?.phase !== 'armed') return false
  const armedAt = Number(wire.armedAt)
  if (!Number.isFinite(armedAt) || !Number.isFinite(now)) return false
  const elapsed = now - armedAt
  return elapsed >= BLACKOUT_EVERY_MS && elapsed % BLACKOUT_EVERY_MS < BLACKOUT_MS
}

/** Has the Swap happened by `now`? Needs an armed bomb with a numeric `swapAt`. */
export function isSwapped(wire, now) {
  if (wire?.phase !== 'armed' || wire.swapAt == null) return false
  const at = Number(wire.swapAt)
  return Number.isFinite(at) && now >= at
}

/** Is the SWAP! banner up at `now` (the 3 s after `swapAt`)? */
export const isSwapBanner = (wire, now) => isSwapped(wire, now) && now < Number(wire.swapAt) + SWAP_BANNER_MS

/**
 * The role of `symbol` ('X' | 'O' | falsy for a spectator) at `now`:
 * 'tech', 'handbook' or 'spectator'. The Tech seat is `wire.tech` (default X);
 * once `now >= wire.swapAt` on an armed bomb the two roles trade places.
 */
export function roleOf(wire, symbol, now) {
  if (symbol !== 'X' && symbol !== 'O') return 'spectator'
  const tech = wire?.tech === 'O' ? 'O' : 'X'
  const isTech = (symbol === tech) !== isSwapped(wire, now)
  return isTech ? 'tech' : 'handbook'
}
