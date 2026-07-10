// "Continue playing" — enrich the local gn-rooms list (raw room codes) with live
// status pulled from Firebase, so Home can show a rich resume row instead of a
// bare code. Pure helpers (deriveChip/getOpponent) take game+identity and are
// unit-tested without any Firebase mocking; fetchContinueRooms is the thin I/O
// wrapper that follows the get(ref(db, ...)) pattern from social.js.

import { ref, get } from 'firebase/database'
import { db } from './firebase'
import { getRooms, forgetRoom } from './profile'
import { getPlayerId } from './playerId'

// Party rooms key players by uid; 2P rooms always key by 'X'/'O' (see
// CLAUDE.md data model). Inferred from the players object shape rather than
// the games.js registry so this module stays free of the registry's
// component-tree import chain (kept import-light for unit testing).
function isNPlayerGame(game) {
  const players = game?.players
  if (!players) return false
  return !('X' in players) && !('O' in players)
}

// Resolve which seat (if any) `myId` occupies in this game.
function resolveSeat(game, myId, sessionSeat) {
  const players = game?.players || {}
  if (isNPlayerGame(game)) {
    return players[myId] ? myId : null
  }
  for (const seat of ['X', 'O']) {
    if (players[seat]?.playerId === myId) return seat
  }
  return sessionSeat || null
}

export function deriveChip(game, myId, sessionSeat) {
  const mySeat = resolveSeat(game, myId, sessionSeat)
  const isNPlayer = isNPlayerGame(game)

  if (game?.status === 'waiting') return { text: 'WAITING FOR OPPONENT', tone: 'dim' }

  if (game?.status === 'finished') {
    const won = !!game.winner && game.winner === mySeat
    return { text: 'FINISHED', tone: won ? 'win' : 'dim' }
  }

  if (game?.status === 'playing') {
    if (!isNPlayer && mySeat) {
      return game.currentTurn === mySeat
        ? { text: 'YOUR TURN', tone: 'action' }
        : { text: 'WAITING FOR OPPONENT', tone: 'dim' }
    }
    return { text: 'IN PROGRESS', tone: 'dim' }
  }

  return { text: 'IN PROGRESS', tone: 'dim' }
}

export function getOpponent(game, myId, sessionSeat) {
  const players = game?.players || {}
  const isNPlayer = isNPlayerGame(game)

  if (isNPlayer) {
    const others = Object.keys(players).filter(uid => uid !== myId)
    if (!others.length) return null
    const first = players[others[0]]
    const opp = { name: first?.name, avatar: first?.avatar }
    if (others.length > 1) opp.extra = others.length - 1
    return opp
  }

  const mySeat = resolveSeat(game, myId, sessionSeat)
  const otherSeat = mySeat === 'X' ? 'O' : mySeat === 'O' ? 'X' : null
  if (!otherSeat || !players[otherSeat]) return null
  return { name: players[otherSeat].name, avatar: players[otherSeat].avatar }
}

function readSessionSeat(id) {
  try {
    const raw = sessionStorage.getItem(`game-${id}`)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed?.symbol || null
  } catch { return null }
}

export async function fetchContinueRooms({ limit = 4 } = {}) {
  const rooms = getRooms().slice(0, limit)
  if (!db || !rooms.length) return []

  const myId = getPlayerId()
  const results = await Promise.allSettled(rooms.map(r => get(ref(db, `games/${r.id}`))))

  const out = []
  results.forEach((res, i) => {
    const room = rooms[i]
    // Only forget rooms confirmed gone (expired/deleted); a rejected read may
    // be a transient network failure, so just skip the room this time.
    if (res.status !== 'fulfilled') return
    if (!res.value.exists()) {
      forgetRoom(room.id)
      return
    }
    const game = res.value.val()
    const sessionSeat = readSessionSeat(room.id)
    out.push({
      id: room.id,
      gameType: game.gameType || room.gameType,
      status: game.status,
      chip: deriveChip(game, myId, sessionSeat),
      opponent: getOpponent(game, myId, sessionSeat),
    })
  })
  return out
}
