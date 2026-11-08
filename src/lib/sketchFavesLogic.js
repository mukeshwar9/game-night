// @ts-check
// SKETCH hearts and the CROWD FAVOURITE award. Pure logic only — no DOM,
// Firebase or React.
//
// Each player may give one heart to a drawing: `round/likes/{uid} = true`, a
// second tap removes it. Guessers who already got the word can heart during
// the drawing; at the reveal everyone seated except the artist can. Hearts
// never touch the score.
//
// Whoever advances the reveal folds the round's hearts into the match tally
// `round/faves/{cycle:artist} = count` inside the same transaction; the fold
// replaces that drawing's entry, so a coordinator hand-off that folds twice
// never counts twice. nextRoundState carries the tally to the next round.
//
// At the end of the match the drawing with the most hearts, with at least
// MIN_FAVE_HEARTS, is the CROWD FAVOURITE. Drawings tied on top share it (at
// most MAX_FAVES_SHOWN, in play order). A 2-player room has one possible voter
// per drawing, so it shows hearts but gives no award.

export const MIN_FAVE_HEARTS = 2
export const MAX_FAVES_SHOWN = 3
// Others' hearts float up from the button; at most this many at once.
export const MAX_HEART_FLOATS = 4
// The "TAP ♥ IF YOU LOVE IT" hint on the match's first reveal.
export const HEART_HINT_MS = 2000

/**
 * @typedef {{ cycle?: number, artist?: string | null, order?: string[], phase?: string,
 *   correct?: Record<string, any> | null, likes?: Record<string, any> | null,
 *   faves?: Record<string, any> | null }} RoundLike
 */

/** The tally key for a drawing: `${cycle}:${artist}` (also the gallery entry id). */
export function faveKey(round) {
  return `${round?.cycle ?? 1}:${round?.artist ?? ''}`
}

/** `{ cycle, artist }` back from a tally key, or null when it is malformed. */
export function parseFaveKey(key) {
  const m = /^([1-9][0-9]*):(.+)$/.exec(String(key ?? ''))
  return m ? { cycle: Number(m[1]), artist: m[2] } : null
}

/** The uids who hearted, from `round/likes` as Firebase returns it. */
export function likers(likes) {
  if (!likes || typeof likes !== 'object') return []
  return Object.keys(likes).filter(uid => likes[uid] === true).sort()
}

/** How many hearts a drawing has. */
export function likeCount(likes) {
  return likers(likes).length
}

/** `round/faves` read back: { key: positive integer }, malformed entries dropped. */
export function normalizeFaves(raw) {
  /** @type {Record<string, number>} */
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [key, v] of Object.entries(raw)) {
    if (!parseFaveKey(key)) continue
    if (!Number.isInteger(v) || v <= 0) continue
    out[key] = v
  }
  return out
}

/**
 * The match tally with this round's hearts folded in: the drawing's entry is
 * set to the round's count, never added to, so folding the same round twice
 * gives the same tally. A round with no hearts leaves the tally as it was —
 * also a round whose hearts were already folded and cleared, which a second
 * coordinator can still see after the match finished. Returns null for an
 * empty tally (Firebase deletes the key).
 * @param {any} faves
 * @param {RoundLike} round
 * @returns {Record<string, number> | null}
 */
export function foldLikes(faves, round) {
  const out = normalizeFaves(faves)
  const key = faveKey(round)
  const n = likeCount(round?.likes)
  if (n > 0) out[key] = n
  return Object.keys(out).length ? out : null
}

/**
 * What this phone shows for the heart: 'button' (can heart), 'count' (sees the
 * count only: the artist, a spectator), or null (nothing: a guesser still
 * guessing, choosing, or a drawing with nothing on it).
 * @param {{ round: RoundLike | null, uid: string | null, isPlayer: boolean, hasDrawing: boolean }} p
 * @returns {'button' | 'count' | null}
 */
export function heartView({ round, uid, isPlayer, hasDrawing }) {
  if (!round || !hasDrawing) return null
  if (round.phase !== 'drawing' && round.phase !== 'reveal') return null
  const isArtist = !!uid && round.artist === uid
  if (!isPlayer || isArtist) return 'count'
  if (round.phase === 'reveal') return 'button'
  return round.correct?.[uid] ? 'button' : null
}

/** Screen-reader label for the heart button. */
export function heartAriaLabel(count) {
  return `Love this drawing, ${count} heart${count === 1 ? '' : 's'}`
}

/**
 * Hearts that just arrived from other players: the uids in `likes` that were
 * not in `prevLikes`, without `mySeat`, at most MAX_HEART_FLOATS.
 */
export function newHeartsFrom(prevLikes, likes, mySeat, max = MAX_HEART_FLOATS) {
  const before = new Set(likers(prevLikes))
  return likers(likes).filter(uid => uid !== mySeat && !before.has(uid)).slice(0, max)
}

/**
 * The CROWD FAVOURITE: `{ hearts, keys }` with the winning tally keys in play
 * order (cycle, then seat order), or null when no drawing reached `min` hearts
 * or the room has only 2 players (`order`).
 * @param {any} faves
 * @param {{ order?: string[], min?: number, max?: number }} [opts]
 * @returns {{ hearts: number, keys: string[] } | null}
 */
export function crowdFavourite(faves, { order = [], min = MIN_FAVE_HEARTS, max = MAX_FAVES_SHOWN } = {}) {
  if ((order?.length ?? 0) <= 2) return null
  const tally = normalizeFaves(faves)
  const top = Math.max(0, ...Object.values(tally))
  if (top < min) return null
  const seat = (/** @type {string} */ artist) => {
    const i = order.indexOf(artist)
    return i === -1 ? order.length : i
  }
  const keys = Object.keys(tally)
    .filter(k => tally[k] === top)
    .map(k => ({ k, p: /** @type {{ cycle: number, artist: string }} */ (parseFaveKey(k)) }))
    .sort((a, b) => (a.p.cycle - b.p.cycle) || (seat(a.p.artist) - seat(b.p.artist)) || (a.k < b.k ? -1 : 1))
    .slice(0, max)
    .map(x => x.k)
  return { hearts: top, keys }
}

/** "♥ 4 OF 5": hearts out of everyone who could heart that drawing. */
export function heartsOf(hearts, order) {
  const voters = Math.max(0, (order?.length ?? 0) - 1)
  return `♥ ${hearts} OF ${voters}`
}
