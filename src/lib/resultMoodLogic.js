// @ts-check
// How a finished round should feel to the person looking at it. Pure: no DOM,
// Firebase or React. Unit-tested in resultMoodLogic.test.js.
//
// The same result reads differently from each seat: the winner gets the
// celebration, a close loser gets "SO CLOSE.", a blowout gets a plain "ROUGH
// ONE.", a spectator gets neither. GameStatus renders the copy; Game.jsx uses
// `showsWinBurst` to keep the confetti for the winner.

/**
 * What the game can say about the margin, from the viewer's side (registry
 * `resultMargin(game, viewerSymbol)`). `total` is the size of the whole prize
 * pool when it is fixed (36 boxes); without it the margin is read against what
 * was scored. `unit` is `[one, many]` for the honest positive line.
 * @typedef {{ mine: number, theirs: number, total?: number, unit?: [string, string] }} Margin
 * @typedef {{ myWins: number, theirWins: number }} HeadToHead
 * @typedef {'winner' | 'loser' | 'draw' | 'spectator'} ResultRole
 * @typedef {'win' | 'closeLoss' | 'bigLoss' | 'loss' | 'draw' | 'spectator'} ResultMood
 */

// A loss is "close" within one point, or when the gap is this share of the pool.
export const CLOSE_RATIO = 0.15
// ...and a blowout from this share up. Between the two is a plain loss.
export const BIG_RATIO = 0.3

/**
 * @param {{ winner: string | null | undefined, mySymbol: string | null | undefined }} p
 * @returns {ResultRole}
 */
export function resultRole({ winner, mySymbol }) {
  if (mySymbol !== 'X' && mySymbol !== 'O') return 'spectator'
  if (winner === 'draw') return 'draw'
  return winner === mySymbol ? 'winner' : 'loser'
}

/** Confetti and the screen flash are the winner's. Everyone else gets calm. */
export function showsWinBurst(/** @type {ResultRole} */ role) {
  return role === 'winner'
}

/**
 * @param {Margin | null | undefined} margin
 * @returns {'closeLoss' | 'bigLoss' | 'loss'}
 */
export function classifyLoss(margin) {
  if (!margin || !Number.isFinite(margin.mine) || !Number.isFinite(margin.theirs)) return 'loss'
  const gap = margin.theirs - margin.mine
  const pool = margin.total ?? margin.mine + margin.theirs
  // Not behind on the count (lost on a tiebreak): as close as it gets.
  if (gap <= 1) return 'closeLoss'
  if (!(pool > 0)) return 'loss'
  const share = gap / pool
  if (share <= CLOSE_RATIO) return 'closeLoss'
  if (share >= BIG_RATIO) return 'bigLoss'
  return 'loss'
}

/** "1 box" / "3 boxes". */
function counted(/** @type {number} */ n, /** @type {[string, string]} */ unit) {
  return `${n} ${n === 1 ? unit[0] : unit[1]}`
}

/**
 * "YOU LEAD 3–2" / "2–3 · ONE MORE TO TIE?" / "TIED 2–2". Null before anyone
 * has scored: a 0–0 line says nothing.
 * @param {number} mine
 * @param {number} theirs
 * @returns {string | null}
 */
export function seriesLine(mine, theirs) {
  if (!(mine > 0 || theirs > 0)) return null
  if (mine > theirs) return `YOU LEAD ${mine}–${theirs}`
  if (mine === theirs) return `TIED ${mine}–${theirs}`
  if (theirs - mine === 1) return `${mine}–${theirs} · ONE MORE TO TIE?`
  return `${mine}–${theirs} IN THIS SERIES`
}

/**
 * Which numbers the series line shows. After a decided match it is the
 * head-to-head record between these two players; mid-match, or when there is
 * no record yet, it is the room's round wins. Spectators get none.
 * @param {{ mySymbol: string | null | undefined, scores?: { X?: number, O?: number } | null,
 *   headToHead?: HeadToHead | null, matchOver?: boolean }} p
 * @returns {string | null}
 */
export function seriesFor({ mySymbol, scores, headToHead, matchOver = false }) {
  if (mySymbol !== 'X' && mySymbol !== 'O') return null
  if (matchOver && headToHead) return seriesLine(headToHead.myWins, headToHead.theirWins)
  if (!scores) return null
  const other = mySymbol === 'X' ? 'O' : 'X'
  return seriesLine(scores[mySymbol] || 0, scores[other] || 0)
}

/**
 * The mood and copy for one viewer. `headline` is null when today's copy
 * should stay (a win, a draw, a spectator, or a loss with no known margin);
 * `positive` is one honest line, or null when nothing true can be said.
 * @param {{ winner: string | null | undefined, mySymbol: string | null | undefined,
 *   margin?: Margin | null, headToHead?: HeadToHead | null }} p
 * @returns {{ role: ResultRole, mood: ResultMood, headline: string | null, positive: string | null }}
 */
export function resultMood({ winner, mySymbol, margin = null, headToHead = null }) {
  const role = resultRole({ winner, mySymbol })
  if (role === 'winner') return { role, mood: 'win', headline: null, positive: null }
  if (role === 'draw') return { role, mood: 'draw', headline: null, positive: null }
  if (role === 'spectator') return { role, mood: 'spectator', headline: null, positive: null }

  const mood = classifyLoss(margin)
  const headline = !margin ? null : mood === 'closeLoss' ? 'SO CLOSE.' : mood === 'bigLoss' ? 'ROUGH ONE.' : null
  return { role, mood, headline, positive: positiveLine(mood, margin, headToHead) }
}

/**
 * @param {'closeLoss' | 'bigLoss' | 'loss'} mood
 * @param {Margin | null | undefined} margin
 * @param {HeadToHead | null | undefined} headToHead
 * @returns {string | null}
 */
function positiveLine(mood, margin, headToHead) {
  if (mood === 'closeLoss' && margin?.unit && margin.mine > 0) {
    const gap = margin.theirs - margin.mine
    return gap > 0
      ? `You took ${counted(margin.mine, margin.unit)}, just ${gap} short.`
      : `You took ${counted(margin.mine, margin.unit)}. It came down to a tiebreak.`
  }
  if (headToHead && headToHead.myWins > headToHead.theirWins) {
    return `You still lead ${headToHead.myWins}–${headToHead.theirWins} overall.`
  }
  if (margin?.unit && margin.mine > 0) return `You took ${counted(margin.mine, margin.unit)}.`
  return null
}
