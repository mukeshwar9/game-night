// @ts-check
// Arrows solo — the 20-level campaign, endless boards and progress. Pure
// logic: no DOM, no Firebase, no React (storage lives in arrowsProgress.js).
//
// Every level is a generator spec (hand-set shape and twists) plus a seed
// picked by scripts/pick-arrows-levels.mjs so the difficulty score climbs
// level by level. The generator guarantees solvability by construction and
// arrowsLevelsLogic.test.js re-checks every level with the solver.

import { ARROWS_LIVES, ARROWS_TIERS, generateArrowsLevel, isBent, isCurved, isDiagonal, solveArrows } from './arrowsLogic.js'

// Shape of each level. Levels 1–5 teach the core rule on small boards;
// straight diagonal arrows arrive at level 6, their curved-body cousins at
// level 8 and hooked arrows at level 11;
// from there boards grow toward the full 10 × 13 hard size and get denser.
// `samples` is the generator's look-ahead — more means fewer arrows free at
// the start. `bend` is the share of diagonals that get a curved body. `intro`
// marks the level that introduces a twist.
export const ARROWS_LEVEL_SPECS = [
  { cols: 5, rows: 6, maxLen: 3, fill: 0.62, samples: 2 },
  { cols: 5, rows: 7, maxLen: 3, fill: 0.7, samples: 3 },
  { cols: 6, rows: 7, maxLen: 4, fill: 0.74, samples: 4 },
  { cols: 6, rows: 8, maxLen: 4, fill: 0.78, samples: 5 },
  { cols: 6, rows: 8, maxLen: 5, fill: 0.82, samples: 6 },
  { cols: 6, rows: 8, maxLen: 4, fill: 0.8, samples: 6, diag: 0.3, intro: 'diag' },
  { cols: 7, rows: 8, maxLen: 5, fill: 0.82, samples: 6, diag: 0.16 },
  { cols: 7, rows: 9, maxLen: 5, fill: 0.84, samples: 7, diag: 0.28, bend: 1, intro: 'bend' },
  { cols: 7, rows: 9, maxLen: 5, fill: 0.86, samples: 8, diag: 0.2, bend: 0.8 },
  { cols: 7, rows: 10, maxLen: 6, fill: 0.86, samples: 8, diag: 0.2, bend: 0.8 },
  { cols: 7, rows: 10, maxLen: 5, fill: 0.84, samples: 8, diag: 0.08, curve: 0.3, bend: 0.8, intro: 'curve' },
  { cols: 8, rows: 10, maxLen: 6, fill: 0.86, samples: 8, diag: 0.12, curve: 0.15, bend: 0.9 },
  { cols: 8, rows: 11, maxLen: 6, fill: 0.87, samples: 9, diag: 0.12, curve: 0.15, bend: 0.9 },
  { cols: 8, rows: 11, maxLen: 7, fill: 0.88, samples: 9, diag: 0.14, curve: 0.15, bend: 0.9 },
  { cols: 8, rows: 12, maxLen: 7, fill: 0.88, samples: 10, diag: 0.14, curve: 0.16, bend: 0.9 },
  { cols: 9, rows: 12, maxLen: 7, fill: 0.89, samples: 10, diag: 0.15, curve: 0.16, bend: 0.9 },
  { cols: 9, rows: 12, maxLen: 8, fill: 0.9, samples: 11, diag: 0.15, curve: 0.18, bend: 0.9 },
  { cols: 9, rows: 13, maxLen: 8, fill: 0.9, samples: 12, diag: 0.16, curve: 0.18, bend: 0.9 },
  { cols: 10, rows: 13, maxLen: 8, fill: 0.9, samples: 12, diag: 0.16, curve: 0.18, bend: 0.9 },
  { cols: 10, rows: 13, maxLen: 9, fill: 0.92, samples: 14, diag: 0.18, curve: 0.2, bend: 0.9 },
]

// Picked by scripts/pick-arrows-levels.mjs — rerun it after changing a spec.
export const ARROWS_LEVEL_SEEDS = [
  63, 296, 825, 472, 9, 71, 46, 59, 5, 515,
  92, 1066, 126, 733, 966, 740, 2141, 360, 316, 2221,
]

export const ARROWS_LEVEL_COUNT = ARROWS_LEVEL_SPECS.length

// One-line tutorials, shown the first time a player meets each twist.
export const ARROWS_TWIST_TIPS = {
  diag: 'NEW · DIAGONAL ARROWS FLY CORNER TO CORNER — ONLY CELLS ON THEIR DIAGONAL BLOCK THEM.',
  bend: 'NEW · CURVED DIAGONALS BEND LIKE A SNAKE, BUT THE HEAD STILL FLIES STRAIGHT ALONG ITS DIAGONAL.',
  curve: 'NEW · HOOKED ARROWS FLY TO THE EDGE, TURN ONCE THE WAY THE HOOK POINTS, THEN RUN ALONG IT.',
}

// An intro level must actually show its twist a few times.
// Levels past the curved-diagonal intro keep showing at least one.
export function levelMeetsIntro(spec, level) {
  if (spec.bend > 0 && spec.diag > 0 && !level.arrows.some(isBent)) return false
  if (spec.intro === 'diag') return level.arrows.filter(isDiagonal).length >= 2
  if (spec.intro === 'bend') return level.arrows.filter(isBent).length >= 2
  if (spec.intro === 'curve') return level.arrows.filter(isCurved).length >= 2
  return true
}

const levelCache = new Map()

// The board for level n (1-based); null outside 1..ARROWS_LEVEL_COUNT.
export function getArrowsLevel(n) {
  if (!Number.isInteger(n) || n < 1 || n > ARROWS_LEVEL_COUNT) return null
  if (!levelCache.has(n)) {
    const spec = { ...ARROWS_LEVEL_SPECS[n - 1], name: `level-${n}` }
    levelCache.set(n, generateArrowsLevel(ARROWS_LEVEL_SEEDS[n - 1], spec))
  }
  return levelCache.get(n)
}

// Twist kinds present on a board, in the order they are introduced.
export function twistsIn(level) {
  const out = []
  if (level.arrows.some(isDiagonal)) out.push('diag')
  if (level.arrows.some(isBent)) out.push('bend')
  if (level.arrows.some(isCurved)) out.push('curve')
  return out
}

// The first twist on this board the player has not been taught yet.
export function newTwist(level, seen) {
  return twistsIn(level).find((t) => !seen?.[t]) ?? null
}

// Endless boards: any seed at a race tier. The generator is solvable by
// construction; the solver re-checks and steps to the next seed if a board
// ever failed, so endless play can never serve a dead board.
export function endlessLevel(seed, tier) {
  const t = ARROWS_TIERS.includes(tier) ? tier : 'easy'
  for (let s = seed; ; s += 1) {
    const level = generateArrowsLevel(s, t)
    if (solveArrows(level).solvable) return level
  }
}

// ── Scoring ───────────────────────────────────────────────────────────────

// Stars for a cleared board: 3 for no blocked taps, one fewer per mistake;
// taking a hint caps it at 2. 0 = not cleared (out of lives).
export function starsFor({ mistakes = 0, hints = 0 } = {}) {
  if (mistakes >= ARROWS_LIVES) return 0
  return Math.max(1, Math.min(3 - mistakes, hints > 0 ? 2 : 3))
}

// ── Progress ──────────────────────────────────────────────────────────────
// { levels: { l1: stars, … }, endless: { easy, medium, hard } }. Level keys
// carry an `l` prefix so Firebase never turns the map into a sparse array.

export const levelKey = (n) => `l${n}`

export function blankProgress() {
  return { levels: {}, endless: { easy: 0, medium: 0, hard: 0 } }
}

// Sanitise anything read from storage or Firebase into a valid progress
// object: unknown keys dropped, stars clamped to 1..3, counts to integers ≥ 0.
export function normalizeProgress(raw) {
  const out = blankProgress()
  if (!raw || typeof raw !== 'object') return out
  const levels = raw.levels && typeof raw.levels === 'object' ? raw.levels : {}
  for (let n = 1; n <= ARROWS_LEVEL_COUNT; n += 1) {
    const v = Number(levels[levelKey(n)])
    if (v >= 1) out.levels[levelKey(n)] = Math.min(3, Math.floor(v))
  }
  const endless = raw.endless && typeof raw.endless === 'object' ? raw.endless : {}
  for (const tier of ARROWS_TIERS) {
    const v = Math.floor(Number(endless[tier]))
    out.endless[tier] = Number.isFinite(v) && v > 0 ? v : 0
  }
  return out
}

export function levelStars(progress, n) {
  return progress?.levels?.[levelKey(n)] ?? 0
}

// Level 1 is always open; every other level opens once the one before it is
// cleared.
export function isLevelUnlocked(progress, n) {
  if (n < 1 || n > ARROWS_LEVEL_COUNT) return false
  return n === 1 || levelStars(progress, n - 1) >= 1
}

// Keep the best result: a replay never lowers a level's stars.
export function recordLevelResult(progress, n, stars) {
  const p = normalizeProgress(progress)
  if (n < 1 || n > ARROWS_LEVEL_COUNT || stars < 1) return p
  const key = levelKey(n)
  p.levels[key] = Math.max(p.levels[key] ?? 0, Math.min(3, stars))
  return p
}

export function recordEndlessClear(progress, tier) {
  const p = normalizeProgress(progress)
  if (ARROWS_TIERS.includes(tier)) p.endless[tier] += 1
  return p
}

// Union of two progress snapshots (device + account): best stars per level,
// highest endless count per tier. Never loses progress from either side.
export function mergeProgress(a, b) {
  const x = normalizeProgress(a)
  const y = normalizeProgress(b)
  const out = blankProgress()
  for (let n = 1; n <= ARROWS_LEVEL_COUNT; n += 1) {
    const key = levelKey(n)
    const best = Math.max(x.levels[key] ?? 0, y.levels[key] ?? 0)
    if (best) out.levels[key] = best
  }
  for (const tier of ARROWS_TIERS) out.endless[tier] = Math.max(x.endless[tier], y.endless[tier])
  return out
}

export function sameProgress(a, b) {
  return JSON.stringify(normalizeProgress(a)) === JSON.stringify(normalizeProgress(b))
}

export function totalStars(progress) {
  let n = 0
  for (const v of Object.values(normalizeProgress(progress).levels)) n += v
  return n
}

// Where CONTINUE goes: the first unlocked level not yet cleared, else the
// last level.
export function nextLevel(progress) {
  for (let n = 1; n <= ARROWS_LEVEL_COUNT; n += 1) {
    if (isLevelUnlocked(progress, n) && levelStars(progress, n) === 0) return n
  }
  return ARROWS_LEVEL_COUNT
}
