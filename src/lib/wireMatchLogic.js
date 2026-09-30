// WIRE CROSSED: the small per-match state helper imported by games.js.
// Keep this module independent of wireLogic.js to protect the entry bundle.

export const WIRE_MAX_LEVEL = 6 // legacy generator ceiling
export const WIRE_BOMBS_PER_MATCH = 2
export const WIRE_DIFFICULTY_LEVELS = Object.freeze({ easy: 1, normal: 3, hard: 5 })

export function levelForDifficulty(difficulty) {
  return Object.prototype.hasOwnProperty.call(WIRE_DIFFICULTY_LEVELS, difficulty)
    ? WIRE_DIFFICULTY_LEVELS[difficulty]
    : null
}

/** Resolve old rooms (which only persisted `level`) without rewriting them. */
export function difficultyForLevel(level) {
  if (!Number.isInteger(level) || level < 1) return null
  if (level >= 5) return 'hard'
  if (level >= 3) return 'normal'
  return 'easy'
}

/** Difficulty explicitly selected for v2 rooms; infer it for legacy rooms. */
export function getWireDifficulty(wire) {
  if (Object.prototype.hasOwnProperty.call(WIRE_DIFFICULTY_LEVELS, wire?.difficulty)) return wire.difficulty
  return wire?.generatorVersion === 2 ? null : difficultyForLevel(wire?.level)
}

/**
 * Record this seat's v2 support. Upgrade only an unarmed first bomb after
 * both clients have acknowledged; older open clients keep using v1 rules.
 * Returns null when no room write is needed.
 */
export function registerWireClient(wire, seat) {
  if (!wire || (seat !== 'X' && seat !== 'O')) return null
  const key = seat === 'X' ? 'clientVersionX' : 'clientVersionO'
  const versions = {
    X: seat === 'X' ? 2 : wire.clientVersionX,
    O: seat === 'O' ? 2 : wire.clientVersionO,
  }
  if (wire.generatorVersion === 2 && wire[key] === 2) return null
  if (wire.generatorVersion !== 2 && wire[key] === 2
    && !(wire.phase === 'ready' && (wire.bombNo || 1) === 1 && versions.X === 2 && versions.O === 2)) return null

  const next = { ...wire, [key]: 2 }
  if (wire.generatorVersion !== 2 && wire.phase === 'ready'
    && (wire.bombNo || 1) === 1 && versions.X === 2 && versions.O === 2) {
    next.generatorVersion = 2
    next.level = 0
    delete next.difficulty
  }
  return next
}

/**
 * Prepare next bomb. Legacy rooms keep the old climb/hold ladder; v2 rooms
 * keep selected difficulty fixed and cap match at two bombs. Tech swaps either way.
 *
 * @param {any} previous - finished bomb, or null for a fresh room/match.
 * @param {string} seed
 */
export function nextWireBomb(previous, seed) {
  const legacyLevel = Number.isInteger(previous?.level) && previous.level >= 1 ? previous.level : 0
  const version = previous?.generatorVersion === 2 ? 2 : 1
  const defused = previous?.result?.outcome === 'defused'
  const level = version === 2
    ? (Number.isInteger(previous?.level) && previous.level >= 1 ? previous.level : 0)
    : legacyLevel
      ? Math.min(WIRE_MAX_LEVEL, defused ? legacyLevel + 1 : legacyLevel)
      : 1
  const next = {
    seed: String(seed),
    level,
    generatorVersion: version,
    bombNo: (Number.isInteger(previous?.bombNo) ? previous.bombNo : 0) + 1,
    tech: previous?.tech === 'X' ? 'O' : 'X',
    phase: 'ready',
    strikes: 0,
    stats: previous?.stats ?? null,
  }
  if (version === 2) {
    const difficulty = getWireDifficulty(previous) ?? difficultyForLevel(level)
    if (difficulty) next.difficulty = difficulty
    if (previous?.clientVersionX === 2) next.clientVersionX = 2
    if (previous?.clientVersionO === 2) next.clientVersionO = 2
  } else {
    if (previous?.clientVersionX === 2) next.clientVersionX = 2
    if (previous?.clientVersionO === 2) next.clientVersionO = 2
  }
  return next
}

export function isWireMatchComplete(wire) {
  return wire?.generatorVersion === 2
    && wire.phase === 'over'
    && Number(wire.bombNo) >= WIRE_BOMBS_PER_MATCH
}

export function didWinWireMatch(wire) {
  return isWireMatchComplete(wire)
    && Number(wire.stats?.defused) === WIRE_BOMBS_PER_MATCH
    && Number(wire.stats?.booms) === 0
}
