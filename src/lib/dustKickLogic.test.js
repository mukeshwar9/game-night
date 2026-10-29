import { describe, it, expect } from 'vitest'
import {
  SEG, MAXSPD, LANEX, DT, PIPS, STAGGER, TRACK_SEED, DUST_TRACKS, DUST_TRACK_ORDER, dustTrackForRace, createWorld, buildTrack, step, tryKick, tryBoost,
  tryLasso, receiveLasso, receiveKick, applyHit, encodeRider, decodeRider, applyGhost, parseKick, kickKey, roundTrack, trackLength, lassoTarget, segAt, RACE_MAX,
} from './sideKickLogic'
import {
  DUST_ORDER, DUST_KICK_SLOW, SPOOK_T, SPOOK_TOP, KICK_FILL, HAY_FILL, HAY_SURGE_T, LASSO_WIND, LASSO_RANGE_Z, ROPED_T, ROPED_TOP, REEL_T, REEL_TOP,
  WEED_SLOW, WEED_WOBBLE, ROCK_SLOW, CACTUS_SLOW, LOG_SIGN_SEGS, COILS_PER_RACE, tri, weedAt, lassoKey,
} from './dustKickLogic'

const four = () => [
  { id: 'a', name: 'AAA' },
  { id: 'b', name: 'BBB', bot: true },
  { id: 'c', name: 'CCC', bot: true },
  { id: 'd', name: 'DDD', bot: true },
]
/** An empty canyon: no scenery or hazards, so a test places exactly what it needs. */
function lab(opts = {}) {
  const w = createWorld({ riders: four(), phase: 'race', dust: true, trackId: 'canyon', ...opts })
  for (const s of w.track.segs) s.spr = []
  w.track.hay = []; w.track.haz = []; w.weeds = []
  flat(w)
  w.riders.forEach((r, i) => { r.speed = MAXSPD * 0.8; if (i) { r.bot = false; r.z = 1e6 + i * 1e5 } })
  return w
}
/** A dead-straight, level road: a test controls every contact. */
const flat = (w) => { for (const s of w.track.segs) { s.curve = 0; s.y1 = 0; s.y2 = 0 } }
const run = (w, secs, inputs = {}) => {
  const out = []
  for (let i = 0; i < Math.round(secs / DT); i++) {
    step(w, inputs, DT)
    out.push(...w.events)
    w.events.length = 0
  }
  return out
}
const put = (w, z, spr) => segAt(w.track, z).spr.push(spr)
const kinds = (ev) => ev.map((e) => e.t)

describe('the Western roads', () => {
  it('names the cup order and the three looks', () => {
    expect(DUST_ORDER).toEqual(['canyon', 'prairie', 'town'])
    expect(DUST_TRACK_ORDER).toEqual(DUST_ORDER)
    expect(Object.keys(DUST_TRACKS)).toEqual(DUST_ORDER)
    expect([0, 1, 2, 3, -1].map(dustTrackForRace)).toEqual(['canyon', 'prairie', 'town', 'canyon', 'town'])
  })

  it('SIDE KICK is untouched: no dust flag, no weeds, its own roads', () => {
    const w = createWorld({ riders: four(), phase: 'race' })
    expect(w.dust).toBe(false)
    expect(w.weeds).toEqual([])
    expect(w.cars.length).toBeGreaterThan(0)
    expect(buildTrack(TRACK_SEED, 'meadow').dust).toBeUndefined()
  })

  it.each(DUST_ORDER)('%s grows the same road every time, with no traffic', (id) => {
    const a = buildTrack(TRACK_SEED, id)
    const b = buildTrack(TRACK_SEED, id)
    expect(a.dust).toBe(true)
    expect(a.cars).toEqual([])
    expect(JSON.stringify(a.segs.map((s) => s.spr))).toBe(JSON.stringify(b.segs.map((s) => s.spr)))
    expect(a.weeds).toEqual(b.weeds)
  })

  it.each(DUST_ORDER)('%s places the obstacles in tiers, signs the logs and keeps hay off the bends', (id) => {
    const t = buildTrack(TRACK_SEED, id)
    const all = t.segs.flatMap((s) => s.spr.map((q) => ({ ...q, i: s.i, curve: s.curve })))
    const count = (k) => all.filter((q) => q.k === k)
    expect(t.weeds.length).toBeGreaterThanOrEqual(8)
    expect(t.weeds.length).toBeLessThanOrEqual(10)
    expect(count('oil').length).toBeGreaterThanOrEqual(2)
    expect(count('oil').length).toBeLessThanOrEqual(5)
    expect(count('rock').length).toBeGreaterThanOrEqual(3)
    expect(count('rock').length).toBeLessThanOrEqual(6)
    const logs = count('log')
    expect(logs.length).toBeGreaterThanOrEqual(1)
    expect(logs.length).toBeLessThanOrEqual(3)
    for (const l of logs) {
      expect(Math.abs(l.curve)).toBeLessThan(0.4)
      expect(count('sign').some((s) => s.i === Math.max(5, l.i - LOG_SIGN_SEGS))).toBe(true)
    }
    expect(count('cactus').every((q) => Math.abs(q.x) > 0.9)).toBe(true)
    for (const h of count('hay')) {
      expect(Math.abs(h.curve)).toBeLessThanOrEqual(1.5)
      expect(LANEX).toContain(h.x)
    }
    expect(count('hay').length).toBeGreaterThan(20)
    expect(count('coil').length).toBe(COILS_PER_RACE)
    expect(new Set(count('hay').map((q) => q.id)).size).toBe(count('hay').length)
  })

  it('a tumbleweed is a pure function of race time, rolling to and fro across the trail', () => {
    expect(tri(-1)).toBe(-1)
    expect(tri(1)).toBe(1)
    expect(tri(3)).toBe(-1)
    expect(tri(0)).toBe(0)
    const w = { z0: 5000, x0: 0.3, dir: 1, spd: 0.5 }
    expect(weedAt(w, 4)).toEqual(weedAt(w, 4))
    for (let t = 0; t < 40; t += 0.37) expect(Math.abs(weedAt(w, t).x)).toBeLessThanOrEqual(1)
    expect(weedAt(w, 10).z).toBeGreaterThan(weedAt(w, 0).z)
  })

  it('roundTrack and trackLength know the Western roads', () => {
    expect(roundTrack('prairie', true)).toBe('prairie')
    expect(roundTrack('meadow', true)).toBe('canyon')
    expect(roundTrack('canyon')).toBe('meadow')
    expect(trackLength('town')).toBe(buildTrack(TRACK_SEED, 'town').finish)
  })
})

describe('the kick: slows, spooks, fills the spurs', () => {
  it('a kick in the west takes 25% of the speed, spooks the horse and still counts a pip', () => {
    const w = lab()
    const [a, b] = w.riders
    b.local = true; b.z = a.z; b.x = a.x + 0.25; b.speed = MAXSPD * 0.8
    applyHit(w, b, a, 1)
    expect(b.speed).toBeCloseTo(MAXSPD * 0.8 * DUST_KICK_SLOW)
    expect(b.spook).toBe(SPOOK_T)
    expect(b.pips).toBe(PIPS - 1)
    expect(b.stag).toBe(STAGGER)
  })

  it('in SIDE KICK a kick is still x0.82 and never spooks', () => {
    const w = createWorld({ riders: four(), phase: 'race' })
    const [a, b] = w.riders
    b.speed = MAXSPD
    applyHit(w, b, a, 1)
    expect(b.speed).toBeCloseTo(MAXSPD * 0.82)
    expect(b.spook).toBe(0)
  })

  it('a spooked horse tops out at 85% for 0.8 s', () => {
    const w = lab()
    const a = w.riders[0]
    a.spook = SPOOK_T
    a.speed = MAXSPD
    run(w, 0.5)
    expect(a.speed).toBeLessThanOrEqual(MAXSPD * SPOOK_TOP + 1)
    run(w, 1.5)
    expect(a.spook).toBe(0)
  })

  it('a landed kick adds 0.20 to the kicker\'s meter at once, a whiff adds nothing', () => {
    const w = lab()
    const [a, b] = w.riders
    b.local = true; b.z = a.z; b.x = a.x + 0.25; b.speed = a.speed
    expect(tryKick(w, a, 1)).toBe(true)
    const ev = run(w, 0.2)
    expect(kinds(ev)).toContain('spurs')
    expect(a.boost).toBeCloseTo(KICK_FILL)
    const w2 = lab()
    expect(tryKick(w2, w2.riders[0], 1)).toBe(true)
    run(w2, 0.2)
    expect(w2.riders[0].boost).toBe(0)
  })

  it('a kick to a ghost fills the meter on the kicker\'s phone and still sends the blow', () => {
    const w = lab()
    const [a, b] = w.riders
    b.local = false; b.z = a.z; b.x = a.x + 0.25
    a.speed = 0
    tryKick(w, a, 1)
    const ev = run(w, 0.2)
    expect(a.boost).toBeCloseTo(KICK_FILL)
    expect(ev.find((e) => e.t === 'send')).toMatchObject({ kind: 'kick', by: 0, to: 1, side: 1 })
  })

  it('three kicks still throw the rider', () => {
    const w = lab()
    const [a, b] = w.riders
    b.local = true
    for (let n = 0; n < 3; n++) { b.sinceHit = 0; b.hitGuard = 0; b.lastHitBy = -1; applyHit(w, b, a, 1) }
    expect(b.state).toBe('down')
  })
})

describe('hay and the spurs', () => {
  it('a bale fills a third of the meter and gives a short surge, once', () => {
    const w = lab()
    const a = w.riders[0]
    a.z = 100 * SEG; a.x = LANEX[1]
    put(w, a.z + 3 * SEG, { k: 'hay', x: LANEX[1], id: 7 })
    const ev = run(w, 0.6)
    expect(kinds(ev)).toContain('hay')
    expect(a.boost).toBeCloseTo(HAY_FILL, 2)
    expect(a.got.has(7)).toBe(true)
    expect(a.surge).toBeLessThanOrEqual(HAY_SURGE_T)
    a.z = 100 * SEG
    run(w, 0.6)
    expect(a.boost).toBeCloseTo(HAY_FILL, 2)
  })

  it('three bales fill the meter and the tap spends it as a speed burst', () => {
    const w = lab()
    const a = w.riders[0]
    a.z = 100 * SEG; a.x = LANEX[2]
    for (let k = 0; k < 3; k++) put(w, a.z + (3 + k * 4) * SEG, { k: 'hay', x: LANEX[2], id: 10 + k })
    run(w, 1.5)
    expect(a.boost).toBeCloseTo(1, 1)
    expect(tryBoost(w, a)).toBe(true)
    expect(a.boosting).toBe(true)
  })

  it('hay is personal: every rider can take the same bale', () => {
    const w = lab()
    const [a, b] = w.riders
    for (const r of [a, b]) { r.local = true; r.z = 100 * SEG; r.x = LANEX[0] }
    b.x = LANEX[0] + 0.02
    put(w, a.z + 3 * SEG, { k: 'hay', x: LANEX[0], id: 5 })
    run(w, 0.6)
    expect(a.got.has(5) && b.got.has(5)).toBe(true)
    expect(a.boost).toBeGreaterThan(0)
    expect(b.boost).toBeGreaterThan(0)
  })

  it('a bale out of reach in the next lane is not taken', () => {
    const w = lab()
    const a = w.riders[0]
    a.z = 100 * SEG; a.x = LANEX[0]
    put(w, a.z + 3 * SEG, { k: 'hay', x: LANEX[3], id: 8 })
    run(w, 0.6)
    expect(a.boost).toBe(0)
  })

  it('a fast rider cannot skip a bale between two steps', () => {
    const w = lab()
    const a = w.riders[0]
    a.z = 100 * SEG; a.x = LANEX[1]; a.boosting = true; a.boostT = 5; a.boostLen = 5
    a.speed = MAXSPD * 1.3
    expect(a.speed * DT).toBeGreaterThan(SEG)
    for (let k = 1; k <= 6; k++) put(w, a.z + k * SEG, { k: 'hay', x: LANEX[1], id: 100 + k })
    run(w, 0.3)
    expect(a.got.size).toBeGreaterThanOrEqual(5)
  })
})

describe('mud, rocks, cactus, logs and tumbleweeds', () => {
  const at = (w, spr, lane = 1) => {
    const a = w.riders[0]
    a.z = 100 * SEG; a.x = LANEX[lane]
    put(w, a.z + 3 * SEG, { ...spr, x: spr.x ?? LANEX[lane] })
    return a
  }

  it('mud is today\'s oil: slows and wanders, never a pip', () => {
    const w = lab()
    const a = at(w, { k: 'oil' })
    const ev = run(w, 0.4)
    expect(kinds(ev)).toContain('oil')
    expect(a.oil).toBeGreaterThan(0)
    expect(a.pips).toBe(PIPS)
  })

  it('a rock costs speed, a stagger and one horseshoe, but never the last or a fall', () => {
    const w = lab()
    const a = at(w, { k: 'rock' })
    const before = a.speed
    const ev = run(w, 0.3)
    expect(kinds(ev)).toContain('rock')
    expect(a.speed).toBeLessThan(before * ROCK_SLOW + 400)
    expect(a.pips).toBe(PIPS - 1)
    expect(a.state).toBe('ride')
    const w2 = lab()
    const b = at(w2, { k: 'rock' })
    b.pips = 1
    run(w2, 0.3)
    expect(b.pips).toBe(1)
    expect(b.state).toBe('ride')
  })

  it('a cactus on the edge costs a horseshoe and nudges the rider back onto the trail', () => {
    const w = lab()
    const a = at(w, { k: 'cactus', x: 0.95 }, 3)
    a.x = 0.9
    const ev = run(w, 0.5)
    expect(kinds(ev)).toContain('cactus')
    expect(a.pips).toBe(PIPS - 1)
    expect(a.x).toBeLessThan(0.9)
    expect(CACTUS_SLOW).toBeLessThan(1)
  })

  it('a log across two lanes throws the rider off', () => {
    const w = lab()
    const a = at(w, { k: 'log', x: 0 }, 1)
    const ev = run(w, 0.4)
    expect(ev.find((e) => e.t === 'down')).toMatchObject({ to: 0, why: 'log' })
    expect(a.state).toBe('down')
  })

  it('the log covers both lanes beside its middle but not the far one', () => {
    const w = lab()
    const a = at(w, { k: 'log', x: -0.5 }, 0)
    run(w, 0.4)
    expect(a.state).toBe('down')
    const w2 = lab()
    const b = at(w2, { k: 'log', x: -0.5 }, 3)
    run(w2, 0.4)
    expect(b.state).toBe('ride')
  })

  it('a remount shield ignores every hazard but still takes hay', () => {
    const w = lab()
    const a = at(w, { k: 'log', x: 0 }, 1)
    a.shield = 3
    put(w, a.z + 4 * SEG, { k: 'hay', x: LANEX[1], id: 3 })
    run(w, 0.6)
    expect(a.state).toBe('ride')
    expect(a.got.has(3)).toBe(true)
  })

  it('a tumbleweed costs 10% of the speed and a wobble, once per pass, never a pip', () => {
    const w = lab()
    const a = w.riders[0]
    a.z = 100 * SEG; a.x = 0.25
    w.weeds = [{ z0: a.z + 600, z: 0, x: 0, x0: 0.25, dir: 1, spd: 0, spin: 0 }]
    const before = a.speed
    const ev = []
    let hitSpeed = 0
    let hitWob = 0
    for (let i = 0; i < 30; i++) {
      step(w, {}, DT)
      if (w.events.some((e) => e.t === 'weed') && !hitSpeed) { hitSpeed = a.speed; hitWob = a.wob }
      ev.push(...w.events); w.events.length = 0
    }
    expect(ev.filter((e) => e.t === 'weed')).toHaveLength(1)
    expect(hitSpeed).toBeLessThan(before * (WEED_SLOW + 0.03))
    expect(hitSpeed).toBeGreaterThan(before * (WEED_SLOW - 0.03))
    expect(hitWob).toBeGreaterThan(0)
    expect(hitWob).toBeLessThanOrEqual(WEED_WOBBLE)
    expect(a.pips).toBe(PIPS)
  })

  it('a tumbleweed far across the trail misses', () => {
    const w = lab()
    const a = w.riders[0]
    a.z = 100 * SEG; a.x = -0.75
    w.weeds = [{ z0: a.z + 600, z: 0, x: 0, x0: 0.75, dir: 1, spd: 0, spin: 0 }]
    expect(run(w, 0.6).some((e) => e.t === 'weed')).toBe(false)
  })
})

describe('the lasso', () => {
  const setup = () => {
    const w = lab()
    const [a, b] = w.riders
    a.z = 100 * SEG; a.x = LANEX[1]; a.rope = 1
    b.local = true; b.z = a.z + 800; b.x = LANEX[1] + 0.2; b.speed = MAXSPD * 0.8
    return { w, a, b }
  }

  it('needs a coil in hand, and only picks one up from a post', () => {
    const w = lab()
    const a = w.riders[0]
    expect(tryLasso(w, a)).toBe(false)
    a.z = 100 * SEG; a.x = 0.9
    put(w, a.z + 3 * SEG, { k: 'coil', x: 0.9, id: 1e6 + 1 })
    expect(kinds(run(w, 0.6))).toContain('coil')
    expect(a.rope).toBe(1)
  })

  it('holds at most one coil: a second one stays on its post', () => {
    const w = lab()
    const a = w.riders[0]
    a.z = 100 * SEG; a.x = 0.9; a.rope = 1
    put(w, a.z + 3 * SEG, { k: 'coil', x: 0.9, id: 1e6 + 2 })
    run(w, 0.6)
    expect(a.got.has(1e6 + 2)).toBe(false)
  })

  it('winds up for 0.3 s that everyone can see, then ropes the nearest rider ahead', () => {
    const { w, a, b } = setup()
    expect(tryLasso(w, a)).toBe(true)
    expect(a.rope).toBe(0)
    expect(a.lassoT).toBeCloseTo(LASSO_WIND)
    expect(encodeRider(a, 1).ks).toBe(2)
    run(w, LASSO_WIND - 0.1)
    expect(b.roped).toBe(0)
    const ev = run(w, 0.2)
    expect(ev.find((e) => e.t === 'roped')).toMatchObject({ by: 0, to: 1 })
    expect(b.roped).toBeGreaterThan(0)
    expect(b.roped).toBeLessThanOrEqual(ROPED_T)
    expect(a.reel).toBeGreaterThan(0)
    expect(a.reel).toBeLessThanOrEqual(REEL_T)
  })

  it('the caught rider is held to 70% and the thrower reels in at 112%', () => {
    const { w, a, b } = setup()
    b.base = 1; a.base = 1
    tryLasso(w, a)
    run(w, LASSO_WIND + 0.05)
    run(w, 1)
    expect(b.speed).toBeLessThanOrEqual(MAXSPD * ROPED_TOP + 1)
    expect(a.speed).toBeGreaterThan(MAXSPD * 0.95)
    expect(a.speed).toBeLessThanOrEqual(MAXSPD * REEL_TOP + 1)
    run(w, 1.5)
    expect(b.roped).toBe(0)
    expect(a.reel).toBe(0)
  })

  it('aims itself at the nearest rider ahead, within 1400 and 0.55 lanes; nobody behind', () => {
    const w = lab()
    const [a, b, c, d] = w.riders
    a.z = 100 * SEG; a.x = LANEX[1]; a.rope = 1
    b.z = a.z + 1000; b.x = a.x + 0.3
    c.z = a.z + 500; c.x = a.x - 0.3
    d.z = a.z - 300; d.x = a.x
    expect(lassoTarget(w, a)).toBe(c)
    c.x = a.x + 0.9
    expect(lassoTarget(w, a)).toBe(b)
    b.z = a.z + LASSO_RANGE_Z + 100
    expect(lassoTarget(w, a)).toBe(null)
    b.z = a.z + 500; b.shield = 1
    expect(lassoTarget(w, a)).toBe(null)
    b.shield = 0; b.state = 'down'
    expect(lassoTarget(w, a)).toBe(null)
  })

  it('a throw with nobody in range is a miss and the coil is spent', () => {
    const w = lab()
    const a = w.riders[0]
    a.rope = 1
    expect(tryLasso(w, a)).toBe(true)
    const ev = run(w, LASSO_WIND + 0.1)
    expect(kinds(ev)).toContain('lassomiss')
    expect(a.rope).toBe(0)
    expect(a.reel).toBe(0)
  })

  it('cannot kick while the rope winds up, and cannot throw mid-kick or when down', () => {
    const { w, a } = setup()
    tryLasso(w, a)
    expect(tryKick(w, a, 1)).toBe(false)
    const { w: w2, a: a2 } = setup()
    expect(tryKick(w2, a2, 1)).toBe(true)
    expect(tryLasso(w2, a2)).toBe(false)
    const { w: w3, a: a3 } = setup()
    a3.state = 'down'
    expect(tryLasso(w3, a3)).toBe(false)
  })

  it('a fall during the wind-up cancels the throw', () => {
    const { w, a, b } = setup()
    tryLasso(w, a)
    run(w, 0.1)
    w.events.length = 0
    a.state = 'ride'
    for (let n = 0; n < 3; n++) { a.hitGuard = 0; a.lastHitBy = -1; applyHit(w, a, b, 1) }
    expect(a.state).toBe('down')
    expect(a.lassoT).toBe(0)
    run(w, 0.5)
    expect(b.roped).toBe(0)
  })

  it('to a ghost it is sent as `victim|L` under one shared action counter with kicks', () => {
    const { w, a, b } = setup()
    b.local = false
    expect(tryKick(w, a, 1)).toBe(true)
    run(w, 0.5)
    expect(a.kickCount).toBe(1)
    a.rope = 1; a.cd = 0
    b.z = a.z + 800
    a.base = 0.02; a.speed = 100   // a ghost stands still, so the thrower must not ride past it during the wind-up
    tryLasso(w, a)
    expect(a.kickCount).toBe(2)
    const ev = run(w, LASSO_WIND + 0.1)
    const send = ev.find((e) => e.t === 'send' && e.kind === 'lasso')
    expect(send).toMatchObject({ by: 0, to: 1, n: 2 })
    expect(a.reel).toBeGreaterThan(0)
    a.cd = 0
    tryKick(w, a, -1)
    expect(a.kickCount).toBe(3)
  })

  it('the wire: a lasso key parses, kicks still do, junk does not', () => {
    expect(lassoKey('bob')).toBe('bob|L')
    expect(parseKick('bob|L')).toEqual({ to: 'bob', side: 0, lasso: true })
    expect(parseKick(kickKey('bob', 1))).toEqual({ to: 'bob', side: 1 })
    expect(parseKick('bob|2')).toBe(null)
    expect(parseKick('|L')).toBe(null)
    expect(parseKick(7)).toBe(null)
  })

  it('receiving a lasso ropes a rider that is ahead of the thrower and in range', () => {
    const { w, a, b } = setup()
    a.local = false
    expect(receiveLasso(w, 1, 0)).toBe(true)
    expect(b.roped).toBe(ROPED_T)
    expect(kinds(w.events)).toContain('roped')
  })

  it('a shielded, fallen or finished rider slips the loop and the thrower sees a clang', () => {
    for (const patch of [{ shield: 1 }, { state: 'down' }, { done: true }]) {
      const { w, a, b } = setup()
      a.local = false
      Object.assign(b, patch)
      expect(receiveLasso(w, 1, 0)).toBe(false)
      expect(b.roped).toBe(0)
      expect(w.events.some((e) => e.t === 'clang')).toBe(true)
    }
  })

  it('a forged lasso from far away, from the side or in a SIDE KICK room does nothing', () => {
    const { w, a, b } = setup()
    a.local = false
    a.z = b.z - LASSO_RANGE_Z * 4
    expect(receiveLasso(w, 1, 0)).toBe(false)
    a.z = b.z - 500; a.x = b.x + 3
    expect(receiveLasso(w, 1, 0)).toBe(false)
    a.x = b.x
    w.dust = false
    expect(receiveLasso(w, 1, 0)).toBe(false)
    expect(b.roped).toBe(0)
    expect(receiveKick).toBeTypeOf('function')
  })

  it('travels in the report: the roped flag, the lasso action, and a ghost shows the wind-up', () => {
    const { w, a, b } = setup()
    b.roped = 1
    const snap = decodeRider(encodeRider(b, 5000))
    expect(snap.ro).toBe(1)
    expect(decodeRider(encodeRider(a, 5000)).ro).toBe(0)
    tryLasso(w, a)
    const lasso = decodeRider(encodeRider(a, 6000))
    expect(lasso.ks).toBe(2)
    expect(lasso.kn).toBe(1)
    const w2 = lab()
    const ghost = w2.riders[1]
    ghost.local = false
    applyGhost(w2, ghost, { ...lasso, z: 5000, x: 0, at: 1 }, 1, 0)
    applyGhost(w2, ghost, { ...lasso, kn: 2, z: 5000, x: 0, at: 2 }, 2, 0)
    expect(ghost.lassoT).toBeCloseTo(LASSO_WIND)
    expect(ghost.kickT).toBe(0)
    applyGhost(w2, ghost, { ...snap, kn: 2, ks: 1, z: 5000, x: 0, at: 3 }, 3, 0)
    expect(ghost.roped).toBeGreaterThan(0)
  })

  it('SIDE KICK reports still read ks as 0 or 1', () => {
    expect(decodeRider({ z: 5, ks: 1 }).ks).toBe(1)
    expect(decodeRider({ z: 5, ks: 0 }).ks).toBe(0)
    expect(decodeRider({ z: 5, ks: 7 }).ks).toBe(1)
    expect(decodeRider({ z: 5 }).ro).toBe(0)
  })
})

describe('bots in the west', () => {
  it('a bot steers off a log ahead of it and never rides into it', () => {
    const w = createWorld({ riders: four(), phase: 'race', dust: true, trackId: 'canyon' })
    for (const s of w.track.segs) s.spr = []
    flat(w)
    w.track.hay = []; w.weeds = []
    const bot = w.riders[1]
    bot.z = 200 * SEG; bot.x = 0.25; bot.tx = 0.25; bot.speed = MAXSPD * 0.9
    w.riders.forEach((r, i) => { if (i !== 1) { r.z = 1e6 + i * 1e5; r.bot = false } })
    put(w, bot.z + 25 * SEG, { k: 'log', x: 0 })
    w.track.haz = [{ k: 'log', z: bot.z + 25 * SEG + SEG / 2, x: 0, hw: 0.36 }]
    const ev = run(w, 3)
    expect(ev.some((e) => e.t === 'down' && e.to === 1)).toBe(false)
    expect(Math.abs(bot.x)).toBeGreaterThan(0.4)
  })

  it('a bot goes for hay, takes it and picks up a coil when its hand is empty', () => {
    const w = createWorld({ riders: four(), phase: 'race', dust: true, trackId: 'canyon' })
    for (const s of w.track.segs) s.spr = []
    flat(w)
    w.track.haz = []; w.weeds = []
    const bot = w.riders[1]
    bot.z = 200 * SEG; bot.x = 0.25; bot.tx = 0.25; bot.speed = MAXSPD * 0.9
    w.riders.forEach((r, i) => { if (i !== 1) { r.z = 1e6 + i * 1e5; r.bot = false } })
    const hay = { k: 'hay', x: -0.25, id: 41 }
    const coil = { k: 'coil', x: -0.25, id: 1e6 + 9 }
    put(w, bot.z + 25 * SEG, hay)
    put(w, bot.z + 55 * SEG, coil)
    w.track.hay = [{ ...hay, z: bot.z + 25 * SEG + SEG / 2 }, { ...coil, z: bot.z + 55 * SEG + SEG / 2 }]
    run(w, 6)
    expect(bot.got.has(41)).toBe(true)
    expect(bot.got.has(1e6 + 9)).toBe(true)
  })

  it('a bot with a rope throws it at a rider ahead', () => {
    const w = lab()
    const [a, b] = w.riders
    w.riders.forEach((r) => { r.bot = false })
    b.bot = true; b.local = true; b.rope = 1; b.z = 200 * SEG; b.x = 0.25; b.aggr = 1.3
    a.z = b.z + 900; a.x = 0.25; a.local = true
    const ev = run(w, 4)
    expect(kinds(ev)).toContain('lasso')
  })

  it('four bots finish a full canyon race without a stall', () => {
    for (const id of DUST_ORDER) {
      const w = createWorld({ riders: four().map((r) => ({ ...r, bot: true })), phase: 'race', dust: true, trackId: id })
      run(w, RACE_MAX + 10)
      expect(w.riders.filter((r) => r.done).length).toBeGreaterThanOrEqual(3)
      for (const r of w.riders) expect(Number.isFinite(r.z) && Number.isFinite(r.speed)).toBe(true)
    }
  })
})
