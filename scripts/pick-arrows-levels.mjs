// Picks the seed for each of the 20 Arrows solo levels.
//
//   node scripts/pick-arrows-levels.mjs
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
import { ARROWS_LEVEL_SPECS, levelMeetsIntro } from '../src/lib/arrowsLevelsLogic.js'

const TRIES = 2500
const statsFor = (spec) => {
  const out = []
  for (let seed = 1; seed <= TRIES; seed += 1) {
    const level = generateArrowsLevel(seed, spec)
    const st = levelStats(level)
    if (st.solvable && levelMeetsIntro(spec, level)) out.push({ seed, ...st })
  }
  return out
}

const pools = ARROWS_LEVEL_SPECS.map(statsFor)
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
console.log(`\nexport const ARROWS_LEVEL_SEEDS = [${seeds.join(', ')}]`)
