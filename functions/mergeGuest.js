// Pure merge logic for folding a guest (anonymous) account's progress into the
// Google account it just signed into. No Firebase, no I/O: accountMerge.js reads
// the rows, calls these, and writes the result. Unit-tested in
// test/accountMerge.test.js.
//
// The client-side rules are ported, not imported (functions/ cannot import src/):
//   matches        src/lib/statsSync.js        mergeMatches
//   arrowsSolo     src/lib/arrowsLevelsLogic.js normalizeProgress / mergeProgress
//   memoryBests    src/lib/memoryDailyLogic.js  mergeBests

const MAX_MATCHES = 50
// Limits mirrored from database.rules.json (users/$uid/arrowsSolo, memoryBests),
// so a merged row never fails a later client write that revalidates it.
const ARROWS_MAX_LEVEL = 170
const ARROWS_REPLAY_LEVELS = 100
const ARROWS_TIERS = ['easy', 'medium', 'hard']
const MEMORY_MAX = 100000

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** Sum two { w, l, name? } cells; the first non-empty name wins. */
function sumWl(a, b) {
  const out = { w: num(a?.w) + num(b?.w), l: num(a?.l) + num(b?.l) }
  const name = a?.name || b?.name
  if (name) out.name = name
  return out
}

/**
 * Stats: counts add, bestStreak is the max, streak stays the target's own.
 * @param {object|null} target the existing account's users/{uid}/stats
 * @param {object|null} guest the guest's users/{uid}/stats
 */
function mergeStats(target, guest) {
  const t = isObj(target) ? target : {}
  const g = isObj(guest) ? guest : {}
  const mergeMap = (a, b) => {
    const out = {}
    for (const k of new Set([...Object.keys(isObj(a) ? a : {}), ...Object.keys(isObj(b) ? b : {})])) {
      out[k] = sumWl(a?.[k], b?.[k])
    }
    return out
  }
  return {
    games: num(t.games) + num(g.games),
    wins: num(t.wins) + num(g.wins),
    losses: num(t.losses) + num(g.losses),
    streak: num(t.streak),
    bestStreak: Math.max(num(t.bestStreak), num(g.bestStreak)),
    byGame: mergeMap(t.byGame, g.byGame),
    vs: mergeMap(t.vs, g.vs),
  }
}

/** Array or numeric-keyed object (Firebase) -> array, by explicit key order. */
function normalizeMatchList(raw) {
  if (Array.isArray(raw)) return raw.filter(isObj)
  if (isObj(raw)) {
    return Object.keys(raw).sort((a, b) => Number(a) - Number(b)).map((k) => raw[k]).filter(isObj)
  }
  return []
}

/** Union deduped by ts|opponentUid, newest first, capped at 50. Target wins ties. */
function mergeMatches(target, guest) {
  const byKey = new Map()
  for (const m of [...normalizeMatchList(target), ...normalizeMatchList(guest)]) {
    const key = `${m.ts}|${m.opponentUid || ''}`
    if (!byKey.has(key)) byKey.set(key, m)
  }
  return [...byKey.values()].sort((a, b) => num(b.ts) - num(a.ts)).slice(0, MAX_MATCHES)
}

function levelNumber(key, max) {
  const m = /^l([1-9]\d*)$/.exec(key)
  const n = m ? Number(m[1]) : 0
  return n >= 1 && n <= max ? n : 0
}

/** Arrows solo progress: best stars per level, replayed stays replayed, max endless. */
function mergeArrows(target, guest) {
  const out = { levels: {}, endless: { easy: 0, medium: 0, hard: 0 }, replayed: {} }
  for (const src of [target, guest]) {
    if (!isObj(src)) continue
    for (const [k, raw] of Object.entries(isObj(src.levels) ? src.levels : {})) {
      const n = levelNumber(k, ARROWS_MAX_LEVEL)
      const v = Math.min(3, Math.floor(Number(raw)))
      if (n && v >= 1) out.levels[k] = Math.max(out.levels[k] ?? 0, v)
    }
    for (const [k, raw] of Object.entries(isObj(src.replayed) ? src.replayed : {})) {
      if (levelNumber(k, ARROWS_REPLAY_LEVELS) && raw === true) out.replayed[k] = true
    }
    for (const tier of ARROWS_TIERS) {
      const v = Math.floor(Number(src.endless?.[tier]))
      if (Number.isFinite(v) && v > 0) out.endless[tier] = Math.max(out.endless[tier], v)
    }
  }
  return out
}

/** Memory bests: the better value per key. */
function mergeMemoryBests(target, guest) {
  const out = {}
  for (const src of [target, guest]) {
    for (const [k, v] of Object.entries(isObj(src) ? src : {})) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
        out[k] = Math.min(MEMORY_MAX, Math.max(out[k] ?? 0, Math.floor(v)))
      }
    }
  }
  return out
}

/**
 * Friends the target gains: the guest's friends who are not already the target's,
 * not the target itself, and not blocked by the target.
 * @param {object|null} guestFriends friends/{guest}
 * @param {object|null} targetFriends friends/{target}
 * @param {object|null} targetBlocks blocks/{target}
 * @returns {Record<string, number|null>} friendUid -> since (null when unknown)
 */
function friendsToAdd(guestFriends, targetFriends, targetBlocks, { guestUid, targetUid }) {
  const have = isObj(targetFriends) ? targetFriends : {}
  const blocked = isObj(targetBlocks) ? targetBlocks : {}
  const out = {}
  for (const [uid, row] of Object.entries(isObj(guestFriends) ? guestFriends : {})) {
    if (uid === targetUid || uid === guestUid || uid in have || uid in blocked) continue
    out[uid] = typeof row?.since === 'number' ? row.since : null
  }
  return out
}

module.exports = { mergeStats, mergeMatches, mergeArrows, mergeMemoryBests, friendsToAdd, normalizeMatchList }
