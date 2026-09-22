import { beforeAll, describe, expect, it } from 'vitest'
if (typeof globalThis.localStorage === 'undefined') globalThis.localStorage = { getItem: () => null, setItem: () => {} }
let PUBLIC_ROOM_TTL_MS, getPublicGameTypes, normalizePublicRooms, publicRoomEntry
beforeAll(async () => {
  ;({ PUBLIC_ROOM_TTL_MS, getPublicGameTypes, normalizePublicRooms, publicRoomEntry } = await import('./matchmaking'))
})
describe('matchmaking helpers', () => {
  it('exposes only base two-player games', () => {
    const types = getPublicGameTypes()
    expect(types.length).toBeGreaterThan(10)
    expect(types.every(game => !game.variantOf && !game.nPlayer)).toBe(true)
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
})
