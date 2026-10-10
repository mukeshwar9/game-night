import { describe, expect, it } from 'vitest'
import { COINS_PER_HEART, HEARTS, INVULN, MAX_HEARTS, RADIUS, ROUNDS_TO_WIN, SUDDEN_FROM } from './bamboozleLogic'
import {
  BOT_LEVELS, COUNT_IN, GRAB_BREAK, GRAB_MAX, GRAB_RECHARGE, PAD_FOLLOW, SEAT_KEYS, alive, coverTiles, createSim, fastForward,
  followPad, inPole, keyVector, liveCoin, padVector, pathTo, stepSim, tallyRound,
} from './bamboozleSim'

const DT = 1 / 60

/** Run until `until(sim)` or `limit` seconds of round time, collecting events. */
function run(sim, until, { inputs = [], limit = 200 } = {}) {
  const events = []
  let steps = 0
  while (sim.t < limit && !until(sim)) {
    const next = typeof inputs === 'function' ? inputs(sim) : inputs
    events.push(...stepSim(sim, next, DT))
    if (++steps > 200000) throw new Error('runaway')
  }
  return events
}

const goLive = (sim) => run(sim, (s) => s.t >= 0)

describe('createSim', () => {
  it('seats dodgers on free, different tiles', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const sim = createSim({ seed, players: [{}, { bot: true }, { bot: true }, { bot: true }] })
      expect(sim.n).toBe(5)
      const cells = sim.players.map((p) => `${Math.floor(p.x)},${Math.floor(p.y)}`)
      expect(new Set(cells).size).toBe(4)
      for (const p of sim.players) {
        expect(sim.tl.initial.some((s) => s.c === Math.floor(p.x) && s.r === Math.floor(p.y))).toBe(false)
        expect(p.hp).toBe(HEARTS)
      }
    }
  })

  it('uses the small yard for one or two dodgers', () => {
    expect(createSim({ seed: 1, players: [{}, {}] }).n).toBe(4)
    expect(createSim({ seed: 1, players: [{}] }).n).toBe(4)
  })

  it('holds everybody still through the count-in', () => {
    const sim = createSim({ seed: 2, players: [{}, { bot: true }] })
    const home = sim.players.map((p) => [p.x, p.y])
    for (let i = 0; i < 100; i++) stepSim(sim, [{ x: 1, y: 0 }], DT)
    expect(sim.t).toBeLessThan(0)
    expect(sim.players.map((p) => [p.x, p.y])).toEqual(home)
    expect(COUNT_IN).toBeGreaterThan(3)
  })

  it('says go once, when the count-in ends', () => {
    const sim = createSim({ seed: 2, players: [{}, {}] })
    const events = run(sim, (s) => s.t > 0.5)
    expect(events.filter((e) => e.type === 'go')).toHaveLength(1)
  })
})

describe('hearts', () => {
  it('a dodger who never moves loses all three hearts and is out', () => {
    const sim = createSim({ seed: 11, players: [{}] })
    const events = run(sim, (s) => s.over)
    expect(events.filter((e) => e.type === 'hit')).toHaveLength(HEARTS)
    expect(events.filter((e) => e.type === 'out')).toHaveLength(1)
    expect(sim.players[0].out).toBe(true)
    expect(sim.over).toBe(true)
    expect(sim.winner).toBeNull()
  })

  it('cover works: standing behind a rock through the first volley costs nothing', () => {
    let proven = 0
    for (let seed = 1; seed <= 12; seed++) {
      const sim = createSim({ seed, players: [{}], coins: false })
      goLive(sim)
      const v0 = sim.tl.volley(0)
      stepSim(sim, [], DT)
      // Walk to the first tile behind a rock for volley 0 by teleporting, the same as a perfectly timed player.
      const cover = coverTiles({ ...sim, view: sim.tl.view(v0.warnAt + 0.01), n: sim.n })
      if (!cover.length) continue
      const [c, r] = cover[0]
      const p = sim.players[0]
      const events = []
      while (sim.t < v0.backEnd + 0.05) {
        p.x = c + 0.5; p.y = r + 0.5
        events.push(...stepSim(sim, [], DT))
      }
      expect(events.filter((e) => e.type === 'hit')).toHaveLength(0)
      expect(p.hp).toBe(HEARTS)
      proven++
    }
    expect(proven).toBeGreaterThan(8)
  })

  it('an open tile in the firing lane does get hit, and a hit blinks so one volley cannot hit twice', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const sim = createSim({ seed, players: [{}], coins: false })
      goLive(sim)
      const v0 = sim.tl.volley(0)
      // Find a free tile no cover protects from the fired wall.
      const view = sim.tl.view(v0.warnAt + 0.01)
      const safe = new Set(coverTiles({ ...sim, view }).map(([c, r]) => `${c},${r}`))
      let spot = null
      for (let r = 0; r < sim.n && !spot; r++) {
        for (let c = 0; c < sim.n; c++) {
          if (!sim.tl.initial.some((s) => s.c === c && s.r === r) && !safe.has(`${c},${r}`) && v0.lanes.some((l) => l.len === sim.n)) {
            spot = [c, r]
            break
          }
        }
      }
      if (!spot) continue
      const p = sim.players[0]
      const events = []
      while (sim.t < v0.backEnd) {
        p.x = spot[0] + 0.5; p.y = spot[1] + 0.5
        events.push(...stepSim(sim, [], DT))
      }
      const hits = events.filter((e) => e.type === 'hit')
      expect(hits.length).toBeLessThanOrEqual(1)
      if (hits.length) {
        expect(p.hp).toBe(HEARTS - 1)
        expect(p.inv).toBeGreaterThan(0)
        expect(INVULN).toBeGreaterThan(1)
        return
      }
    }
    throw new Error('no seed put a dodger in a lane')
  })

  it('knows which tiles a pole is on', () => {
    const sim = createSim({ seed: 4, players: [{}] })
    goLive(sim)
    const v0 = sim.tl.volley(0)
    run(sim, (s) => s.t >= v0.impactAt + 0.01)
    const lane = sim.view.lanes[0]
    const [mx, my] = lane.side === 0 ? [lane.i + 0.5, 0.1] : lane.side === 2 ? [lane.i + 0.5, sim.n - 0.1] : lane.side === 3 ? [0.1, lane.i + 0.5] : [sim.n - 0.1, lane.i + 0.5]
    expect(lane.len).toBeGreaterThan(0)
    expect(inPole(sim, mx, my)).toBe(true)
  })
})

describe('rounds', () => {
  const botsOf = (n, level) => Array.from({ length: n }, () => ({ bot: true, level }))

  it('always ends, for every bot level and player count', () => {
    for (const level of BOT_LEVELS) {
      for (const count of [2, 3, 4]) {
        for (let seed = 1; seed <= 6; seed++) {
          const sim = createSim({ seed: seed * 17 + count, players: botsOf(count), botLevel: level, coins: true, grab: true })
          run(sim, (s) => s.over, { limit: 180 })
          expect(sim.over, `${level} ${count}p seed ${seed} still going at ${sim.t.toFixed(0)}s`).toBe(true)
          // The garden never outlasts its sudden-death volley by much.
          expect(sim.view.k).toBeLessThan(SUDDEN_FROM + 12)
          if (sim.winner != null) expect(alive(sim).map((p) => p.i)).toEqual([sim.winner])
        }
      }
    }
  })

  it('the winner is the last dodger standing; a shared last hit is a draw', () => {
    const results = []
    for (let seed = 1; seed <= 24; seed++) {
      const sim = createSim({ seed, players: botsOf(2), botLevel: 'normal' })
      run(sim, (s) => s.over, { limit: 180 })
      results.push(sim.winner)
      if (sim.winner == null) expect(alive(sim)).toHaveLength(0)
      else expect(sim.players[sim.winner].out).toBe(false)
    }
    expect(results.filter((w) => w != null).length).toBeGreaterThan(12)
  })

  it('is deterministic for one seed and one set of inputs', () => {
    const play = () => {
      const sim = createSim({ seed: 99, players: [{}, { bot: true }, { bot: true }], coins: true, grab: true })
      const log = []
      run(sim, (s) => s.over, { inputs: (s) => [{ x: Math.sin(s.t * 2), y: Math.cos(s.t * 3) }], limit: 120 })
      log.push(sim.t, sim.winner, sim.players.map((p) => [p.hp, p.out, Math.round(p.x * 1e6), Math.round(p.y * 1e6)]))
      return JSON.stringify(log)
    }
    expect(play()).toBe(play())
  })

  it('the garden is the same whatever the players do', () => {
    const still = createSim({ seed: 5, players: [{}, {}] })
    const busy = createSim({ seed: 5, players: [{}, {}] })
    for (let i = 0; i < 600; i++) {
      stepSim(still, [], DT)
      stepSim(busy, [{ x: Math.sin(i / 20), y: 1 }, { x: -1, y: Math.cos(i / 30) }], DT)
      if (still.over || busy.over) break
    }
    // They fall at different times, but the schedule they fell through is identical.
    expect(busy.tl.volley(7)).toEqual(still.tl.volley(7))
  })

  it('stops the poles at a pull-back once the round is decided', () => {
    const sim = createSim({ seed: 11, players: [{}] })
    run(sim, (s) => s.over)
    const k = sim.view.k
    run(sim, () => false, { limit: sim.t + 6 })
    expect(sim.view.phase).toBe('idle')
    expect(sim.view.ext).toBe(0)
    expect(sim.view.k).toBeLessThanOrEqual(k + 1)
  })

  it('tallies a one-phone match: first to two rounds, a draw scores nobody', () => {
    let r = tallyRound([0, 0], 1, ROUNDS_TO_WIN)
    expect(r).toEqual({ wins: [0, 1], matchWinner: null, draw: false })
    r = tallyRound(r.wins, null, ROUNDS_TO_WIN)
    expect(r).toEqual({ wins: [0, 1], matchWinner: null, draw: true })
    r = tallyRound(r.wins, 1, ROUNDS_TO_WIN)
    expect(r.matchWinner).toBe(1)
  })
})

/** Step (keeping everyone alive) until a coin shows, and return it. */
function waitForCoin(sim) {
  for (let guard = 0; guard < 4000; guard++) {
    const coin = liveCoin(sim)
    if (coin) return coin
    sim.players.forEach((q) => { q.inv = 5 })
    stepSim(sim, [], DT)
  }
  throw new Error('no coin appeared')
}

describe('coins', () => {
  it('picking up three coins buys a heart, up to four', () => {
    const sim = createSim({ seed: 8, players: [{}], coins: true })
    goLive(sim)
    const p = sim.players[0]
    p.hp = 2
    for (let got = 1; got <= COINS_PER_HEART; got++) {
      // wait for a coin to show, then stand on it
      const coin = waitForCoin(sim)
      p.x = coin.x
      p.y = coin.y
      const events = stepSim(sim, [], DT)
      expect(events.some((e) => e.type === 'coin')).toBe(true)
    }
    expect(p.hp).toBe(3)
    expect(p.coins).toBe(0)
  })

  it('a heart cannot go past the cap and coins stop at a full set', () => {
    const sim = createSim({ seed: 8, players: [{}], coins: true })
    goLive(sim)
    const p = sim.players[0]
    p.hp = MAX_HEARTS
    p.coins = COINS_PER_HEART
    const coin = waitForCoin(sim)
    p.x = coin.x; p.y = coin.y
    stepSim(sim, [], DT)
    expect(p.hp).toBe(MAX_HEARTS)
    expect(p.coins).toBe(COINS_PER_HEART)
  })

  it('only the first dodger to reach a coin gets it', () => {
    const sim = createSim({ seed: 8, players: [{}, {}], coins: true })
    goLive(sim)
    const coin = waitForCoin(sim)
    sim.players[0].x = coin.x; sim.players[0].y = coin.y
    sim.players[1].x = coin.x + 0.05; sim.players[1].y = coin.y
    stepSim(sim, [], DT)
    expect(sim.players[0].coins + sim.players[1].coins).toBe(1)
    expect(liveCoin(sim)).toBeNull()
  })
})

describe('grab', () => {
  /** Two dodgers side by side in the middle of an open yard, past the count-in. */
  function pair({ grab = true } = {}) {
    const sim = createSim({ seed: 3, players: [{}, {}], grab })
    goLive(sim)
    const [a, b] = sim.players
    // find a spot with free tiles around
    const free = (c, r) => !sim.view.solid.some((s) => s.c === c && s.r === r)
    let spot = [1, 1]
    for (let r = 1; r < sim.n - 1; r++) for (let c = 0; c < sim.n - 1; c++) if (free(c, r) && free(c + 1, r)) { spot = [c, r]; break }
    a.x = spot[0] + 0.5; a.y = spot[1] + 0.5
    b.x = a.x + RADIUS * 2 + 0.05; b.y = a.y
    a.vx = a.vy = b.vx = b.vy = 0
    a.inv = b.inv = 99
    return { sim, a, b }
  }

  it('holds a rival who is close enough and carries them along', () => {
    const { sim, a, b } = pair()
    const events = stepSim(sim, [{ grab: true }, {}], DT)
    expect(events.some((e) => e.type === 'grab' && e.i === 0 && e.j === 1)).toBe(true)
    expect(a.grab).toBe(1)
    expect(b.heldBy).toBe(0)
    const x0 = b.x
    for (let i = 0; i < 20; i++) stepSim(sim, [{ grab: true, x: -1, y: 0 }, {}], DT)
    expect(b.x).toBeLessThan(x0)
  })

  it('a grab that finds nobody costs a beat, not the full recharge', () => {
    const { sim, a, b } = pair()
    b.x = a.x + 3
    stepSim(sim, [{ grab: true }, {}], DT)
    expect(a.grab).toBeNull()
    expect(a.grabCd).toBeGreaterThan(0)
    expect(a.grabCd).toBeLessThan(GRAB_RECHARGE)
  })

  it('letting go throws the rival the way the grabber faces, then recharges', () => {
    const { sim, a, b } = pair()
    stepSim(sim, [{ grab: true }, {}], DT)
    expect(a.grab).toBe(1)
    const events = stepSim(sim, [{ grab: false }, {}], DT)
    expect(events.some((e) => e.type === 'throw')).toBe(true)
    expect(a.grab).toBeNull()
    expect(a.grabCd).toBeGreaterThan(GRAB_RECHARGE - 0.1)
    expect(Math.hypot(b.kx, b.ky)).toBeGreaterThan(2)
  })

  it('the held dodger wriggles free by pushing their own pad', () => {
    const { sim, a, b } = pair()
    stepSim(sim, [{ grab: true }, {}], DT)
    let freed = false
    for (let i = 0; i < Math.ceil((GRAB_BREAK + 0.2) / DT); i++) {
      const ev = stepSim(sim, [{ grab: true }, { x: 0, y: 1 }], DT)
      if (ev.some((e) => e.type === 'free')) { freed = true; break }
    }
    expect(freed).toBe(true)
    expect(a.grab).toBeNull()
    expect(b.heldBy).toBeNull()
  })

  it('a hold times out and throws', () => {
    const { sim, a } = pair()
    stepSim(sim, [{ grab: true }, {}], DT)
    let threw = false
    for (let i = 0; i < Math.ceil((GRAB_MAX + 0.3) / DT); i++) {
      const ev = stepSim(sim, [{ grab: true }, {}], DT)
      if (ev.some((e) => e.type === 'throw')) { threw = true; break }
    }
    expect(threw).toBe(true)
    expect(a.grab).toBeNull()
  })

  it('is off unless the twist is on', () => {
    const { sim, a } = pair({ grab: false })
    stepSim(sim, [{ grab: true }, {}], DT)
    expect(a.grab).toBeNull()
  })

  it('a held dodger who is knocked out is let go', () => {
    const { sim, a, b } = pair()
    stepSim(sim, [{ grab: true }, {}], DT)
    b.hp = 0
    b.out = true
    stepSim(sim, [{ grab: true }, {}], DT)
    expect(a.grab).toBeNull()
  })
})

describe('pathTo and fastForward', () => {
  it('finds the shortest way round a rock', () => {
    const blocked = (c, r) => c === 1 && r === 0
    const path = pathTo(3, [0, 0], [[2, 0]], blocked)
    expect(path?.[0]).toEqual([0, 0])
    expect(path?.at(-1)).toEqual([2, 0])
    expect(path).toHaveLength(5)
    expect(pathTo(3, [0, 0], [[2, 0]], (c) => c === 1)).toBeNull()
  })

  it('skips ahead without replaying hits', () => {
    const sim = createSim({ seed: 6, players: [{}] })
    fastForward(sim, 20)
    expect(sim.t).toBe(20)
    expect(sim.players[0].hp).toBe(HEARTS)
    const events = stepSim(sim, [], DT)
    expect(events.filter((e) => e.type === 'go')).toHaveLength(0)
    expect(sim.view.k).toBe(sim.tl.volleyAt(20).k)
  })
})

describe('input mapping', () => {
  it('a thumb pad is a unit stick with a deadzone', () => {
    expect(padVector(0, 0)).toEqual([0, 0])
    expect(padVector(3, 2)).toEqual([0, 0]) // resting thumb
    const [x, y] = padVector(20, 0)
    expect(x).toBeCloseTo(0.5)
    expect(y).toBe(0)
    const full = padVector(120, 160)
    expect(Math.hypot(full[0], full[1])).toBeCloseTo(1)
    expect(padVector(-40, 0)[0]).toBeCloseTo(-1)
  })

  it('the pad trails a thumb that drifts past its edge', () => {
    expect(followPad(100, 100, 120, 100)).toEqual([100, 100])
    const [ox, oy] = followPad(100, 100, 200, 100)
    expect(Math.hypot(200 - ox, 100 - oy)).toBeCloseTo(PAD_FOLLOW)
    expect(oy).toBe(100)
  })

  it('arrow keys, WASD, IJKL and TFGH each steer their own seat', () => {
    expect(SEAT_KEYS).toHaveLength(4)
    const every = SEAT_KEYS.flatMap((s) => [...s.move, ...s.grab])
    expect(new Set(every).size).toBe(every.length)
    expect(keyVector(new Set(['ArrowRight']), SEAT_KEYS[0].move)).toEqual([1, 0])
    expect(keyVector(new Set(['KeyW', 'KeyA']), SEAT_KEYS[1].move)[0]).toBeCloseTo(-Math.SQRT1_2)
    expect(keyVector(new Set(['ArrowUp', 'ArrowDown']), SEAT_KEYS[0].move)).toEqual([0, 0])
    expect(keyVector(new Set(['KeyW']), SEAT_KEYS[0].move)).toEqual([0, 0])
  })
})
