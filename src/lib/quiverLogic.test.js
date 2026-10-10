import { describe, it, expect } from 'vitest'
import {
  TABLE_W, TABLE_H, WHEEL_R, CLINK_WIDTH, SHAVE_WIDTH, WHEELS, WHEEL_SECONDS, SUDDEN_SECONDS, SUDDEN_MAX, RELOAD_SECONDS,
  LOCK_SECONDS, HEARTS, GOLD_VALUE, MIN_SEPARATION, QUIVER, STARS, BETWEEN_SECONDS, EMPTY_GRACE, COUNT_IN_SECONDS,
  createState, step, canFire, wheelAngle, norm, angleDist, seatsFor, flightSeconds, getWinner, ranking, winnerSymbol,
  sightAngle, createBrain, botInput, BOT_LEVELS, encodeSnapshot, decodeSnapshot, deadReckon, cleanInput,
} from './quiverLogic'

const DT = 1 / 120
const NONE = [{ fire: false }, { fire: false }, { fire: false }, { fire: false }]

function mulberry(seed) {
  let a = seed | 0
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const fresh = (o = {}) => createState({ players: 2, countIn: 0, seed: 7, ...o })

/** The wheel-frame angle an arrow from player i meets if it lands on the next tick. */
const meets = (s, i) => norm(s.players[i].phi - wheelAngle(s, s.tau + DT))

/** Put an arrow from player i one tick short of the rim, with a spare far-off star so the wheel keeps going. */
function aimed(s, i, { items = [], pins = [] } = {}) {
  const far = norm(meets(s, i) + Math.PI)
  return {
    ...s,
    items: [...items, { id: 9001, a: far, kind: 'star' }],
    pins,
    fly: [{ id: 700 + i, o: i, d: WHEEL_R + 1, d0: 150 }],
  }
}
const last = (s) => s.results[s.results.length - 1]

describe('createState', () => {
  it('seats players and fills quivers by count', () => {
    for (const n of [2, 3, 4]) {
      const s = createState({ players: n })
      expect(s.players).toHaveLength(n)
      expect(s.players.every((p) => p.ammo === QUIVER[n])).toBe(true)
      expect(seatsFor(n)).toHaveLength(n)
    }
  })

  it('deals the right number of stars and, with items on, one gold, bomb and reverse', () => {
    for (const n of [2, 3, 4]) {
      const s = createState({ players: n, seed: 3 })
      expect(s.items.filter((x) => x.kind === 'star')).toHaveLength(STARS[n])
      expect(s.items.filter((x) => x.kind === 'gold')).toHaveLength(1)
      expect(s.items.filter((x) => x.kind === 'bomb')).toHaveLength(1)
      expect(s.items.filter((x) => x.kind === 'flip')).toHaveLength(1)
    }
    const plain = createState({ players: 2, items: false })
    expect(plain.items.every((x) => x.kind === 'star')).toBe(true)
  })

  it('keeps every item at least MIN_SEPARATION apart, for any seed', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const n of [2, 4]) {
        const { items } = createState({ players: n, seed })
        for (let a = 0; a < items.length; a++) {
          for (let b = a + 1; b < items.length; b++) {
            expect(angleDist(items[a].a, items[b].a)).toBeGreaterThanOrEqual(MIN_SEPARATION)
          }
        }
      }
    }
  })

  it('clamps the player count to 2 to 4', () => {
    expect(createState({ players: 1 }).players).toHaveLength(2)
    expect(createState({ players: 9 }).players).toHaveLength(4)
  })

  it('starts in a count-in that hands over to play with a go event', () => {
    let s = createState({ players: 2 })
    expect(s.phase).toBe('count')
    expect(canFire(s, 0)).toBe(false)
    let sawGo = false
    for (let k = 0; k < Math.ceil(COUNT_IN_SECONDS / DT) + 2; k++) {
      const r = step(s, NONE, DT)
      s = r.state
      if (r.events.some((e) => e.type === 'go')) sawGo = true
    }
    expect(sawGo).toBe(true)
    expect(s.phase).toBe('play')
    expect(canFire(s, 0)).toBe(true)
  })
})

describe('seats and lanes', () => {
  it('puts every seat inside the table and a lane to the hub', () => {
    for (const n of [2, 3, 4]) {
      for (const seat of seatsFor(n)) {
        expect(seat.x).toBeGreaterThan(0)
        expect(seat.x).toBeLessThan(TABLE_W)
        expect(seat.y).toBeGreaterThan(0)
        expect(seat.y).toBeLessThan(TABLE_H)
      }
    }
  })

  it('gives every seat a flight of well under half a second', () => {
    for (const n of [2, 3, 4]) {
      for (const p of createState({ players: n }).players) {
        expect(flightSeconds(p)).toBeGreaterThan(0.05)
        expect(flightSeconds(p)).toBeLessThan(0.3)
      }
    }
  })
})

describe('firing', () => {
  it('spends one arrow, starts the reload and puts an arrow in the air', () => {
    const s = fresh()
    const r = step(s, [{ fire: true }, { fire: false }], DT)
    expect(r.state.players[0].ammo).toBe(QUIVER[2] - 1)
    expect(r.state.players[0].cool).toBeCloseTo(RELOAD_SECONDS, 5)
    expect(r.state.fly).toHaveLength(1)
    expect(r.events).toContainEqual({ type: 'throw', by: 0 })
  })

  it('cannot fire again until the reload is over', () => {
    let s = step(fresh(), [{ fire: true }, { fire: false }], DT).state
    s = step(s, [{ fire: true }, { fire: false }], DT).state
    expect(s.fly).toHaveLength(1)
    for (let k = 0; k < Math.ceil(RELOAD_SECONDS / DT) + 1; k++) s = step(s, NONE, DT).state
    expect(canFire(s, 0)).toBe(true)
  })

  it('lets both players shoot in the same tick', () => {
    const r = step(fresh(), [{ fire: true }, { fire: true }], DT)
    expect(r.state.fly.map((f) => f.o).sort()).toEqual([0, 1])
  })

  it('cannot fire with an empty quiver', () => {
    const s = fresh()
    s.players[0].ammo = 0
    expect(canFire(s, 0)).toBe(false)
    expect(step(s, [{ fire: true }, { fire: false }], DT).state.fly).toHaveLength(0)
  })

  it('ignores anything that is not a plain boolean fire', () => {
    expect(cleanInput(null)).toEqual({ fire: false })
    expect(cleanInput({ fire: 'yes', hack: 1 })).toEqual({ fire: true })
    expect(cleanInput({ press: 3 })).toEqual({ fire: false })
  })

  it('does not mutate the state it is given', () => {
    const s = fresh()
    const before = JSON.stringify(s)
    step(s, [{ fire: true }, { fire: true }], DT)
    expect(JSON.stringify(s)).toBe(before)
  })
})

describe('landing', () => {
  it('sticks on a bare rim and scores nothing', () => {
    const s = aimed(fresh(), 0)
    const r = step(s, NONE, DT)
    expect(r.state.pins).toHaveLength(1)
    expect(r.state.pins[0].o).toBe(0)
    expect(r.state.players[0].score).toBe(0)
    expect(last(r.state).kind).toBe('bare')
  })

  it('scores 1 for a star and takes it off the rim', () => {
    const base = fresh()
    const s = aimed(base, 0, { items: [{ id: 5, a: meets(base, 0), kind: 'star' }] })
    const r = step(s, NONE, DT)
    expect(r.state.players[0].score).toBe(1)
    expect(r.state.items.some((x) => x.id === 5)).toBe(false)
    expect(last(r.state).kind).toBe('star')
    expect(r.events).toContainEqual({ type: 'star', by: 0 })
    expect(r.state.pins).toHaveLength(1)
  })

  it('scores GOLD_VALUE for a gold star', () => {
    const base = fresh()
    const s = aimed(base, 1, { items: [{ id: 5, a: meets(base, 1), kind: 'gold' }] })
    expect(step(s, NONE, DT).state.players[1].score).toBe(GOLD_VALUE)
  })

  it('counts an item that is just inside the catch width', () => {
    const base = fresh()
    const s = aimed(base, 0, { items: [{ id: 5, a: meets(base, 0) + 0.12, kind: 'star' }] })
    expect(step(s, NONE, DT).state.players[0].score).toBe(1)
  })

  it('misses an item that is just outside it', () => {
    const base = fresh()
    const s = aimed(base, 0, { items: [{ id: 5, a: meets(base, 0) + 0.25, kind: 'star' }] })
    const r = step(s, NONE, DT)
    expect(r.state.players[0].score).toBe(0)
    expect(r.state.items.some((x) => x.id === 5)).toBe(true)
  })

  it('clinks on a stuck arrow: the arrow is lost, a point goes, the button locks', () => {
    const base = fresh()
    const s = aimed(base, 0, { pins: [{ id: 3, a: meets(base, 0) + 0.05, o: 1 }] })
    s.players[0].score = 2
    const r = step(s, NONE, DT)
    expect(r.state.players[0].score).toBe(1)
    expect(r.state.players[0].stun).toBeCloseTo(LOCK_SECONDS, 5)
    expect(r.state.pins).toHaveLength(1)
    expect(last(r.state).kind).toBe('clink')
    expect(r.events).toContainEqual({ type: 'clink', by: 0 })
  })

  it('never takes a score below zero', () => {
    const base = fresh()
    const s = aimed(base, 0, { pins: [{ id: 3, a: meets(base, 0), o: 1 }] })
    expect(step(s, NONE, DT).state.players[0].score).toBe(0)
  })

  it('blocks firing while locked', () => {
    const base = fresh()
    let s = aimed(base, 0, { pins: [{ id: 3, a: meets(base, 0), o: 1 }] })
    s = step(s, NONE, DT).state
    expect(canFire(s, 0)).toBe(false)
    expect(canFire(s, 1)).toBe(true)
  })

  it('a bomb blows every stuck arrow off the rim and loses the arrow that hit it', () => {
    const base = fresh()
    const s = aimed(base, 0, {
      items: [{ id: 5, a: meets(base, 0), kind: 'bomb' }],
      pins: [{ id: 3, a: meets(base, 0) + 1, o: 1 }, { id: 4, a: meets(base, 0) - 1, o: 0 }],
    })
    const r = step(s, NONE, DT)
    expect(r.state.pins).toHaveLength(0)
    expect(last(r.state).kind).toBe('bomb')
    expect(r.state.items.some((x) => x.id === 5)).toBe(false)
  })

  it('a reverse token turns the wheel the other way without a jump', () => {
    const base = fresh()
    const s = aimed(base, 0, { items: [{ id: 5, a: meets(base, 0), kind: 'flip' }] })
    const r = step(s, NONE, DT)
    expect(r.state.dir).toBe(-1)
    // The wheel keeps its angle at the instant of the reversal.
    expect(angleDist(wheelAngle(r.state), wheelAngle({ ...s, tau: s.tau + DT }))).toBeLessThan(1e-9)
    const later = step(r.state, NONE, DT).state
    const moved = norm(wheelAngle(later) - wheelAngle(r.state))
    expect(moved).toBeLessThan(0)
  })

  it('CLOSE SHAVE pays 1 just outside a clink, and nothing with the twist off', () => {
    const offset = CLINK_WIDTH + SHAVE_WIDTH / 2
    const base = fresh()
    const s = aimed(base, 0, { pins: [{ id: 3, a: meets(base, 0) + offset, o: 1 }] })
    const r = step(s, NONE, DT)
    expect(r.state.players[0].score).toBe(1)
    expect(last(r.state).kind).toBe('shave')

    const off = fresh({ shave: false })
    const so = aimed(off, 0, { pins: [{ id: 3, a: meets(off, 0) + offset, o: 1 }] })
    expect(step(so, NONE, DT).state.players[0].score).toBe(0)
  })

  it('pays nothing beyond the shave band', () => {
    const base = fresh()
    const s = aimed(base, 0, { pins: [{ id: 3, a: meets(base, 0) + CLINK_WIDTH + SHAVE_WIDTH + 0.05, o: 1 }] })
    expect(step(s, NONE, DT).state.players[0].score).toBe(0)
  })

  it('resolves two arrows in the order they were fired', () => {
    const base = fresh()
    const a = meets(base, 0)
    const s = {
      ...base,
      items: [{ id: 9001, a: norm(a + Math.PI), kind: 'star' }],
      pins: [],
      fly: [{ id: 1, o: 0, d: WHEEL_R + 1, d0: 150 }, { id: 2, o: 0, d: WHEEL_R + 1, d0: 150 }],
    }
    const r = step(s, NONE, DT)
    // The second lands exactly on the first: a clink.
    expect(r.state.results.map((x) => x.kind)).toEqual(['bare', 'clink'])
  })
})

describe('wheels and the match', () => {
  it('ends a wheel when its stars are gone and deals the next', () => {
    const base = fresh({ items: false })
    base.items = [{ id: 5, a: meets(base, 0), kind: 'star' }]
    base.fly = [{ id: 1, o: 0, d: WHEEL_R + 1, d0: 150 }]
    const r = step(base, NONE, DT)
    expect(r.state.wheel).toBe(1)
    expect(r.state.pins).toHaveLength(0)
    expect(r.state.pause).toBeCloseTo(BETWEEN_SECONDS, 5)
    expect(r.state.players.every((p) => p.ammo === QUIVER[2])).toBe(true)
    expect(r.state.pat).toBe(1)
    expect(r.events).toContainEqual({ type: 'wheel', n: 1 })
  })

  it('does not let anyone fire during the banner pause', () => {
    const s = fresh()
    s.pause = 0.5
    expect(canFire(s, 0)).toBe(false)
    expect(step(s, [{ fire: true }, { fire: true }], DT).state.fly).toHaveLength(0)
  })

  it('ends a wheel when every quiver is empty and nothing is in the air', () => {
    let s = fresh()
    s.players.forEach((p) => { p.ammo = 0 })
    for (let k = 0; k < Math.ceil((EMPTY_GRACE + 0.2) / DT); k++) s = step(s, NONE, DT).state
    expect(s.wheel).toBe(1)
  })

  it('ends a wheel on the clock', () => {
    let s = fresh()
    for (let k = 0; k < Math.ceil((WHEEL_SECONDS + 0.2) / DT); k++) s = step(s, NONE, DT).state
    expect(s.wheel).toBe(1)
  })

  it('emits a tick for each of the last three seconds', () => {
    let s = fresh()
    let ticks = 0
    for (let k = 0; k < Math.ceil(WHEEL_SECONDS / DT); k++) {
      const r = step(s, NONE, DT)
      s = r.state
      ticks += r.events.filter((e) => e.type === 'tick').length
      if (s.wheel > 0) break
    }
    expect(ticks).toBe(3)
  })

  it('names the player with most stars after the third wheel', () => {
    let s = fresh()
    s.wheel = WHEELS - 1
    s.players[1].score = 4
    s.players[0].score = 2
    s.wt = 0.001
    s = step(s, NONE, DT).state
    expect(s.phase).toBe('over')
    expect(getWinner(s)).toBe(1)
    expect(winnerSymbol(s)).toBe('O')
    expect(ranking(s).map((r) => r.i)).toEqual([1, 0])
  })

  it('plays sudden death between tied leaders only', () => {
    let s = createState({ players: 3, countIn: 0, seed: 4 })
    s.wheel = WHEELS - 1
    s.players[0].score = 5
    s.players[1].score = 5
    s.players[2].score = 2
    s.wt = 0.001
    const r = step(s, [{}, {}, {}], DT)
    s = r.state
    expect(s.phase).toBe('play')
    expect(s.sudden).toBe(1)
    expect(s.players.map((p) => p.out)).toEqual([false, false, true])
    expect(s.players.map((p) => p.ammo)).toEqual([1, 1, 0])
    expect(s.items.filter((x) => x.kind === 'star')).toHaveLength(1)
    expect(s.items).toHaveLength(1)
    expect(r.events).toContainEqual({ type: 'sudden' })
  })

  it('gives sudden death to the first player to take the star', () => {
    let s = fresh()
    s.wheel = WHEELS - 1
    s.wt = 0.001
    s = step(s, NONE, DT).state
    expect(s.sudden).toBe(1)
    s.pause = 0
    s.items = [{ id: 5, a: meets(s, 1), kind: 'star' }]
    s.fly = [{ id: 1, o: 1, d: WHEEL_R + 1, d0: 150 }]
    const r = step(s, NONE, DT)
    expect(r.state.phase).toBe('over')
    expect(getWinner(r.state)).toBe(1)
    expect(r.events.some((e) => e.type === 'end')).toBe(true)
  })

  it('is a draw when sudden death runs out', () => {
    let s = fresh()
    s.wheel = WHEELS - 1
    s.wt = 0.001
    s = step(s, NONE, DT).state
    for (let k = 0; k < Math.ceil(((SUDDEN_SECONDS + BETWEEN_SECONDS + 1) * SUDDEN_MAX) / DT) && s.phase !== 'over'; k++) {
      s = step(s, NONE, DT).state
    }
    expect(s.phase).toBe('over')
    expect(getWinner(s)).toBe('draw')
    expect(winnerSymbol(s)).toBe('draw')
  })

  it('an idle match ends in a draw', () => {
    let s = fresh()
    for (let k = 0; k < 20000 && s.phase !== 'over'; k++) s = step(s, NONE, DT).state
    expect(getWinner(s)).toBe('draw')
  })

  it('replays exactly from the same seed and inputs', () => {
    const run = () => {
      let s = createState({ players: 3, countIn: 0, seed: 99 })
      const rng = mulberry(5)
      for (let k = 0; k < 3000; k++) {
        s = step(s, s.players.map(() => ({ fire: rng() < 0.02 })), DT).state
      }
      return JSON.stringify(s)
    }
    expect(run()).toBe(run())
  })
})

describe('co-op', () => {
  it('loses a heart on a clink instead of a point', () => {
    const base = fresh({ coop: true })
    const s = aimed(base, 0, { pins: [{ id: 3, a: meets(base, 0), o: 1 }] })
    s.players[0].score = 2
    const r = step(s, NONE, DT)
    expect(r.state.hearts).toBe(HEARTS - 1)
    expect(r.state.players[0].score).toBe(2)
  })

  it('is lost when the hearts run out', () => {
    const base = fresh({ coop: true })
    base.hearts = 1
    const s = aimed(base, 0, { pins: [{ id: 3, a: meets(base, 0), o: 1 }] })
    const r = step(s, NONE, DT)
    expect(getWinner(r.state)).toBe('lost')
  })

  it('costs a heart to leave a star on the rim', () => {
    let s = fresh({ coop: true })
    for (let k = 0; k < Math.ceil((WHEEL_SECONDS + 0.2) / DT); k++) s = step(s, NONE, DT).state
    expect(s.wheel).toBe(1)
    expect(s.hearts).toBe(HEARTS - 1)
  })

  it('is won by clearing the third wheel with a heart left', () => {
    const base = fresh({ coop: true, items: false })
    base.wheel = WHEELS - 1
    base.items = [{ id: 5, a: meets(base, 0), kind: 'star' }]
    base.fly = [{ id: 1, o: 0, d: WHEEL_R + 1, d0: 150 }]
    const r = step(base, NONE, DT)
    expect(getWinner(r.state)).toBe('team')
  })

  it('never shows the underdog sight', () => {
    const s = fresh({ coop: true })
    s.players[0].score = 1
    expect(sightAngle(s, 1)).toBeNull()
  })
})

describe('underdog sight', () => {
  it('shows only to the player strictly in last place', () => {
    const s = fresh()
    expect(sightAngle(s, 0)).toBeNull()
    expect(sightAngle(s, 1)).toBeNull()
    s.players[0].score = 2
    expect(sightAngle(s, 1)).not.toBeNull()
    expect(sightAngle(s, 0)).toBeNull()
  })

  it('shows to nobody in a tie for last', () => {
    const s = createState({ players: 3, countIn: 0 })
    s.players[0].score = 3
    expect(sightAngle(s, 1)).toBeNull()
    expect(sightAngle(s, 2)).toBeNull()
  })

  it('points at where an arrow shot now would land', () => {
    const s = fresh()
    s.players[0].score = 2
    const marker = sightAngle(s, 1)
    // Fire it and let it fly: it meets the rim at the marker.
    let t = step(s, [{ fire: false }, { fire: true }], DT).state
    // A spare star far from the lane keeps the wheel from ending as the arrow lands.
    t = { ...t, items: [{ id: 9001, a: norm(marker + Math.PI), kind: 'star' }], pins: [] }
    let meetAt = null
    for (let k = 0; k < 120 && meetAt == null; k++) {
      const r = step(t, NONE, DT)
      t = r.state
      if (t.pins.length) meetAt = t.pins[0].a
    }
    expect(meetAt).not.toBeNull()
    expect(angleDist(meetAt, marker)).toBeLessThan(0.1)
  })

  it('is off when the twist is off, for bots and when the quiver is empty', () => {
    const off = fresh({ sight: false })
    off.players[0].score = 2
    expect(sightAngle(off, 1)).toBeNull()
    const bot = fresh({ bots: [null, 'normal'] })
    bot.players[0].score = 2
    expect(sightAngle(bot, 1)).toBeNull()
    const dry = fresh()
    dry.players[0].score = 2
    dry.players[1].ammo = 0
    expect(sightAngle(dry, 1)).toBeNull()
  })
})

describe('bots', () => {
  function play(level, tapper, seed) {
    let s = createState({ players: 2, countIn: 0, seed, bots: [null, level] })
    const rng = mulberry(seed * 31 + 1)
    const brain = createBrain()
    for (let k = 0; k < 40000 && s.phase !== 'over'; k++) {
      const human = { fire: tapper(rng, s) }
      s = step(s, [human, botInput(s, 1, level, brain, rng)], DT).state
    }
    return s
  }
  const randomTapper = (rng, s) => canFire(s, 0) && rng() < 0.03

  it('a hard bot beats a random tapper in most matches', () => {
    let wins = 0
    for (let seed = 1; seed <= 8; seed++) {
      const s = play('hard', randomTapper, seed)
      expect(s.phase).toBe('over')
      if (getWinner(s) === 1) wins += 1
    }
    expect(wins).toBeGreaterThanOrEqual(7)
  })

  it('a harder bot scores more than an easier one against the same tapper', () => {
    const total = (level) => {
      let n = 0
      for (let seed = 1; seed <= 6; seed++) n += play(level, randomTapper, seed).players[1].score
      return n
    }
    expect(total('hard')).toBeGreaterThan(total('easy'))
  })

  it('has only a timing handicap: every level is a positive error and none is zero', () => {
    for (const v of Object.values(BOT_LEVELS)) expect(v).toBeGreaterThan(0)
    expect(BOT_LEVELS.easy).toBeGreaterThan(BOT_LEVELS.normal)
    expect(BOT_LEVELS.normal).toBeGreaterThan(BOT_LEVELS.hard)
  })

  it('never fires with a locked button or an empty quiver', () => {
    const s = fresh({ bots: [null, 'hard'] })
    s.players[1].stun = 0.5
    const brain = createBrain()
    for (let k = 0; k < 200; k++) expect(botInput(s, 1, 'hard', brain).fire).toBe(false)
  })
})

describe('snapshots', () => {
  it('round-trips a busy table', () => {
    let s = createState({ players: 2, countIn: 0, seed: 12 })
    const rng = mulberry(8)
    for (let k = 0; k < 900; k++) s = step(s, s.players.map(() => ({ fire: rng() < 0.05 })), DT).state
    const snap = JSON.parse(JSON.stringify(encodeSnapshot(s)))
    const back = decodeSnapshot(snap, createState({ players: 2, countIn: 0, seed: 12 }))
    expect(back.phase).toBe(s.phase)
    expect(back.wheel).toBe(s.wheel)
    expect(back.players.map((p) => [p.score, p.ammo])).toEqual(s.players.map((p) => [p.score, p.ammo]))
    expect(back.pins).toHaveLength(s.pins.length)
    expect(back.items.map((x) => x.kind).sort()).toEqual(s.items.map((x) => x.kind).sort())
    expect(back.fly).toHaveLength(s.fly.length)
    expect(angleDist(wheelAngle(back), wheelAngle(s))).toBeLessThan(0.01)
  })

  it('carries a finished match, a draw and a co-op result', () => {
    for (const winner of [0, 1, 'draw', 'team', 'lost']) {
      const s = { ...fresh(), phase: 'over', winner }
      const back = decodeSnapshot(encodeSnapshot(s), fresh())
      expect(back.winner).toBe(winner)
      expect(back.phase).toBe('over')
    }
  })

  it('stays small enough to stream at 30 Hz', () => {
    let s = createState({ players: 2, countIn: 0, seed: 2 })
    const rng = mulberry(2)
    for (let k = 0; k < 600; k++) s = step(s, s.players.map(() => ({ fire: rng() < 0.05 })), DT).state
    expect(JSON.stringify(encodeSnapshot(s)).length).toBeLessThan(900)
  })

  it('dead reckoning advances the wheel and the arrows but stops short of the rim', () => {
    const s = { ...fresh(), fly: [{ id: 1, o: 0, d: 120, d0: 150 }] }
    const r = deadReckon(s, 0.05)
    expect(r.tau).toBeCloseTo(s.tau + 0.05, 6)
    expect(r.fly[0].d).toBeCloseTo(120 - 45, 3)
    const near = deadReckon({ ...s, fly: [{ id: 1, o: 0, d: WHEEL_R + 3, d0: 150 }] }, 0.2)
    expect(near.fly[0].d).toBeGreaterThan(WHEEL_R)
    expect(deadReckon(s, 0)).toBe(s)
  })
})
