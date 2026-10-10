import { describe, it, expect } from 'vitest'
import { Vec2 } from './vendor/planck-det'
import { mulberry32 } from './detMath'
import {
  DT, TARGET, KO_SECONDS, PICK_SECONDS, BOT_PICK_SECONDS, COUNT_STEP, T, LID_GAP,
  createMatch, createRound, stepRound, step, getWinner, makeBot, helmetAt, countDigit, countLength, koScale, lidSeats,
} from './bonkLogic'
import { ARENA_IDS } from './bonkArenas'

const NONE = { d: 0, hop: false }
const run = (m, seconds, inputs = { X: NONE, O: NONE }) => {
  const events = []
  for (let k = 0; k < Math.round(seconds / DT); k++) events.push(...step(m, inputs, DT).events)
  return events
}
// Skip the 3 · 2 · 1 and go straight to play.
const playing = (opt = {}) => {
  const m = createMatch({ leadCount: 0.1, ...opt })
  run(m, 0.2)
  expect(m.phase).toBe('play')
  return m
}
const place = (car, x, y, angle = 0) => {
  car.chassis.setPosition(new Vec2(x, y))
  car.chassis.setAngle(angle)
  car.chassis.setLinearVelocity(new Vec2(0, 0))
  car.chassis.setAngularVelocity(0)
  car.wheels.forEach((w, k) => {
    w.setPosition(new Vec2(x + (k ? 1 : -1) * 0.58, y - 0.3))
    w.setLinearVelocity(new Vec2(0, 0))
  })
}
// Drop the left buggy's wheels onto the right buggy's helmet: the right one is bonked.
const dropOnto = (r, from, onto) => {
  const h = helmetAt(r.cars[onto])
  place(r.cars[from], h.x, h.y + 1.3)
}
const untilPhase = (m, phase, seconds = 20, inputs) => {
  const events = []
  for (let k = 0; k < Math.round(seconds / DT) && m.phase !== phase; k++) events.push(...step(m, inputs || { X: NONE, O: NONE }, DT).events)
  return events
}

describe('a round', () => {
  it.each(ARENA_IDS.map((id) => [id]))('%s: both buggies settle on their wheels with nothing touching a helmet', (id) => {
    const r = createRound({ arena: id, hop: true })
    for (let k = 0; k < 240; k++) stepRound(r, null, DT)
    for (const c of r.cars) {
      expect(Number.isFinite(c.chassis.getPosition().x)).toBe(true)
      expect(c.headTouch).toHaveLength(0)
      expect(Math.abs(c.chassis.getAngle())).toBeLessThan(0.5)
      expect(c.alive).toBe(true)
    }
    expect(r.outcome).toBe(null)
  })

  it('starts the two buggies facing each other, seat 0 on the left', () => {
    const r = createRound({ arena: 'halfpipe' })
    expect(r.cars[0].dir).toBe(1)
    expect(r.cars[1].dir).toBe(-1)
    expect(r.cars[0].chassis.getPosition().x).toBeLessThan(0)
    const swapped = createRound({ arena: 'halfpipe', swap: true })
    expect(swapped.cars[0].dir).toBe(-1)
    expect(swapped.cars[0].chassis.getPosition().x).toBeGreaterThan(0)
  })

  it('ignores the buttons until the round is playing', () => {
    const r = createRound({ arena: 'humps' })
    const x0 = r.cars[0].chassis.getPosition().x
    for (let k = 0; k < 240; k++) stepRound(r, [{ d: 1, hop: false }, NONE], DT)
    expect(Math.abs(r.cars[0].chassis.getPosition().x - x0)).toBeLessThan(0.3)
    r.phase = 'play'
    for (let k = 0; k < 120; k++) stepRound(r, [{ d: 1, hop: false }, NONE], DT)
    expect(r.cars[0].chassis.getPosition().x - x0).toBeGreaterThan(0.5)
  })

  it('RIGHT drives a buggy facing right forward and a buggy facing left backward', () => {
    const r = createRound({ arena: 'humps' })
    r.phase = 'play'
    const x = r.cars.map((c) => c.chassis.getPosition().x)
    for (let k = 0; k < 120; k++) stepRound(r, [{ d: 1, hop: false }, { d: 1, hop: false }], DT)
    expect(r.cars[0].chassis.getPosition().x).toBeGreaterThan(x[0] + 0.5)
    expect(r.cars[1].chassis.getPosition().x).toBeGreaterThan(x[1] + 0.5)
  })

  it('hop fires only with the twist on, once per cooldown', () => {
    const on = createRound({ arena: 'humps', hop: true })
    on.phase = 'play'
    for (let k = 0; k < 120; k++) stepRound(on, null, DT)
    const vy0 = on.cars[0].chassis.getLinearVelocity().y
    stepRound(on, [{ d: 0, hop: true }, NONE], DT)
    expect(on.cars[0].chassis.getLinearVelocity().y).toBeGreaterThan(vy0 + 3)
    expect(on.cars[0].hopCd).toBeGreaterThan(T.hopCooldown - 0.05)
    expect(on.events.filter((e) => e.type === 'hop')).toHaveLength(1)
    on.events.length = 0
    stepRound(on, [{ d: 0, hop: true }, NONE], DT)
    expect(on.events.filter((e) => e.type === 'hop')).toHaveLength(0)

    const off = createRound({ arena: 'humps', hop: false })
    off.phase = 'play'
    for (let k = 0; k < 120; k++) stepRound(off, null, DT)
    stepRound(off, [{ d: 0, hop: true }, NONE], DT)
    expect(off.events.filter((e) => e.type === 'hop')).toHaveLength(0)
  })

  it('the tide holds for tideStart seconds, then rises', () => {
    const r = createRound({ arena: 'humps' })
    r.phase = 'play'
    for (let k = 0; k < Math.round((T.tideStart - 0.5) / DT); k++) stepRound(r, null, DT)
    expect(r.water).toBe(T.water0)
    for (let k = 0; k < Math.round(3 / DT); k++) stepRound(r, null, DT)
    expect(r.water).toBeGreaterThan(T.water0 + 0.5)
  })
})

describe('how a round is won', () => {
  it('touching the rival helmet wins it', () => {
    const m = playing()
    dropOnto(m.r, 1, 0)   // seat 1's buggy lands on seat 0's helmet
    const ev = run(m, 1.5)
    expect(m.outcome).toMatchObject({ winner: 1, reason: 'bonk', double: false, loser: 0 })
    expect(m.score).toEqual([0, 1])
    expect(ev.find((e) => e.type === 'bonk')).toMatchObject({ car: 0, by: 'O' })
    expect(ev.find((e) => e.type === 'point')).toMatchObject({ by: 'O', winner: 1, score: [0, 1] })
  })

  it('your own helmet touching the ground gives the point away', () => {
    const m = playing()
    const c = m.r.cars[0]
    place(c, c.chassis.getPosition().x, c.chassis.getPosition().y + 0.4, Math.PI)
    const ev = run(m, 2)
    expect(m.outcome).toMatchObject({ winner: 1, reason: 'self', loser: 0 })
    expect(ev.some((e) => e.type === 'self' && e.car === 0 && e.by === undefined)).toBe(true)
    expect(m.score).toEqual([0, 1])
  })

  it('sinking under the tide gives the point away', () => {
    const m = playing()
    place(m.r.cars[1], 0, 0.1)
    run(m, 0.2)
    expect(m.outcome).toMatchObject({ winner: 0, reason: 'sunk', loser: 1 })
    expect(m.score).toEqual([1, 0])
  })

  it('both sinking in the same instant scores nobody and replays the round', () => {
    const m = playing()
    place(m.r.cars[0], -1, 0.1)
    place(m.r.cars[1], 1, 0.1)
    run(m, 0.2)
    expect(m.outcome).toMatchObject({ winner: -1, double: true })
    expect(m.score).toEqual([0, 0])
    untilPhase(m, 'count')
    expect(m.round).toBe(2)
    expect(m.score).toEqual([0, 0])
  })

  it('a point is awarded exactly once', () => {
    const m = playing()
    dropOnto(m.r, 1, 0)
    run(m, 1.5)
    run(m, 0.3)
    expect(m.score).toEqual([0, 1])
  })
})

describe('the match', () => {
  it('counts in: a long 3 · 2 · 1 between rounds, a short lead-in for round one', () => {
    const first = createMatch()
    expect(countLength(first)).toBeCloseTo(0.5)
    expect(countDigit(first)).toBe(0)
    const m = createMatch({ leadCount: 1.5 })
    const digits = []
    for (const e of run(m, 1.6)) if (e.type === 'count') digits.push(e.digit)
    expect(digits).toEqual([2, 1])   // 3 is on screen from the first tick, so 2 and 1 are the transitions
    expect(m.phase).toBe('play')
    expect(countLength({ round: 2, leadCount: 0.5 })).toBeCloseTo(COUNT_STEP * 3)
  })

  it('ignores steering during the count', () => {
    const m = createMatch({ leadCount: 1.5 })
    const x0 = m.r.cars[0].chassis.getPosition().x
    run(m, 1, { X: { d: 1, hop: false }, O: NONE })
    expect(Math.abs(m.r.cars[0].chassis.getPosition().x - x0)).toBeLessThan(0.3)
  })

  it('ends at TARGET points with the right winner and no arena pick', () => {
    const m = playing({ score: [TARGET - 1, 0] })
    dropOnto(m.r, 0, 1)    // seat 0 bonks seat 1
    run(m, 1.5)
    expect(m.score).toEqual([TARGET, 0])
    expect(getWinner(m)).toBe(null)    // the knockout still plays out
    untilPhase(m, 'over', KO_SECONDS + 1)
    expect(m.phase).toBe('over')
    expect(getWinner(m)).toBe('X')
    const before = JSON.stringify(m.score)
    run(m, 1)
    expect(JSON.stringify(m.score)).toBe(before)
  })

  it('an O win reads as O', () => {
    const m = playing({ score: [0, TARGET - 1] })
    dropOnto(m.r, 1, 0)
    run(m, 1.5)
    untilPhase(m, 'over', KO_SECONDS + 1)
    expect(getWinner(m)).toBe('O')
  })

  it('alternates which end each seat starts at every round', () => {
    const m = playing({ twists: { pick: false } })
    const side = (mm) => Math.sign(mm.r.cars[0].chassis.getPosition().x)
    expect(side(m)).toBe(-1)
    dropOnto(m.r, 1, 0)
    run(m, 1.5)
    untilPhase(m, 'count', KO_SECONDS + 1)
    expect(m.round).toBe(2)
    expect(side(m)).toBe(1)
  })

  it('never repeats the arena just played', () => {
    const m = playing({ seed: 7, twists: { pick: false } })
    let last = m.r.arena.id
    for (let n = 0; n < TARGET - 1; n++) {
      place(m.r.cars[1], 0, 0.1)
      run(m, 0.2)
      untilPhase(m, 'count', KO_SECONDS + 1)
      expect(m.r.arena.id).not.toBe(last)
      last = m.r.arena.id
      untilPhase(m, 'play', 3)
    }
  })

  it('same seed and same inputs reach the same positions', () => {
    const go = () => {
      const m = createMatch({ seed: 99, leadCount: 0.1, arena: 'kicker' })
      const rng = mulberry32(5)
      const bots = [makeBot('normal', rng), makeBot('hard', rng)]
      for (let k = 0; k < 600; k++) step(m, { X: bots[0](m.r, 0, DT), O: bots[1](m.r, 1, DT) }, DT)
      return m.r.cars.map((c) => [c.chassis.getPosition().x, c.chassis.getPosition().y, c.chassis.getAngle()])
    }
    expect(go()).toEqual(go())
  })
})

describe('twist: spare lid', () => {
  it('goes to a player trailing by LID_GAP or more, and only then', () => {
    const behind = createMatch({ score: [LID_GAP, 0] })
    expect(lidSeats(behind)).toEqual([false, true])
    const close = createMatch({ score: [LID_GAP - 1, 0] })
    expect(lidSeats(close)).toEqual([false, false])
    const off = createMatch({ score: [4, 0], twists: { lid: false } })
    expect(lidSeats(off)).toEqual([false, false])
  })

  it('soaks one hit, gives the attacker a shove and the round goes on', () => {
    const m = playing({ score: [3, 0], twists: { pick: false } })
    expect(m.r.cars[1].shield).toBe(1)
    dropOnto(m.r, 0, 1)
    const ev = run(m, 0.6)
    expect(ev.some((e) => e.type === 'shield' && e.car === 1)).toBe(true)
    expect(m.r.cars[1].shield).toBe(0)
    expect(m.r.cars[1].alive).toBe(true)
    expect(m.phase).toBe('play')
    expect(m.score).toEqual([3, 0])
  })

  it('does not protect from the tide or from your own helmet touching down', () => {
    const m = playing({ score: [3, 0] })
    place(m.r.cars[1], 0, 0.1)
    run(m, 0.2)
    expect(m.outcome).toMatchObject({ winner: 0, reason: 'sunk' })
  })
})

describe('twist: loser picks', () => {
  const afterBonk = (opt = {}) => {
    const m = playing(opt)
    dropOnto(m.r, 1, 0)      // seat 0 loses the round
    run(m, 1.5)
    untilPhase(m, 'pick', KO_SECONDS + 1)
    return m
  }

  it('offers the loser two other arenas', () => {
    const m = afterBonk({ seed: 3 })
    expect(m.phase).toBe('pick')
    expect(m.pick.by).toBe(0)
    expect(m.pick.options).toHaveLength(2)
    expect(new Set(m.pick.options).size).toBe(2)
    expect(m.pick.options).not.toContain(m.r.arena.id)
  })

  it("plays the loser's chosen arena next", () => {
    const m = afterBonk({ seed: 3 })
    const want = m.pick.options[1]
    const events = step(m, { X: { d: 0, hop: false, pick: want }, O: NONE }, DT).events
    expect(events.some((e) => e.type === 'chose' && e.arena === want && e.by === 'X')).toBe(true)
    expect(m.phase).toBe('count')
    expect(m.r.arena.id).toBe(want)
  })

  it('ignores a pick from the winner or for an arena that was not offered', () => {
    const m = afterBonk({ seed: 3 })
    const offered = m.pick.options[0]
    step(m, { X: NONE, O: { d: 0, hop: false, pick: offered } }, DT)
    expect(m.phase).toBe('pick')
    const other = ARENA_IDS.find((id) => !m.pick.options.includes(id))
    step(m, { X: { d: 0, hop: false, pick: other }, O: NONE }, DT)
    expect(m.phase).toBe('pick')
  })

  it('picks for a loser who never answers, after PICK_SECONDS', () => {
    const m = afterBonk({ seed: 3 })
    const options = m.pick.options.slice()
    run(m, PICK_SECONDS - 0.5)
    expect(m.phase).toBe('pick')
    run(m, 0.6)
    expect(m.phase).toBe('count')
    expect(options).toContain(m.r.arena.id)
  })

  it('a bot loser chooses quickly', () => {
    const m = afterBonk({ seed: 3, bots: ['X'] })
    run(m, BOT_PICK_SECONDS + 0.1)
    expect(m.phase).toBe('count')
  })

  it('is skipped when the twist is off', () => {
    const m = playing({ twists: { pick: false } })
    dropOnto(m.r, 1, 0)
    run(m, 1.5)
    untilPhase(m, 'count', KO_SECONDS + 1)
    expect(m.round).toBe(2)
  })
})

describe('knockout timing', () => {
  it('pauses for a beat, crawls, then comes back to full speed', () => {
    expect(koScale(0)).toBe(0)
    expect(koScale(0.4)).toBeCloseTo(0.2)
    expect(koScale(0.75)).toBeCloseTo(0.2)
    expect(koScale(1.0)).toBeGreaterThan(0.5)
    expect(koScale(1.5)).toBe(1)
  })

  it('slow motion slows the physics, not the clock', () => {
    const m = playing()
    dropOnto(m.r, 1, 0)
    run(m, 1.5)
    expect(m.phase).toBe('ko')
    const t0 = m.timer
    const y0 = m.r.cars[0].chassis.getPosition().y
    run(m, 0.3)
    expect(m.timer).toBeCloseTo(t0 + 0.3, 2)
    // 0.3 s of wall clock at 0.2× is about 0.06 s of falling
    expect(Math.abs(m.r.cars[0].chassis.getPosition().y - y0)).toBeLessThan(0.3)
  })
})

describe('bots', () => {
  it.each(ARENA_IDS.map((id) => [id]))('%s: two hard bots finish a round with a finite result', (id) => {
    const rng = mulberry32(11)
    const m = createMatch({ seed: 5, arena: id, leadCount: 0.1, twists: { pick: false } })
    const bots = [makeBot('hard', rng), makeBot('hard', rng)]
    let k = 0
    while (m.phase !== 'ko' && k < 60 * 120) {
      step(m, { X: bots[0](m.r, 0, DT), O: bots[1](m.r, 1, DT) }, DT)
      k++
    }
    expect(m.phase).toBe('ko')
    expect(Number.isFinite(m.r.cars[0].chassis.getPosition().x)).toBe(true)
    expect(m.outcome.t).toBeGreaterThan(0.3)
  })

  it('a bot never reads input outside its seat or crashes when the rival is out', () => {
    const rng = mulberry32(2)
    const bot = makeBot('easy', rng)
    const r = createRound({ arena: 'humps', hop: true })
    r.phase = 'play'
    r.cars[1].alive = false
    for (let k = 0; k < 300; k++) {
      const inp = bot(r, 0, DT)
      expect([-1, 0, 1]).toContain(inp.d)
      stepRound(r, [inp, NONE], DT)
    }
  })
})
