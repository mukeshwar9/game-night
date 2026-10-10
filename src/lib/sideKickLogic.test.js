import { describe, it, expect } from 'vitest'
import {
  SEG, MAXSPD, LANEX, DT, PIPS, KICK_T, KICK_CD, KICK_BUFFER, STRAIN_HIT, STRAIN_MISS, SHIELD, DOWN_T, DOWN_T_BEHIND,
  REMOUNT_SPD, REMOUNT_SPD_BEHIND, CATCHUP_MAX, SAME_ATTACKER_GUARD, RACE_END_AFTER_FIRST, RACE_MAX, CUP_POINTS,
  TRACKS, TRACK_IDS, TRACK_ORDER, buildTrack, trackForRace, createWorld, step, tryKick, kickTarget, inReach,
  applyHit, receiveKick, knockOff, raceShouldEnd, standings, placeOf, cupAward, encodeRider, decodeRider,
  applyGhost, promoteBot, demoteBot, kickKey, parseKick, raceEntry, raceIsDone, normalizeStats, formatRaceTime,
  getDifficulty, DIFFICULTY_IDS,
} from './sideKickLogic'

const four = (over = {}) => [
  { id: 'a', name: 'AAA', ...over.a },
  { id: 'b', name: 'BBB', bot: true, ...over.b },
  { id: 'c', name: 'CCC', bot: true, ...over.c },
  { id: 'd', name: 'DDD', bot: true, ...over.d },
]
// An empty straight road with no cars: a test controls every contact.
function lab(riders = four(), opts = {}) {
  const w = createWorld({ riders, phase: 'race', ...opts })
  w.cars = []
  w.track.cars = []
  for (const r of w.riders) { r.speed = MAXSPD * 0.8 }
  return w
}
const run = (w, secs, inputs = {}) => {
  const out = []
  for (let i = 0; i < Math.round(secs / DT); i++) {
    step(w, inputs, DT)
    out.push(...w.events)
    w.events.length = 0
  }
  return out
}
// Park every rider far apart so bots do not interfere, then place two side by side.
const isolate = (w, keep) => {
  w.riders.forEach((r, i) => { if (!keep.includes(i)) { r.z = 1e6 + i * 1e5; r.bot = false; r.done = false } })
}

describe('tracks', () => {
  it('builds every track the same way for the same seed', () => {
    for (const id of TRACK_IDS) {
      const a = buildTrack(7, id)
      const b = buildTrack(7, id)
      expect(a.segs.length).toBe(b.segs.length)
      expect(a.finish).toBe((a.segs.length - 220) * SEG)
      expect(JSON.stringify(a.cars)).toBe(JSON.stringify(b.cars))
      expect(a.segs[500].curve).toBe(b.segs[500].curve)
      expect(a.segs[500].y2).toBe(b.segs[500].y2)
    }
  })
  it('puts the finish gate on a segment boundary with road beyond it', () => {
    for (const id of TRACK_IDS) {
      const t = buildTrack(3, id)
      expect(t.finish % SEG).toBe(0)
      expect(t.segs.length * SEG).toBeGreaterThan(t.finish + 200 * SEG - 1)
      expect(t.segs[t.finish / SEG].spr.some((s) => s.k === 'gate')).toBe(true)
    }
  })
  it('keeps the named roads in a sensible length band and the random road close to them', () => {
    const len = (id, seed = 5) => buildTrack(seed, id).finish / SEG
    for (const id of TRACK_ORDER) { expect(len(id)).toBeGreaterThan(2200); expect(len(id)).toBeLessThan(3200) }
    for (let seed = 1; seed <= 12; seed++) { expect(len('random', seed)).toBeGreaterThan(2500); expect(len('random', seed)).toBeLessThan(3300) }
  })
  it('seeds a different random road per seed', () => {
    expect(buildTrack(1, 'random').finish).not.toBe(buildTrack(2, 'random').finish)
  })
  it('has no car in the first 90 segments and no car past the finish run-up', () => {
    const t = buildTrack(9, 'rush')
    expect(t.cars.length).toBeGreaterThan(30)
    for (const c of t.cars) { expect(c.z0).toBeGreaterThanOrEqual(90 * SEG); expect(c.z0).toBeLessThan(t.finish - 60 * SEG) }
    for (const c of t.cars) expect(LANEX).toContain(c.x)
  })
  it('names a track for each race of the cup in turn', () => {
    expect([0, 1, 2, 3, 4].map(trackForRace)).toEqual(['meadow', 'pass', 'rush', 'meadow', 'pass'])
    expect(trackForRace(-1)).toBe('rush')
    for (const id of TRACK_ORDER) expect(TRACKS[id]).toBeTruthy()
  })
})

describe('createWorld', () => {
  it('seats the player last on the grid and the bots ahead, with difficulty tuning on the bots only', () => {
    const w = createWorld({ riders: four(), difficulty: 'hard' })
    expect(w.riders).toHaveLength(4)
    expect(w.riders[0].z).toBeLessThan(w.riders[1].z)
    expect(w.riders[0].base).toBe(1)
    expect(w.riders[1].base).toBe(getDifficulty('hard').base[0])
    expect(w.phase).toBe('count')
    expect(w.riders.every((r) => r.pips === PIPS && r.state === 'ride')).toBe(true)
  })
  it('puts last place in front when a grid order is given', () => {
    const w = createWorld({ riders: four(), gridBackToFront: [2, 0, 3, 1] })
    expect(w.riders[2].z).toBeLessThan(w.riders[0].z)
    expect(w.riders[1].z).toBeGreaterThan(w.riders[3].z)
  })
  it('caps the field at four riders and knows every difficulty', () => {
    const w = createWorld({ riders: [...four(), { id: 'e' }] })
    expect(w.riders).toHaveLength(4)
    for (const id of DIFFICULTY_IDS) expect(getDifficulty(id).base).toHaveLength(4)
    expect(getDifficulty('nonsense')).toBe(getDifficulty('normal'))
  })
})

describe('the race clock', () => {
  it('counts down and then says go', () => {
    const w = createWorld({ riders: four() })
    const ev = run(w, 3.5)
    expect(w.phase).toBe('race')
    expect(ev.filter((e) => e.t === 'go')).toHaveLength(1)
  })
  it('lets the shared clock set the time so traffic agrees across phones', () => {
    const w = lab()
    w.cars = [{ z0: 5000, z: 0, x: 0.25, spd: 1000, col: 0, van: false }]
    step(w, {}, DT, 10)
    expect(w.t).toBe(10)
    expect(w.cars[0].z).toBe(5000 + 1000 * 10)
  })
})

describe('riding', () => {
  it('accelerates to top speed and steers', () => {
    const w = lab()
    isolate(w, [0])
    w.track.segs.forEach((q) => { q.curve = 0 })
    w.riders[0].speed = 0
    run(w, 8)
    expect(w.riders[0].speed).toBeGreaterThan(MAXSPD * 0.95)
    run(w, 0.6, { 0: { steer: 1 } })
    expect(w.riders[0].x).toBeGreaterThan(0.3)
  })
  it('caps speed off the tarmac', () => {
    const w = lab()
    isolate(w, [0])
    w.riders[0].x = 1.4
    run(w, 4)
    expect(w.riders[0].speed).toBeLessThanOrEqual(MAXSPD * 0.42 + 1)
  })
  it('wobbles on oil without losing a pip', () => {
    const w = lab()
    isolate(w, [0])
    const r = w.riders[0]
    r.x = 0.25; r.z = 150 * SEG - 40
    w.track.segs[150].spr.push({ k: 'oil', x: 0.25 })
    const ev = run(w, 0.5)
    expect(ev.some((e) => e.t === 'oil')).toBe(true)
    expect(r.pips).toBe(PIPS)
    expect(r.stag).toBeGreaterThan(0)
  })
  it('knocks a rider off on any car, then remounts shielded with full pips', () => {
    const w = lab()
    isolate(w, [0])
    const r = w.riders[0]
    r.z = 20000; r.x = 0.25
    w.cars = [{ z0: 20000, z: 20000, x: 0.25, spd: 0, col: 0, van: false }]
    const ev = run(w, 0.1)
    expect(ev.some((e) => e.t === 'down' && e.why === 'car')).toBe(true)
    run(w, DOWN_T + 0.2)
    expect(r.state).toBe('ride')
    expect(r.shield).toBeGreaterThan(0)
    expect(r.pips).toBe(PIPS)
  })
  it('a shielded rider ignores traffic', () => {
    const w = lab()
    isolate(w, [0])
    const r = w.riders[0]
    r.z = 20000; r.x = 0.25; r.shield = SHIELD
    w.cars = [{ z0: 20000, z: 20000, x: 0.25, spd: 0, col: 0, van: false }]
    const ev = run(w, 0.1)
    expect(ev.some((e) => e.t === 'down')).toBe(false)
  })
})

describe('kicking', () => {
  const pair = (dx = 0.3, dz = 0) => {
    const w = lab()
    isolate(w, [0, 1])
    w.riders[0].z = 30000; w.riders[0].x = 0
    w.riders[1].z = 30000 + dz; w.riders[1].x = dx
    w.riders[1].bot = false
    return w
  }
  it('reaches one lane to the side and about a bike length fore and aft', () => {
    const w = pair(0.3, 100)
    expect(inReach(w.riders[0], w.riders[1], 1)).toBe(true)
    expect(inReach(w.riders[0], w.riders[1], -1)).toBe(false)
    w.riders[1].x = 0.5
    expect(inReach(w.riders[0], w.riders[1], 1)).toBe(false)
    w.riders[1].x = 0.3; w.riders[1].z = 30000 + 400
    expect(inReach(w.riders[0], w.riders[1], 1)).toBe(false)
    expect(kickTarget(w, w.riders[0], 1)).toBe(null)
  })
  it('lands a kick on one frame after the wind-up: shove, stagger, one pip, slower', () => {
    const w = pair()
    const before = w.riders[1].speed
    const ev = run(w, 0.6, { 0: { kick: 1 } })
    const hit = ev.find((e) => e.t === 'hit')
    expect(hit).toMatchObject({ by: 0, to: 1, side: 1 })
    expect(w.riders[1].pips).toBe(PIPS - 1)
    expect(w.riders[1].speed).toBeLessThan(before)
    expect(w.riders[0].hits).toBe(1)
  })
  it('a miss costs a little speed and more balance than a hit', () => {
    const w = pair(0.9)
    const ev = run(w, 0.6, { 0: { kick: 1 } })
    expect(ev.some((e) => e.t === 'miss')).toBe(true)
    expect(w.riders[0].strain).toBeGreaterThan(0)
    expect(STRAIN_MISS).toBeGreaterThan(STRAIN_HIT)
  })
  it('refuses a second kick during the cooldown but buffers a press made just before it ends', () => {
    const w = pair(0.9)
    const r = w.riders[0]
    expect(tryKick(w, r, 1)).toBe(true)
    expect(tryKick(w, r, 1)).toBe(false)
    expect(r.kickCount).toBe(1)
    // Press with 0.1 s of cooldown left: it must still go out.
    run(w, KICK_CD - 0.1)
    const swings0 = r.kickCount
    step(w, { 0: { kick: -1 } }, DT)
    expect(r.kickCount).toBe(swings0)
    run(w, KICK_BUFFER + 0.05)
    expect(r.kickCount).toBe(swings0 + 1)
    expect(r.kickSide).toBe(-1)
  })
  it('a press far inside the cooldown is dropped', () => {
    const w = pair(0.9)
    const r = w.riders[0]
    tryKick(w, r, 1)
    step(w, { 0: { kick: 1 } }, DT)
    run(w, 0.3)
    expect(r.kickCount).toBe(1)
  })
  it('three kicks unseat a rider, and the fall is marked as a kick', () => {
    const w = pair()
    const v = w.riders[1]
    for (let n = 0; n < PIPS; n++) {
      v.sinceHit = 0
      applyHit(w, v, w.riders[0], 1)
      v.hitGuard = 0
    }
    expect(v.state).toBe('down')
    expect(v.lastDownBy).toBe(0)
    expect(w.events.some((e) => e.t === 'down' && e.why === 'kick' && e.by === 0)).toBe(true)
  })
  it('the same attacker cannot take two pips inside a second', () => {
    const w = pair()
    const v = w.riders[1]
    applyHit(w, v, w.riders[0], 1)
    applyHit(w, v, w.riders[0], 1)
    expect(v.pips).toBe(PIPS - 1)
    expect(w.events.filter((e) => e.t === 'hit')[1].soft).toBe(true)
    run(w, SAME_ATTACKER_GUARD + 0.1)
    applyHit(w, v, w.riders[0], 1)
    expect(v.pips).toBe(PIPS - 2)
  })
  it('a different attacker is not guarded', () => {
    const w = pair()
    const v = w.riders[1]
    applyHit(w, v, w.riders[0], 1)
    applyHit(w, v, w.riders[2], 1)
    expect(v.pips).toBe(PIPS - 2)
  })
  it('too many kicks in a row throw the kicker off (four hits are safe, the fifth is not)', () => {
    const w = pair()
    const a = w.riders[0]
    let falls = 0
    for (let n = 1; n <= 6 && a.state === 'ride'; n++) {
      a.x = 0; a.vx = 0; w.riders[1].x = 0.3; w.riders[1].z = a.z; w.riders[1].speed = a.speed; w.riders[1].pips = PIPS; w.riders[1].state = 'ride'; w.riders[1].shield = 0; w.riders[1].hitGuard = 0
      run(w, KICK_CD + 0.05, { 0: { kick: 1 } })
      if (a.state === 'down') falls = n
    }
    expect(falls).toBe(5)
  })
  it('strain drains when you stop kicking', () => {
    const w = pair()
    const a = w.riders[0]
    a.strain = 0.8; a.strainT = 0
    run(w, 4.5)
    expect(a.strain).toBe(0)
  })
  it('a shielded or fallen rider cannot be kicked', () => {
    const w = pair()
    w.riders[1].shield = 1
    expect(inReach(w.riders[0], w.riders[1], 1)).toBe(false)
    w.riders[1].shield = 0; w.riders[1].state = 'down'
    expect(inReach(w.riders[0], w.riders[1], 1)).toBe(false)
  })
})

describe('kicks over the network', () => {
  const setup = () => {
    const w = lab(four({ b: { bot: false }, c: { local: false }, d: { local: false } }))
    isolate(w, [0, 1])
    w.riders[0].z = 40000; w.riders[0].x = 0; w.riders[0].speed = 0
    w.riders[1].z = 40000; w.riders[1].x = 0.3
    w.riders[1].local = false
    return w
  }
  it('sends the kick to the victim instead of judging it, and shows the blow now', () => {
    const w = setup()
    const ev = run(w, 0.6, { 0: { kick: 1 } })
    expect(ev.find((e) => e.t === 'send')).toMatchObject({ kind: 'kick', by: 0, to: 1, side: 1 })
    expect(ev.find((e) => e.t === 'hit')).toMatchObject({ ghost: true })
    expect(w.riders[1].pips).toBe(PIPS) // the ghost's real cost is decided on its own phone
  })
  it('applies a received kick on the local victim', () => {
    const w = lab()
    isolate(w, [0, 1])
    w.riders[0].z = 40000; w.riders[0].x = 0.3
    w.riders[1].z = 40000; w.riders[1].x = 0
    w.riders[1].local = false
    expect(receiveKick(w, 0, 1, -1)).toBe(true)
    expect(w.riders[0].pips).toBe(PIPS - 1)
    expect(w.riders[0].stag).toBeGreaterThan(0)
  })
  it('drops a kick that arrives during the remount shield, and tells the kicker', () => {
    const w = lab()
    isolate(w, [0, 1])
    w.riders[0].z = 40000; w.riders[1].z = 40000; w.riders[1].x = -0.3; w.riders[1].local = false
    w.riders[0].shield = 1
    expect(receiveKick(w, 0, 1, -1)).toBe(false)
    expect(w.riders[0].pips).toBe(PIPS)
    expect(w.events.some((e) => e.t === 'clang')).toBe(true)
  })
  it('drops a forged kick from a rider nowhere near, a bad side, or aimed at a ghost', () => {
    const w = lab()
    isolate(w, [0, 1])
    w.riders[0].z = 40000; w.riders[1].z = 90000; w.riders[1].local = false
    expect(receiveKick(w, 0, 1, 1)).toBe(false)
    w.riders[1].z = 40000
    expect(receiveKick(w, 0, 1, 5)).toBe(false)
    expect(receiveKick(w, 1, 0, 1)).toBe(false)
    expect(receiveKick(w, 9, 0, 1)).toBe(false)
    expect(w.riders[0].pips).toBe(PIPS)
  })
  it('round-trips the wire format of a kick', () => {
    expect(parseKick(kickKey('uid_123', 1))).toEqual({ to: 'uid_123', side: 1 })
    expect(parseKick(kickKey('bot2', -1))).toEqual({ to: 'bot2', side: -1 })
    expect(parseKick('nonsense')).toBe(null)
    expect(parseKick('x|7')).toBe(null)
    expect(parseKick(12)).toBe(null)
  })
})

describe('falling and the catch-up remount', () => {
  it('a rider with someone ahead gets up faster, quicker and with a boost that ends once the gap is closed', () => {
    const w = lab()
    isolate(w, [0, 1])
    const r = w.riders[0]
    r.z = 20000; w.riders[1].z = 21500; w.riders[1].speed = MAXSPD * 0.9
    knockOff(w, r, 'car')
    expect(r.tMax).toBe(DOWN_T_BEHIND)
    expect(r.cuTarget).toBe(1)
    run(w, DOWN_T_BEHIND + 0.05)
    expect(r.state).toBe('ride')
    expect(r.cu).toBeGreaterThan(0)
    expect(r.cu).toBeLessThanOrEqual(CATCHUP_MAX)
    expect(r.speed).toBeGreaterThanOrEqual(MAXSPD * REMOUNT_SPD_BEHIND - 1)
  })
  it('the leader stays down longer and rejoins slowly with no boost', () => {
    const w = lab()
    isolate(w, [0])
    const r = w.riders[0]
    r.z = 2e6
    knockOff(w, r, 'car')
    expect(r.tMax).toBe(DOWN_T)
    run(w, DOWN_T + 0.05)
    expect(r.cu).toBe(0)
    expect(r.speed).toBeLessThan(MAXSPD * (REMOUNT_SPD + 0.1))
  })
  it('the boost cannot be farmed: it ends the moment the gap is what it was', () => {
    const w = lab()
    isolate(w, [0, 1])
    const r = w.riders[0]
    r.z = 20000; w.riders[1].z = 21500; w.riders[1].speed = 0
    knockOff(w, r, 'car')
    run(w, DOWN_T_BEHIND + 0.05)
    run(w, 3)
    expect(r.cu).toBe(0)
  })
})

describe('boost', () => {
  it('burns for about two seconds and refills after a pause', () => {
    const w = lab()
    isolate(w, [0])
    const r = w.riders[0]
    r.boost = 1
    run(w, 2.2, { 0: { boost: true } })
    expect(r.boost).toBe(0)
    expect(r.boosting).toBe(false)
    run(w, 0.5 + 8.3)
    expect(r.boost).toBeGreaterThan(0.95)
  })
  it('needs 15 percent in the tank to light', () => {
    const w = lab()
    isolate(w, [0])
    const r = w.riders[0]
    r.boost = 0.1
    run(w, 0.2, { 0: { boost: true } })
    expect(r.boosting).toBe(false)
  })
})

describe('slipstream', () => {
  it('charges in a rider\'s wake and lifts top speed after half a second', () => {
    const w = lab()
    isolate(w, [0, 1])
    const a = w.riders[0]; const b = w.riders[1]
    a.base = 0.8; b.bot = false
    a.z = 30000; a.x = 0.25; b.z = 30800; b.x = 0.25; b.speed = MAXSPD * 0.8; b.base = 0.8
    run(w, 1.5)
    expect(a.draft).toBeGreaterThan(0.5)
    expect(a.speed).toBeGreaterThan(MAXSPD * 0.8)
  })
})

describe('bots', () => {
  it('race to the line against each other and kick when level', () => {
    const w = createWorld({ riders: four({ a: { bot: true } }), phase: 'race', difficulty: 'hard' })
    let kicks = 0
    for (let i = 0; i < 70 * 60 && w.phase !== 'done'; i++) {
      step(w, {}, DT)
      for (const e of w.events) if (e.t === 'hit') kicks++
      w.events.length = 0
    }
    expect(w.riders.filter((r) => r.done).length).toBeGreaterThanOrEqual(2)
    expect(kicks).toBeGreaterThan(0)
  })
  it('slow down when far ahead of the people, and the band shrinks on harder levels', () => {
    expect(getDifficulty('easy').band).toBeGreaterThan(getDifficulty('hard').band)
  })
  it('is deterministic for a seed', () => {
    const go = () => {
      const w = createWorld({ riders: four({ a: { bot: true } }), phase: 'race', seed: 11, seedRng: 5 })
      for (let i = 0; i < 1800; i++) { step(w, {}, DT); w.events.length = 0 }
      return w.riders.map((r) => Math.round(r.z * 100))
    }
    expect(go()).toEqual(go())
  })
})

describe('ending a race and the cup', () => {
  it('ends when every person is done, 20 s after the first finisher, or at the time limit', () => {
    const w = lab()
    expect(raceShouldEnd(w)).toBe(false)
    w.riders[1].done = true; w.firstFinishAt = 10; w.t = 10 + RACE_END_AFTER_FIRST - 1
    expect(raceShouldEnd(w)).toBe(false)
    w.t = 10 + RACE_END_AFTER_FIRST + 1
    expect(raceShouldEnd(w)).toBe(true)
    const x = lab(); x.t = RACE_MAX + 1
    expect(raceShouldEnd(x)).toBe(true)
    const y = lab(four({ a: { bot: false } })); y.riders[0].done = true
    expect(raceShouldEnd(y)).toBe(true)
  })
  it('finishes, rests the finished rider, and closes the race after the grace', () => {
    const w = lab(four({ a: { bot: false } }))
    isolate(w, [0])
    const r = w.riders[0]
    r.z = w.track.finish - 100
    const ev = run(w, 3)
    expect(ev.some((e) => e.t === 'finish' && e.to === 0)).toBe(true)
    expect(ev.some((e) => e.t === 'results')).toBe(true)
    expect(w.phase).toBe('done')
    expect(r.done).toBe(true)
  })
  it('ranks finishers by time, then the rest by distance', () => {
    const w = lab()
    const [a, b, c, d] = w.riders
    a.done = true; a.time = 50; b.done = true; b.time = 48; c.z = 9000; d.z = 12000
    expect(standings(w)).toEqual([b, a, d, c])
    expect(placeOf(w, a)).toBe(2)
  })
  it('awards 3 / 2 / 1 / 0 and one bonus point for a payback', () => {
    expect(CUP_POINTS).toEqual([3, 2, 1, 0])
    expect(cupAward(['a', 'b', 'c', 'd'])).toEqual({ a: 3, b: 2, c: 1, d: 0 })
    expect(cupAward(['a', 'b', 'c', 'd'], { d: 2 })).toEqual({ a: 3, b: 2, c: 1, d: 1 })
    expect(cupAward(['a', 'b'], { a: 1 })).toEqual({ a: 4, b: 2 })
  })
  it('a payback is a knock-off of the rider who knocked you off', () => {
    const w = lab()
    isolate(w, [0, 1])
    const [a, b] = w.riders
    a.z = b.z = 30000; b.x = 0.3
    // b knocked a off earlier, so a has marked b.
    a.mark = 1
    b.pips = 1
    applyHit(w, b, a, 1)
    expect(b.state).toBe('down')
    expect(a.paybacks).toBe(1)
    expect(a.mark).toBe(-1)
    expect(w.events.some((e) => e.t === 'payback' && e.by === 0 && e.to === 1)).toBe(true)
    expect(b.mark).toBe(0)
  })
})

describe('the wire format', () => {
  it('round-trips a rider through the codec within rounding', () => {
    const w = lab()
    const r = w.riders[0]
    r.z = 12345.6; r.x = -0.4321; r.speed = MAXSPD * 0.7; r.lean = 0.5; r.pips = 2; r.kickCount = 4; r.kickSide = -1
    r.offs = 3; r.lastDownBy = 2; r.hits = 5; r.paybacks = 1; r.boosting = true; r.stag = 0.2
    const raw = encodeRider(r, 1234567)
    for (const v of Object.values(raw)) expect(Number.isInteger(v)).toBe(true)
    const d = decodeRider(raw)
    expect(d.z).toBe(12346)
    expect(d.x).toBeCloseTo(-0.432, 3)
    expect(d.v).toBeCloseTo(0.7, 3)
    expect(d).toMatchObject({ pp: 2, kn: 4, ks: 0, dn: 3, dw: 3, hk: 5, pb: 1, bo: 1, sg: 1, s: 0, fin: 0, at: 1234567 })
  })
  it('marks a finished rider with its time', () => {
    const w = lab()
    w.riders[0].done = true; w.riders[0].time = 51.234
    expect(decodeRider(encodeRider(w.riders[0], 1)).fin).toBe(51234)
  })
  it('sanitises hostile or broken input', () => {
    expect(decodeRider(null)).toBe(null)
    expect(decodeRider([1, 2])).toBe(null)
    expect(decodeRider({ x: 1 })).toBe(null)
    expect(decodeRider({ z: 'abc' })).toBe(null)
    const d = decodeRider({ z: 1e12, x: 99999, v: -5, pp: 77, kn: -3, ln: 500, fin: 'x', at: NaN })
    expect(d.z).toBe(1e7)
    expect(d.x).toBe(2)
    expect(d.v).toBe(0)
    expect(d.pp).toBe(PIPS)
    expect(d.kn).toBe(0)
    expect(d.ln).toBe(1)
    expect(d.fin).toBe(0)
    expect(d.at).toBe(0)
  })
  it('keeps the kicks map alongside normalised stats', () => {
    const s = normalizeStats({ z: 10, k: { 1: 'b|1' } })
    expect(s.k).toEqual({ 1: 'b|1' })
    expect(normalizeStats(undefined)).toBe(null)
  })
})

describe('ghosts', () => {
  const ghostWorld = () => {
    const w = lab(four({ b: { bot: false, local: false } }))
    w.riders[1].bot = false
    return w
  }
  it('places a ghost from its report, carries it forward by the report\'s age and eases it in', () => {
    const w = ghostWorld()
    const g = w.riders[1]
    const snap = decodeRider({ z: 50000, x: 300, v: 800, at: 1000 })
    applyGhost(w, g, snap, 1200)
    expect(g.z).toBeCloseTo(50000 + 0.8 * MAXSPD * 0.2, 0) // first report snaps
    const snap2 = decodeRider({ z: 51000, x: 300, v: 800, at: 1300 })
    applyGhost(w, g, snap2, 1300)
    expect(g.z).toBeGreaterThan(50000)
    expect(g.z).toBeGreaterThanOrEqual(51000)
    expect(g.z).toBeLessThan(51920)
  })
  it('caps extrapolation of a stale report', () => {
    const w = ghostWorld()
    const g = w.riders[1]
    applyGhost(w, g, decodeRider({ z: 1000, x: 0, v: 1000, at: 0 }), 10000)
    expect(g.z).toBeLessThanOrEqual(1000 + MAXSPD * 0.4 + 1)
  })
  it('animates a new swing but not the first sighting of an old one', () => {
    const w = ghostWorld()
    const g = w.riders[1]
    applyGhost(w, g, decodeRider({ z: 1000, x: 0, v: 800, kn: 5, ks: 1, at: 10 }), 20)
    expect(g.kickT).toBe(0)
    applyGhost(w, g, decodeRider({ z: 1100, x: 0, v: 800, kn: 6, ks: 1, at: 110 }), 120)
    expect(g.kickT).toBe(KICK_T)
    expect(g.kickSide).toBe(1)
  })
  it('follows a fall and a recovery', () => {
    const w = ghostWorld()
    const g = w.riders[1]
    applyGhost(w, g, decodeRider({ z: 1000, x: 0, v: 800, at: 10 }), 20)
    applyGhost(w, g, decodeRider({ z: 1000, x: 0, v: 0, s: 1, dn: 1, at: 110 }), 120)
    expect(g.state).toBe('down')
    expect(g.t).toBeGreaterThan(0)
    applyGhost(w, g, decodeRider({ z: 1100, x: 0, v: 300, s: 0, dn: 1, at: 2200 }), 2210)
    expect(g.state).toBe('ride')
  })
  it('credits a payback when the ghost I kicked off had knocked me off', () => {
    const w = ghostWorld()
    const me = w.riders[0]
    const g = w.riders[1]
    me.mark = 1
    applyGhost(w, g, decodeRider({ z: 1000, x: 0, v: 800, dn: 0, at: 10 }), 20, 0)
    applyGhost(w, g, decodeRider({ z: 1100, x: 0, v: 0, s: 1, dn: 1, dw: 1, at: 110 }), 120, 0)
    expect(me.paybacks).toBe(1)
    expect(w.events.some((e) => e.t === 'payback')).toBe(true)
  })
  it('does not credit a payback for a stranger\'s knock-off', () => {
    const w = ghostWorld()
    const me = w.riders[0]
    const g = w.riders[1]
    me.mark = 2
    applyGhost(w, g, decodeRider({ z: 1000, x: 0, v: 800, dn: 0, at: 10 }), 20, 0)
    applyGhost(w, g, decodeRider({ z: 1100, x: 0, v: 0, s: 1, dn: 1, dw: 1, at: 110 }), 120, 0)
    expect(me.paybacks).toBe(0)
  })
  it('does not step a ghost with the rider sim (it only settles its springs)', () => {
    const w = ghostWorld()
    const g = w.riders[1]
    g.z = 5000; g.speed = MAXSPD
    run(w, 1)
    expect(g.z).toBe(5000)
  })
  it('hands a bot to a new coordinator and back', () => {
    const w = lab(four({ b: { local: false } }))
    const b = w.riders[1]
    expect(b.local).toBe(false)
    promoteBot(b)
    expect(b.local).toBe(true)
    demoteBot(b)
    expect(b.local).toBe(false)
    expect(b.netAt).toBe(0)
  })
})

describe('race entries for the room', () => {
  it('ranks a finisher by time and a rider still going by distance, and a missing report last', () => {
    const fin = raceEntry({ z: 1e5, fin: 50000 })
    const slow = raceEntry({ z: 1e5, fin: 51000 })
    const far = raceEntry({ z: 90000 })
    const near = raceEntry({ z: 40000 })
    expect(fin.sortKey).toEqual([0, 50000])
    expect(fin.sortKey[1]).toBeLessThan(slow.sortKey[1])
    expect(far.sortKey[0]).toBe(1)
    expect(far.sortKey[1]).toBeLessThan(near.sortKey[1])
    expect(raceEntry(null).sortKey).toBe(null)
    expect(raceIsDone({ z: 1, fin: 1 })).toBe(true)
    expect(raceIsDone({ z: 1 })).toBe(false)
  })
  it('formats times', () => {
    expect(formatRaceTime(61.5)).toBe('1:01.50')
    expect(formatRaceTime(9.05)).toBe('0:09.05')
    expect(formatRaceTime(NaN)).toBe('-:--.--')
  })
})
