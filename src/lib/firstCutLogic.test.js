import { describe, expect, it } from 'vitest'
import {
  BOTS, DEFAULT_FC_CONFIG, FC_BEAT_MS, FC_FLIP_EVERY, FC_GOLD_MS, FC_GOLD_POINTS, FC_MAX_DRY, FC_ONLINE_TARGET,
  FC_PACES, FC_REPORT_SLACK_MS, FC_SETTLE_MS, FC_TARGET, ITEMS, RULES,
  averageMs, botTapAt, classifyTap, describeFcConfig, entryAt, fcDecided, fcRaceEntry, fcRow, freeIndexAfter,
  indexAt, isValidFcConfig, itemDef, katanaPhase, normalizeFcConfig, normalizeReports, receipt, resolveFromRound,
  resolveRound, ruleDef,
} from './firstCutLogic'
import { mulberry32 } from './detMath'

const PLAIN = DEFAULT_FC_CONFIG
const FLIP = { ...PLAIN, flip: true }
const GOLD = { ...PLAIN, gold: true }

/** The first index at or after `from` whose entry matches `pred`. */
function find(seed, cfg, pred, from = 0, max = 400) {
  for (let i = from; i < from + max; i++) if (pred(entryAt(seed, cfg, i))) return i
  throw new Error('no entry found')
}
const fruitAt = (seed, cfg, from = 0) => find(seed, cfg, e => e.hit, from)
const twinAt = (seed, cfg, from = 0) => find(seed, cfg, e => e.kind === 'item' && !e.hit && !e.rotten, from)

describe('items and rules', () => {
  it('has four fruit and four lookalikes that point at each other', () => {
    expect(ITEMS.filter(i => i.fruit)).toHaveLength(4)
    expect(ITEMS.filter(i => !i.fruit)).toHaveLength(4)
    for (const it of ITEMS) {
      const twin = itemDef(it.twin)
      expect(twin?.twin).toBe(it.id)
      expect(twin?.fruit).toBe(!it.fruit)
      expect(twin?.color).toBe(it.color)
    }
  })

  it('RULE FLIP rules only ever allow fruit', () => {
    for (const r of RULES) for (const it of ITEMS) if (r.ok(it)) expect(it.fruit).toBe(true)
    expect(ruleDef('citrus').ok(itemDef('lemon'))).toBe(true)
    expect(ruleDef('citrus').ok(itemDef('apple'))).toBe(false)
    expect(ruleDef('nocitrus').ok(itemDef('melon'))).toBe(true)
    expect(ruleDef('redgreen').ok(itemDef('orange'))).toBe(false)
    expect(ruleDef('nope').id).toBe('any')
  })
})

describe('config', () => {
  it('normalizes whatever the room holds', () => {
    expect(normalizeFcConfig(null)).toEqual(PLAIN)
    expect(normalizeFcConfig({ flip: true, gold: 'yes', pace: 'medium', extra: 1 })).toEqual({ version: 1, flip: true, gold: false, pace: 'medium' })
    expect(normalizeFcConfig({ pace: 'warp' }).pace).toBe('slow')
  })

  it('validates exactly the stored shape', () => {
    expect(isValidFcConfig(PLAIN)).toBe(true)
    expect(isValidFcConfig({ ...PLAIN, extra: 1 })).toBe(false)
    expect(isValidFcConfig({ ...PLAIN, pace: 'fast' })).toBe(false)
    expect(isValidFcConfig(null)).toBe(false)
  })

  it('describes the twists', () => {
    expect(describeFcConfig(PLAIN)).toBe('PLAIN · SLOW PACE')
    expect(describeFcConfig({ flip: true, gold: true, pace: 'medium' })).toBe('RULE FLIP + GOLD & ROTTEN · MEDIUM PACE')
  })
})

describe('the timetable', () => {
  it('is the same for everyone with the same seed and config', () => {
    for (let i = 0; i < 60; i++) expect(entryAt(31337, FLIP, i)).toEqual(entryAt(31337, FLIP, i))
    const a = Array.from({ length: 40 }, (_, i) => entryAt(5, GOLD, i).id)
    const b = Array.from({ length: 40 }, (_, i) => entryAt(6, GOLD, i).id)
    expect(a).not.toEqual(b)
  })

  it('keeps each item within the pace window, and gold short', () => {
    for (const pace of ['slow', 'medium']) {
      const cfg = { ...GOLD, pace }
      for (let i = 0; i < 200; i++) {
        const e = entryAt(77, cfg, i)
        if (e.gold) expect(e.ms).toBe(FC_GOLD_MS)
        else expect(e.ms).toBeGreaterThanOrEqual(FC_PACES[pace].min)
        if (!e.gold) expect(e.ms).toBeLessThanOrEqual(FC_PACES[pace].max)
      }
    }
  })

  it('the default pace is slow: every item stays at least 1.2 s', () => {
    for (let i = 0; i < 100; i++) expect(entryAt(8, PLAIN, i).ms).toBeGreaterThanOrEqual(1200)
  })

  it('lays items end to end', () => {
    let at = 0
    for (let i = 0; i < 50; i++) {
      const e = entryAt(12, FLIP, i)
      expect(e.start).toBe(at)
      at += e.ms
    }
  })

  it('never repeats an item and never goes dry for more than three in a row', () => {
    for (const seed of [1, 2, 3, 99, 4242]) {
      let dry = 0
      let last = null
      for (let i = 0; i < 300; i++) {
        const e = entryAt(seed, PLAIN, i)
        expect(e.kind).toBe('item')
        expect(e.id).not.toBe(last)
        last = e.id
        dry = e.hit ? 0 : dry + 1
        expect(dry).toBeLessThanOrEqual(FC_MAX_DRY)
      }
    }
  })

  it('about four in ten items can be cut', () => {
    let hits = 0
    const n = 2000
    for (let i = 0; i < n; i++) if (entryAt(2024, PLAIN, i).hit) hits++
    expect(hits / n).toBeGreaterThan(0.35)
    expect(hits / n).toBeLessThan(0.55)
  })

  it('plain games have no gold, no rotten fruit and no beats', () => {
    for (let i = 0; i < 300; i++) {
      const e = entryAt(10, PLAIN, i)
      expect(e.gold || e.rotten).toBe(false)
      expect(e.rule).toBe('any')
    }
  })

  it('GOLD & ROTTEN puts gold and rotten on fruit the rule allows, never on a twin', () => {
    let gold = 0
    let rotten = 0
    for (let i = 0; i < 600; i++) {
      const e = entryAt(555, GOLD, i)
      if (e.gold) { gold++; expect(e.hit).toBe(true); expect(itemDef(e.id).fruit).toBe(true) }
      if (e.rotten) { rotten++; expect(e.hit).toBe(false); expect(itemDef(e.id).fruit).toBe(true) }
    }
    expect(gold).toBeGreaterThan(5)
    expect(rotten).toBeGreaterThan(10)
  })

  it('RULE FLIP inserts a beat with a new rule every few items', () => {
    let items = 0
    let rule = 'any'
    let beats = 0
    for (let i = 0; i < 120; i++) {
      const e = entryAt(808, FLIP, i)
      if (e.kind === 'beat') {
        beats++
        expect(e.ms).toBe(FC_BEAT_MS)
        expect(e.hit).toBe(false)
        expect(e.id).toBeNull()
        expect(e.rule).not.toBe(rule)
        expect(items).toBe(FC_FLIP_EVERY)
        rule = e.rule
        items = 0
      } else {
        expect(e.rule).toBe(rule)
        items++
        // a cut is only ever a fruit the card in force allows
        expect(e.hit).toBe(ruleDef(rule).ok(itemDef(e.id)))
      }
    }
    expect(beats).toBeGreaterThan(8)
  })

  it('finds the item showing at a moment', () => {
    expect(indexAt(1, PLAIN, -1)).toBe(-1)
    expect(indexAt(1, PLAIN, 0)).toBe(0)
    const e3 = entryAt(1, PLAIN, 3)
    expect(indexAt(1, PLAIN, e3.start)).toBe(3)
    expect(indexAt(1, PLAIN, e3.start + e3.ms - 1)).toBe(3)
    expect(indexAt(1, PLAIN, e3.start + e3.ms)).toBe(4)
  })
})

describe('blocking and tap classes', () => {
  it('classes a tap by what is showing', () => {
    const f = fruitAt(3, FLIP)
    const t = twinAt(3, FLIP)
    const b = find(3, FLIP, e => e.kind === 'beat')
    expect(classifyTap(3, FLIP, f)).toBe('cut')
    expect(classifyTap(3, FLIP, t)).toBe('block')
    expect(classifyTap(3, FLIP, b)).toBe('none')
  })

  it('a wrong tap costs the rest of that item and the whole next one', () => {
    expect(freeIndexAfter(1, PLAIN, 4)).toBe(6)
  })

  it('a rule beat in between does not count as the item you miss', () => {
    const b = find(21, FLIP, e => e.kind === 'beat')
    const free = freeIndexAfter(21, FLIP, b - 1)
    // the item after the beat is the one that is missed; free again one later
    expect(free).toBe(b + 2)
    expect(entryAt(21, FLIP, b + 1).kind).toBe('item')
  })

  it('the underdog is free as soon as the item leaves', () => {
    expect(freeIndexAfter(1, PLAIN, 4, true)).toBe(5)
  })

  it('reads a katana phase from the block', () => {
    const blocked = { at: 4, until: 6 }
    expect(katanaPhase(null, 4)).toBe('ready')
    expect(katanaPhase(blocked, 4)).toBe('stopped')
    expect(katanaPhase(blocked, 5)).toBe('drawing')
    expect(katanaPhase(blocked, 6)).toBe('ready')
  })
})

describe('reports', () => {
  it('normalizes a sparse Firebase object and drops junk', () => {
    expect(normalizeReports(null)).toEqual({ t: {}, j: {} })
    const r = normalizeReports({ t: { 3: 410.6, x: 5, 7: -1, 8: 'a' }, j: { 5: true, 9: false, nope: true }, v: 1 })
    expect(r).toEqual({ t: { 3: 411 }, j: { 5: true } })
    expect(normalizeReports({ t: [null, null, 300] })).toEqual({ t: { 2: 300 }, j: {} })
  })
})

describe('scoring a round', () => {
  const seed = 4711
  const racers = ['a', 'b', 'c']
  const score = (stats, extra = {}) => resolveRound({ seed, config: PLAIN, stats, racers, ...extra })

  it('the fastest cut owns the fruit', () => {
    const k = fruitAt(seed, PLAIN)
    const res = score({ a: { t: { [k]: 500 } }, b: { t: { [k]: 430 } } })
    expect(res.owners[k]).toBe('b')
    expect(res.scores).toEqual({ a: 0, b: 1, c: 0 })
    expect(res.cuts.b).toBe(1)
    expect(res.rts.b).toEqual([430])
  })

  it('a dead heat is void', () => {
    const k = fruitAt(seed, PLAIN)
    const res = score({ a: { t: { [k]: 480 } }, b: { t: { [k]: 480 } } })
    expect(res.owners[k]).toBeNull()
    expect(res.ties.has(k)).toBe(true)
    expect(res.scores).toEqual({ a: 0, b: 0, c: 0 })
  })

  it('ignores a time later than the item itself', () => {
    const k = fruitAt(seed, PLAIN)
    const e = entryAt(seed, PLAIN, k)
    const res = score({ a: { t: { [k]: e.ms + FC_REPORT_SLACK_MS + 1 } } })
    expect(res.scores.a).toBe(0)
    expect(score({ a: { t: { [k]: e.ms + FC_REPORT_SLACK_MS } } }).scores.a).toBe(1)
  })

  /** A twin that is followed straight away by a fruit: the fruit you would miss. */
  const twinThenFruit = () => find(seed, PLAIN, (e) => e.kind === 'item' && !e.hit && !e.rotten && entryAt(seed, PLAIN, e.i + 1).hit)

  it('a wrong tap blocks you: the next fruit cannot be cut, the one after can', () => {
    const w = twinThenFruit()
    const until = freeIndexAfter(seed, PLAIN, w)
    expect(until).toBe(w + 2)
    const freeFruit = find(seed, PLAIN, e => e.hit, until)
    const res = score({ a: { j: { [w]: true }, t: { [w + 1]: 300, [freeFruit]: 300 } } })
    expect(res.jams.a).toBe(1)
    expect(res.owners[w + 1]).toBeUndefined()
    expect(res.owners[freeFruit]).toBe('a')
    expect(res.scores.a).toBe(1)
    expect(res.blocked.a).toEqual({ at: w, until })
  })

  it('a blocked player does not stop others cutting', () => {
    const w = twinThenFruit()
    const res = score({ a: { j: { [w]: true }, t: { [w + 1]: 200 } }, b: { t: { [w + 1]: 700 } } })
    expect(res.owners[w + 1]).toBe('b')
  })

  it('a tap on a twin that is not reported as wrong scores nothing', () => {
    const w = twinAt(seed, PLAIN)
    const res = score({ a: { t: { [w]: 300 } } })
    expect(res.scores.a).toBe(0)
    expect(res.owners[w]).toBeUndefined()
  })

  it('a block report on a fruit is not a block', () => {
    const k = fruitAt(seed, PLAIN)
    const res = score({ a: { j: { [k]: true } } })
    expect(res.jams.a).toBe(0)
  })

  it('a rule beat cannot be cut or blocked', () => {
    const b = find(seed, FLIP, e => e.kind === 'beat')
    const res = resolveRound({ seed, config: FLIP, stats: { a: { t: { [b]: 100 }, j: { [b]: true } } }, racers })
    expect(res.scores.a).toBe(0)
    expect(res.jams.a).toBe(0)
  })

  it('gold is worth three', () => {
    const k = find(seed, GOLD, e => e.gold)
    const res = resolveRound({ seed, config: GOLD, stats: { a: { t: { [k]: 300 } } }, racers })
    expect(res.scores.a).toBe(FC_GOLD_POINTS)
  })

  it('a rotten fruit costs a point, floors at zero and blocks', () => {
    const r = find(seed, GOLD, e => e.rotten)
    const res = resolveRound({ seed, config: GOLD, stats: { a: { j: { [r]: true } } }, racers })
    expect(res.scores.a).toBe(0)
    expect(res.jams.a).toBe(1)
    expect(res.blocked.a?.at).toBe(r)
    // with a point in hand it comes off
    const before = find(seed, GOLD, e => e.hit && !e.gold, 0)
    const rot = find(seed, GOLD, e => e.rotten, freeIndexAfter(seed, GOLD, before) + 0)
    const res2 = resolveRound({ seed, config: GOLD, stats: { a: { t: { [before]: 300 }, j: { [rot]: true } } }, racers })
    expect(res2.scores.a).toBe(0)
    expect(res2.cuts.a).toBe(1)
  })

  it('GOLD & ROTTEN frees a player three or more behind in time for the next item', () => {
    // b is far ahead by gold cuts, a blocks on a twin
    const golds = []
    for (let from = 0; golds.length < 2; ) { const g = find(seed, GOLD, e => e.gold, from); golds.push(g); from = g + 1 }
    const w = find(seed, GOLD, e => e.kind === 'item' && !e.hit && !e.rotten, golds[1] + 1)
    const res = resolveRound({
      seed, config: GOLD, racers,
      stats: { b: { t: { [golds[0]]: 200, [golds[1]]: 200 } }, a: { j: { [w]: true } } },
    })
    expect(res.scores.b).toBe(6)
    expect(res.blocked.a).toEqual({ at: w, until: w + 1 })
    // on the plain rules the same block lasts two items
    const plain = resolveRound({ seed, config: PLAIN, racers, stats: { a: { j: { [twinAt(seed, PLAIN)]: true } } } })
    expect(plain.blocked.a.until - plain.blocked.a.at).toBe(2)
  })

  it('stops at the item where someone reaches the target', () => {
    const t = {}
    let k = 0
    for (let n = 0; n < 12; n++) { k = find(seed, PLAIN, e => e.hit, k); t[k] = 300; k++ }
    const res = score({ a: { t } }, { target: FC_TARGET })
    expect(res.scores.a).toBe(FC_TARGET)
    expect(res.winner).toBe('a')
    expect(res.decidedAt).toBe(Number(Object.keys(t)[FC_TARGET - 1]))
  })

  it('the first to the target wins even if the others pile up after', () => {
    const ks = []
    for (let from = 0; ks.length < 8; ) { const k = find(seed, PLAIN, e => e.hit, from); ks.push(k); from = k + 1 }
    const stats = {
      a: { t: Object.fromEntries(ks.slice(0, 5).map(k => [k, 400])) },
      b: { t: Object.fromEntries(ks.slice(5).map(k => [k, 400])) },
    }
    const res = resolveRound({ seed, config: PLAIN, stats, racers: ['a', 'b'], target: 5 })
    expect(res.winner).toBe('a')
    expect(res.scores.b).toBe(0)
  })

  it('online: an item is only final once a faster report can no longer arrive', () => {
    const k = fruitAt(seed, PLAIN)
    const e = entryAt(seed, PLAIN, k)
    const stats = { a: { t: { [k]: 400 } } }
    const early = resolveRound({ seed, config: PLAIN, stats, racers: ['a', 'b'], target: 1, settleAt: e.start + 400 + FC_SETTLE_MS - 1 })
    expect(early.winner).toBeNull()
    const late = resolveRound({ seed, config: PLAIN, stats, racers: ['a', 'b'], target: 1, settleAt: e.start + 400 + FC_SETTLE_MS })
    expect(late.winner).toBe('a')
  })

  it('a racer with no reports scores zero', () => {
    expect(resolveRound({ seed, config: PLAIN, stats: {}, racers }).scores).toEqual({ a: 0, b: 0, c: 0 })
  })
})

describe('online race hooks', () => {
  const seed = 9001
  const k = fruitAt(seed, PLAIN)
  const round = (stats, extra = {}) => ({
    id: 'r1', seed, startedAt: 10_000, endsAt: 100_000, racers: ['a', 'b'], stats,
    raw: { fcConfig: PLAIN }, ...extra,
  })

  it('ranks by points, then by fewest blocks; no stats is DNF', () => {
    const stats = { a: { t: { [k]: 300 } }, b: { j: { [twinAt(seed, PLAIN)]: true } } }
    const r = round(stats)
    expect(fcRaceEntry(stats.a, r, 'a')).toEqual({ sortKey: [-1, 0], score: 1 })
    const b = fcRaceEntry(stats.b, r, 'b')
    expect(b.sortKey.map(n => n + 0)).toEqual([0, 1])
    expect(b.score).toBe(0)
    expect(fcRaceEntry(null, r, 'c')).toEqual({ sortKey: null, score: null })
  })

  it('builds a live row', () => {
    const stats = { a: { t: { [k]: 300 } } }
    const row = fcRow(stats.a, round(stats), 'a')
    expect(row.primary).toBe(`1 / ${FC_ONLINE_TARGET}`)
    expect(row.status).toBe('racing')
    expect(fcRow(null, round(stats), 'b').status).toBe('idle')
  })

  it('decides the round once the fifth cut is final', () => {
    const t = {}
    let at = 0
    for (let n = 0; n < FC_ONLINE_TARGET; n++) { at = find(seed, PLAIN, e => e.hit, at); t[at] = 350; at++ }
    const last = Number(Object.keys(t).at(-1))
    const e = entryAt(seed, PLAIN, last)
    const stats = { a: { t }, b: {} }
    const goAt = 10_000 + 3000
    const at1 = goAt + e.start + 350 + FC_SETTLE_MS
    const r = round(stats)
    expect(fcDecided(stats, ['a', 'b'], { now: at1 - 1, round: r })).toBe(false)
    expect(fcDecided(stats, ['a', 'b'], { now: at1, round: r })).toBe(true)
    expect(resolveFromRound(r).winner).toBe('a')
    expect(fcDecided(stats, ['a', 'b'], { round: r })).toBe(false)
  })
})

describe('bots', () => {
  it('cuts fruit it can reach, at about its reaction time', () => {
    const rand = mulberry32(1)
    const k = fruitAt(3, PLAIN)
    const e = entryAt(3, PLAIN, k)
    const times = Array.from({ length: 200 }, () => botTapAt('normal', e, rand)).filter(t => t != null)
    expect(times.length).toBeGreaterThan(150)
    const mean = times.reduce((a, b) => a + b, 0) / times.length
    expect(mean).toBeGreaterThan(BOTS.normal.mean - 90)
    expect(mean).toBeLessThan(BOTS.normal.mean + 90)
    for (const t of times) expect(t).toBeLessThan(e.ms - 90)
  })

  it('never taps a rule beat', () => {
    const b = find(5, FLIP, e => e.kind === 'beat')
    expect(botTapAt('hard', entryAt(5, FLIP, b), () => 0)).toBeNull()
  })

  it('falls for a twin at about its slip rate, easy more than hard', () => {
    const t = entryAt(3, PLAIN, twinAt(3, PLAIN))
    const rate = (level) => {
      const rand = mulberry32(7)
      let n = 0
      const trials = 2000
      for (let i = 0; i < trials; i++) if (botTapAt(level, t, rand) != null) n++
      return n / trials
    }
    expect(rate('easy')).toBeGreaterThan(rate('hard'))
    expect(rate('hard')).toBeLessThan(0.1)
    expect(rate('easy')).toBeGreaterThan(0.08)
  })

  it('swings at a rotten fruit more often than at a twin', () => {
    const rot = entryAt(555, GOLD, find(555, GOLD, e => e.rotten))
    const twin = entryAt(555, GOLD, find(555, GOLD, e => e.kind === 'item' && !e.hit && !e.rotten))
    const rate = (entry) => {
      const rand = mulberry32(3)
      let n = 0
      for (let i = 0; i < 3000; i++) if (botTapAt('normal', entry, rand) != null) n++
      return n
    }
    expect(rate(rot)).toBeGreaterThan(rate(twin))
  })

  it('a harder bot is quicker', () => {
    const k = entryAt(3, PLAIN, fruitAt(3, PLAIN))
    const mean = (level) => {
      const rand = mulberry32(11)
      const xs = Array.from({ length: 300 }, () => botTapAt(level, k, rand)).filter(x => x != null)
      return xs.reduce((a, b) => a + b, 0) / xs.length
    }
    expect(mean('hard')).toBeLessThan(mean('normal'))
    expect(mean('normal')).toBeLessThan(mean('easy'))
  })
})

describe('receipt', () => {
  it('averages cut times and counts blocks', () => {
    expect(averageMs([])).toBeNull()
    expect(averageMs([400, 500, 601])).toBe(500)
    const res = resolveRound({
      seed: 1, config: PLAIN, racers: ['a', 'b'],
      stats: { a: { t: { [fruitAt(1, PLAIN)]: 420 } }, b: { j: { [twinAt(1, PLAIN)]: true } } },
    })
    expect(receipt(res, ['a', 'b'])).toEqual([
      { id: 'a', score: 1, cuts: 1, avgMs: 420, blocks: 0 },
      { id: 'b', score: 0, cuts: 0, avgMs: null, blocks: 1 },
    ])
  })
})
