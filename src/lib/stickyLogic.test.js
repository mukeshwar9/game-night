import { describe, it, expect } from 'vitest'
import { mulberry32 } from './detMath'
import {
  TABLE_W, TABLE_H, ROUND_SECONDS, LAST_CALL_SECONDS, COUNT_IN_SECONDS, CONTEST_WINDOW, CONTEST_CAP, SNAP_STUN, MAX_LOOT,
  DYE_HANDS_OUT_SECONDS, VALUES, RADII, BOT_LEVELS,
  seatsFor, handsFor, createState, step, getWinner, winnerSymbol, ranking, multiplier, lastCallActive,
  clampToReach, cleanInput, createBrain, botInput, botHoldFor, encodeSnapshot, decodeSnapshot, deadReckon,
} from './stickyLogic'

const DT = 1 / 120
const NOBODY = [null, null, null, null]

/** Run `seconds` of ticks with a fixed input list; returns the final state and every event. */
function run(state, inputs, seconds) {
  let s = state
  const events = []
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const r = step(s, typeof inputs === 'function' ? inputs(s) : inputs, DT)
    s = r.state
    events.push(...r.events)
  }
  return { s, events }
}

/** A live table (no count-in) with one loot item already landed. */
function table(opts = {}, loot = []) {
  const s = createState({ players: 2, countIn: 0, seed: 11, ...opts })
  loot.forEach((l, i) => {
    s.loot.push({
      id: 100 + i, kind: 'coin', x: 180, y: 280, vx: 0, vy: 0, z: 0, ttl: 7.5, holders: [], held: 0, duel: false, contest: 0, strain: 0, dead: false, ...l,
    })
  })
  return s
}
const at = (x, y) => ({ hands: [{ x, y }, null] })
const SAFE0 = { x: 180, y: TABLE_H - 46 }
const SAFE1 = { x: 180, y: 46 }

describe('seats and hands', () => {
  it('seats 2, 3 and 4 safes inside the table, apart from each other', () => {
    for (const n of [2, 3, 4]) {
      const seats = seatsFor(n)
      expect(seats).toHaveLength(n)
      for (const a of seats) {
        expect(a.x).toBeGreaterThan(0); expect(a.x).toBeLessThan(TABLE_W)
        expect(a.y).toBeGreaterThan(0); expect(a.y).toBeLessThan(TABLE_H)
      }
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        expect(Math.hypot(seats[i].x - seats[j].x, seats[i].y - seats[j].y)).toBeGreaterThan(120)
      }
    }
  })

  it('gives two hands in a duel and one when three or four share the phone', () => {
    expect([2, 3, 4].map(handsFor)).toEqual([2, 1, 1])
    expect(createState({ players: 2 }).players.every((p) => p.hands.length === 2)).toBe(true)
    expect(createState({ players: 3 }).players.every((p) => p.hands.length === 1)).toBe(true)
    expect(createState({ players: 4 }).players.every((p) => p.hands.length === 1)).toBe(true)
  })

  it('clamps the player count to 2..4 and gives each arm a real reach', () => {
    expect(createState({ players: 9 }).players).toHaveLength(4)
    expect(createState({ players: 1 }).players).toHaveLength(2)
    for (const p of createState({ players: 4 }).players) {
      expect(p.reach).toBeGreaterThan(150)
      expect(p.reach).toBeLessThan(Math.hypot(TABLE_W, TABLE_H))
    }
  })

  it('starts with a count-in, or live when asked to', () => {
    expect(createState().phase).toBe('count')
    expect(createState({ countIn: 0 }).phase).toBe('play')
  })
})

describe('step basics', () => {
  it('never mutates the state it is given', () => {
    const s = table({}, [{ x: 180, y: 300 }])
    const before = JSON.stringify(s)
    step(s, [at(180, 300), null], DT)
    expect(JSON.stringify(s)).toBe(before)
  })

  it('replays exactly from the same seed and inputs', () => {
    const go = () => run(createState({ players: 3, countIn: 0, seed: 99 }), [at(120, 300), at(200, 200), null], 6).s
    expect(go()).toEqual(go())
    const other = run(createState({ players: 3, countIn: 0, seed: 100 }), [at(120, 300), at(200, 200), null], 6).s
    expect(other.loot).not.toEqual(go().loot)
  })

  it('counts in 3 · 2 · 1 · GO then goes live', () => {
    const { s, events } = run(createState({ players: 2 }), NOBODY, COUNT_IN_SECONDS + 0.1)
    expect(s.phase).toBe('play')
    expect(events.filter((e) => e.type === 'tick')).toHaveLength(2)
    expect(events.filter((e) => e.type === 'go')).toHaveLength(1)
  })

  it('does not run the clock or spawn loot during the count-in', () => {
    const { s } = run(createState({ players: 2 }), NOBODY, 2)
    expect(s.phase).toBe('count')
    expect(s.time).toBe(ROUND_SECONDS)
    expect(s.loot).toHaveLength(0)
  })

  it('lets a hand move during the count-in', () => {
    const { s } = run(createState({ players: 2 }), [at(180, 400), null], 0.5)
    expect(s.players[0].hands[0].y).toBeLessThan(420)
  })

  it('lands each drop before it can be touched', () => {
    const s = table({}, [{ x: 180, y: 300, z: 1 }])
    const r = run(s, [at(180, 300), null], 0.2)
    expect(r.s.players[0].hands[0].loot).toBeNull()
    const later = run(r.s, [at(180, 300), null], 0.5)
    expect(later.events.some((e) => e.type === 'land')).toBe(true)
    expect(later.s.players[0].hands[0].loot).toBe(100)
  })
})

describe('reach and grip', () => {
  it('never lets a hand past its arm, whatever the client says', () => {
    const s = table()
    const { s: end } = run(s, [at(180, -5000), at(180, 99999)], 1)
    for (const p of end.players) {
      for (const h of p.hands) {
        expect(Math.hypot(h.x - p.safe.x, h.y - p.safe.y)).toBeLessThanOrEqual(p.reach + 0.5)
      }
    }
  })

  it('clampToReach keeps a point on the table and inside the circle', () => {
    const p = createState({ players: 2 }).players[0]
    const c = clampToReach(p, 180, -300)
    expect(Math.hypot(c.x - p.safe.x, c.y - p.safe.y)).toBeLessThanOrEqual(p.reach + 1e-6)
    const e = clampToReach(p, -50, 600)
    expect(e.x).toBeGreaterThanOrEqual(10)
    expect(e.y).toBeLessThanOrEqual(TABLE_H - 10)
  })

  it('cleans wire input: bad numbers become a lifted hand, the rest is kept on the table', () => {
    expect(cleanInput({ hands: [{ x: 'a', y: 3 }, { x: -20, y: 9999 }] }, 2)).toEqual([null, { x: 0, y: TABLE_H }])
    expect(cleanInput(null, 2)).toEqual([null, null])
    expect(cleanInput({ hands: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }, 1)).toEqual([{ x: 1, y: 2 }])
  })
})

describe('grab, carry and stash', () => {
  it('grabs a landed coin, carries it home and scores it', () => {
    let s = table({}, [{ x: 180, y: 380 }])
    s = run(s, [at(180, 380), null], 0.3).s
    expect(s.players[0].hands[0].loot).toBe(100)
    const home = run(s, [at(SAFE0.x, SAFE0.y - 20), null], 1.2)
    expect(home.s.players[0].score).toBe(VALUES.coin)
    expect(home.events.some((e) => e.type === 'cash' && e.by === 0)).toBe(true)
    expect(home.s.loot.find((l) => l.id === 100)).toBeUndefined()
  })

  it('pays a bill 3 and a gem 5', () => {
    for (const [kind, pay] of [['bill', 3], ['gem', 5]]) {
      let s = table({}, [{ kind, x: 180, y: 400 }])
      s = run(s, [at(180, 400), null], 0.3).s
      s = run(s, [at(SAFE0.x, SAFE0.y - 15), null], 2).s
      expect(s.players[0].score, kind).toBe(pay)
    }
  })

  it('never puts two of one player\'s hands on the same item', () => {
    let s = table({}, [{ x: 180, y: 380 }])
    s = run(s, [{ hands: [{ x: 180, y: 380 }, { x: 182, y: 382 }] }, null], 0.4).s
    expect(s.loot[0].holders).toHaveLength(1)
  })

  it('does not grab while the finger is up', () => {
    const s = run(table({}, [{ x: 180, y: 514 - 60 }]), NOBODY, 0.5).s
    expect(s.players[0].hands.every((h) => h.loot == null)).toBe(true)
  })

  it('lets a stashed item score for whoever owns the safe it entered', () => {
    let s = table({}, [{ x: 180, y: 150, vy: -400 }])
    s = run(s, NOBODY, 1.2).s
    expect(s.players[1].score).toBe(1)
    expect(s.players[0].score).toBe(0)
  })

  it('flicks: letting go mid-swing keeps the item sliding with the hand\'s speed', () => {
    let s = table({}, [{ x: 180, y: 400 }])
    s = run(s, [at(180, 400), null], 0.3).s
    // Swing up the table, then lift.
    s = run(s, [at(180, 120), null], 0.05).s
    const holding = s.loot[0]
    expect(holding.holders).toHaveLength(1)
    s = run(s, NOBODY, 0.02).s
    const l = s.loot.find((o) => o.id === 100)
    expect(l.holders).toHaveLength(0)
    expect(l.vy).toBeLessThan(-100)
  })

  it('expires an unclaimed item with a blink-out', () => {
    const s = table({}, [{ x: 100, y: 300, ttl: 0.05 }])
    const r = run(s, NOBODY, 0.2)
    expect(r.events.some((e) => e.type === 'expire')).toBe(true)
    expect(r.s.loot.find((l) => l.id === 100)).toBeUndefined()
  })
})

describe('contests: last one holding keeps it', () => {
  const both = (x, y) => [at(x, y), at(x, y)]
  const contested = (kind = 'coin', x = 180, y = 280) => run(table({}, [{ kind, x, y }]), both(x, y), 0.3).s

  it('is a contest when two players land on the same item inside the window', () => {
    for (const kind of ['coin', 'bill', 'gem']) {
      const s = contested(kind)
      const l = s.loot.find((o) => o.id === 100)
      expect(l.holders).toHaveLength(2)
      expect(l.duel).toBe(true)
    }
  })

  it('announces the tug once and shows the strain building toward the cap', () => {
    const r = run(table({}, [{ x: 180, y: 280 }]), both(180, 280), 1.5)
    expect(r.events.filter((e) => e.type === 'tug')).toHaveLength(1)
    const l = r.s.loot.find((o) => o.id === 100)
    expect(l.strain).toBeGreaterThan(0.3)
    expect(l.strain).toBeLessThan(0.7)
  })

  it('the player who lets go first loses it; the last one holding keeps it', () => {
    for (const kind of ['coin', 'bill', 'gem']) {
      const s = contested(kind)
      const r = run(s, [at(180, 280), null], 0.1)       // player 1 (hand 0) lifts, player 0 holds on
      const l = r.s.loot.find((o) => o.id === 100)
      expect(l.holders).toEqual([0])
      expect(r.s.players[1].hands[0].loot).toBeNull()
      expect(r.events).toContainEqual({ type: 'won', by: 0 })
    }
  })

  it('the winner of a bill tug carries all of it home (no splitting)', () => {
    const s = contested('bill', 180, 330)
    const r = run(s, [at(SAFE0.x, SAFE0.y - 15), null], 3)
    expect(r.s.players[0].score).toBe(VALUES.bill)
    expect(r.s.players[1].score).toBe(0)
  })

  it('whoever holds longest wins whichever side lets go', () => {
    const s = contested()
    const r = run(s, [null, at(180, 280)], 0.1)
    expect(r.s.loot.find((o) => o.id === 100).holders).toEqual([2])
    expect(r.events).toContainEqual({ type: 'won', by: 1 })
  })

  it('a hand that lost the tug cannot jump back onto the item', () => {
    let s = contested()
    s = run(s, [at(180, 280), null], 0.1).s
    const r = run(s, [at(180, 280), at(180, 280)], 0.3)
    expect(r.s.loot.find((o) => o.id === 100).holders).toEqual([0])
    expect(r.s.players[1].hands[0].loot).toBeNull()
  })

  it('a hand arriving after the window finds the first grip locked', () => {
    let s = table({}, [{ x: 180, y: 280 }])
    s = run(s, [at(180, 280), null], CONTEST_WINDOW + 0.2).s
    expect(s.loot[0].holders).toEqual([0])
    const r = run(s, [at(180, 280), at(180, 280)], 0.3)
    expect(r.s.loot[0].holders).toEqual([0])
    expect(r.s.loot[0].duel).toBe(false)
    expect(r.s.players[1].hands[0].loot).toBeNull()
  })

  it('a hand arriving inside the window still makes it a contest', () => {
    let s = table({}, [{ x: 180, y: 280 }])
    s = run(s, [at(180, 280), null], CONTEST_WINDOW - 0.2).s
    expect(s.loot[0].holders).toEqual([0])
    const r = run(s, [at(180, 280), at(180, 280)], 0.1)
    expect(r.s.loot[0].holders).toHaveLength(2)
  })

  it('snaps at the cap when nobody lets go: nobody scores, both hands are dazed', () => {
    const s = contested('gem')
    const r = run(s, both(180, 280), CONTEST_CAP)
    expect(r.events.filter((e) => e.type === 'snap')).toHaveLength(1)
    expect(r.s.loot.some((o) => o.id === 100)).toBe(false)
    expect(r.s.players.map((p) => p.score)).toEqual([0, 0])
    expect(r.s.players[0].hands[0].loot).toBeNull()
    expect(r.s.players[1].hands[0].loot).toBeNull()
    expect(r.s.players[0].hands[0].stun).toBeGreaterThan(0)
    expect(r.s.players[0].hands[0].stun).toBeLessThanOrEqual(SNAP_STUN)
  })

  it('does not snap while somebody has already let go', () => {
    const s = contested()
    const r = run(s, [at(180, 280), null], CONTEST_CAP + 1)
    expect(r.events.some((e) => e.type === 'snap')).toBe(false)
    expect(r.s.loot.find((o) => o.id === 100).holders).toEqual([0])
  })

  it('a contested item sits between the hands and cannot be pulled into a safe', () => {
    const s = contested('coin', 180, 330)
    const r = run(s, [at(SAFE0.x, SAFE0.y - 15), at(SAFE1.x, SAFE1.y + 15)], 1)
    expect(r.s.players.map((p) => p.score)).toEqual([0, 0])
  })

  it('three players can contest and the last holder wins it (two at a time)', () => {
    let s = table({ players: 3 }, [{ x: 180, y: 280 }])
    s = run(s, [at(180, 280), at(180, 280), at(180, 280)], 0.3).s
    expect(s.loot[0].holders).toHaveLength(2)
    const [a, b] = s.loot[0].holders.map((k) => k >> 1)
    const inputs = [null, null, null]
    inputs[a] = at(180, 280)
    const r = run(s, inputs, 0.1)
    expect(r.s.loot[0].holders).toEqual([a * 2])
    expect(r.s.players[b].hands[0].loot).toBeNull()
  })

  it('both lifting at once just drops the item, with no winner', () => {
    const s = contested()
    const r = run(s, NOBODY, 0.1)
    expect(r.events.some((e) => e.type === 'won')).toBe(false)
    expect(r.s.loot.find((o) => o.id === 100).holders).toHaveLength(0)
  })

  it('a dye pack tug ends the same way: the last holder is stuck with it', () => {
    const s = contested('dye', 180, 330)
    const r = run(s, [at(SAFE0.x, SAFE0.y - 15), null], 3)
    expect(r.s.players[0].score).toBe(0)
    expect(r.events).toContainEqual({ type: 'dye', by: 0 })
  })

  it('replays the same contest exactly, and does not mutate its input', () => {
    const s = contested()
    const frozen = JSON.stringify(s)
    const a = run(s, both(180, 280), 1)
    expect(JSON.stringify(s)).toBe(frozen)
    expect(JSON.stringify(run(s, both(180, 280), 1).s)).toBe(JSON.stringify(a.s))
  })
})

describe('dye packs', () => {
  it('costs 3 (never below 0) and puts your hands out for a moment', () => {
    let s = table({}, [{ kind: 'dye', x: SAFE0.x, y: SAFE0.y - 10 }])
    s.players[0].score = 5
    const r = run(s, NOBODY, 0.1)
    expect(r.s.players[0].score).toBe(5 + VALUES.dye)
    expect(r.s.players[0].dyed).toBeGreaterThan(0)
    expect(r.events.some((e) => e.type === 'dye' && e.by === 0)).toBe(true)

    let z = table({}, [{ kind: 'dye', x: SAFE0.x, y: SAFE0.y - 10 }])
    z = run(z, NOBODY, 0.1).s
    expect(z.players[0].score).toBe(0)
  })

  it('cannot grab until the dye wears off', () => {
    let s = table({}, [{ kind: 'dye', x: SAFE0.x, y: SAFE0.y - 10 }])
    s = run(s, NOBODY, 0.05).s
    s.loot.push({ id: 200, kind: 'coin', x: 180, y: 380, vx: 0, vy: 0, z: 0, ttl: 7.5, holders: [], held: 0, duel: false, contest: 0, strain: 0, dead: false })
    const during = run(s, [at(180, 380), null], 0.5).s
    expect(during.players[0].hands[0].loot).toBeNull()
    const after = run(during, [at(180, 380), null], DYE_HANDS_OUT_SECONDS).s
    expect(after.players[0].hands[0].loot).toBe(200)
  })

  it('is a gift when flicked into a rival\'s safe', () => {
    let s = table({}, [{ kind: 'dye', x: 180, y: 150, vy: -400 }])
    s.players[1].score = 4
    s = run(s, NOBODY, 1.2).s
    expect(s.players[1].score).toBe(4 + VALUES.dye)
    expect(s.players[0].score).toBe(0)
  })

  it('is never dealt when dye packs are off', () => {
    let s = createState({ players: 2, countIn: 0, seed: 5, dyePacks: false })
    const kinds = new Set()
    for (let i = 0; i < 120 * 55; i++) {
      s = step(s, NOBODY, DT).state
      s.loot.forEach((l) => kinds.add(l.kind))
      // clear the table so the spawner keeps dealing
      if (i % 60 === 0) s.loot = []
    }
    expect(kinds.has('dye')).toBe(false)
    expect(kinds.size).toBeGreaterThan(1)
  })
})

describe('last call', () => {
  it('doubles loot in the last 10 seconds, but not the dye penalty', () => {
    let s = table({}, [{ x: SAFE0.x, y: SAFE0.y - 10 }, { kind: 'dye', x: SAFE0.x + 5, y: SAFE0.y - 8 }])
    s.time = LAST_CALL_SECONDS - 1
    s.players[0].score = 10
    expect(multiplier(s)).toBe(2)
    expect(lastCallActive(s)).toBe(true)
    s = run(s, NOBODY, 0.1).s
    // +2 for the coin, −3 for the pack
    expect(s.players[0].score).toBe(10 + VALUES.coin * 2 + VALUES.dye)
  })

  it('announces itself once and sprays more loot', () => {
    let s = table()
    s.time = LAST_CALL_SECONDS + 0.01
    const r = run(s, NOBODY, 0.2)
    expect(r.events.filter((e) => e.type === 'lastcall')).toHaveLength(1)
    const late = run(r.s, (st) => { st.loot = st.loot.map((l) => ({ ...l, ttl: 99 })); return NOBODY }, 5)
    expect(late.s.loot.length).toBeGreaterThan(MAX_LOOT - 1)
    expect(late.s.loot.length).toBeLessThanOrEqual(MAX_LOOT + 2)
  })

  it('ticks the clock once a second through the last 10', () => {
    const s = table()
    s.time = 3.05
    const r = run(s, NOBODY, 3.2)
    expect(r.events.filter((e) => e.type === 'tick')).toHaveLength(3)
  })

  it('stays at 1× with the twist off', () => {
    const s = table({ lastCall: false })
    s.time = 3
    expect(multiplier(s)).toBe(1)
  })
})

describe('the buzzer', () => {
  it('ends the round for the clear leader', () => {
    const s = table()
    s.time = 0.01
    s.players[1].score = 7
    s.players[0].score = 3
    const r = run(s, NOBODY, 0.1)
    expect(r.s.phase).toBe('over')
    expect(getWinner(r.s)).toBe(1)
    expect(winnerSymbol(r.s)).toBe('O')
    expect(r.events.some((e) => e.type === 'end')).toBe(true)
  })

  it('settles a tie with the next item into a safe', () => {
    const s = table()
    s.time = 0.01
    s.players[0].score = 4
    s.players[1].score = 4
    let r = run(s, NOBODY, 0.1)
    expect(r.s.phase).toBe('play')
    expect(r.s.sudden).toBe(true)
    expect(getWinner(r.s)).toBeNull()
    // A coin lands in player 1's safe.
    r.s.loot = [{ id: 300, kind: 'coin', x: SAFE1.x, y: SAFE1.y + 10, vx: 0, vy: 0, z: 0, ttl: 7, holders: [], held: 0, duel: false, contest: 0, strain: 0, dead: false }]
    r = run(r.s, NOBODY, 0.1)
    expect(r.s.phase).toBe('over')
    expect(getWinner(r.s)).toBe(1)
  })

  it('only deals plain coins in a tie-break', () => {
    const s = table()
    s.time = 0.01
    let r = run(s, NOBODY, 0.1)
    expect(r.s.sudden).toBe(true)
    r = run(r.s, NOBODY, 3)
    expect(r.s.loot.every((l) => l.kind === 'coin')).toBe(true)
  })

  it('lets go of everything and ignores fingers once it is over', () => {
    let s = table({}, [{ x: 180, y: 380 }])
    s = run(s, [at(180, 380), null], 0.3).s
    expect(s.players[0].hands[0].loot).toBe(100)
    s.time = 0.01
    s.players[0].score = 9
    const r = run(s, [at(180, 380), null], 0.1)
    expect(r.s.phase).toBe('over')
    expect(r.s.players[0].hands.every((h) => h.loot == null && !h.active)).toBe(true)
  })

  it('ranks players best first, ties by seat', () => {
    const s = createState({ players: 4 })
    s.players[0].score = 2
    s.players[1].score = 9
    s.players[2].score = 2
    s.players[3].score = 5
    expect(ranking(s).map((r) => r.i)).toEqual([1, 3, 0, 2])
  })
})

describe('bots', () => {
  const live = (opts) => table({ bots: [null, 'normal'], ...opts })

  it('waits its reaction time, then goes for the nearest valuable item in reach', () => {
    const s = live()
    s.loot.push(
      { id: 1, kind: 'coin', x: 180, y: 100, vx: 0, vy: 0, z: 0, ttl: 7, holders: [], held: 0, duel: false, contest: 0, strain: 0, dead: false },
      { id: 2, kind: 'gem', x: 140, y: 150, vx: 0, vy: 0, z: 0, ttl: 7, holders: [], held: 0, duel: false, contest: 0, strain: 0, dead: false },
    )
    const brain = createBrain(2)
    const rng = mulberry32(3)
    expect(botInput(s, 1, 'normal', brain, DT, rng).hands).toEqual([null, null])
    expect(brain.hands[0].target).toBe(2)
    botInput(s, 1, 'normal', brain, BOT_LEVELS.normal.react * 1.5, rng)
    const out = botInput(s, 1, 'normal', brain, DT, rng)
    expect(out.hands[0]).toEqual({ x: 140, y: 150 })
    expect(out.hands[1]).toBeNull()
  })

  it('takes its second hand out only once told a person is using two', () => {
    const s = live()
    s.loot.push(
      { id: 1, kind: 'coin', x: 100, y: 100, vx: 0, vy: 0, z: 0, ttl: 7, holders: [], held: 0, duel: false, contest: 0, strain: 0, dead: false },
      { id: 2, kind: 'coin', x: 260, y: 100, vx: 0, vy: 0, z: 0, ttl: 7, holders: [], held: 0, duel: false, contest: 0, strain: 0, dead: false },
    )
    const brain = createBrain(2)
    brain.secondHand = true
    const rng = mulberry32(9)
    botInput(s, 1, 'hard', brain, DT, rng)
    expect(brain.hands[0].target).not.toBeNull()
    expect(brain.hands[1].target).not.toBeNull()
    expect(brain.hands[0].target).not.toBe(brain.hands[1].target)
  })

  it('carries what it holds to its own safe mouth', () => {
    const s = live()
    s.players[1].hands[0].loot = 5
    const out = botInput(s, 1, 'normal', createBrain(2), DT, mulberry32(1))
    expect(out.hands[0]).toEqual(s.players[1].mouth)
  })

  it('a hard bot is never fooled by a dye pack; an easy one often is', () => {
    const dye = { kind: 'dye', x: 180, y: 120 }
    const hard = live(); hard.loot.push({ id: 7, vx: 0, vy: 0, z: 0, ttl: 7, holders: [], held: 0, duel: false, contest: 0, strain: 0, dead: false, x: 180, y: 120, kind: 'dye' })
    const b = createBrain(2)
    botInput(hard, 1, 'hard', b, DT, mulberry32(1))
    expect(b.hands[0].target).toBeNull()
    let fooled = 0
    for (let id = 1; id <= 40; id++) {
      const s = live()
      s.loot.push({ ...dye, id, vx: 0, vy: 0, z: 0, ttl: 7, holders: [], held: 0, duel: false, contest: 0, strain: 0, dead: false })
      const bb = createBrain(2)
      botInput(s, 1, 'easy', bb, DT, mulberry32(id))
      if (bb.hands[0].target != null) fooled += 1
    }
    expect(fooled).toBeGreaterThan(10)
    expect(fooled).toBeLessThan(35)
  })

  it('does not chase loot beyond its reach, a locked item, or a stunned hand\'s turn', () => {
    const s = live()
    s.loot.push({ id: 1, kind: 'coin', x: 150, y: 120, vx: 0, vy: 0, z: 0, ttl: 7, holders: [0], held: CONTEST_WINDOW + 0.1, duel: false, contest: 0, strain: 0, dead: false })
    const brain = createBrain(2)
    botInput(s, 1, 'hard', brain, DT, mulberry32(1))
    expect(brain.hands[0].target).toBeNull()
    s.loot.push({ id: 2, kind: 'coin', x: 150, y: 120, vx: 0, vy: 0, z: 0, ttl: 7, holders: [], held: 0, duel: false, contest: 0, strain: 0, dead: false })
    s.players[1].hands[0].stun = 0.5
    expect(botInput(s, 1, 'hard', brain, DT, mulberry32(1)).hands[0]).toBeNull()
  })

  it('a bot hangs on in a tug, then lets go at a time that varies per contest', () => {
    const limits = new Set()
    for (let seed = 1; seed <= 12; seed++) {
      const s = live()
      s.loot.push({ id: 5, kind: 'coin', x: 180, y: 280, vx: 0, vy: 0, z: 0, ttl: 7, holders: [0, 2], held: 0.2, duel: true, contest: 0.1, strain: 0, dead: false })
      s.players[0].hands[0].loot = 5
      s.players[1].hands[0].loot = 5
      const brain = createBrain(2)
      const rng = mulberry32(seed)
      let t = 0
      let out = botInput(s, 1, 'normal', brain, DT, rng)
      expect(out.hands[0]).toEqual(s.players[1].mouth)          // still pulling
      while (out.hands[0] && t < 5) { t += DT; out = botInput(s, 1, 'normal', brain, DT, rng) }
      expect(out.hands[0]).toBeNull()                            // let go
      expect(t).toBeLessThan(CONTEST_CAP)
      limits.add(Math.round(t * 10))
    }
    expect(limits.size).toBeGreaterThan(3)
  })

  it('bot hold times grow with level and item value, and a dye pack is dropped at once', () => {
    const rng = () => 0.5
    expect(botHoldFor('hard', 'coin', rng)).toBeGreaterThan(botHoldFor('easy', 'coin', rng))
    expect(botHoldFor('normal', 'gem', rng)).toBeGreaterThan(botHoldFor('normal', 'coin', rng))
    expect(botHoldFor('hard', 'dye', rng)).toBeLessThan(0.2)
    for (const level of Object.keys(BOT_LEVELS)) {
      for (const kind of ['coin', 'bill', 'gem']) {
        expect(botHoldFor(level, kind, () => 0.999)).toBeLessThan(CONTEST_CAP)
        expect(botHoldFor(level, kind, () => 0)).toBeGreaterThan(0.1)
      }
    }
  })

  it('a bot does not pile onto an item whose window has closed', () => {
    const s = live()
    s.loot.push({ id: 9, kind: 'gem', x: 180, y: 120, vx: 0, vy: 0, z: 0, ttl: 7, holders: [0], held: CONTEST_WINDOW + 0.2, duel: false, contest: 0, strain: 0, dead: false })
    const brain = createBrain(2)
    botInput(s, 1, 'hard', brain, DT, mulberry32(1))
    expect(brain.hands[0].target).toBeNull()
  })

  it('two bots play a whole round to a winner, replayably', () => {
    const play = (seed) => {
      let s = createState({ players: 2, countIn: 0, seed, bots: ['normal', 'hard'] })
      const brains = [createBrain(2), createBrain(2)]
      const rng = mulberry32(seed + 1)
      let guard = 0
      while (s.phase !== 'over' && guard++ < 120 * 100) {
        const inputs = s.players.map((p) => botInput(s, p.i, p.bot, brains[p.i], DT, rng))
        s = step(s, inputs, DT).state
      }
      return s
    }
    const a = play(21)
    expect(a.phase).toBe('over')
    expect(a.players[0].score + a.players[1].score).toBeGreaterThan(8)
    expect([0, 1]).toContain(getWinner(a))
    expect(play(21)).toEqual(a)
  })

  it('RADII covers every loot kind the bot can see', () => {
    for (const k of Object.keys(VALUES)) expect(RADII[k]).toBeGreaterThan(0)
  })
})

describe('wire format', () => {
  function busy() {
    let s = createState({ players: 2, countIn: 0, seed: 4 })
    s = run(s, [at(180, 300), at(180, 260)], 5).s
    return s
  }

  it('round-trips the scene the guest needs', () => {
    const s = busy()
    const base = createState({ players: 2, countIn: 0, seed: 4 })
    const snap = JSON.parse(JSON.stringify(encodeSnapshot(s)))
    const scene = decodeSnapshot(snap, base)
    expect(scene.phase).toBe(s.phase)
    expect(scene.players.map((p) => p.score)).toEqual(s.players.map((p) => p.score))
    expect(scene.loot.map((l) => [l.id, l.kind])).toEqual(s.loot.map((l) => [l.id, l.kind]))
    expect(scene.loot.map((l) => l.holders)).toEqual(s.loot.map((l) => l.holders))
    expect(scene.players[0].hands[0].loot ?? null).toBe(s.players[0].hands[0].loot ?? null)
    expect(Math.abs(scene.players[0].hands[0].x - s.players[0].hands[0].x)).toBeLessThan(0.06)
    expect(scene.time).toBeCloseTo(s.time, 0)
  })

  it('keeps the winner and phase at the buzzer', () => {
    const s = table()
    s.time = 0.01
    s.players[1].score = 5
    const over = run(s, NOBODY, 0.1).s
    const scene = decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(over))), table())
    expect(scene.phase).toBe('over')
    expect(getWinner(scene)).toBe(1)
  })

  it('dead-reckons free loot a little and rides held loot on its hand', () => {
    const base = createState({ players: 2, countIn: 0 })
    const scene = {
      ...base,
      loot: [
        { id: 1, kind: 'coin', x: 100, y: 300, vx: 100, vy: 0, z: 0, holders: [], ttl: 5, strain: 0, contest: 0 },
        { id: 2, kind: 'coin', x: 200, y: 200, vx: 0, vy: 0, z: 0, holders: [0], ttl: 5, strain: 0, contest: 0 },
      ],
    }
    scene.players = scene.players.map((p) => ({ ...p, hands: p.hands.map((h) => ({ ...h })) }))
    scene.players[0].hands[0].x = 150
    scene.players[0].hands[0].y = 400
    const out = deadReckon(scene, 5, {})
    expect(out.loot[0].x).toBeCloseTo(100 + 100 * 0.1, 5)    // age is capped at 0.1 s
    expect(out.loot[1]).toMatchObject({ x: 150, y: 400 })
  })

  it('draws your own hand at your finger at once, and the item it holds follows', () => {
    const base = createState({ players: 2, countIn: 0 })
    const scene = {
      ...base,
      loot: [{ id: 2, kind: 'coin', x: 200, y: 200, vx: 0, vy: 0, z: 0, holders: [0], ttl: 5, strain: 0, contest: 0 }],
    }
    const out = deadReckon(scene, 0, { 0: { x: 170, y: 420 } })
    expect(out.players[0].hands[0]).toMatchObject({ x: 170, y: 420, active: true })
    expect(out.loot[0]).toMatchObject({ x: 170, y: 420 })
    // …but never past the arm.
    const far = deadReckon(scene, 0, { 0: { x: 170, y: -900 } })
    const p = far.players[0]
    expect(Math.hypot(p.hands[0].x - p.safe.x, p.hands[0].y - p.safe.y)).toBeLessThanOrEqual(p.reach + 0.5)
  })
})
