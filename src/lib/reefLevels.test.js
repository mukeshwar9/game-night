import { describe, it, expect } from 'vitest'
import { buildLevel, raceLevelIndex, maxScoreFor, TILE, LEVEL_COUNT, LEVEL_NAMES, ENT_SIZE } from './reefLevels'

const SEEDS = Array.from({ length: 22 }, (_, i) => 13 + i * 7919)
const LEVELS = [0, 1, 2, 3, 4, 5]
const FISH = [18, 15]
const HB = [3, 5, 11, 7]
const HIT = {
  jelly: [2, 1, 8, 8], shark: [6, 5, 28, 10], eel: [3, 3, 19, 6], urchin: [3, 3, 7, 7], mine: [3, 3, 7, 7],
  angler: [4, 7, 12, 10], pearl: [0, 0, 7, 7], shell: [0, 0, 11, 9], star: [1, 1, 9, 9], heartB: [1, 1, 11, 11],
  anem: [2, 4, 12, 10], goal: [2, 2, 10, 22],
}

// Own tile-based solid test (mirrors the world collision rules).
function solid(level, x, y, w, h) {
  if (y < 2 || x < 0 || x + w > level.cols * TILE) return true
  for (let c = Math.floor(x / TILE); c <= Math.floor((x + w - 1) / TILE); c++) {
    if (y < level.ceil[c] * TILE || y + h > level.floor[c] * TILE) return true
  }
  return false
}
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const spriteRect = (e) => ({ x: e.x, y: e.y, w: ENT_SIZE[e.k][0], h: ENT_SIZE[e.k][1] })
const hitRect = (e) => ({ x: e.x + HIT[e.k][0], y: e.y + HIT[e.k][1], w: HIT[e.k][2], h: HIT[e.k][3] })

// Whole swept area of an entity over its motion.
function sweepRect(e) {
  const [w, h] = ENT_SIZE[e.k]
  if (e.k === 'jelly' || e.k === 'mine') return { x: e.x, y: e.by - e.amp, w, h: h + 2 * e.amp }
  if (e.k === 'eel' || e.k === 'shark') return { x: e.a, y: e.y, w: e.b - e.a + w, h }
  return spriteRect(e)
}
function sweepHit(e) {
  const [hx, hy, hw, hh] = HIT[e.k]
  if (e.k === 'jelly' || e.k === 'mine') return { x: e.x + hx, y: e.by - e.amp + hy, w: hw, h: hh + 2 * e.amp }
  if (e.k === 'eel' || e.k === 'shark') return { x: e.a + hx, y: e.y + hy, w: e.b - e.a + hw, h: hh }
  return hitRect(e)
}

// BFS on a 2px grid over fish-hitbox positions. `blockers` are rects the hitbox cannot enter.
function reach(level, blockers) {
  const gw = Math.floor((level.cols * TILE - HB[2]) / 2) + 1
  const gh = Math.floor((level.rows * TILE - HB[3]) / 2) + 1
  const blk = new Uint8Array(gw * gh)
  for (const q of blockers) {
    const x0 = Math.max(0, Math.ceil((q.x - HB[2] + 1) / 2))
    const x1 = Math.min(gw - 1, Math.floor((q.x + q.w - 1) / 2))
    const y0 = Math.max(0, Math.ceil((q.y - HB[3] + 1) / 2))
    const y1 = Math.min(gh - 1, Math.floor((q.y + q.h - 1) / 2))
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) blk[gy * gw + gx] = 1
  }
  const seen = new Uint8Array(gw * gh)
  const sx = Math.round((level.spawn.x + HB[0]) / 2)
  const sy = Math.round((level.spawn.y + HB[1]) / 2)
  const ok = (gx, gy) =>
    gx >= 0 && gy >= 0 && gx < gw && gy < gh && !blk[gy * gw + gx] && !solid(level, gx * 2, gy * 2, HB[2], HB[3])
  const queue = new Int32Array(gw * gh)
  let head = 0
  let tail = 0
  if (ok(sx, sy)) {
    seen[sy * gw + sx] = 1
    queue[tail++] = sy * gw + sx
  }
  while (head < tail) {
    const cur = queue[head++]
    const gx = cur % gw
    const gy = (cur - gx) / gw
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = gx + dx
      const ny = gy + dy
      if (ok(nx, ny) && !seen[ny * gw + nx]) {
        seen[ny * gw + nx] = 1
        queue[tail++] = ny * gw + nx
      }
    }
  }
  const touches = (q) => {
    for (let gy = Math.max(0, Math.ceil((q.y - HB[3] + 1) / 2)); gy <= Math.min(gh - 1, Math.floor((q.y + q.h - 1) / 2)); gy++) {
      for (let gx = Math.max(0, Math.ceil((q.x - HB[2] + 1) / 2)); gx <= Math.min(gw - 1, Math.floor((q.x + q.w - 1) / 2)); gx++) {
        if (seen[gy * gw + gx]) return true
      }
    }
    return false
  }
  return { touches, startOk: ok(sx, sy) }
}

const bfsCache = new Map()
function bfs(index, seed, strict) {
  const key = `${index}:${seed}:${strict}`
  if (!bfsCache.has(key)) {
    const level = buildLevel(index, seed)
    const blockers = level.ents
      .filter((e) => (strict ? ['urchin', 'angler', 'jelly', 'mine', 'eel', 'shark'].includes(e.k) && !e.chaser : ['urchin', 'angler'].includes(e.k)))
      .map(strict ? sweepHit : hitRect)
    bfsCache.set(key, reach(level, blockers))
  }
  return bfsCache.get(key)
}

describe.each(LEVELS)('reef level %i', (index) => {
  it('is deterministic per seed and differs across seeds', () => {
    for (const seed of SEEDS) {
      expect(buildLevel(index, seed)).toEqual(JSON.parse(JSON.stringify(buildLevel(index, seed))))
    }
    const a = JSON.stringify(buildLevel(index, SEEDS[0]))
    expect(JSON.stringify(buildLevel(index, SEEDS[0]))).toBe(a)
    for (const seed of SEEDS.slice(1)) expect(JSON.stringify(buildLevel(index, seed))).not.toBe(a)
  })

  it('has well-formed terrain', () => {
    for (const seed of SEEDS) {
      const L = buildLevel(index, seed)
      expect(L.index).toBe(index)
      expect(L.name).toBe(LEVEL_NAMES[index])
      expect(L.ceil).toHaveLength(L.cols)
      expect(L.floor).toHaveLength(L.cols)
      expect(L.cols * TILE).toBeGreaterThanOrEqual(3000)
      expect(L.cols * TILE).toBeLessThanOrEqual(4200)
      for (let c = 0; c < L.cols; c++) {
        expect(L.floor[c] - L.ceil[c]).toBeGreaterThanOrEqual(4)
        expect(L.ceil[c]).toBeGreaterThanOrEqual(0)
        expect(L.floor[c]).toBeLessThanOrEqual(L.rows)
        expect(Number.isInteger(L.ceil[c]) && Number.isInteger(L.floor[c])).toBe(true)
      }
    }
  })

  it('has an open spawn inside the world', () => {
    for (const seed of SEEDS) {
      const L = buildLevel(index, seed)
      expect(L.spawn.x).toBeGreaterThanOrEqual(0)
      expect(L.spawn.y).toBeGreaterThanOrEqual(0)
      expect(L.spawn.x + FISH[0]).toBeLessThanOrEqual(L.cols * TILE)
      expect(L.spawn.y + FISH[1]).toBeLessThanOrEqual(L.rows * TILE)
      expect(solid(L, L.spawn.x + HB[0], L.spawn.y + HB[1], HB[2], HB[3])).toBe(false)
      expect(solid(L, L.spawn.x, L.spawn.y, FISH[0], FISH[1])).toBe(false)
    }
  })

  it('keeps entities in the world, off terrain and off the spawn, with ids == indices', () => {
    for (const seed of SEEDS) {
      const L = buildLevel(index, seed)
      const spawn = { x: L.spawn.x, y: L.spawn.y, w: FISH[0], h: FISH[1] }
      L.ents.forEach((e, i) => {
        expect(e.id).toBe(i)
        expect(ENT_SIZE[e.k]).toBeDefined()
        const q = sweepRect(e)
        expect(solid(L, q.x, q.y, q.w, q.h), `${e.k}#${i} solid (seed ${seed})`).toBe(false)
        expect(overlap(q, spawn), `${e.k}#${i} on spawn (seed ${seed})`).toBe(false)
        if (e.k === 'jelly' || e.k === 'mine') {
          expect(e.amp).toBeGreaterThan(0)
          expect(e.y).toBe(e.by)
        }
        if (e.k === 'eel' || (e.k === 'shark' && !e.chaser)) {
          expect(e.b).toBeGreaterThan(e.a)
          expect(e.v).toBeGreaterThan(0)
        }
      })
    }
  })

  it('has 3 stars, 1-3 checkpoints and exactly one goal', () => {
    for (const seed of SEEDS) {
      const L = buildLevel(index, seed)
      const count = (k) => L.ents.filter((e) => e.k === k).length
      expect(count('star')).toBe(3)
      expect(L.starCount).toBe(3)
      expect(count('anem')).toBeGreaterThanOrEqual(1)
      expect(count('anem')).toBeLessThanOrEqual(3)
      expect(count('goal')).toBe(1)
      expect(count('shell')).toBeGreaterThanOrEqual(1)
      expect(count('shell')).toBeLessThanOrEqual(2)
      expect(count('heartB')).toBeGreaterThanOrEqual(1)
      expect(count('heartB')).toBeLessThanOrEqual(2)
      expect(count('pearl')).toBeGreaterThan(20)
      L.ents.filter((e) => e.k === 'anem').forEach((e) => expect(e.on).toBe(false))
    }
  })

  it('has a fish-passable route from spawn to the goal (terrain + static hazards)', () => {
    for (const seed of SEEDS) {
      const L = buildLevel(index, seed)
      const R = bfs(index, seed, false)
      expect(R.startOk).toBe(true)
      expect(R.touches(hitRect(L.ents.find((e) => e.k === 'goal'))), `goal unreachable (seed ${seed})`).toBe(true)
    }
  }, 120000)

  it('keeps a lane open past every moving hazard (worst-case sweeps)', () => {
    for (const seed of SEEDS) {
      const L = buildLevel(index, seed)
      const R = bfs(index, seed, true)
      expect(R.touches(hitRect(L.ents.find((e) => e.k === 'goal'))), `goal blocked by sweeps (seed ${seed})`).toBe(true)
    }
  }, 120000)

  it('can reach every checkpoint and pickup', () => {
    for (const seed of SEEDS) {
      const L = buildLevel(index, seed)
      const R = bfs(index, seed, false)
      for (const e of L.ents) {
        if (['star', 'shell', 'heartB', 'anem'].includes(e.k)) {
          expect(R.touches(hitRect(e)), `${e.k} at ${e.x},${e.y} unreachable (seed ${seed})`).toBe(true)
        }
      }
    }
  }, 120000)

  it('leaves >= 10px clearance beside static wall hazards', () => {
    for (const seed of SEEDS) {
      const L = buildLevel(index, seed)
      const statics = L.ents.filter((e) => e.k === 'urchin' || e.k === 'angler').map(spriteRect)
      for (let c = 0; c < L.cols; c++) {
        let blocked = []
        for (const q of statics) if (q.x < (c + 1) * TILE && q.x + q.w > c * TILE) blocked.push([q.y, q.y + q.h])
        if (!blocked.length) continue
        blocked.sort((a, b) => a[0] - b[0])
        let cur = L.ceil[c] * TILE
        let best = 0
        for (const [a, b] of blocked) {
          best = Math.max(best, a - cur)
          cur = Math.max(cur, b)
        }
        best = Math.max(best, L.floor[c] * TILE - cur)
        expect(best).toBeGreaterThanOrEqual(10)
      }
    }
  })

  it('reports maxScore from maxScoreFor and a sane par time', () => {
    for (const seed of SEEDS) {
      const L = buildLevel(index, seed)
      expect(L.maxScore).toBe(maxScoreFor(L))
      expect(L.parSec).toBeGreaterThanOrEqual(35)
      expect(L.parSec).toBeLessThanOrEqual(90)
      expect(L.maxScore).toBeGreaterThan(2500 + L.parSec * 10)
    }
  })
})

describe('reef level identity', () => {
  it('level 4 (JELLY FOREST) is taller than the rest and runs bottom-left to top-right', () => {
    for (const seed of SEEDS) {
      const rows = LEVELS.map((i) => buildLevel(i, seed).rows)
      expect(rows[3]).toBeGreaterThanOrEqual(44)
      LEVELS.filter((i) => i !== 3).forEach((i) => expect(rows[i]).toBeLessThan(rows[3]))
      const L = buildLevel(3, seed)
      const goal = L.ents.find((e) => e.k === 'goal')
      expect(L.spawn.y).toBeGreaterThan(L.rows * TILE * 0.7)
      expect(goal.y).toBeLessThan(L.rows * TILE * 0.35)
      expect(goal.x).toBeGreaterThan(L.cols * TILE * 0.8)
    }
  })

  it('only level 6 scrolls and has a chaser; only level 5 is dark', () => {
    for (const seed of SEEDS) {
      LEVELS.forEach((i) => {
        const L = buildLevel(i, seed)
        const chasers = L.ents.filter((e) => e.chaser)
        if (i === 5) {
          expect(L.scroll.speed0).toBeCloseTo(0.75, 2)
          expect(L.scroll.speed1).toBeCloseTo(1.15, 2)
          expect(chasers).toHaveLength(1)
          expect(chasers[0].k).toBe('shark')
          expect(L.current).toBe(true)
        } else {
          expect(L.scroll).toBeNull()
          expect(chasers).toHaveLength(0)
          expect(L.current).toBe(false)
        }
        expect(L.dark).toBe(i === 4)
      })
    }
  })

  it('has the intended hazard mix per level', () => {
    const kinds = (i) => new Set(buildLevel(i, SEEDS[0]).ents.map((e) => e.k))
    expect(kinds(0).has('urchin') || kinds(0).has('eel') || kinds(0).has('mine')).toBe(false)
    expect(kinds(0).has('jelly')).toBe(true)
    expect(kinds(1).has('eel')).toBe(true)
    expect(kinds(2).has('urchin')).toBe(true)
    expect(kinds(2).has('mine')).toBe(true)
    expect(kinds(3).has('jelly')).toBe(true)
    for (const k of ['urchin', 'mine', 'eel', 'angler']) {
      const any = SEEDS.some((s) => buildLevel(4, s).ents.some((e) => e.k === k))
      expect(any, `trench lacks ${k}`).toBe(true)
    }
    expect(kinds(5).has('mine')).toBe(true)
    expect(kinds(5).has('jelly')).toBe(true)
  })

  it('uses tighter passages in the late caves than in the kelp corridors', () => {
    const minGap = (i, seed) => {
      const L = buildLevel(i, seed)
      return Math.min(...L.ceil.map((c, k) => L.floor[k] - c).filter((g, k) => k > 20 && k < L.cols - 30 && g < 12))
    }
    for (const seed of SEEDS) {
      expect(minGap(2, seed)).toBeLessThanOrEqual(5)
      expect(minGap(4, seed)).toBeLessThanOrEqual(5)
      expect(minGap(1, seed)).toBeGreaterThanOrEqual(6)
    }
  })

  it('buildLevel is memoised and returns the same object for the same key', () => {
    expect(buildLevel(2, 99)).toBe(buildLevel(2, 99))
  })
})

describe('raceLevelIndex', () => {
  it('is in 0..5, stable and roughly uniform across seeds', () => {
    const counts = new Array(LEVEL_COUNT).fill(0)
    for (let s = 1; s <= 1200; s++) {
      const i = raceLevelIndex(s * 104729)
      expect(Number.isInteger(i)).toBe(true)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThanOrEqual(5)
      expect(raceLevelIndex(s * 104729)).toBe(i)
      counts[i]++
    }
    counts.forEach((n) => {
      expect(n).toBeGreaterThan(140)
      expect(n).toBeLessThan(260)
    })
  })
})
