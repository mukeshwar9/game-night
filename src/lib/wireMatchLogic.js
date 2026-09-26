// WIRE CROSSED: the per-bomb room node (`games/{id}/wire`) that
// freshGameState() deals. Kept apart from wireLogic.js (the device/manual
// generator) because the registry imports this eagerly and the entry bundle
// has a size budget. Pure — no DOM, no Firebase, no React.

export const WIRE_MAX_LEVEL = 6

/**
 * The next bomb's room node. PLAY AGAIN passes the finished bomb so the level
 * climbs after a defuse (and holds after a boom) and the team streak carries;
 * NEW MATCH / a fresh room passes nothing and starts over at level 1. The
 * Tech seat is normally overwritten by the room's rotating starter
 * (firstMoverUpdates), so roles swap every bomb; the flip here is the
 * fallback for callers that don't apply it.
 *
 * @param {any} previous - the finished `wire` node, or null/undefined.
 * @param {string} seed
 */
export function nextWireBomb(previous, seed) {
  const prevLevel = Number.isInteger(previous?.level) && previous.level >= 1 ? previous.level : 0
  const defused = previous?.result?.outcome === 'defused'
  const level = prevLevel
    ? Math.min(WIRE_MAX_LEVEL, defused ? prevLevel + 1 : prevLevel)
    : 1
  const tech = previous?.tech === 'X' ? 'O' : 'X'
  return {
    seed: String(seed),
    level,
    bombNo: (Number.isInteger(previous?.bombNo) ? previous.bombNo : 0) + 1,
    tech,
    phase: 'ready',
    strikes: 0,
    stats: previous?.stats ?? null,
  }
}
