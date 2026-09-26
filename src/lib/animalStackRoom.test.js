import { describe, expect, it } from 'vitest'
import {
  readStack, startStackMatch, applyDrop, applySettle, applyNextTower, applyAway, pendingDrop, cpState, turnUid, dropKey,
} from './animalStackRoom'
import { runDrop, hashState, pieceAt, roundSeed } from './animalStackLogic'

const P = (id, joinedAt, online = true) => ({ playerId: id, name: id.toUpperCase(), joinedAt, online })
const room = (ids = ['a', 'b', 'c']) => {
  const players = Object.fromEntries(ids.map((id, i) => [id, P(id, i + 1)]))
  return { gameType: 'animalstack', status: 'playing', players, ...startStackMatch(players, 1234) }
}
// Firebase-shaped copy (drops `undefined`, like a round trip would)
const fb = (g) => JSON.parse(JSON.stringify(g))

describe('startStackMatch', () => {
  it('seats online players in join order with hearts by count', () => {
    const players = { z: P('z', 3), a: P('a', 1), gone: P('gone', 2, false), b: P('b', 2) }
    const { stack } = startStackMatch(players, 7)
    expect(stack.order).toEqual(['a', 'b', 'z'])
    expect(stack.hearts).toEqual([2, 2, 2])
    expect(stack.seed).toBe(roundSeed(7, 1))
    expect(startStackMatch({ a: P('a', 1), b: P('b', 2) }, 7).stack.hearts).toEqual([3, 3])
  })

  it('caps at four seats', () => {
    const players = Object.fromEntries('abcde'.split('').map((id, i) => [id, P(id, i)]))
    expect(startStackMatch(players, 1).stack.order).toHaveLength(4)
  })
})

describe('readStack', () => {
  it('normalizes sparse arrays and numeric-keyed objects by key', () => {
    const s = readStack({ order: { 0: 'a', 1: 'b' }, hearts: { 1: 2 }, drops: { d001: { by: 'b', x: 5, r: 1 }, d000: { by: 'a', x: -3, r: 0 }, junk: {} } })
    expect(s.order).toEqual(['a', 'b'])
    expect(s.hearts).toEqual([0, 2])
    expect(s.drops.map(d => d.n)).toEqual([0, 1])
    expect(s.cp).toEqual({ n: 0, hash: hashState([]), poses: '' })
    expect(readStack(null)).toBeNull()
  })
})

describe('drop → settle', () => {
  it('only the seat to move may drop, once', () => {
    const g = room()
    expect(applyDrop(g, 'b', { x: 0, r: 0 })).toBeNull()
    const g2 = applyDrop(g, 'a', { x: 25.4, r: 30 })
    expect(g2.stack.phase).toBe('settle')
    expect(g2.stack.drops[dropKey(0)]).toEqual({ by: 'a', x: 25, r: 6 })
    expect(applyDrop(g2, 'a', { x: 0, r: 0 })).toBeNull()
    expect(turnUid(readStack(g2.stack))).toBeNull()
  })

  it('a standing drop advances the checkpoint and passes the turn', () => {
    const g = fb(applyDrop(room(), 'a', { x: 0, r: 0 }))
    const s = readStack(g.stack)
    const pend = pendingDrop(s)
    expect(pend.k).toBe(pieceAt(s.seed, 0))
    const res = runDrop(cpState(s), pend)
    expect(res.fell).toBe(false)
    const g2 = applySettle(g, 0, res)
    expect(g2.stack.cp.n).toBe(1)
    expect(g2.stack.cp.hash).toBe(res.hash)
    expect(cpState(readStack(g2.stack))).toEqual(res.state)
    expect(g2.stack.phase).toBe('aim')
    expect(turnUid(readStack(g2.stack))).toBe('b')
    // a second (slower) client's identical settle is a no-op
    expect(applySettle(fb(g2), 0, res)).toBeNull()
  })

  it('a topple costs a heart and pauses; the toppler starts the next tower', () => {
    const g = fb(applyDrop(room(), 'a', { x: 320, r: 0 }))
    const g2 = applySettle(g, 0, { fell: true })
    expect(g2.stack.phase).toBe('roundover')
    expect(g2.stack.hearts).toEqual([1, 2, 2])
    expect(g2.stack.result).toEqual({ toppler: 'a', round: 1, n: 0 })
    const g3 = applyNextTower(fb(g2), 1)
    expect(g3.stack.round).toBe(2)
    expect(g3.stack.turn).toBe(0)
    expect(g3.stack.drops).toBeNull()
    expect(g3.stack.cp.n).toBe(0)
    expect(g3.stack.seed).toBe(roundSeed(1234, 2))
    expect(applyNextTower(fb(g3), 1)).toBeNull()
  })

  it('the last seat standing wins and finishes the room', () => {
    const g = room(['a', 'b'])
    g.stack.hearts = [1, 3]
    const g2 = applySettle(fb(applyDrop(g, 'a', { x: 320, r: 0 })), 0, { fell: true })
    expect(g2.status).toBe('finished')
    expect(g2.winner).toBe('b')
    expect(g2.stack.phase).toBe('over')
  })
})

describe('away seats', () => {
  it('first miss drops for them at their ghost aim; second miss while offline knocks them out', () => {
    const g = room()
    g.stack.aim = { x: 0.42, r: 3 }
    const g2 = applyAway(fb(g), 'a', 0)
    expect(g2.stack.drops[dropKey(0)]).toEqual({ by: 'a', x: 42, r: 3, auto: true })
    expect(g2.stack.miss.a).toBe(1)

    const back = fb(g)
    back.stack.miss = { a: 1 }
    back.players.a.online = false
    const g3 = applyAway(back, 'a', 0)
    expect(g3.stack.hearts[0]).toBe(0)
    expect(g3.stack.turn).toBe(1)
    expect(g3.stack.drops).toBeFalsy()
  })

  it('a real drop clears the miss count; CAS guards stale calls', () => {
    const g = room()
    g.stack.miss = { a: 1 }
    expect(applyDrop(g, 'a', { x: 0, r: 0 }).stack.miss.a).toBe(0)
    expect(applyAway(fb(g), 'b', 0)).toBeNull()
    expect(applyAway(fb(g), 'a', 3)).toBeNull()
  })

  it('knocking out the second-to-last seat ends the match', () => {
    const g = room(['a', 'b'])
    g.stack.miss = { a: 1 }
    g.players.a.online = false
    const g2 = applyAway(fb(g), 'a', 0)
    expect(g2.status).toBe('finished')
    expect(g2.winner).toBe('b')
  })
})
