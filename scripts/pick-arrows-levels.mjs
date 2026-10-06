// Picks the seed for each of the 100 Arrows solo levels.
//
//   node scripts/pick-arrows-levels.mjs [first level]
//
// Levels 1–20 (below) climb steadily. Levels 21–100 are picked chapter by
// chapter further down: each chapter opens on a lighter lesson level, then
// every level beats the one before it and the chapter's last level beats the
// previous chapter's last level. With a first level (a chapter start: 21, 31,
// … 61, 71, …) the earlier seeds are kept from ARROWS_LEVEL_SEEDS, so levels
// players have already starred are never re-picked. After pasting new seeds
// for 21+, run scripts/bake-arrows-levels.mjs to bake their boards.
//
// Each level's shape (grid, snake length, density, twists) is hand-set in
// ARROWS_LEVEL_SPECS (src/lib/arrowsLevelsLogic.js). This script searches
// seeds for every spec and keeps the one whose difficulty score lands closest
// to a steadily rising target (and whose depth, in solve waves, tracks a
// rising 2 → 11 target), strictly above the previous level, with at least
// as many arrows and as many waves as the previous level and never fewer
// than two waves (level 1 already needs one arrow moved first),
// and that shows the level's twist when it is the one introducing it. Paste the
// printed seeds into ARROWS_LEVEL_SEEDS; arrowsLevelsLogic.test.js re-checks
// every level is solvable and that difficulty keeps climbing.

import { Worker } from 'node:worker_threads'
import { availableParallelism } from 'node:os'
import { generateArrowsLevel, levelStats } from '../src/lib/arrowsLogic.js'
import { ARROWS_GENERATED_LEVELS, ARROWS_LEVEL_SEEDS, ARROWS_LEVEL_SPECS, getArrowsLevel, levelMeetsIntro } from '../src/lib/arrowsLevelsLogic.js'

const FIRST = Number(process.argv[2] ?? 1)
if (FIRST !== 1 && (FIRST <= ARROWS_GENERATED_LEVELS || (FIRST - ARROWS_GENERATED_LEVELS - 1) % 10 !== 0)) {
  throw new Error(`first level must be 1 or a chapter start (21, 31, …), got ${process.argv[2]}`)
}

const TRIES = 2500
const CHAPTER_TRIES = 300
const DEPTH_FREE_FROM = 60
const statsFor = (spec) => {
  const out = []
  for (let seed = 1; seed <= TRIES; seed += 1) {
    const level = generateArrowsLevel(seed, spec)
    const st = levelStats(level)
    if (st.solvable && levelMeetsIntro(spec, level)) out.push({ seed, ...st })
  }
  return out
}

const STEADY = ARROWS_LEVEL_SPECS.slice(0, ARROWS_GENERATED_LEVELS)
const pools = FIRST === 1 ? STEADY.map(statsFor) : []
const lo = pools.length ? Math.min(...pools[0].map((s) => s.difficulty)) : 0
const hi = pools.length ? Math.max(...pools[pools.length - 1].map((s) => s.difficulty)) : 0
// Depth (solve waves) climbs from 2 to 11 alongside the difficulty score;
// both targets steer the pick, and depth may never drop.
const layerTarget = (i) => 2 + (9 * i) / (pools.length - 1)
let prev = { difficulty: -Infinity, arrows: 0, layers: 2 }
const seeds = []
pools.forEach((pool, i) => {
  const target = lo + ((hi - lo) * i) / (pools.length - 1)
  const ok = pool.filter((s) => s.difficulty > prev.difficulty + 2 && s.arrows >= prev.arrows && s.layers >= prev.layers)
  if (!ok.length) throw new Error(`level ${i + 1}: no seed beats ${JSON.stringify(prev)}`)
  const cost = (s) => Math.abs(s.difficulty - target) + 6 * Math.abs(s.layers - layerTarget(i))
  ok.sort((a, b) => cost(a) - cost(b))
  const pick = ok[0]
  prev = pick
  seeds.push(pick.seed)
  console.log(`L${i + 1}`, JSON.stringify(pick), `target ${target.toFixed(0)} / ${layerTarget(i).toFixed(1)} waves`)
})

// ── Levels 21+: chapters of ten, a sawtooth ────────────────────────────────
// Per chapter, a backward pass keeps only the seeds that can still be
// followed by a rising chain ending in a level that beats the previous
// chapter's last; the forward pass then takes the feasible seed nearest each
// level's target, a percentile of its pool's difficulty (30th for the lesson
// level, then 50th rising to 95th for the last).
const workers = Array.from({ length: Math.min(6, availableParallelism()) }, () => new Worker(new URL('./pick-arrows-worker.mjs', import.meta.url)))
const chapterPools = (specs, firstN) => new Promise((resolve) => {
  const result = []
  let next = 0
  let pending = specs.length
  const feed = (worker) => {
    if (next >= specs.length) return
    const id = next
    next += 1
    worker.postMessage({ id, spec: specs[id], name: `level-${firstN + id}`, tries: CHAPTER_TRIES })
  }
  for (const worker of workers) {
    worker.on('message', ({ id, out }) => {
      result[id] = out
      pending -= 1
      if (pending === 0) resolve(result)
      else feed(worker)
    })
    feed(worker)
  }
})
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] }
// Resuming at a chapter start keeps every earlier seed, and the level before
// it is the boss to beat.
let boss = prev
if (FIRST > 1) {
  seeds.push(...ARROWS_LEVEL_SEEDS.slice(0, FIRST - 1))
  boss = levelStats(getArrowsLevel(FIRST - 1))
}
for (let from = Math.max(FIRST - 1, ARROWS_GENERATED_LEVELS); from < ARROWS_LEVEL_SPECS.length; from += 10) {
  const ch = await chapterPools(ARROWS_LEVEL_SPECS.slice(from, from + 10), from + 1)
  // From level 61 some boards are shaped and shallower than a full rectangle,
  // so depth may dip there; difficulty (which counts depth) still has to rise.
  const deeper = (a, b) => from + 1 > DEPTH_FREE_FROM || a.layers >= b.layers
  const feas = ch.map(() => new Set())
  for (let p = ch.length - 1; p >= 0; p -= 1) {
    for (const st of ch[p]) {
      const ok = p === ch.length - 1
        ? st.difficulty > boss.difficulty
        : ch[p + 1].some((t) => feas[p + 1].has(t) && t.difficulty > st.difficulty && deeper(t, st))
      if (ok) feas[p].add(st)
    }
  }
  let last = null
  ch.forEach((pool, p) => {
    const target = pct(pool.map((st) => st.difficulty), p === 0 ? 0.3 : 0.45 + 0.055 * p)
    let ok = pool.filter((st) => feas[p].has(st))
    if (last) ok = ok.filter((st) => st.difficulty > last.difficulty && deeper(st, last))
    if (!ok.length) {
      const top = Math.max(...pool.map((st) => st.difficulty))
      throw new Error(`level ${from + p + 1}: no seed fits the chapter (${pool.length} usable seeds, top difficulty ${top}, ${feas[p].size} can still reach the chapter boss, boss to beat ${boss.difficulty})`)
    }
    ok.sort((a, b) => Math.abs(a.difficulty - target) - Math.abs(b.difficulty - target))
    last = ok[0]
    seeds.push(last.seed)
    console.log(`L${from + p + 1}`, JSON.stringify(last), `target ${target}`)
  })
  boss = last
}
for (const worker of workers) await worker.terminate()
console.log(`\nexport const ARROWS_LEVEL_SEEDS = [${seeds.join(', ')}]`)
