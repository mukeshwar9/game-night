import { describe, it, expect } from 'vitest'
import {
  W, H, ROAD_L, ROAD_R, LANES, HEARTS, HORN_COOLDOWN, HORN_RADIUS, SQUEEZE_AT, SQUEEZE_MAX, GHOST_DELAY, INVULN,
  MATCH_TARGETS, KINDS, createState, step, squeezeAt, getRoundResult, getWinner, addRound, matchWinner,
  encodeSnapshot, decodeSnapshot, advanceView, computeAI,
} from './fenderLogic'

const DT = 1 / 120
const IDLE = { x: 0, y: 0 }

// Run `secs` of sim with the same inputs every step; stops when the round ends.
function run(state, inputs, secs, onStep) {
  let s = state
  const events = []
  for (let k = 0; k < Math.round(secs / DT) && !s.over; k++) {
    const inp = typeof inputs === 'function' ? inputs(s) : inputs
    const res = step(s, inp, DT)
    s = res.state
    events.push(...res.events)
    onStep?.(s, res.events)
  }
  return { s, events }
}

// A quiet table: the cars where we want them, no traffic and no spawns.
function table(players = 2, set = {}) {
  const s = createState({ players, seed: 7 })
  s.spawn = 1e9
  for (const [i, patch] of Object.entries(set)) Object.assign(s.cars[i], patch)
  return s
}

describe('createState', () => {
  it('seats two to four cars inside the road, evenly, with full hearts', () => {
    for (const n of [2, 3, 4]) {
      const s = createState({ players: n })
      expect(s.cars).toHaveLength(n)
      expect(s.ghosts).toHaveLength(n)
      const xs = s.cars.map((c) => c.x)
      expect([...xs].sort((a, b) => a - b)).toEqual(xs)
      expect(Math.min(...xs)).toBeGreaterThan(ROAD_L + 20)
      expect(Math.max(...xs)).toBeLessThan(ROAD_R - 20)
      expect(s.cars.every((c) => c.hp === HEARTS && c.alive)).toBe(true)
    }
  })
  it('clamps the player count to 2..4', () => {
    expect(createState({ players: 1 }).n).toBe(2)
    expect(createState({ players: 9 }).n).toBe(4)
  })
  it('match targets are 3 / 5 / 7', () => {
    expect(MATCH_TARGETS).toEqual({ 2: 3, 3: 5, 4: 7 })
  })
})

describe('step', () => {
  it('never mutates the state it is given and is deterministic for a seed', () => {
    const a = createState({ players: 3, seed: 42 })
    const snapshot = JSON.stringify(a)
    const r1 = run(a, IDLE, 5)
    expect(JSON.stringify(a)).toBe(snapshot)
    const r2 = run(createState({ players: 3, seed: 42 }), IDLE, 5)
    expect(JSON.stringify(r1.s)).toBe(JSON.stringify(r2.s))
  })

  it('does nothing once the round is over', () => {
    const s = { ...table(), over: true }
    const res = step(s, IDLE, DT)
    expect(res.state).toBe(s)
    expect(res.events).toEqual([])
  })

  it('a car moves where its stick points, and is bounded to the screen vertically', () => {
    const s = table(2)
    const { s: after } = run(s, [{ x: 1, y: 0 }, IDLE], 0.3)
    expect(after.cars[0].x).toBeGreaterThan(s.cars[0].x + 10)
    const { s: up } = run(table(2), [{ x: 0, y: -1 }, IDLE], 3)
    expect(up.cars[0].y).toBeGreaterThanOrEqual(22)
    const { s: down } = run(table(2), [{ x: 0, y: 1 }, IDLE], 3)
    expect(down.cars[0].y).toBeLessThanOrEqual(H - 22)
  })

  it('ignores junk input from the network', () => {
    const s = table(2)
    const { s: after } = run(s, [{ x: NaN, y: 'up', horn: undefined }, null], 0.2)
    expect(Number.isFinite(after.cars[0].x)).toBe(true)
    const { s: big } = run(table(2), [{ x: 1e9, y: 0 }, IDLE], 0.1)
    expect(Number.isFinite(big.cars[0].vx)).toBe(true)
    expect(Math.hypot(big.cars[0].vx, big.cars[0].vy)).toBeLessThan(500)
  })
})

describe('road edge and the squeeze', () => {
  it('crossing the edge is out at once, whatever the hearts', () => {
    const s = table(2, { 0: { x: ROAD_L + 1 } })
    const { s: after, events } = run(s, IDLE, 0.05)
    expect(after.cars[0].alive).toBe(false)
    expect(after.cars[0].why).toBe('fell')
    expect(after.cars[0].hp).toBe(HEARTS)
    expect(events.some((e) => e.k === 'fell' && e.i === 0)).toBe(true)
    expect(after.over).toBe(true)
    expect(getWinner(after)).toBe('O')
  })

  it('the road closes in from both sides after SQUEEZE_AT and stops at SQUEEZE_MAX', () => {
    expect(squeezeAt(SQUEEZE_AT)).toBe(0)
    expect(squeezeAt(SQUEEZE_AT + 5)).toBeGreaterThan(0)
    expect(squeezeAt(1000)).toBe(SQUEEZE_MAX)
    const s = table(2)
    s.t = SQUEEZE_AT + 10
    const { state } = step(s, IDLE, DT)
    expect(state.roadL).toBeGreaterThan(ROAD_L + 30)
    expect(state.roadR).toBeLessThan(ROAD_R - 30)
    expect(state.roadL - ROAD_L).toBeCloseTo(ROAD_R - state.roadR, 5)
  })

  it('a squeezed edge wrecks a car that stays put near it', () => {
    const s = table(2, { 0: { x: ROAD_L + 40 } })
    s.t = SQUEEZE_AT
    const { s: after } = run(s, IDLE, 14)
    expect(after.cars[0].alive).toBe(false)
  })
})

describe('traffic', () => {
  const hit = (s) => {
    // A van sitting right on car 0.
    s.traffic.push({ kind: 'van', lane: 1, x: s.cars[0].x, y: s.cars[0].y, w: KINDS.van.w, h: KINDS.van.h, v: 0, tint: 0 })
    return s
  }

  it('a hit costs one heart and gives about a second of safety', () => {
    const s = hit(table(2))
    const { s: after, events } = run(s, IDLE, 0.05)
    expect(after.cars[0].hp).toBe(HEARTS - 1)
    expect(after.cars[0].inv).toBeGreaterThan(0)
    expect(events.filter((e) => e.k === 'crash')).toHaveLength(1)
  })

  it('does not cost another heart while the safety flash lasts', () => {
    const s = hit(table(2))
    const { s: after } = run(s, IDLE, INVULN - 0.1)
    expect(after.cars[0].hp).toBe(HEARTS - 1)
  })

  it('with no hearts left the car is wrecked and the other car wins', () => {
    const s = hit(table(2, { 0: { hp: 1 } }))
    const { s: after, events } = run(s, IDLE, 0.05)
    expect(after.cars[0].alive).toBe(false)
    expect(after.cars[0].why).toBe('wreck')
    expect(events.some((e) => e.k === 'wreck' && e.i === 0)).toBe(true)
    expect(getRoundResult(after).winner).toBe(1)
  })

  it('always leaves a lane open', () => {
    let s = createState({ players: 4, seed: 99 })
    // Keep every car alive and out of the way so only the spawner is under test.
    for (const c of s.cars) { c.hp = 99; c.inv = 1e9 }
    for (let k = 0; k < 120 * 40; k++) {
      s = step(s, IDLE, DT).state
      for (const c of s.cars) { c.x = 180; c.y = 380; c.vx = 0; c.vy = 0; c.alive = true }
      const busy = new Set(s.traffic.filter((t) => t.y - t.h / 2 < 150).map((t) => t.lane))
      expect(busy.size).toBeLessThan(LANES)
    }
    expect(s.traffic.length).toBeGreaterThan(0)
  })

  it('an idle car does not last: traffic or the squeeze gets it inside 45 s', () => {
    let wrecked = 0
    for (let seed = 1; seed <= 12; seed++) {
      const s = createState({ players: 2, seed })
      const { s: after } = run(s, (st) => [IDLE, computeAI(st, 1, 2)], 45, (st) => { st.cars[1].hp = 99; st.cars[1].inv = Math.max(st.cars[1].inv, 1) })
      if (!after.cars[0].alive) wrecked += 1
    }
    expect(wrecked).toBe(12)   // an absent seat cannot stall a round
  })
})

describe('bumps', () => {
  it('the car driving in harder wins: the other is knocked away, skids and braces', () => {
    const s = table(2, { 0: { x: 150, y: 300, vx: 260 }, 1: { x: 172, y: 300 } })
    const { state, events } = step(s, IDLE, DT)
    const [a, b] = state.cars
    expect(events.some((e) => e.k === 'hit' && e.i === 1)).toBe(true)
    expect(b.vx).toBeGreaterThan(a.vx)
    expect(b.stun).toBeGreaterThan(0.14)
    expect(b.brace).toBeGreaterThan(b.stun)
    expect(a.stun).toBe(0)
    expect(a.hp).toBe(HEARTS)
    expect(b.hp).toBe(HEARTS)
  })

  it('a ram carries the victim about a lane while they steer the other way', () => {
    const s = table(2, { 0: { x: 130, y: 300, vx: 250 }, 1: { x: 164, y: 300 } })
    const x0 = s.cars[1].x
    const { s: after } = run(s, [{ x: 1, y: 0 }, { x: -1, y: 0 }], 0.6)
    expect(after.cars[1].x - x0).toBeGreaterThan(40)
  })

  it('a brace stops a second knock from chain-stunning', () => {
    const s = table(2, { 0: { x: 150, y: 300, vx: 260 }, 1: { x: 172, y: 300, brace: 0.6, stun: 0 } })
    const { state } = step(s, IDLE, DT)
    expect(state.cars[1].stun).toBe(0)
  })

  it('a gentle touch costs nothing, stuns nobody and is only a bump', () => {
    const s = table(2, { 0: { x: 150, y: 300, vx: 40 }, 1: { x: 172, y: 300 } })
    const { state, events } = step(s, IDLE, DT)
    expect(state.cars.every((c) => c.stun === 0 && c.hp === HEARTS)).toBe(true)
    expect(events.filter((e) => e.k === 'hit')).toEqual([])
    expect(events.some((e) => e.k === 'bump')).toBe(true)
  })
})

describe('horn', () => {
  const near = (dist) => table(2, { 0: { x: 150, y: 300, cd: 0 }, 1: { x: 150 + dist, y: 300 } })

  it('blasts a car in range outward and knocks it', () => {
    const { state, events } = step(near(60), [{ x: 0, y: 0, horn: true }, IDLE], DT)
    expect(events.some((e) => e.k === 'horn' && e.i === 0)).toBe(true)
    expect(state.cars[1].vx).toBeGreaterThan(100)
    expect(state.cars[1].stun).toBeGreaterThan(0)
    expect(state.cars[0].cd).toBeGreaterThan(HORN_COOLDOWN - 0.1)
  })

  it('leaves a car out of range alone', () => {
    const { state } = step(near(HORN_RADIUS + 20), [{ x: 0, y: 0, horn: true }, IDLE], DT)
    expect(state.cars[1].vx).toBe(0)
  })

  it('waits for the recharge', () => {
    const s = near(60)
    s.cars[0].cd = 2
    const { events } = step(s, [{ x: 0, y: 0, horn: true }, IDLE], DT)
    expect(events.some((e) => e.k === 'horn')).toBe(false)
  })

  it('starts a round part-way recharged, so nobody honks in the first second', () => {
    const s = createState({ players: 2 })
    expect(s.cars[0].cd).toBeGreaterThan(0)
  })

  it('a counted press fires once however often it is resent', () => {
    let s = near(60)
    const press = [{ x: 0, y: 0, hq: 1 }, IDLE]
    const first = step(s, press, DT)
    expect(first.events.filter((e) => e.k === 'horn')).toHaveLength(1)
    s = first.state
    s.cars[0].cd = 0               // recharged, but the same counter value arrives again
    const again = step(s, press, DT)
    expect(again.events.some((e) => e.k === 'horn')).toBe(false)
    const second = step(again.state, [{ x: 0, y: 0, hq: 2 }, IDLE], DT)
    expect(second.events.some((e) => e.k === 'horn')).toBe(true)
  })

  it('does nothing when the twist is off', () => {
    const s = near(60)
    s.opts.horn = false
    const { events } = step(s, [{ x: 0, y: 0, horn: true }, IDLE], DT)
    expect(events.some((e) => e.k === 'horn')).toBe(false)
  })
})

describe('ghost truck', () => {
  function threeOneOut() {
    const s = table(3, { 0: { x: ROAD_L + 1 } })
    return run(s, IDLE, 0.05).s
  }

  it('does not appear before the pause, then drives down the road', () => {
    const s = threeOneOut()
    expect(s.over).toBe(false)
    expect(s.ghosts[0]).toBeNull()
    const { s: later } = run(s, IDLE, GHOST_DELAY + 0.5, (st) => { for (const c of st.cars) c.hp = 99 })
    expect(later.ghosts[0]).not.toBeNull()
    expect(later.ghosts[0].y).toBeGreaterThan(-70)
  })

  it('steers sideways with the owner’s stick', () => {
    const s = threeOneOut()
    const keep = (st) => { for (const c of st.cars) { c.hp = 99; c.inv = 1e9 } }
    const { s: a } = run(s, [{ x: 0, y: 0 }, IDLE, IDLE], GHOST_DELAY + 0.1, keep)
    const { s: b } = run(a, [{ x: 1, y: 0 }, IDLE, IDLE], 0.3, keep)
    expect(b.ghosts[0].x).toBeGreaterThan(a.ghosts[0].x + 20)
  })

  it('costs a car a heart when it runs it over', () => {
    const s = threeOneOut()
    s.t += GHOST_DELAY
    s.ghosts[0] = { x: s.cars[1].x, y: s.cars[1].y, w: 32, h: 60, v: 0, owner: 0 }
    const { state } = step(s, IDLE, DT)
    expect(state.cars[1].hp).toBe(HEARTS - 1)
  })

  it('stays off when the twist is off', () => {
    const s = threeOneOut()
    s.opts.ghost = false
    const { s: later } = run(s, IDLE, GHOST_DELAY + 1, (st) => { for (const c of st.cars) { c.hp = 99; c.inv = 1e9 } })
    expect(later.ghosts[0]).toBeNull()
  })
})

describe('scoring', () => {
  const kill = (s, ...idx) => {
    for (const i of idx) s.cars[i].x = ROAD_L + 1
    return step(s, IDLE, DT).state
  }

  it('every car still rolling gains a point per rival that goes out', () => {
    let s = table(4)
    s.opts.ghost = false
    s = kill(s, 0)
    expect(s.cars.map((c) => c.gained)).toEqual([0, 1, 1, 1])
    s = kill(s, 1)
    expect(s.cars.map((c) => c.gained)).toEqual([0, 1, 2, 2])
    s = kill(s, 2)
    expect(s.over).toBe(true)
    expect(getRoundResult(s)).toEqual({ winner: 3, gained: [0, 1, 2, 3] })
  })

  it('cars that go out in the same step score nothing off each other', () => {
    let s = table(4)
    s = kill(s, 0, 1)
    expect(s.cars.map((c) => c.gained)).toEqual([0, 0, 2, 2])
    s = kill(s, 2)
    expect(getRoundResult(s).gained).toEqual([0, 0, 2, 3])
  })

  it('the last two out in the same step is a draw and gives nobody a point', () => {
    let s = table(2)
    s = kill(s, 0, 1)
    expect(s.over).toBe(true)
    expect(getRoundResult(s)).toEqual({ winner: 'draw', gained: [0, 0] })
    expect(getWinner(s)).toBe('draw')
  })

  it('two cars: the survivor gets the one point', () => {
    const s = kill(table(2), 1)
    expect(getRoundResult(s)).toEqual({ winner: 0, gained: [1, 0] })
    expect(getWinner(s)).toBe('X')
  })

  it('has no result while the round is on', () => {
    expect(getRoundResult(table(3))).toBeNull()
    expect(getWinner(table(3))).toBeNull()
  })

  it('match totals add up and need the target and a clear lead', () => {
    expect(addRound([1, 0, 2], { gained: [0, 2, 1] })).toEqual([1, 2, 3])
    expect(matchWinner([2, 1])).toBeNull()
    expect(matchWinner([3, 1])).toBe(0)
    expect(matchWinner([4, 5, 1])).toBe(1)
    expect(matchWinner([5, 5, 2])).toBeNull()       // level at the target: play on
    expect(matchWinner([6, 7, 7, 1])).toBeNull()
    expect(matchWinner([7, 6, 4, 0])).toBe(0)
  })
})

describe('snapshot codec', () => {
  it('round-trips what the guest draws', () => {
    const { s } = run(createState({ players: 3, seed: 5 }), IDLE, 6, (st) => { st.cars[2].x = ROAD_L + 1 })
    const snap = JSON.parse(JSON.stringify(encodeSnapshot(s)))
    expect(snap.t).toBe('s')
    const v = decodeSnapshot(snap, 3)
    expect(v.cars).toHaveLength(3)
    v.cars.forEach((c, i) => {
      expect(c.x).toBeCloseTo(s.cars[i].x, 0)
      expect(c.y).toBeCloseTo(s.cars[i].y, 0)
      expect(c.hp).toBe(s.cars[i].hp)
      expect(c.alive).toBe(s.cars[i].alive)
      expect(c.why).toBe(s.cars[i].why)
    })
    expect(v.traffic).toHaveLength(s.traffic.length)
    v.traffic.forEach((t, i) => {
      expect(t.kind).toBe(s.traffic[i].kind)
      expect(t.w).toBe(KINDS[t.kind].w)
      expect(t.y).toBeCloseTo(s.traffic[i].y, 0)
    })
    expect(v.roadL).toBeCloseTo(s.roadL, 0)
  })

  it('carries a ghost truck to its owner’s slot', () => {
    const s = createState({ players: 3 })
    s.ghosts[1] = { x: 120, y: 40, w: 32, h: 60, v: 160, owner: 1 }
    const v = decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(s))), 3)
    expect(v.ghosts[0]).toBeNull()
    expect(v.ghosts[1]).toMatchObject({ x: 120, y: 40 })
  })

  it('is small enough to send 30 times a second', () => {
    const { s } = run(createState({ players: 2, seed: 3 }), IDLE, 8, (st) => { for (const c of st.cars) { c.hp = 99; c.inv = 1e9 } })
    expect(JSON.stringify(encodeSnapshot(s)).length).toBeLessThan(900)
  })

  it('survives a short or empty snapshot without throwing', () => {
    const v = decodeSnapshot({ t: 's' }, 2)
    expect(v.cars).toHaveLength(2)
    expect(v.traffic).toEqual([])
    expect(W).toBe(360)
  })

  it('dead-reckons forward by at most a tenth of a second', () => {
    const v = decodeSnapshot(encodeSnapshot(table(2, { 0: { vx: 100, vy: 0 } })), 2)
    const a = advanceView(v, 0.05)
    expect(a.cars[0].x).toBeCloseTo(v.cars[0].x + 5, 1)
    const far = advanceView(v, 5)
    expect(far.cars[0].x).toBeCloseTo(v.cars[0].x + 10, 1)
    expect(advanceView(v, 0)).toBe(v)
  })
})

describe('computeAI', () => {
  it('returns a steer inside [-1, 1] for every level', () => {
    const { s } = run(createState({ players: 4, seed: 2 }), IDLE, 3, (st) => { for (const c of st.cars) { c.hp = 99; c.inv = 1e9 } })
    for (const level of [0, 1, 2]) {
      for (let i = 0; i < 4; i++) {
        const o = computeAI(s, i, level)
        expect(Math.abs(o.x)).toBeLessThanOrEqual(1)
        expect(Math.abs(o.y)).toBeLessThanOrEqual(1)
        expect(typeof o.horn).toBe('boolean')
      }
    }
  })

  it('steers a car that is out as its ghost truck toward a survivor', () => {
    const s = table(3, { 0: { alive: false, outAt: 0 }, 1: { x: 240, y: 200 }, 2: { x: 250, y: 380 } })
    s.ghosts[0] = { x: 100, y: 190, w: 32, h: 60, v: 160, owner: 0 }
    expect(computeAI(s, 0, 2).x).toBeGreaterThan(0.5)
  })

  it('bots finish a match-length round inside the squeeze, at every size and level', () => {
    for (const players of [2, 3, 4]) {
      for (const level of [0, 1, 2]) {
        for (let seed = 1; seed <= 3; seed++) {
          const { s } = run(createState({ players, seed }), (st) => st.cars.map((_, i) => computeAI(st, i, level)), 90)
          expect(s.over, `${players}p level ${level} seed ${seed}`).toBe(true)
          expect(s.t).toBeLessThan(75)
        }
      }
    }
  })

  it('a normal bot beats an idle car nearly every time', () => {
    let wins = 0
    for (let seed = 1; seed <= 10; seed++) {
      const { s } = run(createState({ players: 2, seed }), (st) => [IDLE, computeAI(st, 1, 1)], 60)
      if (getRoundResult(s)?.winner === 1) wins += 1
    }
    expect(wins).toBeGreaterThanOrEqual(8)
  })
})
