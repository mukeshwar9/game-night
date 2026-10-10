import { describe, expect, it } from 'vitest'
import {
  BACK, COINS_PER_HEART, DOUBLE_ALWAYS, GAP_FLOOR, GAP_START, HEARTS, HOLD, NO_BREAK, OUT, REACH, RISE, SPEED,
  STONE_HP, SUDDEN_FROM, WARN_FLOOR, WARN_START, WARN_SUDDEN,
  bamboozleDecided, bamboozleRaceEntry, bamboozleRow, boulderCount, cellAt, coverReport, createTimeline, gapFor, ghostsFrom,
  isOutStats, laneLen, laneOf, laneRect, normalizeBamboozleStats, packCoord, reachOf, safeCells, tipPoint,
  warnFor, worstWalk, yardSize,
} from './bamboozleLogic'
import { rankRace } from './raceLogic'

const at = (...cells) => (c, r) => cells.some(([x, y]) => x === c && y === r)

describe('yard geometry', () => {
  it('sizes the yard by player count', () => {
    expect([1, 2].map(yardSize)).toEqual([4, 4])
    expect([3, 4].map(yardSize)).toEqual([5, 5])
    expect([boulderCount(4), boulderCount(5)]).toEqual([3, 5])
  })

  it('cellAt and laneOf are inverses from every wall', () => {
    for (const n of [4, 5]) {
      for (const side of [0, 1, 2, 3]) {
        for (let i = 0; i < n; i++) {
          for (let k = 0; k < n; k++) {
            const [c, r] = cellAt(n, side, i, k)
            expect(laneOf(n, side, c, r)).toEqual([i, k])
          }
        }
      }
    }
  })

  it('a pole stops at the first boulder in its lane', () => {
    const blocked = at([1, 2])
    expect(laneLen(4, blocked, 0, 1)).toBe(2) // from the top, column 1: rows 0 and 1 are open
    expect(laneLen(4, blocked, 2, 1)).toBe(1) // from the bottom the rock is one tile in
    expect(laneLen(4, blocked, 0, 0)).toBe(4) // an empty lane runs the whole yard
    expect(laneLen(4, blocked, 3, 2)).toBe(1) // from the left, row 2
  })

  it('only tiles behind a rock are safe', () => {
    // One rock at (1,1). From the top wall column 1 is stopped at row 1.
    const safe = safeCells(4, at([1, 1]), [0]).map(([c, r]) => `${c},${r}`)
    expect(safe).toContain('1,2')
    expect(safe).toContain('1,3')
    expect(safe).not.toContain('0,2') // an open column is never safe
    expect(safe).not.toContain('1,1') // the rock itself is not a tile
    expect(safe).toHaveLength(2)
  })

  it('two walls leave only the tiles safe from both', () => {
    const blocked = at([1, 1])
    const both = safeCells(4, blocked, [0, 3]).map(([c, r]) => `${c},${r}`)
    // behind the rock from the top is (1,2), (1,3); from the left (2,1), (3,1): no tile is behind it for both
    expect(both).toEqual([])
  })

  it('worstWalk is the farthest tile from cover, Infinity with no cover at all', () => {
    expect(worstWalk(4, at(), [0])).toBe(Infinity)
    // rock at (1,1), top wall: safe (1,2), (1,3); the far corner (3,0) is four steps from (1,2)
    expect(worstWalk(4, at([1, 1]), [0])).toBe(4)
    // a corner walled off by rocks cannot walk anywhere, so that wall is never "fair"
    const walled = at([1, 0], [0, 1])
    expect(worstWalk(4, walled, [0])).toBe(Infinity)
    expect(coverReport(4, walled, [0]).stuck).toBe(1)
  })

  it('a pole fills its lane up to just short of the boulder', () => {
    const lane = { side: 0, i: 1, len: 2, stoneId: 1 }
    const [x0, y0, x1, y1] = laneRect(4, lane, 1)
    expect(x0).toBeCloseTo(1.15)
    expect(x1).toBeCloseTo(1.85)
    expect([y0, y1]).toEqual([0, 1.96])
    expect(laneRect(4, lane, 0)[3]).toBe(0)
    // from the right wall the pole grows leftwards
    const [rx0, , rx1] = laneRect(4, { side: 1, i: 0, len: 4, stoneId: null }, 1)
    expect(rx1).toBe(4)
    expect(rx0).toBeCloseTo(0.04)
    expect(tipPoint(4, { side: 2, i: 3, len: 2 }, 1)).toEqual([3.5, 2])
  })
})

describe('pace', () => {
  it('the warning shrinks to a floor, then goes short for sudden death', () => {
    expect(warnFor(0)).toBe(WARN_START)
    expect(warnFor(1)).toBeLessThan(warnFor(0))
    expect(warnFor(SUDDEN_FROM - 1)).toBe(WARN_FLOOR)
    expect(warnFor(SUDDEN_FROM)).toBe(WARN_SUDDEN)
    expect(WARN_SUDDEN).toBeLessThan(WARN_FLOOR)
  })

  it('the pause shrinks to a floor', () => {
    expect(gapFor(0)).toBe(GAP_START)
    expect(gapFor(500)).toBe(GAP_FLOOR)
  })
})

describe('timeline', () => {
  const plain = (tl, upTo) => Array.from({ length: upTo }, (_, k) => ({ ...tl.volley(k), coin: null }))

  it('is a pure function of seed and options', () => {
    const a = createTimeline({ seed: 1234, n: 4 })
    const b = createTimeline({ seed: 1234, n: 4 })
    expect(plain(a, 30)).toEqual(plain(b, 30))
    expect(plain(createTimeline({ seed: 1235, n: 4 }), 30)).not.toEqual(plain(a, 30))
  })

  it('gives the same answers whatever order they are asked in', () => {
    const forward = createTimeline({ seed: 77, n: 5 })
    const jumpy = createTimeline({ seed: 77, n: 5 })
    jumpy.volley(19)
    jumpy.view(3.2)
    for (let k = 0; k < 20; k++) expect(jumpy.volley(k)).toEqual(forward.volley(k))
  })

  it('a coin never reshuffles the volleys', () => {
    const without = createTimeline({ seed: 9, n: 4, coins: false })
    const withCoins = createTimeline({ seed: 9, n: 4, coins: true })
    expect(plain(withCoins, 20)).toEqual(plain(without, 20))
    const coin = withCoins.volley(3).coin
    expect(coin).not.toBeNull()
    expect(without.volley(3).coin).toBeNull()
  })

  it('keeps the same number of boulders and one off the edge, over many seeds', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const n of [4, 5]) {
        const tl = createTimeline({ seed, n })
        expect(tl.initial).toHaveLength(boulderCount(n))
        const cells = tl.initial.map((s) => `${s.c},${s.r}`)
        expect(new Set(cells).size).toBe(cells.length)
        const first = tl.initial[0]
        expect(first.c > 0 && first.r > 0 && first.c < n - 1 && first.r < n - 1).toBe(true)
        for (let k = 0; k < 30; k++) {
          const v = tl.volley(k)
          expect(v.after).toHaveLength(boulderCount(n))
          const after = v.after.map((s) => `${s.c},${s.r}`)
          expect(new Set(after).size).toBe(after.length)
        }
      }
    }
  })

  it('runs volleys back to back and lands every boulder before the next strike', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const tl = createTimeline({ seed, n: 4 })
      for (let k = 0; k < 40; k++) {
        const v = tl.volley(k)
        const next = tl.volley(k + 1)
        expect(next.idleAt).toBeCloseTo(v.backEnd)
        expect(v.warnAt).toBeCloseTo(v.idleAt + gapFor(k))
        expect(v.fireAt).toBeCloseTo(v.warnAt + warnFor(k))
        expect(v.impactAt).toBeCloseTo(v.fireAt + OUT)
        expect(v.retractAt).toBeCloseTo(v.impactAt + HOLD)
        expect(v.backEnd).toBeCloseTo(v.retractAt + BACK)
        for (const s of v.lands) expect(s.landAt).toBeCloseTo(v.retractAt + RISE)
        // Everything that falls from volley k stands before volley k+1 fires.
        for (const s of next.stones) expect(s.landAt).toBeLessThanOrEqual(next.fireAt)
      }
    }
  })

  it('only fires walls whose walk to cover fits the warning, until sudden death', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const tl = createTimeline({ seed, n: 4 })
      for (let k = 0; k < SUDDEN_FROM; k++) {
        const v = tl.volley(k)
        const blocked = (c, r) => v.stones.some((s) => s.c === c && s.r === r)
        const budget = Math.max(1, Math.floor(SPEED * v.warn * REACH))
        const reports = [0, 1, 2, 3].map((s) => coverReport(4, blocked, [s]))
        const fewest = Math.min(...reports.map((r) => r.stuck))
        const best = Math.min(...reports.filter((r) => r.stuck === fewest).map((r) => r.worst))
        if (v.sides.length === 1) {
          const chosen = reports[v.sides[0]]
          expect(chosen.stuck).toBe(fewest)
          expect(chosen.worst).toBeLessThanOrEqual(Math.max(budget, best))
        }
        // Some tile is always safe from whatever fires.
        expect(safeCells(4, blocked, v.sides).length).toBeGreaterThan(0)
      }
    }
  })

  it('a second wall joins in later and always from the cut-off', () => {
    const tl = createTimeline({ seed: 5, n: 5 })
    expect(tl.volley(0).sides).toHaveLength(1)
    expect(tl.volley(1).sides).toHaveLength(1)
    for (let k = DOUBLE_ALWAYS; k < DOUBLE_ALWAYS + 20; k++) {
      const v = tl.volley(k)
      expect(v.sides.length).toBeGreaterThanOrEqual(1)
      expect(v.warn).toBe(warnFor(k))
    }
    // From the sudden-death volley a pair of walls fires whenever one can.
    for (let seed = 1; seed <= 20; seed++) {
      const late = createTimeline({ seed, n: 5 })
      expect(late.volley(SUDDEN_FROM).warn).toBe(WARN_SUDDEN)
    }
  })

  it('a boulder cracks when it stops a pole and breaks on its last block', () => {
    const tl = createTimeline({ seed: 3, n: 4, crumble: true })
    let sawBreak = false
    for (let k = 0; k < 40; k++) {
      const v = tl.volley(k)
      const struck = new Set(v.lanes.map((l) => l.stoneId).filter((id) => id != null))
      for (const s of v.stones) {
        const expected = s.hp - (struck.has(s.id) ? 1 : 0)
        expect(v.hpAfter[s.id]).toBe(expected)
        if (expected <= 0) {
          sawBreak = true
          expect(v.breaks).toContain(s.id)
        }
      }
      expect(v.lands).toHaveLength(v.breaks.length)
      for (const s of v.lands) expect(s.hp).toBe(STONE_HP)
    }
    expect(sawBreak).toBe(true)
  })

  it('with CRUMBLE off boulders never move', () => {
    const tl = createTimeline({ seed: 3, n: 4, crumble: false })
    const home = tl.initial.map((s) => `${s.c},${s.r}`).sort()
    for (let k = 0; k < 40; k++) {
      const v = tl.volley(k)
      expect(v.breaks).toEqual([])
      expect(v.after.map((s) => `${s.c},${s.r}`).sort()).toEqual(home)
      expect(v.stones.every((s) => s.hp === NO_BREAK)).toBe(true)
    }
  })

  it('the coin sits on a free tile, shows before the wall fires and is gone when it does', () => {
    const tl = createTimeline({ seed: 21, n: 5, coins: true })
    for (let k = 0; k < 20; k++) {
      const v = tl.volley(k)
      expect(v.coin).not.toBeNull()
      const { c, r, at: showAt } = /** @type {any} */ (v.coin)
      expect(v.stones.some((s) => s.c === c && s.r === r)).toBe(false)
      expect(showAt).toBeLessThan(v.fireAt)
      expect(tl.view(showAt + 0.01).coin).toEqual({ c, r })
      expect(tl.view(v.fireAt + 0.01).coin).toBeNull()
    }
  })

  describe('view', () => {
    const tl = createTimeline({ seed: 42, n: 4 })
    const v0 = tl.volley(0)

    it('walks the phases in order', () => {
      expect(tl.view(0).phase).toBe('idle')
      expect(tl.view(v0.warnAt + 0.01).phase).toBe('warn')
      expect(tl.view(v0.fireAt + 0.01).phase).toBe('out')
      expect(tl.view(v0.impactAt + 0.01).phase).toBe('hold')
      expect(tl.view(v0.retractAt + 0.01).phase).toBe('back')
      expect(tl.view(v0.backEnd + 0.01).phase).toBe('idle')
      expect(tl.view(v0.backEnd + 0.01).k).toBe(1)
    })

    it('shoots out, stays out, and draws back smoothly', () => {
      const out = [0.2, 0.5, 0.9].map((u) => tl.view(v0.fireAt + OUT * u).ext)
      expect(out[0]).toBeLessThan(out[1])
      expect(out[1]).toBeLessThan(out[2])
      expect(tl.view(v0.impactAt + 0.1).ext).toBe(1)
      const back = [0.2, 0.5, 0.9].map((u) => tl.view(v0.retractAt + BACK * u).ext)
      expect(back[0]).toBeGreaterThan(back[1])
      expect(back[1]).toBeGreaterThan(back[2])
      expect(tl.view(v0.warnAt + 0.1).ext).toBe(0)
    })

    it('shows lanes only while the poles are out', () => {
      expect(tl.view(v0.warnAt + 0.01).lanes).toEqual([])
      expect(tl.view(v0.warnAt + 0.01).sides).toEqual(v0.sides)
      expect(tl.view(v0.fireAt + 0.01).lanes.length).toBe(v0.sides.length * 4)
    })

    it('a boulder is only a ring until it lands', () => {
      for (let seed = 1; seed <= 20; seed++) {
        const t = createTimeline({ seed, n: 4 })
        const v = t.volley(t.volley(0).breaks.length ? 0 : 6)
        const target = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((k) => t.volley(k)).find((x) => x.lands.length)
        if (!target) continue
        const land = target.lands[0]
        const before = t.view(target.retractAt + 0.1)
        expect(before.pending.map((s) => s.id)).toContain(land.id)
        expect(before.solid.map((s) => s.id)).not.toContain(land.id)
        const later = t.view(land.landAt + 0.01)
        expect(later.solid.map((s) => s.id)).toContain(land.id)
        expect(v).toBeDefined()
        return
      }
    })

    it('a struck boulder shows its damage only after the impact', () => {
      for (let k = 0; k < 15; k++) {
        const v = tl.volley(k)
        const lane = v.lanes.find((l) => l.stoneId != null)
        if (!lane) continue
        const id = lane.stoneId
        const stone = v.stones.find((s) => s.id === id)
        expect(tl.view(v.fireAt + 0.001).stones.find((s) => s.id === id)?.hp).toBe(stone.hp)
        const after = tl.view(v.impactAt + 0.001).stones.find((s) => s.id === id)
        expect(after?.hp).toBe(v.hpAfter[id])
        return
      }
    })
  })
})

describe('race stats', () => {
  it('normalizes whatever Firebase returned', () => {
    expect(normalizeBamboozleStats(null)).toEqual({ hearts: HEARTS, v: 0, out: null, hits: 0, coins: 0, x: null, y: null })
    expect(normalizeBamboozleStats({ hearts: 9, v: -4, out: 3, hits: '2', x: 250.4, y: 'bad' })).toEqual({
      hearts: 4, v: 0, out: 3, hits: 2, coins: 0, x: 250, y: null,
    })
    expect(normalizeBamboozleStats({ hearts: 'x' }).hearts).toBe(HEARTS)
  })

  it('knows who is out', () => {
    expect(isOutStats({ out: 0 })).toBe(true)
    expect(isOutStats({ hearts: 3 })).toBe(false)
    expect(isOutStats(null)).toBe(false)
  })

  it('reach is the volley a racer fell in, or how many they have outlived', () => {
    expect(reachOf({ v: 7 })).toBe(7)
    expect(reachOf({ v: 7, out: 5 })).toBe(5)
  })

  const rank = (stats) => rankRace(Object.entries(stats).map(([id, s]) => ({ id, sortKey: bamboozleRaceEntry(s).sortKey })))

  it('ranks by volleys lived through, a standing racer ahead of one who fell on the same volley', () => {
    const { order, ranks } = rank({
      early: { hearts: 0, v: 3, out: 3 },
      late: { hearts: 0, v: 11, out: 11 },
      standing: { hearts: 1, v: 11 },
      same: { hearts: 0, v: 3, out: 3 },
    })
    expect(order[0]).toBe('standing')
    expect(order[1]).toBe('late')
    expect(ranks.early).toBe(ranks.same)
    expect(ranks.early).toBe(3)
  })

  it('a frozen racer who is still "alive" cannot beat one who played on', () => {
    const { order } = rank({ frozen: { hearts: 3, v: 2 }, played: { hearts: 0, v: 9, out: 9 } })
    expect(order).toEqual(['played', 'frozen'])
  })

  it('a racer who never reported is a DNF', () => {
    expect(bamboozleRaceEntry(null).sortKey).toBeNull()
    const { dnf } = rankRace([{ id: 'a', sortKey: bamboozleRaceEntry({ hearts: 2, v: 4 }).sortKey }, { id: 'b', sortKey: null }])
    expect(dnf.b).toBe(true)
  })

  it('the round is decided once at most one racer is standing', () => {
    expect(bamboozleDecided({ a: { out: 4 }, b: {} }, ['a', 'b'])).toBe(true)
    expect(bamboozleDecided({ a: { out: 4 }, b: { hearts: 2 }, c: { hearts: 1 } }, ['a', 'b', 'c'])).toBe(false)
    expect(bamboozleDecided({ a: { out: 4 }, b: { out: 4 } }, ['a', 'b'])).toBe(true)
    // someone who has not reported yet is still standing
    expect(bamboozleDecided({ a: { out: 1 } }, ['a', 'b', 'c'])).toBe(false)
    expect(bamboozleDecided({}, ['a'])).toBe(false)
  })

  it('writes a row for the live table', () => {
    expect(bamboozleRow({ hearts: 1, v: 4, hits: 2 })).toMatchObject({ primary: '1 HEART', secondary: '4 VOLLEYS · 2 HITS', status: 'racing' })
    expect(bamboozleRow({ hearts: 0, out: 6, hits: 3 })).toMatchObject({ primary: 'OUT', status: 'done' })
    expect(bamboozleRow(null).status).toBe('idle')
  })

  it('turns reported positions into ghosts of the other racers', () => {
    const ghosts = ghostsFrom({
      me: { x: 100, y: 100 }, a: { x: 250, y: 75, hearts: 2 }, b: { hearts: 3 }, c: { x: 10, y: 20, out: 4, hearts: 0 },
    }, 'me')
    expect(ghosts).toEqual([
      { id: 'a', x: 2.5, y: 0.75, hearts: 2, out: false },
      { id: 'c', x: 0.1, y: 0.2, hearts: 0, out: true },
    ])
    expect(packCoord(2.504)).toBe(250)
  })

  it('has a coin count that matches the rule text', () => {
    expect(COINS_PER_HEART).toBe(3)
  })
})
