import { freshGameState, getGameConfig } from '../../lib/games'

// Seated players in join order (joinedAt, then uid so identical timestamps
// still sort deterministically) — works for both the X/O and the uid-keyed
// party `players` node.
export function playersToSeatList(players) {
  return Object.values(players || {})
    .filter(p => p && p.playerId)
    .map(p => ({ name: p.name, playerId: p.playerId, joinedAt: p.joinedAt || 0, avatar: p.avatar ?? null }))
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0) || String(a.playerId).localeCompare(String(b.playerId)))
}

// The full room patch for switching to `newType`: the new game's fresh state
// plus the players reseated for its family (uid-keyed for party games, X/O
// in join order otherwise).
export function buildSwitchUpdates(game, newType) {
  const newCfg = getGameConfig(newType)
  const seats = playersToSeatList(game.players)
  const base = {
    gameType: newType,
    ...freshGameState(newType),
    winner: null,
    winningLine: null,
    proposal: null,
    lastActivityAt: Date.now(),
  }
  if (newCfg.nPlayer) {
    const players = {}
    for (const s of seats) {
      players[s.playerId] = { name: s.name, playerId: s.playerId, joinedAt: s.joinedAt, online: true, avatar: s.avatar ?? null }
    }
    return { ...base, players, scores: {}, status: 'waiting' }
  }
  const players = {}
  if (seats[0]) players.X = { name: seats[0].name, playerId: seats[0].playerId, joinedAt: seats[0].joinedAt, avatar: seats[0].avatar ?? null }
  if (seats[1]) players.O = { name: seats[1].name, playerId: seats[1].playerId, joinedAt: seats[1].joinedAt, avatar: seats[1].avatar ?? null }
  return { ...base, players, scores: { X: 0, O: 0 }, status: seats.length >= 2 ? 'playing' : 'waiting' }
}

// GAMEPLAY-02: rematch starter. The loser of the previous round opens the
// next one (catch-up house rule); on a draw, alternate from the previous
// starter. `starter` is persisted on the room so draw-alternation stays
// correct across consecutive rematches — without it, freshGameState would
// hand the creator (X) the first move in every single game, a compounding
// edge in games with a proven first-move advantage (C4, TTT, Gomoku, Hex).
export function nextStarter(prev) {
  const lastStarter = prev?.starter === 'O' ? 'O' : 'X'
  if (prev?.winner === 'X') return 'O'
  if (prev?.winner === 'O') return 'X'
  return lastStarter === 'X' ? 'O' : 'X'
}
