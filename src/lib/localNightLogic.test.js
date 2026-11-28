import { describe, it, expect } from 'vitest'
import { NIGHT_POINTS, DRAW_POINTS } from './nightLogic'
import {
  defaultPlayers, cleanName, canDeal, dealPool, shuffle, dealGames, redealOne,
  createNight, currentGame, currentIndex, isFinished, setPhase, recordResult, undoResult,
  gamePoints, standings, champions, winnerOf, parseNight, serializeNight,
  NIGHT_LENGTHS, NAME_MAX,
} from './localNightLogic'

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

const night3 = (games = ['a', 'b', 'c']) => createNight({ players: defaultPlayers(3), games, now: 5 })

describe('players', () => {
  it('seats two to four with distinct faces', () => {
    expect(defaultPlayers(1)).toHaveLength(2)
    expect(defaultPlayers(9)).toHaveLength(4)
    const p = defaultPlayers(4)
    expect(new Set(p.map(x => x.id)).size).toBe(4)
    expect(new Set(p.map(x => x.avatar)).size).toBe(4)
    expect(p[0].name).toBe('P1')
  })

  it('cleans a name: trims, collapses spaces, caps, falls back', () => {
    expect(cleanName('  Ana   Maria  ', 'P1')).toBe('Ana Maria')
    expect(cleanName('x'.repeat(40), 'P1')).toHaveLength(NAME_MAX)
    expect(cleanName('   ', 'P2')).toBe('P2')
    expect(cleanName(null, 'P3')).toBe('P3')
  })
})

describe('dealing', () => {
  const cfgs = [
    { type: 'ttt' },
    { type: 'ttt4', variantOf: 'ttt' },
    { type: 'quad', localMaxPlayers: 4 },
    { type: 'three', localMaxPlayers: 3 },
    { type: 'online-only' },
  ]
  const local = (t) => t !== 'online-only'

  it('a generic board seats two only; a page with localMaxPlayers seats that many', () => {
    expect(canDeal(cfgs[0], true, 2)).toBe(true)
    expect(canDeal(cfgs[0], true, 3)).toBe(false)
    expect(canDeal(cfgs[2], true, 4)).toBe(true)
    expect(canDeal(cfgs[3], true, 4)).toBe(false)
    expect(canDeal(cfgs[3], true, 3)).toBe(true)
  })

  it('leaves out variants, games without local play and unknown configs', () => {
    expect(canDeal(cfgs[1], true, 2)).toBe(false)
    expect(canDeal(cfgs[4], false, 2)).toBe(false)
    expect(canDeal(undefined, true, 2)).toBe(false)
    expect(dealPool(cfgs, local, 2)).toEqual(['ttt', 'quad', 'three'])
    expect(dealPool(cfgs, local, 4)).toEqual(['quad'])
  })

  it('shuffle keeps every item and does not touch the input', () => {
    const src = [1, 2, 3, 4, 5, 6]
    const out = shuffle(src, seeded(3))
    expect([...out].sort()).toEqual(src)
    expect(src).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('deals distinct games, capped at the pool size', () => {
    const pool = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const dealt = dealGames(pool, 5, seeded(7))
    expect(dealt).toHaveLength(5)
    expect(new Set(dealt).size).toBe(5)
    expect(dealt.every(t => pool.includes(t))).toBe(true)
    expect(dealGames(['a', 'b'], 7)).toHaveLength(2)
    expect(dealGames(['a', 'a', 'b'], 5)).toHaveLength(2)
    expect(NIGHT_LENGTHS).toEqual([5, 7, 10])
  })

  it('re-deals one slot with a game not already in the night', () => {
    const out = redealOne(['a', 'b', 'c'], 1, ['a', 'b', 'c', 'd'], seeded(2))
    expect(out).toEqual(['a', 'd', 'c'])
    expect(redealOne(['a', 'b'], 0, ['a', 'b'])).toEqual(['a', 'b'])
    expect(redealOne(['a', 'b'], 5, ['a', 'b', 'z'])).toEqual(['a', 'b'])
  })
})

describe('scoring', () => {
  it('a win is the first night points, the others get none', () => {
    const pts = gamePoints(defaultPlayers(3), 'p2')
    expect(pts.map(p => p.points)).toEqual([0, NIGHT_POINTS[0], 0])
    expect(pts.map(p => p.win)).toEqual([false, true, false])
  })

  it('a draw gives everyone the draw points and no wins', () => {
    const pts = gamePoints(defaultPlayers(4), null)
    expect(pts.every(p => p.points === DRAW_POINTS && !p.win)).toBe(true)
  })
})

describe('a night', () => {
  it('starts on the first game at intro, with all zeros listed', () => {
    const n = night3()
    expect(currentGame(n)).toBe('a')
    expect(currentIndex(n)).toBe(0)
    expect(n.phase).toBe('intro')
    expect(standings(n).map(r => r.points)).toEqual([0, 0, 0])
    expect(standings(n).every(r => r.rank === 1)).toBe(true)
    expect(champions(n)).toEqual([])
  })

  it('records a winner, advances and returns to intro', () => {
    let n = setPhase(night3(), 'judging')
    expect(n.phase).toBe('judging')
    n = recordResult(n, 'p3')
    expect(n.results).toEqual([{ type: 'a', winner: 'p3' }])
    expect(currentGame(n)).toBe('b')
    expect(n.phase).toBe('intro')
    expect(winnerOf(n, 0).id).toBe('p3')
  })

  it('ignores an unknown winner, a bad phase and results after the end', () => {
    const n = night3(['a'])
    expect(recordResult(n, 'zzz')).toBe(n)
    expect(setPhase(n, 'nope')).toBe(n)
    const done = recordResult(n, 'p1')
    expect(isFinished(done)).toBe(true)
    expect(recordResult(done, 'p2')).toBe(done)
    expect(setPhase(done, 'playing')).toBe(done)
    expect(currentGame(done)).toBeNull()
  })

  it('ranks by points, then wins, then seat order; shares rank on a tie', () => {
    let n = night3(['a', 'b', 'c', 'd'])
    n = recordResult(n, 'p2')
    n = recordResult(n, 'p3')
    n = recordResult(n, null)
    const rows = standings(n)
    // p1: 1 (draw). p2: 3 + 1. p3: 3 + 1.
    expect(rows.map(r => [r.id, r.points, r.wins, r.rank])).toEqual([
      ['p2', 4, 1, 1], ['p3', 4, 1, 1], ['p1', 1, 0, 3],
    ])
    expect(rows.every(r => r.played === 3)).toBe(true)
  })

  it('a draw-only night leaves everyone level on rank 1', () => {
    let n = createNight({ players: defaultPlayers(2), games: ['a', 'b'] })
    n = recordResult(n, null)
    n = recordResult(n, null)
    expect(standings(n).map(r => [r.id, r.points, r.rank])).toEqual([['p1', 2, 1], ['p2', 2, 1]])
  })

  it('names the champion once finished, and both on a tie', () => {
    let n = night3(['a', 'b'])
    n = recordResult(n, 'p1')
    expect(champions(n)).toEqual([])
    n = recordResult(n, 'p1')
    expect(champions(n).map(c => c.id)).toEqual(['p1'])
    let t = night3(['a', 'b'])
    t = recordResult(t, 'p1')
    t = recordResult(t, 'p2')
    expect(champions(t).map(c => c.id)).toEqual(['p1', 'p2'])
  })

  it('undo takes the last result back and reopens judging; nothing to undo is a no-op', () => {
    const n = night3()
    expect(undoResult(n)).toBe(n)
    const back = undoResult(recordResult(n, 'p1'))
    expect(back.results).toEqual([])
    expect(back.phase).toBe('judging')
    expect(standings(back).every(r => r.points === 0)).toBe(true)
  })
})

describe('storage', () => {
  it('round-trips a night', () => {
    let n = night3()
    n = recordResult(n, 'p2')
    n = setPhase(n, 'playing')
    expect(parseNight(serializeNight(n))).toEqual(n)
  })

  it('treats junk as no night', () => {
    for (const bad of [null, '', '{', '[]', '{}', 42, { players: [], games: [] }, { players: [{ id: 'p1' }], games: ['a'] }]) {
      expect(parseNight(bad)).toBeNull()
    }
  })

  it('repairs what it can: bad winners become draws, extra results and seats are dropped', () => {
    const n = parseNight({
      players: [{ id: 'p1', name: '  ' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }, { id: 'p5' }, 7],
      games: ['a', 'b'],
      results: [{ winner: 'p9' }, { winner: 'p2' }, { winner: 'p1' }],
      phase: 'weird',
    })
    expect(n.players.map(p => p.id)).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(n.players[0].name).toBe('P1')
    expect(n.results).toEqual([{ type: 'a', winner: null }, { type: 'b', winner: 'p2' }])
    expect(n.phase).toBe('intro')
  })

  it('a finished stored night never comes back mid-judging', () => {
    const n = parseNight({ players: defaultPlayers(2), games: ['a'], results: [{ winner: 'p1' }], phase: 'judging' })
    expect(isFinished(n)).toBe(true)
    expect(n.phase).toBe('intro')
  })
})
