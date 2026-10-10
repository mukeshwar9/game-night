// Pure level data for REEF RUN — no DOM/Firebase/React.
//
// buildLevel(index, seed) is fully deterministic from (index, seed): every
// racer on the same round seed gets the identical level. All randomness goes
// through seededFraction() with a per-build counter, so call ORDER inside the
// generators matters — don't reorder r() calls casually.
//
// Terrain is a pair of per-column tile arrays: `ceil[c]` is the tile row where
// the solid ceiling ENDS and `floor[c]` the first solid floor row. Each level
// is carved from a wandering centre line, then hazards are placed under a
// "lane" rule (every column keeps a free vertical lane), then pickups.
import { seededFraction } from './raceLogic'

export const TILE = 8
export const LEVEL_COUNT = 6
export const LEVEL_NAMES = ['THE REEF', 'KELP MAZE', 'SUNKEN SUB', 'JELLY FOREST', 'THE TRENCH', 'SHARK CHASE']

/** Sprite sizes in px — used for placement here and by tests. */
export const ENT_SIZE = {
  jelly: [12, 15],
  shark: [36, 19],
  eel: [24, 11],
  urchin: [13, 13],
  mine: [13, 13],
  angler: [24, 19],
  pearl: [7, 7],
  shell: [11, 9],
  star: [11, 11],
  heartB: [13, 13],
  anem: [16, 14],
  goal: [14, 26],
}

const PICKUP_SCORE = { pearl: 10, shell: 50, star: 100 }

// Decor density per theme (ported from the prototype's THEMES).
const DECOR = {
  reef: { weeds: 0.28, coral: 0.22 },
  kelp: { weeds: 0.6, coral: 0.05 },
  cave: { weeds: 0.08, coral: 0 },
  trench: { weeds: 0, coral: 0 },
  open: { weeds: 0.15, coral: 0.1 },
}

/** Upper bound of the score reachable in `level` (pickups + best clear bonus). */
export function maxScoreFor(level) {
  let s = 3 * 500 + 1000 + (level.parSec || 0) * 10
  for (const e of level.ents) {
    s += PICKUP_SCORE[e.k] || 0
    if (e.k === 'heartB') s += 200
  }
  return s
}

/** Which of the 6 levels a race round with this seed plays (0..5). */
export function raceLevelIndex(seed) {
  return Math.min(LEVEL_COUNT - 1, Math.floor(seededFraction(seed, 4242, 7) * LEVEL_COUNT))
}

// ---- builder ---------------------------------------------------------------

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const covers = (q, c) => q.x < (c + 1) * TILE && q.x + q.w > c * TILE
const hits = (a, b, pad = 0) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad

function makeBuilder(index, seed, cols, rows) {
  let n = 0
  const r = () => seededFraction(seed, index + 1, n++)
  const range = (a, b) => a + r() * (b - a)
  const irange = (a, b) => Math.floor(range(a, b + 1))
  const ceil = new Array(cols).fill(0)
  const floor = new Array(cols).fill(rows)
  const ents = []
  const statics = [] // static hazard rects (urchin, angler)
  const sweeps = [] // full swept rects of moving hazards
  const pickups = [] // special pickup rects (goal, anem, star, shell, heartB)
  const W = cols * TILE
  const colOf = (x) => clamp(Math.floor(x / TILE), 0, cols - 1)
  let spawn = { x: 24, y: 0 }
  let line = []

  function setTerrain(ceilT, floorT, minGap = 4) {
    const c = ceilT.map((v) => Math.max(0, Math.round(v)))
    const f = floorT.map((v) => Math.min(rows, Math.round(v)))
    const slope = (a) => {
      for (let i = 1; i < cols; i++) a[i] = clamp(a[i], a[i - 1] - 1, a[i - 1] + 1)
      for (let i = cols - 2; i >= 0; i--) a[i] = clamp(a[i], a[i + 1] - 1, a[i + 1] + 1)
    }
    const gap = () => {
      for (let i = 0; i < cols; i++) {
        if (f[i] - c[i] < minGap) {
          f[i] = Math.min(rows, c[i] + minGap)
          if (f[i] - c[i] < minGap) c[i] = f[i] - minGap
        }
      }
    }
    for (let pass = 0; pass < 3; pass++) {
      slope(c)
      slope(f)
      gap()
    }
    for (let i = 0; i < cols; i++) {
      ceil[i] = c[i]
      floor[i] = f[i]
    }
  }

  // Flatten the first/last columns so spawn and goal sit in clean open water.
  function flatEnds(cT, fT, c0, f0, c1, f1, nStart = 14, nEnd = 22) {
    for (let i = 0; i < nStart; i++) {
      cT[i] = c0
      fT[i] = f0
    }
    for (let i = cols - nEnd; i < cols; i++) {
      cT[i] = c1
      fT[i] = f1
    }
  }

  function fitsRect(q) {
    if (q.y < 2 || q.x < 0 || q.x + q.w > W) return false
    for (let c = colOf(q.x); c <= colOf(q.x + q.w - 1); c++) {
      if (q.y < ceil[c] * TILE || q.y + q.h > floor[c] * TILE) return false
    }
    return true
  }

  function freeIntervals(c, extra = []) {
    const lo0 = Math.max(2, ceil[c] * TILE)
    const hi0 = floor[c] * TILE
    const bl = []
    for (const list of [statics, sweeps, extra]) {
      for (const q of list) if (covers(q, c)) bl.push([q.y, q.y + q.h])
    }
    bl.sort((a, b) => a[0] - b[0])
    const out = []
    let cur = lo0
    for (const [a, b] of bl) {
      if (a > cur) out.push([cur, Math.min(a, hi0)])
      cur = Math.max(cur, b)
    }
    if (cur < hi0) out.push([cur, hi0])
    return out.filter(([a, b]) => b > a)
  }

  function laneOK(q, minLane) {
    for (let c = colOf(q.x); c <= colOf(q.x + q.w - 1); c++) {
      let best = 0
      for (const [a, b] of freeIntervals(c, [q])) best = Math.max(best, b - a)
      if (best < minLane) return false
    }
    return true
  }

  // Local connectivity: some free lane must carry on, column to column, past q.
  function passable(q) {
    const c0 = Math.max(0, colOf(q.x) - 4)
    const c1 = Math.min(cols - 1, colOf(q.x + q.w - 1) + 4)
    let cur = freeIntervals(c0, [q]).filter(([a, b]) => b - a >= 14)
    for (let c = c0 + 1; c <= c1; c++) {
      const prev = cur
      cur = freeIntervals(c, [q])
        .filter(([a, b]) => b - a >= 14)
        .filter(([a, b]) => prev.some(([p, e]) => Math.min(b, e) - Math.max(a, p) >= 10))
      if (!cur.length) return false
    }
    return true
  }

  const hazardHit = (q, pad) => statics.some((s) => hits(q, s, pad)) || sweeps.some((s) => hits(q, s, pad))

  function addStatic(k, x, y, extra = {}, minLane = 18) {
    const [w, h] = ENT_SIZE[k]
    const q = { x, y, w, h }
    if (!fitsRect(q) || hazardHit(q, 4) || !laneOK(q, minLane) || !passable(q)) return false
    ents.push({ k, x, y, ...extra })
    statics.push(q)
    return true
  }

  // Bobbing hazard (jelly / mine): sweeps [by-amp, by+amp+h].
  function addMover(k, x, by, amp, minLane = 28) {
    const [w, h] = ENT_SIZE[k]
    const q = { x, y: by - amp, w, h: h + 2 * amp }
    if (!fitsRect(q) || statics.some((s) => hits(q, s, 4)) || !laneOK(q, minLane) || !passable(q)) return false
    ents.push({ k, x, y: by, by, amp, ph: Math.round(r() * 628) / 100 })
    sweeps.push(q)
    return true
  }

  function tryMover(k, x, by, amps, minLane = 28) {
    for (const amp of amps) if (amp >= 4 && addMover(k, x, Math.round(by), Math.round(amp), minLane)) return true
    return false
  }

  // Horizontal patroller (eel / shark): left edge travels a..b.
  function addPatrol(k, a, b, y, v, minLane = 22) {
    const [w, h] = ENT_SIZE[k]
    const q = { x: a, y, w: b - a + w, h }
    if (!fitsRect(q) || statics.some((s) => hits(q, s, 4)) || !laneOK(q, minLane) || !passable(q)) return false
    ents.push({ k, x: a, y, a, b, v: Math.round(v * 100) / 100, flip: r() < 0.5 })
    sweeps.push(q)
    return true
  }

  function wallUrchin(x, wall) {
    const c0 = colOf(x)
    const c1 = colOf(x + 12)
    let lo = Infinity
    let hi = -Infinity
    for (let c = c0; c <= c1; c++) {
      const v = wall === 'floor' ? floor[c] : ceil[c]
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
    }
    if (hi - lo > 1) return false
    const y = wall === 'floor' ? lo * TILE - 13 : hi * TILE
    return addStatic('urchin', x, y)
  }

  function floorAngler(x) {
    const c0 = colOf(x)
    const c1 = colOf(x + 23)
    let lo = Infinity
    let hi = -Infinity
    for (let c = c0; c <= c1; c++) {
      lo = Math.min(lo, floor[c])
      hi = Math.max(hi, floor[c])
    }
    if (hi - lo > 1) return false
    return addStatic('angler', x, lo * TILE - 19, { flip: r() < 0.5 })
  }

  function scan(from, to, minStep, maxStep, fn) {
    let x = from
    while (x < to) {
      fn(Math.round(x))
      x += range(minStep, maxStep)
    }
  }

  const midAt = (x) => {
    const c = colOf(x)
    return (ceil[c] + floor[c]) * 4
  }

  function setSpawn(x, y) {
    const c = colOf(x + 9)
    spawn = { x, y: y ?? Math.round((ceil[c] + floor[c]) * 4 - 8) }
  }

  // The "safe line": a smooth y per column that stays inside a free lane.
  function computeLine(aim) {
    line = []
    let prev = null
    for (let c = 0; c < cols; c++) {
      const iv = freeIntervals(c).filter(([a, b]) => b - a >= 22)
      const a = aim ? aim(c * TILE + 4) : (ceil[c] + floor[c]) * 4
      if (prev === null) prev = a
      if (!iv.length) {
        line.push(prev)
        continue
      }
      const want = prev + (a - prev) * 0.2
      let best = null
      for (const [lo, hi] of iv) {
        const t = clamp(want, lo + 11, hi - 11)
        const d = Math.abs(t - want)
        if (!best || d < best.d) best = { t, d }
      }
      prev = best.t
      line.push(prev)
    }
  }

  const spawnRect = () => ({ x: spawn.x, y: spawn.y, w: 18, h: 15 })
  const okPickup = (q, pad = 3) =>
    fitsRect(q) && !hazardHit(q, pad) && !pickups.some((p) => hits(q, p, 4)) && !hits(q, spawnRect(), 10)

  function placeSpecial(k, tx, mode) {
    const [w, h] = ENT_SIZE[k]
    const flip = r() < 0.5
    for (let d = 0; d <= 360; d += 6) {
      for (const sg of d ? [1, -1] : [1]) {
        const x = Math.round(tx + d * sg)
        if (x < 120 || x + w > W - 150) continue
        let top = 2
        let bot = Infinity
        for (let c = colOf(x); c <= colOf(x + w - 1); c++) {
          top = Math.max(top, ceil[c] * TILE)
          bot = Math.min(bot, floor[c] * TILE)
        }
        top += 3
        bot -= h + 3
        if (bot < top) continue
        const mid = Math.round(line[colOf(x + w / 2)] - h / 2)
        let ys
        if (mode === 'line') ys = [mid, mid - 14, mid + 14]
        else if (mode === 'floor') ys = [bot, mid]
        else ys = flip ? [top, bot, mid] : [bot, top, mid]
        for (const y0 of ys) {
          const q = { x, y: clamp(y0, top, bot), w, h }
          if (okPickup(q)) {
            ents.push({ k, x: q.x, y: q.y })
            pickups.push(q)
            return q
          }
        }
      }
    }
    throw new Error(`reefLevels: no room for ${k} (level ${index}, seed ${seed})`)
  }

  function placeAnem(tx) {
    const [w, h] = ENT_SIZE.anem
    for (let d = 0; d <= 360; d += 8) {
      for (const sg of d ? [1, -1] : [1]) {
        const x = Math.round(tx + d * sg)
        if (x < 120 || x + w > W - 150) continue
        const c0 = colOf(x)
        const c1 = colOf(x + w - 1)
        let lo = Infinity
        let hi = -Infinity
        for (let c = c0; c <= c1; c++) {
          lo = Math.min(lo, floor[c])
          hi = Math.max(hi, floor[c])
        }
        if (hi !== lo) continue
        const q = { x, y: lo * TILE - h, w, h }
        if (okPickup(q, 8)) {
          ents.push({ k: 'anem', x: q.x, y: q.y, on: false })
          pickups.push(q)
          return
        }
      }
    }
    throw new Error(`reefLevels: no room for anem (level ${index}, seed ${seed})`)
  }

  function pearlTrails(from, to, gapMin, gapMax) {
    let x = from
    while (x < to) {
      const len = irange(5, 10)
      for (let i = 0; i < len; i++) {
        const px = Math.round(x + i * 12)
        if (px > to) break
        const y = Math.round(line[colOf(px + 3)] - 3.5 + Math.sin(i * 0.9) * 3)
        const q = { x: px, y, w: 7, h: 7 }
        if (fitsRect(q) && !hazardHit(q, 2) && !pickups.some((p) => hits(q, p, 2)) && !hits(q, spawnRect(), 8)) ents.push({ k: 'pearl', x: px, y })
      }
      x += len * 12 + range(gapMin, gapMax)
    }
  }

  function placeGoal() {
    const [w, h] = ENT_SIZE.goal
    const x = W - 12 * TILE
    const c = colOf(x + 4)
    const y = floor[c] * TILE - h
    const q = { x, y, w, h }
    if (!fitsRect(q)) throw new Error(`reefLevels: goal does not fit (level ${index}, seed ${seed})`)
    ents.push({ k: 'goal', x, y })
    pickups.push(q)
  }

  function addDecor(theme) {
    const d = DECOR[theme]
    const weeds = []
    const corals = []
    for (let c = 1; c < cols - 1; c++) {
      const h = seededFraction(seed, index + 101, c)
      const gapPx = (floor[c] - ceil[c]) * TILE
      if (h < d.weeds) {
        const hh = Math.min(10 + Math.floor(seededFraction(seed, index + 202, c) * 22), gapPx - 24)
        if (hh >= 8) weeds.push({ x: c * TILE + 2 + Math.floor(seededFraction(seed, index + 303, c) * 4), h: hh, ph: Math.round(h * 2000) / 100 })
      } else if (h < d.weeds + d.coral && gapPx >= 80) {
        corals.push({ x: c * TILE - 2, col: c })
      }
    }
    return { weeds, corals }
  }

  return {
    r, range, irange, ceil, floor, ents, W, cols, rows, colOf, midAt,
    setTerrain, flatEnds, fitsRect, freeIntervals, addStatic, addMover, tryMover, addPatrol,
    wallUrchin, floorAngler, scan, setSpawn, computeLine, placeSpecial, placeAnem, pearlTrails,
    placeGoal, addDecor, getSpawn: () => spawn, getLine: () => line,
  }
}

// ---- per-level generators -------------------------------------------------

function jellyAmps(B, lo, hi) {
  const a = B.irange(lo, hi)
  return [a, Math.floor(a * 0.6), 8]
}

// 1. THE REEF — open water, one short wide tunnel, slow jellies.
function genReef(B) {
  const { cols, range } = B
  const p1 = range(0, 6.3)
  const p2 = range(0, 6.3)
  const t0 = Math.round(range(150, 190))
  const tl = Math.round(range(36, 46))
  const cT = []
  const fT = []
  for (let c = 0; c < cols; c++) {
    let cc = 0
    let ff = 22 + Math.sin(c * 0.07 + p1) * 1.6 + Math.sin(c * 0.19 + p2) * 0.9
    if (c >= t0 && c <= t0 + tl) {
      const w = Math.sin(c * 0.3 + p2) * 0.6
      cc = 8 + w
      ff = 18 + w
    }
    cT.push(cc)
    fT.push(ff)
  }
  B.flatEnds(cT, fT, 0, 22, 0, 22)
  B.setTerrain(cT, fT, 6)
  B.setSpawn(24)
  B.scan(160, B.W - 260, 150, 230, (x) => {
    const mid = B.midAt(x + 6)
    B.tryMover('jelly', x, mid - 7 + B.range(-22, 22), jellyAmps(B, 16, 26))
  })
  return { theme: 'reef', dark: false, current: false, scroll: null, checkpoints: [0.5], shells: [0.42, 0.74], hearts: [0.33, 0.78], pps: 66, pearlGap: [40, 90] }
}

// 2. KELP MAZE — kelp corridors (6-7 tiles) with patrolling eels.
function genKelp(B) {
  const { cols, range, irange } = B
  const cT = new Array(cols).fill(0)
  const p = range(0, 6.3)
  const fT = []
  for (let c = 0; c < cols; c++) fT.push(23 + Math.sin(c * 0.08 + p) * 1.2)
  const corridors = []
  let x = 18
  while (x < cols - 70) {
    x += irange(20, 30)
    const len = irange(46, 62)
    if (x + len > cols - 46) break
    const gap = B.r() < 0.5 ? 6 : 7
    const center = irange(12, 15)
    const ph = range(0, 6.3)
    corridors.push({ a: x, b: x + len, center, gap })
    for (let c = x; c <= x + len; c++) {
      const wob = Math.sin((c - x) * 0.15 + ph) * 1.2
      cT[c] = center - gap / 2 + wob
      fT[c] = center + gap / 2 + wob
    }
    x += len
  }
  B.flatEnds(cT, fT, 0, 23, 0, 23)
  B.setTerrain(cT, fT, 6)
  B.setSpawn(24)
  for (const cor of corridors) {
    let px = (cor.a + 5) * TILE
    const end = (cor.b - 5) * TILE
    while (px < end - 90) {
      const len = Math.min(B.irange(110, 190), end - px)
      const a = Math.round(px)
      const b = Math.round(px + len)
      const y0 = B.midAt((a + b) / 2) - 6
      for (const off of [0, -6, 6, -10, 10]) {
        if (B.addPatrol('eel', a, b, Math.round(y0 + off), range(0.45, 0.7))) break
      }
      px += len + B.irange(10, 50)
    }
  }
  B.scan(150, B.W - 240, 90, 140, (xx) => {
    const c = B.colOf(xx + 6)
    if (B.floor[c] - B.ceil[c] < 12) return
    const mid = B.midAt(xx + 6)
    B.tryMover('jelly', xx, mid - 7 + B.range(-30, 30), jellyAmps(B, 14, 24))
  })
  return { theme: 'kelp', dark: false, current: false, scroll: null, checkpoints: [0.33, 0.68], shells: [0.45], hearts: [0.3, 0.75], pps: 60, pearlGap: [40, 90] }
}

// Winding cave centre line shared by SUNKEN SUB and THE TRENCH.
function caveTerrain(B, o) {
  const { cols, range } = B
  const p = range(0, 6.3)
  const p2 = range(0, 6.3)
  const p3 = range(0, 6.3)
  const cT = []
  const fT = []
  for (let c = 0; c < cols; c++) {
    const cl = o.center + Math.sin(c * 0.045 + p) * o.amp + Math.sin(c * 0.12 + p2) * 1.5
    const sm = 0.5 + 0.5 * Math.sin(c * o.wl + p3)
    const gap = o.gapMin + (o.gapMax - o.gapMin) * Math.pow(sm, o.pow)
    cT.push(cl - gap / 2)
    fT.push(cl + gap / 2)
  }
  B.flatEnds(cT, fT, 6, 20, 6, 20)
  B.setTerrain(cT, fT, 4)
}

function mineAt(B, x, minAmp = 5) {
  const c = B.colOf(x + 6)
  const g = B.floor[c] - B.ceil[c]
  const amp = Math.min(14, Math.floor((g * TILE - 13 - 22) / 2))
  if (amp < minAmp) return false
  return B.tryMover('mine', x, B.midAt(x + 6) - 6, [amp, Math.floor(amp / 2)], 22)
}

// 3. SUNKEN SUB — cave/wreck, passages down to 4 tiles, urchins on one wall at a time, drifting mines.
function genSub(B) {
  caveTerrain(B, { center: 13.5, amp: 4, wl: 0.075, gapMin: 4, gapMax: 9, pow: 1 })
  B.setSpawn(24)
  let wall = B.r() < 0.5 ? 'floor' : 'ceil'
  B.scan(150, B.W - 250, 50, 85, (x) => {
    const c = B.colOf(x + 6)
    const g = B.floor[c] - B.ceil[c]
    if (B.r() < 0.12) wall = wall === 'floor' ? 'ceil' : 'floor'
    const roll = B.r()
    if (g >= 7 && roll < 0.6) mineAt(B, x)
    else if (g <= 8 && roll < 0.9) B.wallUrchin(x, wall)
    else mineAt(B, x)
  })
  return { theme: 'cave', dark: false, current: false, scroll: null, checkpoints: [0.33, 0.68], shells: [0.35, 0.7], hearts: [0.4, 0.8], pps: 56, pearlGap: [30, 70] }
}

// 4. JELLY FOREST — tall cavern, bottom-left to top-right, columns of jellies with a snaking lane.
function genForest(B) {
  const { cols, range } = B
  const p = range(0, 6.3)
  const p2 = range(0, 6.3)
  const floorF = (c) => {
    const t = c / (cols - 1)
    const s = t * 6
    const i = Math.floor(s)
    const f = s - i
    const sm = f < 0.7 ? 0 : (() => { const u = (f - 0.7) / 0.3; return u * u * (3 - 2 * u) })()
    return 41 - 28 * Math.min(1, (i + sm) / 6) + Math.sin(c * 0.09 + p) * 1.2
  }
  const cT = new Array(cols).fill(0)
  const fT = []
  for (let c = 0; c < cols; c++) fT.push(floorF(c))
  B.flatEnds(cT, fT, 0, 41, 0, 13)
  B.setTerrain(cT, fT, 6)
  const laneAim = (x) => {
    const c = B.colOf(x)
    const fl = B.floor[c] * TILE
    return clamp(fl - 70 + Math.sin(x * 0.017 + p2) * 30, 34, fl - 30)
  }
  B.setSpawn(24, B.floor[3] * TILE - 28)
  B.scan(150, B.W - 220, 62, 74, (x) => {
    const lane = laneAim(x + 6)
    const amp = B.irange(12, 18)
    const c = B.colOf(x + 6)
    const ceilPx = Math.max(2, B.ceil[c] * TILE)
    const floorPx = B.floor[c] * TILE
    const step = 15 + 2 * amp + 14
    let yb = lane - 24 - 15 - amp
    while (yb - amp >= ceilPx + 4) {
      B.addMover('jelly', x + B.irange(-4, 4), Math.round(yb), amp)
      yb -= step
    }
    let ya = lane + 24 + amp
    while (ya + amp + 15 <= floorPx - 4) {
      B.addMover('jelly', x + B.irange(-4, 4), Math.round(ya), amp)
      ya += step
    }
  })
  return { theme: 'cave', dark: false, current: false, scroll: null, aim: laneAim, checkpoints: [0.35, 0.7], shells: [0.5], hearts: [0.55], pps: 52, pearlGap: [30, 60] }
}

// 5. THE TRENCH — dark ravine: urchins, mines, eels, anglerfish.
function genTrench(B) {
  caveTerrain(B, { center: 13.5, amp: 4.5, wl: 0.06, gapMin: 4, gapMax: 8.5, pow: 1.4 })
  B.setSpawn(24)
  B.scan(150, B.W - 250, 42, 68, (x) => {
    const c = B.colOf(x + 6)
    const g = B.floor[c] - B.ceil[c]
    const wall = B.r() < 0.5 ? 'floor' : 'ceil'
    const roll = B.r()
    if (g <= 5) {
      if (roll < 0.8) B.wallUrchin(x, wall)
    } else if (g >= 8) {
      if (roll < 0.45) B.floorAngler(x)
      else if (roll < 0.8) mineAt(B, x)
      else B.wallUrchin(x, wall)
    } else if (roll < 0.35) {
      B.wallUrchin(x, wall)
    } else if (roll < 0.6) {
      mineAt(B, x)
    } else if (roll < 0.85) {
      const a = x
      for (const len of [160, 110, 70]) {
        if (B.addPatrol('eel', a, a + len, Math.round(B.midAt(a + len / 2) - 6), B.range(0.6, 0.9))) break
      }
    }
  })
  return { theme: 'trench', dark: true, current: false, scroll: null, checkpoints: [0.25, 0.5, 0.75], shells: [0.4, 0.7], hearts: [0.55], pps: 52, pearlGap: [30, 60] }
}

// 6. SHARK CHASE — open water, auto-scroll, a chaser shark, mines and jellies.
function genChase(B) {
  const { cols, range, irange } = B
  const p = range(0, 6.3)
  const cT = new Array(cols).fill(0)
  const fT = []
  for (let c = 0; c < cols; c++) fT.push(24 + Math.sin(c * 0.06 + p) * 1.2)
  for (let k = 0; k < 12; k++) {
    const c0 = irange(40, cols - 60)
    const wd = irange(4, 7)
    const hgt = irange(3, 6)
    for (let c = Math.max(0, c0 - wd); c <= Math.min(cols - 1, c0 + wd); c++) {
      fT[c] -= hgt * 0.5 * (1 + Math.cos((Math.PI * (c - c0)) / wd))
    }
  }
  B.flatEnds(cT, fT, 0, 24, 0, 24)
  B.setTerrain(cT, fT, 6)
  B.setSpawn(44)
  B.scan(160, B.W - 200, 58, 92, (x) => {
    const c = B.colOf(x + 6)
    const floorPx = B.floor[c] * TILE
    const by = Math.round(range(34, floorPx - 56))
    if (B.r() < 0.55) B.tryMover('mine', x, by, [B.irange(10, 16), 8])
    else B.tryMover('jelly', x, by, jellyAmps(B, 16, 26))
  })
  // Chaser: its real position is driven by the scroll in reefLogic.
  B.ents.unshift({ k: 'shark', x: 0, y: 60, a: 0, b: 0, v: 0, flip: false, chaser: true })
  return { theme: 'open', dark: false, current: true, scroll: { speed0: 0.75, speed1: 1.15 }, checkpoints: [0.35, 0.7], shells: [0.3, 0.6], hearts: [0.5], pps: 57, pearlGap: [30, 70] }
}

const LEVELS = [
  { cols: 420, rows: 28, gen: genReef },
  { cols: 460, rows: 28, gen: genKelp },
  { cols: 500, rows: 28, gen: genSub },
  { cols: 440, rows: 44, gen: genForest },
  { cols: 520, rows: 28, gen: genTrench },
  { cols: 470, rows: 28, gen: genChase },
]

function generate(index, seed) {
  const spec = LEVELS[index]
  const B = makeBuilder(index, seed, spec.cols, spec.rows)
  const cfg = spec.gen(B)
  B.placeGoal()
  B.computeLine(cfg.aim)
  const jit = () => B.range(-30, 30)
  cfg.checkpoints.forEach((f) => B.placeAnem(f * B.W))
  ;[0.27, 0.55, 0.83].forEach((f) => B.placeSpecial('star', f * B.W + jit(), 'edge'))
  cfg.shells.forEach((f) => B.placeSpecial('shell', f * B.W + jit(), 'floor'))
  cfg.hearts.forEach((f) => B.placeSpecial('heartB', f * B.W + jit(), 'line'))
  B.pearlTrails(60, B.W - 200, cfg.pearlGap[0], cfg.pearlGap[1])
  const { weeds, corals } = B.addDecor(cfg.theme)
  const ents = B.ents.map((e, i) => ({ id: i, ...e }))
  const sp = B.getSpawn()
  const width = B.W
  const parSec = Math.round(
    cfg.scroll ? width / (60 * ((cfg.scroll.speed0 + cfg.scroll.speed1) / 2)) : width / cfg.pps,
  )
  const level = {
    index,
    name: LEVEL_NAMES[index],
    theme: cfg.theme,
    dark: cfg.dark,
    current: cfg.current,
    cols: spec.cols,
    rows: spec.rows,
    ceil: B.ceil,
    floor: B.floor,
    weeds,
    corals,
    ents,
    spawn: sp,
    parSec,
    scroll: cfg.scroll,
    starCount: ents.filter((e) => e.k === 'star').length,
    maxScore: 0,
  }
  level.maxScore = maxScoreFor(level)
  return level
}

// ---- public ----------------------------------------------------------------

const MEMO_MAX = 8
const memo = new Map()

/**
 * Deterministic level for (index 0..5, seed). The result is memoised and
 * shared — callers must treat it as read-only (createRun deep-copies ents).
 */
export function buildLevel(index, seed) {
  const idx = clamp(Math.floor(Number(index)) || 0, 0, LEVEL_COUNT - 1)
  const key = `${idx}:${Number(seed) | 0}`
  const hit = memo.get(key)
  if (hit) {
    memo.delete(key)
    memo.set(key, hit)
    return hit
  }
  const level = generate(idx, seed)
  memo.set(key, level)
  if (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value)
  return level
}
