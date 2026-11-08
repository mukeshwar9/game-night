// @ts-check
// SKETCH hearts and the CROWD FAVOURITE award. Pure: no DOM, Firebase or
// React; unit-tested in sketchFavesLogic.test.js.
//
// Room data (under games/{id}/round):
//   likes: { [uid]: boolean }  one heart per player per drawing; a second tap
//                              writes false (rules only let a player write their own)
//   faves: { [cycle:artist]: count }  the match's tally, carried from round to
//                              round by nextRoundState and folded when a reveal ends
//
// Hearts never touch points. The award goes to the most-hearted drawing with
// at least FAVE_MIN hearts; ties share it (up to FAVE_MAX_SHARED). A 2-player
// room has one possible voter per drawing, so it shows hearts but no award.

export const FAVE_MIN = 2
export const FAVE_MAX_SHARED = 3
/** The award needs more than this many players (one voter per drawing is no contest). */
export const FAVE_MIN_PLAYERS = 3
/** At most this many floating hearts at once. */
export const MAX_HEART_FLOATS = 4

/** How many hearts a drawing has: the `true` likes. */
export function countLikes(likes) {
  if (!likes || typeof likes !== 'object') return 0
  return Object.values(likes).filter(v => v === true).length
}

/** The tally key of a round's drawing, the same id the local gallery uses. */
export function favesKey(round) {
  return `${round?.cycle ?? 1}:${round?.artist ?? ''}`
}

/** The tally read back from the room: { key: count } with only sane counts. */
export function normalizeFaves(raw) {
  /** @type {Record<string, number>} */
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw)) {
    if (Number.isInteger(v) && v > 0) out[k] = v
  }
  return out
}

/**
 * The tally with this round's hearts folded in. Setting (not adding) the
 * round's count keeps a repeated fold, e.g. a coordinator hand-off retrying
 * the same transaction, from counting twice.
 * @returns {Record<string, number>}
 */
export function foldLikes(faves, round) {
  const out = normalizeFaves(faves)
  if (!round?.artist) return out
  const n = countLikes(round.likes)
  if (n > 0) out[favesKey(round)] = n
  return out
}

/**
 * The CROWD FAVOURITE(s) of a finished match, or null when no drawing has
 * enough hearts or the room is too small for a contest.
 * @param {any} faves  the tally
 * @param {{ playerCount?: number, min?: number, max?: number }} [opts]
 * @returns {{ count: number, entries: { key: string, cycle: number, artist: string }[] } | null}
 */
export function crowdFavourite(faves, { playerCount = Infinity, min = FAVE_MIN, max = FAVE_MAX_SHARED } = {}) {
  if (playerCount < FAVE_MIN_PLAYERS) return null
  const tally = normalizeFaves(faves)
  const top = Math.max(0, ...Object.values(tally))
  if (top < min) return null
  const entries = Object.entries(tally)
    .filter(([, n]) => n === top)
    .map(([key]) => {
      const i = key.indexOf(':')
      return { key, cycle: Number(key.slice(0, i)) || 1, artist: key.slice(i + 1) }
    })
    .sort((a, b) => (a.cycle - b.cycle) || (a.key < b.key ? -1 : 1))
    .slice(0, max)
  return { count: top, entries }
}

/**
 * What this phone shows in the heart spot on the canvas:
 *   'button' — a player who may heart it (at the reveal, or after guessing it)
 *   'count'  — the count only (the artist, and spectators at the reveal)
 *   null     — nothing (still guessing, nothing drawn, or between rounds)
 */
export function heartMode({ phase, isArtist, isPlayer, solved, drawn }) {
  if (!drawn) return null
  if (phase === 'reveal') return isPlayer && !isArtist ? 'button' : 'count'
  if (phase === 'drawing') {
    if (isArtist) return 'count'
    if (isPlayer && solved) return 'button'
  }
  return null
}
