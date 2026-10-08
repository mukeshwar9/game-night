// @ts-check
// Challenge-a-friend for solo runs: the share link opens the same solo game
// with `?beat=<score>` so the friend sees the number to top. Pure; the share
// sheet itself is ChallengeButton + src/lib/share.js.

const MAX_BEAT = 1_000_000

/**
 * Path of the solo page for a game, carrying the score to beat.
 * @param {string} type game type, e.g. 'cupshuffle'
 * @param {number} score
 */
export function challengePath(type, score) {
  const beat = Math.floor(Number(score))
  const base = `/solo/${encodeURIComponent(type)}`
  return Number.isFinite(beat) && beat > 0 ? `${base}?beat=${beat}` : base
}

/**
 * The score a challenge link asks you to beat, or null when the query has none
 * (or a junk value: zero, negative, fractional garbage, absurdly large).
 * @param {string} search location.search
 * @returns {number | null}
 */
export function parseBeat(search) {
  let raw
  try { raw = new URLSearchParams(search || '').get('beat') } catch { return null }
  if (raw == null || !/^\d{1,7}$/.test(raw)) return null
  const n = Number(raw)
  return n > 0 && n <= MAX_BEAT ? n : null
}

/**
 * The message that goes with the link.
 * @param {{ label: string, score: number, unit?: string }} p
 */
export function challengeText({ label, score, unit = '' }) {
  const what = unit ? `${score} ${unit}` : String(score)
  return `I just set a new high score on ${label}: ${what}. Think you can beat it?`
}

/**
 * Whether a finished run earns the CHALLENGE button: a new personal best with
 * a score worth boasting about (above zero).
 * @param {{ isNewBest: boolean, score: number }} p
 */
export function canChallenge({ isNewBest, score }) {
  return isNewBest === true && Number.isFinite(score) && score > 0
}
