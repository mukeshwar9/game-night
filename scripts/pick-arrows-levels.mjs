// Picks the seed for each of the 60 Arrows solo levels.
//
//   node scripts/pick-arrows-levels.mjs
//
// Levels 1–20 (below) climb steadily. Levels 21–60 are picked chapter by
// chapter further down: each chapter opens on a lighter lesson level, then
// every level beats the one before it and the chapter's last level beats the
// previous chapter's last level. After pasting new seeds for 21+, run
// scripts/bake-arrows-levels.mjs to bake their boards.
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

import { generateArrowsLevel, levelStats } from '../src/lib/arrowsLogic.js'
import { ARROWS_GENERATED_LEVELS, ARROWS_LEVEL_SPECS, levelMeetsIntro } from '../src/lib/arrowsLevelsLogic.js'

const TRIES = 2500
const CHAPTER_TRIES = 300
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
const pools = STEADY.map(statsFor)
const lo = Math.min(...pools[0].map((s) => s.difficulty))
const hi = Math.max(...pools[pools.length - 1].map((s) => s.difficulty))
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
const chapterStats = (spec, n) => {
  const out = []
  for (let seed = 1; seed <= CHAPTER_TRIES; seed += 1) {
    const level = generateArrowsLevel(seed, { ...spec, name: `level-${n}` })
    const st = levelStats(level)
    if (st.solvable && levelMeetsIntro(spec, level)) out.push({ seed, ...st })
  }
  return out
}
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] }
let boss = prev
for (let from = ARROWS_GENERATED_LEVELS; from < ARROWS_LEVEL_SPECS.length; from += 10) {
  const ch = ARROWS_LEVEL_SPECS.slice(from, from + 10).map((spec, p) => chapterStats(spec, from + p + 1))
  const feas = ch.map(() => new Set())
  for (let p = ch.length - 1; p >= 0; p -= 1) {
    for (const st of ch[p]) {
      const ok = p === ch.length - 1
        ? st.difficulty > boss.difficulty
        : ch[p + 1].some((t) => feas[p + 1].has(t) && t.difficulty > st.difficulty && t.layers >= st.layers)
      if (ok) feas[p].add(st)
    }
  }
  let last = null
  ch.forEach((pool, p) => {
    const target = pct(pool.map((st) => st.difficulty), p === 0 ? 0.3 : 0.45 + 0.055 * p)
    let ok = pool.filter((st) => feas[p].has(st))
    if (last) ok = ok.filter((st) => st.difficulty > last.difficulty && st.layers >= last.layers)
    if (!ok.length) throw new Error(`level ${from + p + 1}: no seed fits the chapter`)
    ok.sort((a, b) => Math.abs(a.difficulty - target) - Math.abs(b.difficulty - target))
    last = ok[0]
    seeds.push(last.seed)
    console.log(`L${from + p + 1}`, JSON.stringify(last), `target ${target}`)
  })
  boss = last
}
console.log(`\nexport const ARROWS_LEVEL_SEEDS = [${seeds.join(', ')}]`)
