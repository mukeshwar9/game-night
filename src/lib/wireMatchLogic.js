// WIRE CROSSED: the per-bomb room node (`games/{id}/wire`) that
// freshGameState() deals. Kept apart from wireLogic.js (the device/manual
// generator) because the registry imports this eagerly and the entry bundle
// has a size budget. Pure — no DOM, no Firebase, no React.

/** Levels per mode. The full mode table is src/lib/wire/modes.js (a test keeps them equal). */
export const MODE_LEVELS = { easy: 2, medium: 3, hard: 3 }

export const isWireMode = (mode) => Object.prototype.hasOwnProperty.call(MODE_LEVELS, mode)

const nonNeg = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0)

/** A run's booms so far and total armed ms, from whatever Firebase returns. */
export function normalizeRun(raw) {
  return { booms: nonNeg(raw?.booms), ms: nonNeg(raw?.ms) }
}

/**
 * The next bomb's room node. PLAY AGAIN passes the finished bomb: a defuse
 * moves up a level, a boom retries the same level (run.booms + 1), and a
 * defuse on the mode's last level (MODE CLEARED) starts a new run at level 1
 * of the same mode. NEW MATCH / a fresh room passes nothing: no mode (the
 * players pick one), level 1, no stats. A previous bomb without a mode (dealt
 * before modes existed) also returns to the mode picker. The Tech seat is
 * normally overwritten by the room's rotating starter (firstMoverUpdates), so
 * roles swap every bomb; the flip here is the fallback for callers that don't
 * apply it.
 *
 * @param {any} previous - the finished `wire` node, or null/undefined.
 * @param {string} seed
 */
export function nextWireBomb(previous, seed) {
  const mode = isWireMode(previous?.mode) ? previous.mode : null
  const prevLevel = Number.isInteger(previous?.level) && previous.level >= 1 ? previous.level : 1
  const outcome = previous?.result?.outcome
  let level = 1
  let run = { booms: 0, ms: 0 }
  if (mode) {
    const last = MODE_LEVELS[mode]
    const prev = normalizeRun(previous.run)
    if (outcome === 'defused' && prevLevel < last) {
      level = prevLevel + 1
      run = prev
    } else if (outcome !== 'defused') {
      level = Math.min(prevLevel, last)
      run = { booms: prev.booms + (outcome === 'boom' ? 1 : 0), ms: prev.ms }
    }
  }
  const tech = previous?.tech === 'X' ? 'O' : 'X'
  return {
    seed: String(seed),
    level,
    bombNo: (Number.isInteger(previous?.bombNo) ? previous.bombNo : 0) + 1,
    tech,
    phase: 'ready',
    strikes: 0,
    mode,
    run,
    stats: previous?.stats ?? null,
  }
}
