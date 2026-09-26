// Firebase layer for game-night mode — every write the night scoreboard,
// winner-stays queue and host controls make. The rules themselves are pure
// and tested in nightLogic.js; this file only wires them to the room node.

import { get, ref, runTransaction, update } from 'firebase/database'
import { db } from './firebase'
import { freshGameState, getGameConfig, firstMoverUpdates } from './games'
import { getPlayerId } from './playerId'
import {
  pendingNightResult, addToNight, freshNight, nightSwitchSeating, roomHostUid, kickPatch, canTakeSeat, nightRecap,
} from './nightLogic'
import { normalizeTimerScale } from './timerScale'
import { isMatchOver as isRaceMatchOver } from './raceLogic'
import { shareRecap } from './shareCard'

const roomRef = (gameId) => ref(db, `games/${gameId}`)
const historyId = (now) => `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`

/**
 * Record the room's just-finished match into tonight's standings. Every
 * client that sees the finish calls this; the `nightMark` claim transaction
 * lets exactly one of them add the result, and the `night` transaction is
 * idempotent per history id. Reads the room fresh so a late client never
 * records from a stale snapshot. Never rejects.
 */
export async function recordNightMatch(gameId, gameType) {
  if (!db || !gameId) return
  const cfg = getGameConfig(gameType)
  const nPlayer = !!cfg?.nPlayer
  try {
    const snap = await get(roomRef(gameId))
    const room = snap.val()
    if (room?.gameType !== gameType) return
    // N-player races finish every round; their match is first to
    // RACE_MATCH_WINS round wins, ranked by those wins.
    const pending = pendingNightResult(room, nPlayer, { isMatchOver: cfg?.race ? isRaceMatchOver : undefined })
    if (!pending) return
    const claim = await runTransaction(ref(db, `games/${gameId}/nightMark`), cur => (cur === pending.sig ? undefined : pending.sig))
    if (!claim.committed) return
    const now = Date.now()
    const id = historyId(now)
    await runTransaction(ref(db, `games/${gameId}/night`), cur => addToNight(cur, pending.result, { gameType, now, id }))
  } catch (err) {
    console.error('recordNightMatch failed:', err)
  }
}

/** START A NEW NIGHT (host): clears standings and history. */
export function startNewNight(gameId) {
  return update(roomRef(gameId), { night: freshNight(Date.now()) })
}

/**
 * The switch patch with night-aware seating layered on (party -> 2P picks two
 * seats and queues the rest; back to party restores everyone). Plain 2P rooms
 * get `baseUpdates` back unchanged.
 */
export function nightSwitchUpdates(game, newType, baseUpdates) {
  const fromParty = !!getGameConfig(game.gameType)?.nPlayer
  const toParty = !!getGameConfig(newType)?.nPlayer
  return nightSwitchSeating(game, baseUpdates, {
    fromParty,
    toParty,
    now: Date.now(),
    hostUid: roomHostUid(game, fromParty),
  })
}

/** The host's uid for this room (explicit override, else coordinator / X seat). */
export function hostUidOf(game) {
  return roomHostUid(game, !!getGameConfig(game?.gameType)?.nPlayer)
}

export function amHost(game) {
  return !!game && hostUidOf(game) === getPlayerId()
}

/**
 * KICK (host): removes `uid` from their seat or the queue and bars them from
 * reclaiming it this match. Kicking a 2P seat restarts the match with the
 * refilled seats (or drops the room back to waiting when nobody can fill it).
 */
export function kickPlayer(gameId, game, uid) {
  const nPlayer = !!getGameConfig(game.gameType)?.nPlayer
  const now = Date.now()
  const { updates, reset, seated } = kickPatch(game, uid, nPlayer, now)
  if (!reset) return update(roomRef(gameId), updates)
  const fresh = freshGameState(game.gameType)
  // freshGameState nulls `kicked` for the next match; this write must keep it
  // (and `kicked` alongside `kicked/{uid}` would be a path conflict).
  delete fresh.kicked
  // Refilled from the queue = two seats again; otherwise a seat is now empty.
  const bothSeated = seated
  return update(roomRef(gameId), {
    ...fresh,
    ...updates,
    scores: { X: 0, O: 0 },
    winner: null,
    winningLine: null,
    proposal: null,
    starter: 'X',
    status: bothSeated ? 'playing' : 'waiting',
    ...(bothSeated ? firstMoverUpdates(game.gameType, 'X') : {}),
    lastActivityAt: now,
  })
}

/** LOCK / UNLOCK ROOM (host): a locked room takes no new seats or queue places. */
export function setRoomLocked(gameId, locked) {
  return update(roomRef(gameId), { locked: locked ? true : null })
}

/** TRANSFER HOST: `uid` becomes the room's host until they leave. */
export function transferHost(gameId, uid) {
  return update(roomRef(gameId), { hostUid: uid })
}

/** Lobby timer scale (host): 1 normal, 2 relaxed, 0 off. */
export function setTimerScale(gameId, scale) {
  return update(roomRef(gameId), { timerScale: normalizeTimerScale(scale) })
}

function me() {
  const uid = getPlayerId()
  let name = 'PLAYER'
  let avatar = null
  try {
    name = localStorage.getItem('playerName') || name
    avatar = localStorage.getItem('playerAvatar') || null
  } catch { /* private mode — defaults */ }
  return { uid, name, avatar }
}

/**
 * JOIN QUEUE: a spectator in a party room's 2P game lines up for the next
 * seat. Resolves false when the room is locked or the player was kicked.
 */
export async function joinQueue(gameId, game) {
  const { uid, name, avatar } = me()
  if (!canTakeSeat(game, uid)) return false
  const now = Date.now()
  const { committed } = await runTransaction(ref(db, `games/${gameId}/queue/${uid}`), cur => {
    if (cur) return undefined
    return { name, playerId: uid, avatar, joinedAt: now, at: now }
  })
  return committed
}

export function leaveQueue(gameId) {
  return update(roomRef(gameId), { [`queue/${getPlayerId()}`]: null })
}

/**
 * Share tonight's recap card (MVP, most wins, closest game, games played)
 * through the share-card pipeline. Resolves false on a real failure.
 */
export function shareNightRecap(game, gameId) {
  const recap = nightRecap(game?.night)
  const label = (type) => getGameConfig(type)?.label || type
  const rows = []
  if (recap.mvp) rows.push({ label: 'MVP', value: `${recap.mvp.name} · ${recap.mvp.points} PTS` })
  if (recap.mostWins) rows.push({ label: 'MOST WINS', value: `${recap.mostWins.name} · ${recap.mostWins.wins}` })
  if (recap.closest) {
    const c = recap.closest
    rows.push({
      label: 'CLOSEST GAME',
      value: c.draw ? `${label(c.gameType)} · DRAW` : `${label(c.gameType)} · ${c.hi}–${c.lo}`,
    })
  }
  if (recap.favoriteGame) rows.push({ label: 'MOST PLAYED', value: `${label(recap.favoriteGame.gameType)} ×${recap.favoriteGame.count}` })
  return shareRecap({
    title: "TONIGHT'S RECAP",
    sub: `${recap.gamesPlayed} GAME${recap.gamesPlayed === 1 ? '' : 'S'} PLAYED`,
    rows,
    url: gameId ? `${window.location.origin}/game/${gameId}` : undefined,
  })
}
