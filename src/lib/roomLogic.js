// Room-level decisions shared by the room page and its hooks: who hosts a
// party room, whether a latecomer gets a seat, what the invite screen shows,
// how many people are watching, and the turn/result line read to screen
// readers. Pure — no DOM/Firebase/React.
import { isGhost, isSeatOnline } from './presenceLogic'

const PARTY_DEFAULT_MAX = 8

// Seated party players in join order (joinedAt, then uid) — the first is the
// room's creator. Matches the ordering the party pages use for their host.
function partyJoinOrder(players) {
  return Object.values(players || {})
    .filter(p => p && typeof p === 'object' && p.playerId)
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0) || String(a.playerId).localeCompare(String(b.playerId)))
    .map(p => p.playerId)
}

// The party room's host for START / NEW MATCH — coordinator.js
// `roomCoordinator`'s rule: a TRANSFER HOST override (`game.hostUid`) while
// that player is seated and online, else the first ONLINE seat in join order
// (the creator while connected, then the next player to have joined), falling
// back to the creator when nobody looks online. Reads per-connection presence,
// so a second tab closing never hands the controls away from a present host.
export function pickRoomHost(players, hostUid = null) {
  const override = hostUid ? players?.[hostUid] : null
  if (override?.playerId && isSeatOnline(override)) return hostUid
  const order = partyJoinOrder(players)
  return order.find(id => isSeatOnline(players[id])) ?? order[0] ?? null
}

// Party seats that still hold a place toward the room cap.
export function activePartySeats(players, now = Date.now()) {
  return Object.entries(players || {})
    .filter(([, p]) => p && typeof p === 'object' && p.playerId && !isGhost(p, now))
    .map(([id]) => id)
}

// Can `myId` take a party seat? Only while the room is in its lobby
// (`waiting`) and below `maxPlayers`; a returning player always reclaims
// their own seat. A joiner only ever writes their OWN seat
// (`players/{myId}`), so a full room stays full until a member sweeps out
// its ghosts (ghostsToSweep).
//   → { action: 'reclaim' | 'join' | 'spectate' }
export function partyJoinPlan({ players, myId, status, maxPlayers = PARTY_DEFAULT_MAX }) {
  if (players?.[myId]) return { action: 'reclaim' }
  if (status !== 'waiting') return { action: 'spectate' }
  const seats = Object.values(players || {}).filter(p => p && typeof p === 'object' && p.playerId)
  return { action: seats.length < maxPlayers ? 'join' : 'spectate' }
}

// The players node after `myId` joins per `plan` (null = no change). Kept for
// callers that model a whole-node write; the room itself writes only
// `players/{myId}`.
export function applyPartyJoin(players, plan, mySeat) {
  if (plan?.action !== 'join') return null
  return { ...(players || {}), [mySeat.playerId]: mySeat }
}

// Ghost sweep, run by a seated member (the room host) while the lobby is
// full and people are waiting to get in: the seats to remove, longest-gone
// first — offline past the grace window (isGhost), so they no longer hold a
// place. Only as many as the waiting players need. A swept player who comes
// back joins again like any latecomer.
export function ghostsToSweep({ players, status, maxPlayers = PARTY_DEFAULT_MAX, waiting = 0, now = Date.now() }) {
  if (status !== 'waiting' || waiting <= 0) return []
  const seats = Object.entries(players || {}).filter(([, p]) => p && typeof p === 'object' && p.playerId)
  const need = seats.length + waiting - maxPlayers
  if (need <= 0) return []
  return seats
    .filter(([, p]) => isGhost(p, now))
    .sort(([, a], [, b]) => (a.offlineAt ?? 0) - (b.offlineAt ?? 0) || (a.joinedAt || 0) - (b.joinedAt || 0))
    .slice(0, need)
    .map(([id]) => id)
}

// Who is in the room and how many places are left — for the invite screen.
export function inviteSummary(game, cfg) {
  const party = !!cfg?.nPlayer
  const players = game?.players || {}
  if (party) {
    const order = partyJoinOrder(players)
    const host = players[pickRoomHost(players) ?? order[0]] || null
    const capacity = cfg.maxPlayers || PARTY_DEFAULT_MAX
    const count = activePartySeats(players).length
    return {
      party,
      hostName: host?.name || null,
      hostAvatar: host?.avatar || null,
      playerCount: count,
      capacity,
      seatsLeft: Math.max(0, capacity - count),
      // Party latecomers are seated at the next lobby, not mid-round.
      joinsNextRound: game?.status !== 'waiting',
    }
  }
  const host = players.X || players.O || null
  const count = (players.X ? 1 : 0) + (players.O ? 1 : 0)
  return {
    party,
    hostName: host?.name || null,
    hostAvatar: host?.avatar || null,
    playerCount: count,
    capacity: 2,
    seatsLeft: 2 - count,
    joinsNextRound: false,
  }
}

// Unique spectators with at least one open connection, excluding anyone who
// is also seated (a latecomer's spectator entry can outlive their seating by
// one snapshot). Node shape: `spectators/{uid}/{pushId}: { name, at }`.
export function spectatorCount(spectators, seatedIds = []) {
  const seated = new Set(seatedIds)
  return Object.entries(spectators || {})
    .filter(([uid, conns]) => !seated.has(uid) && conns && typeof conns === 'object' && Object.keys(conns).length > 0)
    .length
}

// Uids holding a seat — X/O `players.*.playerId` or party uid keys.
export function seatedIds(players) {
  return Object.values(players || {}).map(p => p?.playerId).filter(Boolean)
}

// 2P spectator seat offer: a seat is free while the room is in its lobby.
export function openSeat(game) {
  if (!game || game.status !== 'waiting') return null
  if (!game.players?.X) return 'X'
  if (!game.players?.O) return 'O'
  return null
}

// Is it this client's turn? `me` is the 2P seat or the party uid.
export function isMyTurn(game, me) {
  return !!me && game?.status === 'playing' && game.currentTurn != null && game.currentTurn === me
}

// The one-line turn/result text for the room's live region (null = silent).
// Worded as a sentence, not a copy of the on-screen status ("YOUR TURN",
// "YOU WIN!"): the live region is real DOM text, and duplicating the visible
// label would make text lookups ambiguous for tests and assistive-tech
// "find" alike.
export function roomAnnouncement(game, { me, party = false } = {}) {
  if (!game) return null
  const players = game.players || {}
  const nameOf = (id) => players[id]?.name || (party ? 'Someone' : id) || ''
  if (game.status === 'finished') {
    const w = game.winner
    if (!w) return party ? 'Round over.' : null
    if (w === 'draw') return "It's a draw."
    if (me && w === me) return 'You won.'
    return `${nameOf(w)} won.`
  }
  if (game.status !== 'playing' || game.currentTurn == null) return null
  if (me && game.currentTurn === me) return "It's your move."
  if (me && !party) return "Waiting for your opponent's move."
  return `${nameOf(game.currentTurn)} to move.`
}
