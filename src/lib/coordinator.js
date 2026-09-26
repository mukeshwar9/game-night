// Deterministic host-fallback coordinator for host-gated party games (Fibbage,
// Spyfair, Sketch, Trivia, Wavelength, Chain Reaction 4P). The fixed room host
// (the creator) is the natural coordinator, but if their client drops the match
// must not freeze: every phase transition should be driven by whichever seat
// comes first among the *online* ones, not by the immutable `isHost` flag.
// `pickCoordinator` orders by id by default; party pages use
// `isRoomCoordinator`, which orders by join time so the creator leads while
// connected.
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
 * @param {{ ordered?: boolean }} [opts] - `ordered: true` keeps the caller's
 *   seat order (e.g. join order, so the room creator coordinates while online)
 *   instead of sorting by id. Every client must pass the same order.
 * @returns {string|null} the coordinator seat id, or null if `seats` is empty.
 */
export function pickCoordinator(seats, presence, { ordered = false } = {}) {
  const list = Array.isArray(seats) ? seats.filter(Boolean) : []
  if (list.length === 0) return null

  const isOnline = (id) => {
    const p = presence?.[id]
    if (typeof p === 'boolean') return p !== false
    return p?.online !== false
  }

  const online = list.filter(isOnline)
  const pool = online.length > 0 ? online : list
  if (ordered) return pool[0]
  return [...pool].sort((a, b) => String(a).localeCompare(String(b)))[0]
}

/**
 * Convenience wrapper: is `mySeat` the current coordinator for this seat set?
 */
export function isCoordinator(mySeat, seats, presence) {
  if (!mySeat) return false
  return pickCoordinator(seats, presence) === mySeat
}

/**
 * Seat ids of a uid-keyed party room's `players` node (the nPlayer room model,
 * where presence lives on each seat as `players[uid].online`), in join order:
 * `joinedAt`, then id as the tiebreak — the order every lobby lists, and the
 * same on every client.
 */
export function roomSeats(players) {
  return Object.entries(players || {})
    .filter(([, p]) => p && typeof p === 'object')
    .map(([id, p]) => ({ id: p.playerId || id, joinedAt: p.joinedAt || 0 }))
    .sort((a, b) => a.joinedAt - b.joinedAt || String(a.id).localeCompare(String(b.id)))
    .map(s => s.id)
}

/**
 * The party room's coordinator uid. A room-level host override (`game.hostUid`,
 * set by TRANSFER HOST) wins while that player is seated and online; otherwise
 * it is the first ONLINE seat in join order. So the room creator (first to
 * join) keeps the controls while connected; if they close the tab
 * (onDisconnect flips their `online` to false) the next player to have joined
 * takes over instead of the room freezing, and hands them back when the
 * creator returns. Absent `hostUid` = join-order behaviour.
 *
 * @returns {string|null} null for an empty room.
 */
export function roomCoordinator(players, hostUid = null) {
  const host = hostUid ? players?.[hostUid] : null
  if (host && typeof host === 'object' && host.online !== false) return hostUid
  return pickCoordinator(roomSeats(players), players, { ordered: true })
}

/**
 * Party-room shorthand for every host-only control (START, NEW MATCH, phase
 * advances): true only for a SEATED player who is the current
 * roomCoordinator. Spectators are never the coordinator.
 */
export function isRoomCoordinator(mySeat, players, hostUid = null) {
  if (!mySeat || !players?.[mySeat]) return false
  return roomCoordinator(players, hostUid) === mySeat
}
