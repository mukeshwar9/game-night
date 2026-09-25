// @ts-check
// Arrows Puzzle — pure game logic. No DOM, no Firebase, no React.
//
// State is a shared board of "arrow" polylines. `applyTap` is the single move
// rule: a valid arrow is removed (recorded to its clearer), a blocked arrow
// costs a life and stays. `getArrowsWinner` resolves the round once every
// clearable arrow is gone or both players are out of lives.
//
// Rendering helpers (`roundedPathD`, `exitVector`) live here too because they
// are pure geometry the board mirrors from the mockup; the SVG/DOM animation
// stays in ArrowsBoard.jsx.

import { ARROWS_LEVELS, ARROWS_TIERS, levelIdsForTier } from './levels/arrows'

export const ARROWS_LIVES = 3
export const ARROWS_MATCH_TARGET = 2
export const ARROWS_MAX_ROUNDS = 3
export const ARROWS_SEEN_CAP = 6
export const ARROWS_CORNER_RADIUS = 8
export const ARROWS_TIP_INSET = 4.2
export const ARROWS_HEAD_LEN = 5.5
export const ARROWS_HEAD_SPREAD = 3.8

// Parse an SVG M/L polyline into an array of [x, y] points. Mirrors the
// mockup's parsePathPoints: every M/L command contributes a point.
export function parsePathD(d) {
  const points = []
  const re = /([ML])\s*([\d.-]+)\s+([\d.-]+)/g
  let m
  while ((m = re.exec(d))) points.push([Number(m[2]), Number(m[3])])
  return points
}

// Resolve a level id to a fully-parsed level (points attached to each arrow).
// Falls back to easy1 for an unknown id so a stale room never crashes.
export function getLevel(id) {
  const level = ARROWS_LEVELS[id] ?? ARROWS_LEVELS.easy1
  return {
    ...level,
    // Flags a stale-room id so the page can surface it instead of silently
    // showing the wrong board.
    fallback: level.id !== id,
    arrows: level.arrows.map((a) => ({ ...a, points: parsePathD(a.d) })),
  }
}

export function isArrowBlocked(level, index) {
  return !!level.arrows[index]?.blocked
}

export function getClearableCount(level) {
  return level.arrows.filter((a) => !a.blocked).length
}

export function countClears(cleared) {
  let x = 0
  let o = 0
  for (const c of cleared) {
    if (c === 'X') x += 1
    else if (c === 'O') o += 1
  }
  return { X: x, O: o }
}

// Normalize Firebase's sparse/absent array into a fixed-length string array.
// Empty cells are '' (never null) per the Firebase read/write conventions.
export function normalizeCleared(raw, size) {
  const arr = Array(size).fill('')
  if (!raw) return arr
  const entries = Array.isArray(raw)
    ? raw.map((v, i) => [i, v])
    : Object.entries(raw).map(([k, v]) => [parseInt(k, 10), v])
  for (const [i, v] of entries) {
    if (i >= 0 && i < size && (v === 'X' || v === 'O')) arr[i] = v
  }
  return arr
}

// Unit exit vector + tip for the arrow's head (the mockup's exitVector).
// Guards short input so a malformed level can never crash the board: a single
// point has no direction, so it reports a zero vector tipped at that point.
export function exitVector(points) {
  if (!points || points.length < 2) {
    const tip = points?.length === 1 ? [...points[0]] : [0, 0]
    return { dx: 0, dy: 0, tip }
  }
  const a = points[points.length - 2]
  const b = points[points.length - 1]
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  return { dx: dx / len, dy: dy / len, tip: b }
}

// The mockup's roundedPathD: round every interior corner to `radius` and inset
// the tip by `tipInset` so the arrowhead overlaps the body cleanly.
export function roundedPathD(points, radius = ARROWS_CORNER_RADIUS, tipInset = 0) {
  if (!points || points.length < 2) return ''
  const pts = points.map((p) => [...p])
  if (tipInset > 0 && pts.length >= 2) {
    const a = pts[pts.length - 2]
    const b = pts[pts.length - 1]
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const inset = Math.min(tipInset, seg - radius * 0.35)
    pts[pts.length - 1] = [
      b[0] - ((b[0] - a[0]) / seg) * inset,
      b[1] - ((b[1] - a[1]) / seg) * inset,
    ]
  }
  if (pts.length === 2) return `M${pts[0][0]} ${pts[0][1]} L${pts[1][0]} ${pts[1][1]}`
  let d = `M${pts[0][0]} ${pts[0][1]}`
  for (let i = 1; i < pts.length - 1; i += 1) {
    const prev = pts[i - 1]
    const curr = pts[i]
    const next = pts[i + 1]
    const v1x = curr[0] - prev[0]
    const v1y = curr[1] - prev[1]
    const v2x = next[0] - curr[0]
    const v2y = next[1] - curr[1]
    const len1 = Math.hypot(v1x, v1y) || 1
    const len2 = Math.hypot(v2x, v2y) || 1
    const r = Math.min(radius, len1 / 2, len2 / 2)
    const p1x = curr[0] - (v1x / len1) * r
    const p1y = curr[1] - (v1y / len1) * r
    const p2x = curr[0] + (v2x / len2) * r
    const p2y = curr[1] + (v2y / len2) * r
    d += ` L${p1x} ${p1y} Q${curr[0]} ${curr[1]} ${p2x} ${p2y}`
  }
  const last = pts[pts.length - 1]
  d += ` L${last[0]} ${last[1]}`
  return d
}

// Apply a tap by `symbol` on `index`. Returns the new state or null for a
// no-op (invalid index, already cleared, or the player is out of lives).
// `cleared` is the per-round string array; `lives` is { X, O }.
export function applyTap(level, cleared, lives, index, symbol) {
  if (!level || index < 0 || index >= level.arrows.length) return null
  if (cleared[index]) return null
  if (!lives || lives[symbol] <= 0) return null

  if (level.arrows[index].blocked) {
    return {
      cleared,
      lives: { ...lives, [symbol]: lives[symbol] - 1 },
      tap: { index, by: symbol, result: 'blocked' },
    }
  }

  const next = [...cleared]
  next[index] = symbol
  return {
    cleared: next,
    lives,
    tap: { index, by: symbol, result: 'cleared' },
  }
}

// Round winner: most clears once the board is exhausted (all clearable arrows
// cleared) or both players are out of lives. null while the round is live.
export function getArrowsWinner(level, cleared, livesX, livesO) {
  const clearable = getClearableCount(level)
  const { X, O } = countClears(cleared)
  if (X + O >= clearable || (livesX <= 0 && livesO <= 0)) {
    return X > O ? 'X' : O > X ? 'O' : 'draw'
  }
  return null
}

// Pick a random level id from a tier (e.g. 'easy' → 'easy1'..'easy5').
// `exclude` bans recently played ids so rematches feel fresh; when every id
// is excluded the pool resets instead of returning null.
export function pickLevelId(tier, rng = Math.random, exclude = []) {
  const ids = levelIdsForTier(tier)
  if (ids.length === 0) return null
  const banned = new Set(exclude)
  const fresh = ids.filter((id) => !banned.has(id))
  const pool = fresh.length > 0 ? fresh : ids
  return pool[Math.floor(rng() * pool.length)]
}

// Normalize the Firebase `arrowsSeen` map (levelId → true) into a plain
// object. Firebase deletes empty objects, so absent/null reads as {}.
export function normalizeArrowsSeen(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const seen = {}
  for (const [k, v] of Object.entries(raw)) {
    if (v) seen[k] = true
  }
  return seen
}

// Record level ids into the seen map, capped so the node stays tiny.
export function recordArrowsSeen(seen, ids) {
  const next = { ...(seen || {}) }
  for (const id of ids) {
    if (id) next[id] = true
  }
  const keys = Object.keys(next)
  if (keys.length > ARROWS_SEEN_CAP) {
    for (const k of keys.slice(0, keys.length - ARROWS_SEEN_CAP)) delete next[k]
  }
  return next
}

// Match-level result: first to ARROWS_MATCH_TARGET round wins. After the
// final round finishes, the higher score takes it; level scores draw.
export function arrowsMatchWinner(scores) {
  const x = scores?.X || 0
  const o = scores?.O || 0
  if (x >= ARROWS_MATCH_TARGET) return 'X'
  if (o >= ARROWS_MATCH_TARGET) return 'O'
  return null
}

export function isFinalArrowsRound(game) {
  return (game?.arrowsRound ?? 0) >= ARROWS_MAX_ROUNDS - 1
}

// Conclusive match end for a game object: someone hit the target, or the
// final round finished (game.status === 'finished'). Returns 'X' | 'O' |
// 'draw' | null while the match is still live.
export function getArrowsMatchEnd(game) {
  const target = arrowsMatchWinner(game?.scores)
  if (target) return target
  if (isFinalArrowsRound(game) && game?.status === 'finished') {
    const x = game?.scores?.X || 0
    const o = game?.scores?.O || 0
    if (x === o) return 'draw'
    return x > o ? 'X' : 'O'
  }
  return null
}

// Config hook for Game.jsx's applyPlayAgain: advance to the next round's state
// (round 1 easy → 2 medium → 3 hard). Returns null when the match is over.
export function arrowsNextRound(game, rng = Math.random) {
  // Never advance past a decided match or the final round: callers must start
  // a new match instead. This is what stops the 4th tier-less rematch.
  if (arrowsMatchWinner(game?.scores)) return null
  const round = (game.arrowsRound ?? 0) + 1
  const tier = ARROWS_TIERS[round]
  if (!tier) return null
  const seen = normalizeArrowsSeen(game?.arrowsSeen)
  const levelId = pickLevelId(tier, rng, Object.keys(seen))
  return {
    arrowsRound: round,
    arrowsLevel: levelId,
    arrowsCleared: null,
    arrowsLivesX: ARROWS_LIVES,
    arrowsLivesO: ARROWS_LIVES,
    arrowsTrapSeen: null,
    arrowsLastBlocked: null,
    arrowsSeen: recordArrowsSeen(seen, [game?.arrowsLevel, levelId]),
  }
}

// Fresh round-0 state fragment (used by freshGameState in games.js).
export function arrowsFreshState(seen = {}, rng = Math.random) {
  const clean = normalizeArrowsSeen(seen)
  const levelId = pickLevelId('easy', rng, Object.keys(clean))
  return {
    arrowsRound: 0,
    arrowsLevel: levelId,
    arrowsCleared: null,
    arrowsLivesX: ARROWS_LIVES,
    arrowsLivesO: ARROWS_LIVES,
    arrowsTrapSeen: null,
    arrowsLastBlocked: null,
    arrowsSeen: recordArrowsSeen(clean, [levelId]),
  }
}
