import { get, limitToLast, onDisconnect, onValue, orderByChild, query, ref, remove, runTransaction, set, update } from 'firebase/database'
import { db } from './firebase'
import { freshGameState, getGameConfig, GAME_TYPES } from './games'
export const PUBLIC_ROOM_TTL_MS = 24 * 60 * 60 * 1000
export function getPublicGameTypes() { return GAME_TYPES.filter(game => !game.variantOf && !game.nPlayer) }
export function isPublicGameType(gameType) { const cfg = getGameConfig(gameType); return !!cfg && !cfg.variantOf && !cfg.nPlayer }
export function normalizePublicRooms(raw, now = Date.now()) {
  return Object.entries(raw || {}).map(([gameId, room]) => ({ ...room, gameId })).filter(room => room.visibility === 'public' && isPublicGameType(room.gameType) && typeof room.hostUid === 'string' && typeof room.createdAt === 'number' && typeof room.expiresAt === 'number' && room.expiresAt > now && room.hostOnline !== false).sort((a, b) => a.createdAt - b.createdAt)
}
export function publicRoomEntry({ gameId, gameType, hostUid, hostName, hostAvatar, now = Date.now() }) {
  return { gameId, gameType, visibility: 'public', hostUid, hostName: hostName || 'PLAYER', hostAvatar: hostAvatar || null, hostOnline: true, createdAt: now, updatedAt: now, expiresAt: now + PUBLIC_ROOM_TTL_MS }
}
export async function createPublicRoom({ gameId, gameType, playerId, playerName, playerAvatar, now = Date.now() }) {
  if (!db) throw new Error('Firebase is not configured')
  if (!isPublicGameType(gameType)) throw new Error('Game is not eligible for public matchmaking')
  const game = { gameType, visibility: 'public', status: 'waiting', scores: { X: 0, O: 0 }, createdAt: now, lastActivityAt: now, players: { X: { name: playerName, joinedAt: now, playerId, avatar: playerAvatar } }, ...freshGameState(gameType) }
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
export async function claimPublicRoom({ gameId, playerId, playerName, playerAvatar }) {
  if (!db) throw new Error('Firebase is not configured')
  const gameRef = ref(db, `games/${gameId}`)
  const snapshot = await get(gameRef)
  if (!snapshot.exists()) return { ok: false, reason: 'missing' }
  const game = snapshot.val()
  const expiresAt = game.createdAt ? game.createdAt + PUBLIC_ROOM_TTL_MS : 0
  if (game.visibility !== 'public' || game.status !== 'waiting' || !isPublicGameType(game.gameType) || !game.players?.X || game.presence?.X?.online === false || Date.now() >= expiresAt) return { ok: false, reason: 'unavailable' }
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
