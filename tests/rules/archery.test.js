// Archery room inputs are append-only, turn-owned integer aim payloads.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { advanceArcheryShot } from '../../src/lib/archeryLogic.js'
import { assertFails, assertSucceeds, dbAs, gameNode, partyNode, rulesEnvFor, seed } from './helpers.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const arrow = (by = 'X', over = {}) => ({ by, ax: 0, ay: 0, dr: 850, sway: 0, distance: 50, shotIndex: 0, wind: 0, ...over })
const duel = () => gameNode({ x: 'alice', o: 'bob', status: 'playing', extra: {
  gameType: 'archery', currentTurn: 'X', archeryFormat: 'standard', archerySeed: 42,
  archeryPhase: 'main', archeryTurnStartedAt: Date.now(),
} })

async function put(room) { await seed(T.env, 'games/g1', room) }

describe('ARCHERY', () => {
  it('accepts the current archer’s bounded shot and rejects forged, out-of-range, or edited shots', async () => {
    await put(duel())
    await assertSucceeds(as('alice').ref('games/g1/archeryShots/0').set(arrow()))
    await assertFails(as('bob').ref('games/g1/archeryShots/1').set(arrow('X')))
    await assertFails(as('alice').ref('games/g1/archeryShots/1').set(arrow('X', { dr: 1200 })))
    await assertFails(as('alice').ref('games/g1/archeryShots/0/ax').set(25))
  })

  it('lets only the 2P host set the range before the first arrow', async () => {
    await put(duel())
    await assertSucceeds(as('alice').ref('games/g1/archeryFormat').set('quick'))
    await assertFails(as('bob').ref('games/g1/archeryFormat').set('marathon'))
  })

  it('allows the room transaction to append an arrow and flip its turn atomically', async () => {
    const room = duel()
    await put(room)
    const moved = advanceArcheryShot(room, arrow(), ['X', 'O'])
    await assertSucceeds(as('alice').ref('games/g1').transaction(current => ({
      ...current, ...moved, archeryTurnStartedAt: Date.now(), lastActivityAt: Date.now(),
    })))
  })

  it('supports party-seat identities and validates format values', async () => {
    const room = partyNode({ uids: ['alice', 'bob', 'carol'], gameType: 'archery4', status: 'playing', extra: {
      currentTurn: 'X', archeryFormat: 'standard', archerySeed: 8, archeryPhase: 'main',
      archerySeatUids: { X: 'alice', O: 'bob', A: 'carol' }, archeryTurnStartedAt: Date.now(),
    } })
    await put(room)
    await assertSucceeds(as('alice').ref('games/g1/archeryShots/0').set(arrow('X', { shotIndex: 0 })))
    await assertFails(as('bob').ref('games/g1/archeryShots/1').set(arrow('X', { shotIndex: 1 })))
    await assertFails(as('alice').ref('games/g1/archeryFormat').set('unlimited'))
    await put({ ...room, status: 'waiting' })
    await assertSucceeds(as('alice').ref('games/g1/archeryFormat').set('marathon'))
  })

  it('replays party-room arrow transactions without invalidating unchanged room data', async () => {
    const room = partyNode({ uids: ['alice', 'bob'], gameType: 'archery4', status: 'playing', extra: {
      currentTurn: 'X', archeryFormat: 'standard', archerySeed: 8, archeryPhase: 'main',
      archerySeatUids: { X: 'alice', O: 'bob' }, archeryTurnStartedAt: Date.now(),
    } })
    await put(room)
    const moved = advanceArcheryShot(room, arrow('X'), ['X', 'O'])
    await assertSucceeds(as('alice').ref('games/g1').transaction(current => ({
      ...current, ...moved, archeryTurnStartedAt: Date.now(), lastActivityAt: Date.now(),
    })))
  })

  it('validates 70 m shoot-off arrows', async () => {
    const room = duel()
    room.archeryPhase = 'shootOff'
    room.archeryTied = ['X', 'O']
    await put(room)
    await assertSucceeds(as('alice').ref('games/g1/archeryShootOffShots/0').set(arrow('X', { distance: 70 })))
    await assertFails(as('bob').ref('games/g1/archeryShootOffShots/1').set(arrow('O', { distance: 50 })))
  })
})
