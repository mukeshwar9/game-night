import { describe, it, expect } from 'vitest'
import {
  ARROWS_DIRS, solveArrows, generateArrowsLevel, applyArrowTap, exitCheck, countGone, freeArrows, seededRng,
} from './arrowsLogic'
import {
  PARTY_TRANSFORMS, PARTY_ZONE_SIZES, PARTY_TIERS, PARTY_ROUND_CHOICES,
  transformLevel, partyLevel, partyZoneSpec, partyViewZones, buildPartyPicture, pictureGone, seatOfArrow,
  normalizePartyStats, partyIsDone, partyEntry, partyLiveKey, partyUsesLives, partyLivesLeft,
  formatPartyTime, normalizePartyConfig, DEFAULT_PARTY_CONFIG, clampPartyPlayers, describePartyConfig,
  withPartyCrates, SABOTAGE_CLEARS, PARTY_MAX_DROPS, dropValue, parseDrop, normalizeDrops, dropTarget,
  placeCrate, partyCrates,
} from './arrowsPartyLogic'

const SEEDS = Array.from({ length: 24 }, (_, i) => 1000 + i * 7919)

const hook = { cols: 5, rows: 4, arrows: [{ cells: [[1, 1], [2, 1]], dir: 1, turn: 1 }, { cells: [[0, 3], [0, 2]], dir: 0 }] }

describe('transformLevel', () => {
  it('id returns equal arrows', () => {
    const out = transformLevel(hook, 'id')
    expect(out.arrows).toEqual(hook.arrows)
  })

  it('maps cells and keeps head last (tail → head order)', () => {
    const out = transformLevel(hook, 'flipX')
    expect(out.arrows[0].cells).toEqual([[3, 1], [2, 1]])
    const r = transformLevel(hook, 'rot180')
    expect(r.arrows[0].cells).toEqual([[3, 2], [2, 2]])
    expect(r.arrows[1].cells).toEqual([[4, 0], [4, 1]])
  })

  it('maps each heading through the transform', () => {
    const head = (t) => ARROWS_DIRS[transformLevel(hook, t).arrows[0].dir]
    expect(head('id')).toEqual([1, 0])
    expect(head('flipX')).toEqual([-1, 0])
    expect(head('flipY')).toEqual([1, 0])
    expect(head('rot180')).toEqual([-1, 0])
    const up = (t) => ARROWS_DIRS[transformLevel(hook, t).arrows[1].dir]
    expect(up('flipY')).toEqual([0, 1])
    expect(up('rot180')).toEqual([0, 1])
    expect(up('flipX')).toEqual([0, -1])
  })

  it('maps diagonal headings', () => {
    const lvl = { cols: 4, rows: 4, arrows: [{ cells: [[0, 3], [1, 2]], dir: 4 }] } // up-right
    const dir = (t) => ARROWS_DIRS[transformLevel(lvl, t).arrows[0].dir]
    expect(dir('flipX')).toEqual([-1, -1])
    expect(dir('flipY')).toEqual([1, 1])
    expect(dir('rot180')).toEqual([-1, 1])
  })

  it('a mirror swaps a hook turn, a half turn keeps it', () => {
    expect(transformLevel(hook, 'flipX').arrows[0].turn).toBe(-1)
    expect(transformLevel(hook, 'flipY').arrows[0].turn).toBe(-1)
    expect(transformLevel(hook, 'rot180').arrows[0].turn).toBe(1)
    expect(transformLevel(hook, 'id').arrows[0].turn).toBe(1)
    expect('turn' in transformLevel(hook, 'flipX').arrows[1]).toBe(false)
  })

  it('every transform is its own inverse', () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const lvl = partyLevel(seed, 2, 'hard')
      for (const t of PARTY_TRANSFORMS) {
        expect(transformLevel(transformLevel(lvl, t), t).arrows).toEqual(lvl.arrows)
      }
    }
  })

  it('keeps arrow order and count', () => {
    const lvl = partyLevel(5, 2, 'hard')
    const out = transformLevel(lvl, 'rot180')
    expect(out.arrows).toHaveLength(lvl.arrows.length)
    lvl.arrows.forEach((a, i) => expect(out.arrows[i].cells).toHaveLength(a.cells.length))
  })

  it('refuses boards it cannot map', () => {
    expect(() => transformLevel({ ...hook, mask: ['#####'] }, 'flipX')).toThrow()
    expect(() => transformLevel({ ...hook, mirrors: [{ x: 0, y: 0, m: '/' }] }, 'flipX')).toThrow()
    expect(() => transformLevel({ ...hook, arrows: [{ cells: [[0, 0], [1, 0]], dir: 1, twist: 'bank' }] }, 'flipX')).toThrow()
    expect(() => transformLevel(hook, 'spin')).toThrow()
  })

  it('every copy of a generated zone is as hard as the original', () => {
    // Same depth and same number of free arrows at the start, on every tier and size.
    for (const n of [2, 3, 4]) {
      for (const tier of PARTY_TIERS) {
        for (const seed of SEEDS) {
          const base = partyLevel(seed, n, tier)
          const want = solveArrows(base)
          expect(want.solvable).toBe(true)
          for (const t of PARTY_TRANSFORMS) {
            const got = solveArrows(transformLevel(base, t))
            expect(got.solvable).toBe(true)
            expect(got.layers).toBe(want.layers)
            expect(got.initialFree).toBe(want.initialFree)
          }
        }
      }
    }
  })
})

describe('zone boards', () => {
  it('uses the per-count size and the tier mix', () => {
    for (const n of [2, 3, 4]) {
      for (const tier of PARTY_TIERS) {
        const [cols, rows] = PARTY_ZONE_SIZES[n][tier]
        const spec = partyZoneSpec(n, tier)
        expect(spec.cols).toBe(cols)
        expect(spec.rows).toBe(rows)
        const lvl = partyLevel(3, n, tier)
        expect(lvl.cols).toBe(cols)
        expect(lvl.rows).toBe(rows)
      }
    }
  })

  it('is deterministic per seed and differs between seeds', () => {
    expect(partyLevel(11, 3, 'medium').arrows).toEqual(partyLevel(11, 3, 'medium').arrows)
    expect(partyLevel(11, 3, 'medium').arrows).not.toEqual(partyLevel(12, 3, 'medium').arrows)
  })

  it('makes a real puzzle: enough arrows, not all open at the start', () => {
    for (const n of [2, 3, 4]) {
      for (const tier of PARTY_TIERS) {
        for (const seed of SEEDS) {
          const lvl = partyLevel(seed, n, tier)
          const s = solveArrows(lvl)
          expect(lvl.arrows.length).toBeGreaterThanOrEqual(4)
          expect(s.solvable).toBe(true)
          expect(s.initialFree).toBeLessThan(lvl.arrows.length)
        }
      }
    }
  })

  it('tiers escalate (more arrows with size, easy stays straight)', () => {
    for (const n of [2, 3, 4]) {
      let easy = 0
      let hard = 0
      for (const seed of SEEDS) {
        easy += partyLevel(seed, n, 'easy').arrows.length
        hard += partyLevel(seed, n, 'hard').arrows.length
      }
      expect(hard).toBeGreaterThan(easy)
    }
    for (const seed of SEEDS) {
      for (const a of partyLevel(seed, 2, 'easy').arrows) {
        expect(a.dir).toBeLessThan(4)
        expect(a.turn).toBeUndefined()
      }
    }
  })

  it('clamps the player count', () => {
    expect(clampPartyPlayers(1)).toBe(2)
    expect(clampPartyPlayers(9)).toBe(4)
    expect(clampPartyPlayers('3')).toBe(3)
    expect(clampPartyPlayers(undefined)).toBe(2)
  })
})

describe('partyViewZones', () => {
  it('puts you at the bottom, the rest above', () => {
    for (const n of [2, 3, 4]) {
      const { rows, zones } = partyViewZones(n, 5, 6, 1 % n)
      const mine = zones[1 % n]
      expect(mine.y + mine.h).toBe(rows)
      expect(mine.x).toBe(0)
      expect(mine.t).toBe('id')
    }
  })

  it('gives every seat its own non-overlapping rectangle inside the picture', () => {
    for (const n of [2, 3, 4]) {
      for (let v = 0; v < n; v += 1) {
        const { cols, rows, zones } = partyViewZones(n, 6, 5, v)
        expect(zones).toHaveLength(n)
        const taken = new Set()
        zones.forEach((z, seat) => {
          expect(z.seat).toBe(seat)
          expect(z.x + z.w).toBeLessThanOrEqual(cols)
          expect(z.y + z.h).toBeLessThanOrEqual(rows)
          for (let y = z.y; y < z.y + z.h; y += 1) {
            for (let x = z.x; x < z.x + z.w; x += 1) {
              expect(taken.has(`${x},${y}`)).toBe(false)
              taken.add(`${x},${y}`)
            }
          }
        })
      }
    }
  })

  it('shape per count: stacked, lanes, 2×2 cross; a gutter between zones', () => {
    const two = partyViewZones(2, 8, 7, 0)
    expect([two.cols, two.rows]).toEqual([8, 15])
    expect(two.zones[1].t).toBe('rot180')
    const three = partyViewZones(3, 8, 5, 0)
    expect([three.cols, three.rows]).toEqual([8, 17])
    expect(three.zones.every((z) => z.t === 'id')).toBe(true)
    const four = partyViewZones(4, 5, 6, 0)
    expect([four.cols, four.rows]).toEqual([11, 13])
    expect(four.zones.map((z) => z.t).sort()).toEqual(['flipX', 'flipY', 'id', 'rot180'])
  })

  it('a spectator sees seat 0\'s frame', () => {
    expect(partyViewZones(3, 5, 4, null)).toEqual(partyViewZones(3, 5, 4, 0))
    expect(partyViewZones(3, 5, 4, -1)).toEqual(partyViewZones(3, 5, 4, 0))
  })

  it('the cross is point-symmetric: every neighbour pair is a mirror of the other', () => {
    const { zones } = partyViewZones(4, 5, 6, 0)
    const by = Object.fromEntries(zones.map((z) => [`${z.x > 0 ? 'R' : 'L'}${z.y > 0 ? 'B' : 'T'}`, z.t]))
    expect(by).toEqual({ LB: 'id', RB: 'flipX', RT: 'rot180', LT: 'flipY' })
  })
})

describe('buildPartyPicture', () => {
  for (const n of [2, 3, 4]) {
    it(`${n} racers: solvable, every zone the same puzzle, from every seat`, () => {
      for (const tier of PARTY_TIERS) {
        for (const seed of SEEDS.slice(0, 8)) {
          const base = partyLevel(seed, n, tier)
          const want = solveArrows(base)
          for (let v = 0; v < n; v += 1) {
            const { level, per, zones } = buildPartyPicture({ base, n, viewer: v })
            expect(per).toBe(base.arrows.length)
            expect(level.arrows).toHaveLength(per * n)
            // The picture is one sealed puzzle per zone, so solving it solves them all
            // at the depth of one zone (they play in parallel).
            const all = solveArrows(level)
            expect(all.solvable).toBe(true)
            expect(all.layers).toBe(want.layers)
            expect(all.initialFree).toBe(want.initialFree * n)
            zones.forEach((z) => {
              expect(z.first).toBe(z.seat * per)
              const mine = { ...level, arrows: level.arrows.slice(z.first, z.first + per) }
              // Within its own rectangle every cell is playable and nothing leaves it.
              for (const a of mine.arrows) {
                for (const [x, y] of a.cells) {
                  expect(x).toBeGreaterThanOrEqual(z.x)
                  expect(x).toBeLessThan(z.x + z.w)
                  expect(y).toBeGreaterThanOrEqual(z.y)
                  expect(y).toBeLessThan(z.y + z.h)
                }
              }
            })
          }
        }
      }
    })
  }

  it('a zone is walled off: no tap in one zone is ever blocked by another zone', () => {
    for (const n of [2, 3, 4]) {
      for (const seed of SEEDS.slice(0, 8)) {
        const base = partyLevel(seed, n, 'hard')
        const { level, per } = buildPartyPicture({ base, n, viewer: 0 })
        // Clear one zone entirely: the arrows of the others stay exactly as free as before.
        const none = Array(per * n).fill(false)
        for (let seat = 0; seat < n; seat += 1) {
          const gone = none.slice()
          for (let i = 0; i < per; i += 1) gone[seat * per + i] = true
          for (let other = 0; other < n; other += 1) {
            if (other === seat) continue
            for (let i = 0; i < per; i += 1) {
              const idx = other * per + i
              expect(exitCheck(level, gone, idx).free).toBe(exitCheck(level, none, idx).free)
            }
          }
        }
      }
    }
  })

  it('a copy blocks and frees exactly like the original board, arrow by arrow', () => {
    for (const n of [2, 3, 4]) {
      for (const seed of SEEDS.slice(0, 10)) {
        const base = partyLevel(seed, n, 'hard')
        const { level, per, zones } = buildPartyPicture({ base, n, viewer: n - 1 })
        // Clear the original's first wave, then compare each zone's free set to the base's.
        const baseGone = Array(per).fill(false)
        const wave = solveArrows(base).order.slice(0, 3)
        wave.forEach((i) => { baseGone[i] = true })
        const gone = pictureGone(Array.from({ length: n }, () => baseGone), per)
        zones.forEach((z) => {
          for (let i = 0; i < per; i += 1) {
            if (baseGone[i]) continue
            expect(exitCheck(level, gone, z.first + i).free).toBe(exitCheck(base, baseGone, i).free)
          }
        })
      }
    }
  })

  it('marks void gutters and playable zones in the mask', () => {
    const base = partyLevel(2, 2, 'medium')
    const { level } = buildPartyPicture({ base, n: 2, viewer: 0 })
    expect(level.mask).toHaveLength(level.rows)
    const gutter = base.rows
    expect(level.mask[gutter]).toBe('.'.repeat(level.cols))
    expect(level.mask[0]).toBe('#'.repeat(level.cols))
    expect(level.mask[level.rows - 1]).toBe('#'.repeat(level.cols))
  })

  it('arrow index → seat', () => {
    expect(seatOfArrow(0, 10)).toBe(0)
    expect(seatOfArrow(9, 10)).toBe(0)
    expect(seatOfArrow(10, 10)).toBe(1)
    expect(seatOfArrow(35, 10)).toBe(3)
    expect(seatOfArrow(3, 0)).toBe(-1)
  })

  it('tapping works on the picture like on a plain board', () => {
    const base = partyLevel(9, 2, 'medium')
    const { level, per, zones } = buildPartyPicture({ base, n: 2, viewer: 0 })
    const gone = Array(per * 2).fill(false)
    const first = solveArrows(base).order[0]
    const hit = applyArrowTap(level, gone, 3, zones[0].first + first)
    expect(hit.result).toBe('cleared')
    expect(countGone(hit.gone)).toBe(1)
    const blocked = solveArrows(base).order.at(-1)
    const miss = applyArrowTap(level, gone, 3, zones[0].first + blocked)
    expect(miss.result).toBe('blocked')
    expect(miss.lives).toBe(2)
  })
})

describe('pictureGone', () => {
  it('lays each seat\'s cleared set at its own offset', () => {
    expect(pictureGone([[true, false], [false, true], undefined], 2)).toEqual([true, false, false, true, false, false])
  })
})

describe('racer stats', () => {
  it('normalizes a sparse or missing node', () => {
    expect(normalizePartyStats(undefined, 4)).toEqual({ gone: [false, false, false, false], cleared: 0, misses: 0, fin: null, out: false })
    const s = normalizePartyStats({ g: { 0: true, 3: true, 9: true }, m: 2, fin: 4500 }, 4)
    expect(s.gone).toEqual([true, false, false, true])
    expect(s.cleared).toBe(2)
    expect(s.misses).toBe(2)
    expect(s.fin).toBe(4500)
    expect(normalizePartyStats({ x: 1 }, 2).out).toBe(true)
  })

  it('done = finished or knocked out', () => {
    expect(partyIsDone(null)).toBe(false)
    expect(partyIsDone({ g: { 0: true } })).toBe(false)
    expect(partyIsDone({ fin: 1200 })).toBe(true)
    expect(partyIsDone({ x: 1 })).toBe(true)
    expect(partyIsDone({ fin: 0 })).toBe(false)
  })

  it('ranks by finish time, then fewer blocked taps; no finish is a DNF', () => {
    expect(partyEntry({ fin: 9000, m: 1 })).toEqual({ sortKey: [9000, 1], score: 9000 })
    expect(partyEntry({ fin: 9000 }).sortKey).toEqual([9000, 0])
    expect(partyEntry({ x: 1, fin: 3000 }).sortKey).toBeNull()
    expect(partyEntry({ g: { 0: true } }).sortKey).toBeNull()
    expect(partyEntry(undefined).sortKey).toBeNull()
  })

  it('live order: finishers by time, then most cleared, then fewest misses', () => {
    const per = 10
    const keyOf = (raw) => partyLiveKey(raw, per)
    const finisher = keyOf({ fin: 5000, g: {} })
    const ahead = keyOf({ g: { 0: true, 1: true, 2: true } })
    const behind = keyOf({ g: { 0: true } })
    const cleaner = keyOf({ g: { 0: true, 1: true, 2: true }, m: 0 })
    const sloppy = keyOf({ g: { 0: true, 1: true, 2: true }, m: 2 })
    const cmp = (a, b) => { for (let i = 0; i < 3; i += 1) { const d = (a[i] ?? 0) - (b[i] ?? 0); if (d) return d } return 0 }
    expect(cmp(finisher, ahead)).toBeLessThan(0)
    expect(cmp(ahead, behind)).toBeLessThan(0)
    expect(cmp(cleaner, sloppy)).toBeLessThan(0)
    expect(keyOf({ x: 1 })).toBeNull()
  })

  it('lives in a pair, a freeze with 3–4', () => {
    expect(partyUsesLives(2)).toBe(true)
    expect(partyUsesLives(3)).toBe(false)
    expect(partyUsesLives(4)).toBe(false)
    expect(partyLivesLeft(0)).toBe(3)
    expect(partyLivesLeft(2)).toBe(1)
    expect(partyLivesLeft(7)).toBe(0)
  })

  it('formats finish times', () => {
    expect(formatPartyTime(0)).toBe('—')
    expect(formatPartyTime(24_300)).toBe('24.3s')
    expect(formatPartyTime(67_300)).toBe('1:07.3')
  })
})

describe('config', () => {
  it('defaults and coerces', () => {
    expect(normalizePartyConfig(undefined)).toEqual(DEFAULT_PARTY_CONFIG)
    expect(normalizePartyConfig({ tier: 'hard', rounds: 7, sabotage: true })).toEqual({ version: 1, tier: 'hard', rounds: 7, sabotage: true })
    expect(normalizePartyConfig({ tier: 'mixed', rounds: 4, sabotage: 'yes' })).toEqual(DEFAULT_PARTY_CONFIG)
    expect(PARTY_ROUND_CHOICES).toEqual([3, 5, 7])
  })

  it('describes the room settings', () => {
    expect(describePartyConfig(normalizePartyConfig({ tier: 'easy', rounds: 5 }))).toBe('EASY · 5-ROUND CUP')
    expect(describePartyConfig(normalizePartyConfig({ sabotage: true }))).toContain('SABOTAGE')
  })
})

describe('generator guard', () => {
  it('party zones do not draw extra random numbers for plain boards (seed stability)', () => {
    // A zone is generateArrowsLevel(seed, spec): same seed, same spec, same board.
    const spec = { cols: 6, rows: 5, maxLen: 4, fill: 0.88 }
    expect(generateArrowsLevel(4, spec).arrows).toEqual(generateArrowsLevel(4, spec).arrows)
  })
})

describe('sabotage: drop records', () => {
  it('round-trips a drop and refuses malformed ones', () => {
    const v = dropValue(4, 'r1abc', 'bob')
    expect(v).toBe('4|r1abc|bob')
    expect(parseDrop(v)).toEqual({ at: 4, roundId: 'r1abc', from: 'bob' })
    for (const bad of [null, 5, '', 'x|r1|bob', '4|r1', '4||bob', '4|r1|', '-1|r1|bob', '1234|r1|bob']) expect(parseDrop(bad)).toBeNull()
  })

  it('keeps this round\'s drops by racers, in the order written, and drops the rest', () => {
    const racers = ['alice', 'bob', 'carol']
    const raw = {
      alice: { 1: '6|r1|carol', 0: '3|r1|bob', 2: '9|r1|alice', 7: '1|r1|bob' },
      bob: { 0: '2|r0|carol' }, // an earlier round
      mallory: { 0: '1|r1|bob' }, // not a racer
      carol: { 0: 'junk', 1: '5|r1|mallory' },
    }
    expect(normalizeDrops(raw, { roundId: 'r1', racers })).toEqual({
      alice: [{ n: 0, at: 3, from: 'bob' }, { n: 1, at: 6, from: 'carol' }],
    })
    expect(normalizeDrops(undefined, { roundId: 'r1', racers })).toEqual({})
    expect(PARTY_MAX_DROPS).toBe(3)
  })
})

describe('sabotage: who gets the crate', () => {
  const standings = (rows) => rows.map(([uid, cleared, done = false]) => ({ uid, cleared, done }))

  it('goes to the leader, and only when the sender is behind them', () => {
    const st = standings([['a', 4], ['b', 9], ['c', 6]])
    expect(dropTarget({ standings: st, from: 'a' })).toBe('b')
    expect(dropTarget({ standings: st, from: 'c' })).toBe('b')
    expect(dropTarget({ standings: st, from: 'b' })).toBeNull()
  })

  it('ties never qualify, finished racers are never hit, a spent slot list is skipped', () => {
    expect(dropTarget({ standings: standings([['a', 5], ['b', 5]]), from: 'a' })).toBeNull()
    expect(dropTarget({ standings: standings([['a', 2], ['b', 9, true], ['c', 6]]), from: 'a' })).toBe('c')
    expect(dropTarget({ standings: standings([['a', 2, true], ['c', 6]]), from: 'a' })).toBeNull()
    expect(dropTarget({ standings: standings([['a', 2], ['b', 9], ['c', 6]]), from: 'a', used: { b: PARTY_MAX_DROPS } })).toBe('c')
    expect(dropTarget({ standings: standings([['a', 2]]), from: 'zed' })).toBeNull()
  })
})

describe('sabotage: placing a crate', () => {
  const want = (seed, tier = 'hard', n = 3) => partyLevel(seed, n, tier)

  it('is deterministic and lands on a free cell on some route, counting at + 2 clears', () => {
    let placed = 0
    for (const seed of SEEDS) {
      const base = want(seed)
      const a = placeCrate({ base, seed, seat: 1, n: 0, at: 1 })
      expect(placeCrate({ base, seed, seat: 1, n: 0, at: 1 })).toEqual(a)
      if (!a) continue
      placed += 1
      expect(a.k).toBe(1 + SABOTAGE_CLEARS)
      expect(a.x).toBeGreaterThanOrEqual(0)
      expect(a.x).toBeLessThan(base.cols)
      expect(a.y).toBeLessThan(base.rows)
      const covered = base.arrows.some((ar) => ar.cells.some(([x, y]) => x === a.x && y === a.y))
      expect(covered).toBe(false)
    }
    expect(placed).toBeGreaterThan(SEEDS.length / 2)
  })

  it('differs by seat and drop number', () => {
    const seed = SEEDS[3]
    const base = want(seed, 'hard', 2)
    const picks = new Set()
    for (let seat = 0; seat < 3; seat += 1) for (let n = 0; n < 3; n += 1) {
      const c = placeCrate({ base, seed, seat, n, at: 0 })
      if (c) picks.add(`${c.x},${c.y}`)
    }
    expect(picks.size).toBeGreaterThan(1)
  })

  it('never traps a racer: any order of play clears the whole board, with every crate in place', () => {
    for (const n of [2, 3, 4]) {
      for (const tier of ['medium', 'hard']) {
        for (const seed of SEEDS.slice(0, 12)) {
          const base = want(seed, tier, n)
          const per = base.arrows.length
          const crates = partyCrates({
            base, seed, seat: 0,
            drops: [{ n: 0, at: 0 }, { n: 1, at: 2 }, { n: 2, at: 4 }],
          })
          const level = { ...base, crates }
          expect(solveArrows(level).solvable).toBe(true)
          const rng = seededRng(seed + n)
          for (let run = 0; run < 25; run += 1) {
            let gone = Array(per).fill(false)
            // Play any free arrow, in a random order, until none is free.
            for (;;) {
              const free = freeArrows(level, gone)
              if (!free.length) break
              gone = gone.slice()
              gone[free[Math.floor(rng() * free.length)]] = true
            }
            expect(countGone(gone)).toBe(per)
          }
        }
      }
    }
  })

  it('a crate placed late (the victim nearly done) has nothing safe to block and is skipped', () => {
    const seed = SEEDS[0]
    const base = want(seed, 'medium', 3)
    const per = base.arrows.length
    expect(placeCrate({ base, seed, seat: 0, n: 0, at: per })).toBeNull()
    expect(partyCrates({ base, seed, seat: 0, drops: [{ n: 0, at: per }] })).toEqual([])
  })

  it('later drops avoid earlier crates', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const base = want(seed)
      const crates = partyCrates({ base, seed, seat: 2, drops: [{ n: 0, at: 0 }, { n: 1, at: 0 }, { n: 2, at: 0 }] })
      const cells = crates.map((c) => `${c.x},${c.y}`)
      expect(new Set(cells).size).toBe(cells.length)
    }
  })
})

describe('sabotage: crates on the shared picture', () => {
  it('each viewer sees the crate in the victim\'s zone, blocking exactly what it blocks on the base board', () => {
    for (const n of [2, 3, 4]) {
      for (const seed of SEEDS.slice(0, 8)) {
        const base = partyLevel(seed, n, 'hard')
        const per = base.arrows.length
        const victim = n - 1
        const crates = partyCrates({ base, seed, seat: victim, drops: [{ n: 0, at: 0 }, { n: 1, at: 1 }] })
        if (!crates.length) continue
        for (let viewer = 0; viewer < n; viewer += 1) {
          const pic = withPartyCrates(buildPartyPicture({ base, n, viewer }), { [victim]: crates })
          expect(pic.level.crates).toHaveLength(crates.length)
          const z = pic.zones[victim]
          pic.level.crates.forEach((c) => {
            expect(c.x).toBeGreaterThanOrEqual(z.x)
            expect(c.x).toBeLessThan(z.x + z.w)
            expect(c.y).toBeGreaterThanOrEqual(z.y)
            expect(c.y).toBeLessThan(z.y + z.h)
            expect(c.from).toBe(z.first)
            expect(c.to).toBe(z.first + per)
          })
          // Same free arrows as the victim's base board at a few points of the same solve.
          const baseLevel = { ...base, crates }
          const order = solveArrows(base).order
          for (const cut of [0, 3, 7]) {
            const baseGone = Array(per).fill(false)
            order.slice(0, cut).forEach((i) => { baseGone[i] = true })
            const gone = Array(per * n).fill(false)
            for (let seat = 0; seat < n; seat += 1) baseGone.forEach((g, i) => { gone[seat * per + i] = g })
            for (let i = 0; i < per; i += 1) {
              if (baseGone[i]) continue
              expect(exitCheck(pic.level, gone, z.first + i).free).toBe(exitCheck(baseLevel, baseGone, i).free)
            }
          }
        }
      }
    }
  })

  it('a rival\'s clears never open your crate', () => {
    const seed = SEEDS[1]
    const base = partyLevel(seed, 2, 'hard')
    const per = base.arrows.length
    const crates = partyCrates({ base, seed, seat: 1, drops: [{ n: 0, at: 0 }] })
    const pic = withPartyCrates(buildPartyPicture({ base, n: 2, viewer: 0 }), { 1: crates })
    if (!crates.length) return
    const gone = Array(per * 2).fill(false)
    for (let i = 0; i < per; i += 1) gone[i] = true // seat 0 cleared everything
    const blocked = pic.level.arrows.slice(per).map((_, i) => i).filter((i) => {
      const r = exitCheck(pic.level, gone, per + i)
      return r.crate != null
    })
    // Seat 1 has cleared nothing: any arrow whose route crosses the crate is still held.
    const held = base.arrows.map((_, i) => i).filter((i) => exitCheck({ ...base, crates }, Array(per).fill(false), i).crate != null)
    expect(blocked).toEqual(held)
  })

  it('withPartyCrates with none removes the crates and shares the arrows', () => {
    const base = partyLevel(2, 3, 'medium')
    const pic = buildPartyPicture({ base, n: 3, viewer: 1 })
    const crates = partyCrates({ base, seed: 2, seat: 0, drops: [{ n: 0, at: 0 }] })
    const withIt = withPartyCrates(pic, { 0: crates })
    expect(withIt.level.arrows).toBe(pic.level.arrows)
    expect(withIt.level.mask).toBe(pic.level.mask)
    expect(withPartyCrates(withIt, {}).level.crates).toBeUndefined()
  })
})
