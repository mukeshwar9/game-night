import { beforeAll, describe, expect, it } from 'vitest'
if (typeof globalThis.localStorage === 'undefined') globalThis.localStorage = { getItem: () => null, setItem: () => {} }
let PUBLIC_ROOM_TTL_MS, getPublicGameTypes, normalizePublicRooms, publicRoomEntry, isListableRoom, listingHost, isPublicGameType
beforeAll(async () => {
  ;({ PUBLIC_ROOM_TTL_MS, getPublicGameTypes, normalizePublicRooms, publicRoomEntry, isListableRoom, listingHost, isPublicGameType } = await import('./matchmaking'))
})
describe('matchmaking helpers', () => {
  it('exposes base two-player games and the N-player races only', () => {
    const types = getPublicGameTypes()
    expect(types.length).toBeGreaterThan(10)
    expect(types.every(game => !game.variantOf && (!game.nPlayer || game.race))).toBe(true)
    expect(isPublicGameType('herd')).toBe(false)
  })
  it('filters invalid, offline, and expired listings', () => {
    const now = 1000
    const valid = publicRoomEntry({ gameId: 'A', gameType: 'tictactoe', hostUid: 'u1', hostName: 'A', now: 0 })
    expect(normalizePublicRooms({ A: valid, B: { ...valid, gameId: 'B', expiresAt: now }, C: { ...valid, gameId: 'C', hostOnline: false } }, now)).toEqual([{ ...valid, gameId: 'A' }])
  })
  it('sets a bounded expiry for public rooms', () => {
    const entry = publicRoomEntry({ gameId: 'A', gameType: 'tictactoe', hostUid: 'u1', now: 500 })
    expect(entry.expiresAt).toBe(500 + PUBLIC_ROOM_TTL_MS)
  })
  it('republishes only a public room whose host still waits alone', () => {
    const now = 1000
    const room = { visibility: 'public', status: 'waiting', gameType: 'tictactoe', createdAt: 0, players: { X: { playerId: 'u1' } } }
    expect(isListableRoom(room, now)).toBe(true)
    expect(isListableRoom({ ...room, players: { ...room.players, O: { playerId: 'u2' } } }, now)).toBe(false)
    expect(isListableRoom({ ...room, status: 'playing' }, now)).toBe(false)
    expect(isListableRoom({ ...room, visibility: 'private' }, now)).toBe(false)
    expect(isListableRoom({ ...room, gameType: 'herd' }, now)).toBe(false)
    expect(isListableRoom(room, PUBLIC_ROOM_TTL_MS)).toBe(false)
    expect(isListableRoom(null, now)).toBe(false)
  })

  it('lists a race room as a 1v1 while its host waits alone', () => {
    const race = getPublicGameTypes().find(g => g.race)
    if (!race) return // no race types registered in this build
    const now = 1000
    const host = { name: 'Hana', playerId: 'u1', joinedAt: 1, online: true }
    const room = { visibility: 'public', status: 'waiting', gameType: race.type, createdAt: 0, players: { u1: host } }
    expect(listingHost(room)).toMatchObject({ uid: 'u1', online: true })
    expect(isListableRoom(room, now)).toBe(true)
    const joined = { ...room, players: { ...room.players, u2: { name: 'Gus', playerId: 'u2', joinedAt: 2 } } }
    expect(listingHost(joined)).toBe(null)
    expect(isListableRoom(joined, now)).toBe(false)
    expect(listingHost({ ...room, players: { u1: { ...host, online: false } } }).online).toBe(false)
  })
})
