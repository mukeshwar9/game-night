// Arrows solo progress as pure data: stars, replays, endless clears, chapter
// goals. Split from arrowsLevelsLogic.js so the always-loaded home screen can
// read progress without pulling in the ~450 KB of baked level boards.
// arrowsLevelsLogic.js re-exports everything here.

import { ARROWS_TIERS } from './arrowsMatchLogic.js'

// 17 chapters of 10 boards (arrowsLevelsLogic.js asserts the two agree).
export const ARROWS_LEVEL_COUNT = 170

// ── Progress ──────────────────────────────────────────────────────────────
// { levels: { l1: stars, … }, endless: { easy, medium, hard }, replayed: { l1: true, … } }.
// Level keys carry an `l` prefix so Firebase never turns the map into a sparse
// array. `replayed` marks a level among the first REPLAY_LEVELS cleared on its
// current board: stars earned before the 170-level rebuild keep their level
// number, and those levels show a NEW BOARD tag until they are replayed.
const REPLAY_LEVELS = 100

export const levelKey = (n) => `l${n}`

export function blankProgress() {
  return { levels: {}, endless: { easy: 0, medium: 0, hard: 0 }, replayed: {} }
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
  const replayed = raw.replayed && typeof raw.replayed === 'object' ? raw.replayed : {}
  for (let n = 1; n <= REPLAY_LEVELS; n += 1) {
    if (replayed[levelKey(n)] === true) out.replayed[levelKey(n)] = true
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

// A starred level among the first 100 whose current board has not been
// cleared yet: its stars come from the board it had before the rebuild.
export function isNewBoard(progress, n) {
  return n >= 1 && n <= REPLAY_LEVELS && levelStars(progress, n) >= 1 && !progress?.replayed?.[levelKey(n)]
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
  if (n <= REPLAY_LEVELS) p.replayed[key] = true
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
    if (x.replayed[key] || y.replayed[key]) out.replayed[key] = true
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

// Stars one chapter can hold (3 per level).
export function chapterStars(progress, chapter) {
  let n = 0
  for (let l = chapter.from; l <= chapter.to; l += 1) n += levelStars(progress, l)
  return n
}

// A chapter turns gold at 24 of its 30 stars. A target only: it never locks
// or unlocks anything (isLevelUnlocked ignores it).
export const ARROWS_CHAPTER_GOLD = 24
const goldTarget = (max) => (max === 30 ? ARROWS_CHAPTER_GOLD : Math.round(0.8 * max))

export function chapterGoal(progress, chapter) {
  const got = chapterStars(progress, chapter)
  const max = (chapter.to - chapter.from + 1) * 3
  const gold = goldTarget(max)
  return { got, max, gold, isGold: got >= gold, toGold: Math.max(0, gold - got) }
}

export function chapterGold(progress, chapter) {
  return chapterGoal(progress, chapter).isGold
}

// Where CONTINUE goes: the first unlocked level not yet cleared, else the
// last level.
export function nextLevel(progress) {
  for (let n = 1; n <= ARROWS_LEVEL_COUNT; n += 1) {
    if (isLevelUnlocked(progress, n) && levelStars(progress, n) === 0) return n
  }
  return ARROWS_LEVEL_COUNT
}
