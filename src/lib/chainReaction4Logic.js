// Chain Reaction 4P — room-level turn rules that sit on top of
// chainReactionLogic.applyChainReaction4Move: which colours are actually in
// play, and skipping a player who dropped out mid-match so the room never
// freezes on their turn.
//
// Pure — no DOM/Firebase/React. The page wraps these in runTransaction.
import { CR_SYMBOLS_4 } from './chainReactionLogic'

// How long a client must see the player to move as offline before it may
// skip them. Long enough to ride out a tab reload or a network blip.
export const CR4_OFFLINE_GRACE_MS = 15000

/**
 * The colours dealt this match, in turn order. A 2- or 3-player match only
 * deals X O (A); rotating through undealt colours would hand the turn to
 * nobody. Falls back to all four for a room with no deal recorded.
 */
export function dealtSymbols(crSeatSymbols) {
  const dealt = new Set(Object.values(crSeatSymbols || {}))
  const list = CR_SYMBOLS_4.filter(sym => dealt.has(sym))
  return list.length > 0 ? list : [...CR_SYMBOLS_4]
}

/** uid holding `symbol`, or null. */
export function seatOfSymbol(crSeatSymbols, symbol) {
  for (const [uid, sym] of Object.entries(crSeatSymbols || {})) {
    if (sym === symbol) return uid
  }
  return null
}

// A seat is "away" once it has left the players node or its presence reads
// explicitly offline. Missing presence counts as online (codebase convention).
function isAway(players, uid) {
  if (!uid) return true
  const p = players?.[uid]
  if (!p) return true
  return p.online === false
}

/**
 * The player to move, if they are away (offline or gone): `{ symbol, uid }`.
 * Null when the game isn't in progress or the player to move is online.
 */
export function awayTurnOwner(game, players) {
  if (!game || game.status !== 'playing' || game.winner) return null
  const symbol = game.currentTurn
  if (!symbol) return null
  const uid = seatOfSymbol(game.crSeatSymbols, symbol)
  return isAway(players, uid) ? { symbol, uid } : null
}

/**
 * Skip the away player to move. The turn passes to the next colour (in dealt
 * order, skipping eliminated ones) whose player is online; every away colour
 * passed over is skipped too. A skipped player who never placed an orb has
 * nothing on the board to come back to, so they are eliminated (a no-show
 * forfeit); one with orbs just loses the turn and keeps playing if they
 * return. If that leaves a single colour standing, it wins.
 *
 * @param {object} game - the room node (status, currentTurn, crSeatSymbols,
 *   crEliminated, crPlaced).
 * @param {object} players - uid-keyed players with `online` presence.
 * @param {string} [expectedTurn] - CAS guard: only skip if it is still this
 *   colour's turn, so a transaction retried after someone else's skip or move
 *   is a no-op.
 * @returns {{ updates: object, skipped: string[], eliminated: string[] } | null}
 *   null when there is nothing to skip (player online, game over, or no online
 *   player to hand the turn to).
 */
export function skipAwayTurn(game, players, expectedTurn) {
  const away = awayTurnOwner(game, players)
  if (!away) return null
  if (expectedTurn != null && away.symbol !== expectedTurn) return null

  const eliminated = { ...(game.crEliminated || {}) }
  const placed = game.crPlaced || {}
  const order = dealtSymbols(game.crSeatSymbols).filter(sym => !eliminated[sym])
  const start = order.indexOf(away.symbol)
  if (start === -1) return null

  const skipped = []
  let next = null
  for (let step = 0; step < order.length; step++) {
    const sym = order[(start + step) % order.length]
    if (step > 0 && !isAway(players, seatOfSymbol(game.crSeatSymbols, sym))) { next = sym; break }
    skipped.push(sym)
  }
  // Nobody online to take the turn — leave the room as it is.
  if (!next) return null

  const newlyEliminated = skipped.filter(sym => !placed[sym])
  for (const sym of newlyEliminated) eliminated[sym] = true

  const alive = order.filter(sym => !eliminated[sym])
  const updates = { currentTurn: next, crEliminated: eliminated }
  if (alive.length === 1) {
    updates.currentTurn = null
    updates.winner = alive[0]
    updates.status = 'finished'
  }
  return { updates, skipped, eliminated: newlyEliminated }
}
