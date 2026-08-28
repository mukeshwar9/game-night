// Deterministic host-fallback coordinator for host-gated party games (Fibbage,
// Spyfair, Sketch, Trivia). The fixed room host (X, the creator) is the natural
// coordinator, but if their client drops the match must not freeze: every phase
// transition should be driven by whichever *online* seat currently sorts lowest
// by id, not by the immutable `isHost` flag.
//
// Pure — no DOM/Firebase/React. Every client (including a client that just
// reconnected) computes the same answer from `players`, so at most one client
// ever believes it is the coordinator for a given seat set, and transitions
// stay single-writer. Pair with `runTransaction` at the write site so a
// simultaneous handover (two clients briefly agreeing on different coordinators
// during a presence flap) is still idempotent.

/**
 * Pick the coordinator seat: the lowest-id seat that is currently online,
 * falling back to the lowest-id seat overall if nobody appears online (e.g.
 * presence data hasn't loaded yet) so a coordinator is always returned.
 *
 * @param {string[]} seats - seat/player ids in the room (order doesn't matter).
 * @param {Record<string, { online?: boolean } | boolean> | null | undefined} presence -
 *   per-seat presence, keyed by seat id. A value's `online` field (or the value
 *   itself, if it's a boolean) is treated as `false` only when explicitly
 *   `false` — missing/undefined presence is treated as online, matching the
 *   rest of the codebase's `online !== false` convention.
 * @returns {string|null} the coordinator seat id, or null if `seats` is empty.
 */
export function pickCoordinator(seats, presence) {
  const list = Array.isArray(seats) ? seats.filter(Boolean) : []
  if (list.length === 0) return null

  const isOnline = (id) => {
    const p = presence?.[id]
    if (typeof p === 'boolean') return p !== false
    return p?.online !== false
  }

  const online = list.filter(isOnline)
  const pool = online.length > 0 ? online : list
  return [...pool].sort((a, b) => String(a).localeCompare(String(b)))[0]
}

/**
 * Convenience wrapper: is `mySeat` the current coordinator for this seat set?
 */
export function isCoordinator(mySeat, seats, presence) {
  if (!mySeat) return false
  return pickCoordinator(seats, presence) === mySeat
}
