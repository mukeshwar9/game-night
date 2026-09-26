import { get, limitToLast, onDisconnect, onValue, orderByChild, query, ref, remove, runTransaction, set, update } from 'firebase/database'
import { db } from './firebase'
import { freshGameState, getGameConfig, GAME_TYPES } from './games'
import { isSeatOnline } from './presenceLogic'
import { partyJoinPlan } from './roomLogic'
export const PUBLIC_ROOM_TTL_MS = 24 * 60 * 60 * 1000
// Public lobby: base 2P games plus the N-player races (`race: true`), which
// list as a 1v1 while their host waits alone; other party games stay
// invite-only.
const isPublicCfg = cfg => !!cfg && !cfg.variantOf && (!cfg.nPlayer || !!cfg.race)
export function getPublicGameTypes() { return GAME_TYPES.filter(isPublicCfg) }
export function isPublicGameType(gameType) { return isPublicCfg(getGameConfig(gameType)) }
// Who a public room is waiting with: the X seat of a 2P room with O still
// empty, or the only seated player of a race room (uid-keyed seats).
// Null once someone has joined.
export function listingHost(game) {
  if (!game?.players) return null
  if (getGameConfig(game.gameType)?.nPlayer) {
    const seats = Object.values(game.players).filter(p => p && typeof p === 'object' && p.playerId)
    if (seats.length !== 1) return null
    const p = seats[0]
    return { uid: p.playerId, name: p.name, avatar: p.avatar ?? null, online: isSeatOnline(p) }
  }
  const x = game.players.X
  if (!x?.playerId || game.players.O) return null
  return { uid: x.playerId, name: x.name, avatar: x.avatar ?? null, online: isSeatOnline(game.presence?.X) }
}
export function normalizePublicRooms(raw, now = Date.now()) {
  return Object.entries(raw || {}).map(([gameId, room]) => ({ ...room, gameId })).filter(room => room.visibility === 'public' && isPublicGameType(room.gameType) && typeof room.hostUid === 'string' && typeof room.createdAt === 'number' && typeof room.expiresAt === 'number' && room.expiresAt > now && room.hostOnline !== false).sort((a, b) => a.createdAt - b.createdAt)
}
export function publicRoomEntry({ gameId, gameType, hostUid, hostName, hostAvatar, now = Date.now() }) {
  return { gameId, gameType, visibility: 'public', hostUid, hostName: hostName || 'PLAYER', hostAvatar: hostAvatar || null, hostOnline: true, createdAt: now, updatedAt: now, expiresAt: now + PUBLIC_ROOM_TTL_MS }
}
export async function createPublicRoom({ gameId, gameType, playerId, playerName, playerAvatar, now = Date.now() }) {
  if (!db) throw new Error('Firebase is not configured')
  if (!isPublicGameType(gameType)) throw new Error('Game is not eligible for public matchmaking')
  const party = !!getGameConfig(gameType)?.nPlayer
  const game = party
    ? { gameType, visibility: 'public', status: 'waiting', scores: {}, createdAt: now, lastActivityAt: now, players: { [playerId]: { name: playerName, joinedAt: now, playerId, online: true, avatar: playerAvatar } }, ...freshGameState(gameType) }
    : { gameType, visibility: 'public', status: 'waiting', scores: { X: 0, O: 0 }, createdAt: now, lastActivityAt: now, players: { X: { name: playerName, joinedAt: now, playerId, avatar: playerAvatar } }, ...freshGameState(gameType) }
  const entry = publicRoomEntry({ gameId, gameType, hostUid: playerId, hostName: playerName, hostAvatar: playerAvatar, now })
  await set(ref(db, `games/${gameId}`), game)
  try { await set(ref(db, `matchmaking/${gameId}`), entry) } catch (error) { await remove(ref(db, `games/${gameId}`)); throw error }
  await onDisconnect(ref(db, `matchmaking/${gameId}`)).remove()
  return game
}
export function subscribePublicRooms(callback) {
  if (!db) return () => {}
  return onValue(query(ref(db, 'matchmaking'), orderByChild('createdAt'), limitToLast(100)), snapshot => callback(normalizePublicRooms(snapshot.val())))
}
export async function removePublicListing(gameId) { if (db && gameId) await remove(ref(db, `matchmaking/${gameId}`)) }
// Still worth listing: a public, eligible room whose host is waiting alone
// and hasn't hit the listing TTL.
export function isListableRoom(game, now = Date.now()) {
  return !!game && game.visibility === 'public' && game.status === 'waiting' && isPublicGameType(game.gameType) && !!listingHost(game) && typeof game.createdAt === 'number' && now < game.createdAt + PUBLIC_ROOM_TTL_MS
}
// The host's onDisconnect deletes the listing (createPublicRoom), so a host
// who drops and reconnects — or reopens the room — must put it back while the
// room is still waiting. Keeps the room's original createdAt/expiry so it
// keeps its place in the list.
export async function republishPublicRoom({ gameId, game }) {
  if (!db || !isListableRoom(game)) return false
  const host = listingHost(game)
  const entry = { ...publicRoomEntry({ gameId, gameType: game.gameType, hostUid: host.uid, hostName: host.name, hostAvatar: host.avatar, now: game.createdAt }), updatedAt: Date.now() }
  await set(ref(db, `matchmaking/${gameId}`), entry)
  await onDisconnect(ref(db, `matchmaking/${gameId}`)).remove()
  return true
}
export async function claimPublicRoom({ gameId, playerId, playerName, playerAvatar }) {
  if (!db) throw new Error('Firebase is not configured')
  const gameRef = ref(db, `games/${gameId}`)
  const snapshot = await get(gameRef)
  if (!snapshot.exists()) return { ok: false, reason: 'missing' }
  const game = snapshot.val()
  const expiresAt = game.createdAt ? game.createdAt + PUBLIC_ROOM_TTL_MS : 0
  const cfg = getGameConfig(game.gameType)
  if (cfg?.nPlayer) {
    // Race room: joining takes a uid-keyed seat (roomLogic.partyJoinPlan
    // capacity check, then a create-once write of players/{uid}); the room stays in its ready-up
    // lobby. The listing is a 1v1 offer, so it goes once the seat is taken.
    const host = listingHost(game)
    if (game.players?.[playerId]) return host?.uid === playerId ? { ok: false, reason: 'owner' } : { ok: true, gameType: game.gameType, party: true }
    if (game.visibility !== 'public' || game.status !== 'waiting' || !isPublicGameType(game.gameType) || !host?.online || Date.now() >= expiresAt) return { ok: false, reason: 'unavailable' }
    if (partyJoinPlan({ players: game.players, myId: playerId, status: game.status, maxPlayers: cfg.maxPlayers || 8 }).action !== 'join') return { ok: false, reason: 'full' }
    // Only this player's own seat is written (create-once), never the node.
    const seat = { name: playerName, joinedAt: Date.now(), playerId, online: true, avatar: playerAvatar }
    const result = await runTransaction(ref(db, `games/${gameId}/players/${playerId}`), cur => (cur ? undefined : seat))
    if (!result.committed) return { ok: false, reason: 'full' }
    await update(gameRef, { lastActivityAt: Date.now() })
    await removePublicListing(gameId).catch(() => {})
    return { ok: true, gameType: game.gameType, party: true }
  }
  if (game.visibility !== 'public' || game.status !== 'waiting' || !isPublicGameType(game.gameType) || !game.players?.X || !isSeatOnline(game.presence?.X) || Date.now() >= expiresAt) return { ok: false, reason: 'unavailable' }
  if (game.players?.X?.playerId === playerId) return { ok: false, reason: 'owner' }
  if (game.players?.O) return { ok: false, reason: 'full' }
  const result = await runTransaction(ref(db, `games/${gameId}/players/O`), current => current === null ? { name: playerName, joinedAt: Date.now(), playerId, avatar: playerAvatar } : undefined)
  if (!result.committed) return { ok: false, reason: 'full' }
  const updates = { status: 'playing', lastActivityAt: Date.now() }
  if (game.gameType === 'hangwoman') { updates['round/setter'] = 'X'; updates['round/phase'] = 'setting'; updates['round/wrongCount'] = 0 }
  await update(gameRef, updates)
  await removePublicListing(gameId)
  return { ok: true, gameType: game.gameType }

}
