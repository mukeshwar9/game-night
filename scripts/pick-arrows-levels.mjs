// Picks the seed for each of the 170 Arrows solo levels.
//
//   node scripts/pick-arrows-levels.mjs [seeds per level] [--write] [--chapters=9,10]
//
// Each level's shape (grid, outline, snake length, density, pieces) is built
// from the chapter table in src/lib/arrowsLevelsLogic.js. This script walks
// the chapters one by one and, per level, searches the solvable seeds whose
// board shows every piece taught so far (the lesson board: just the new one,
// and any intro the spec asks for), then takes the one whose difficulty is
// nearest a target rising through the chapter, strictly above the previous
// level where it can. A coverage floor comes first: boards whose arrows cover
// at least FLOOR of the playable cells are preferred; when none in the seed
// budget does, the best coverage among the valid boards is taken and a
// warning is printed. With --write the seeds replace ARROWS_LEVEL_SEEDS in
// arrowsLevelsLogic.js; then run scripts/bake-arrows-levels.mjs. With
// --chapters (0-based) only those chapters are picked again and every other
// level keeps its seed.

import fs from 'node:fs'
import { Worker } from 'node:worker_threads'
import { availableParallelism } from 'node:os'
import { ARROWS_CHAPTERS, ARROWS_LEVEL_SEEDS, ARROWS_LEVEL_SPECS } from '../src/lib/arrowsLevelsLogic.js'

const TRIES = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 300)
const WRITE = process.argv.includes('--write')
const FLOOR = 0.75
const ONLY = process.argv.find((a) => a.startsWith('--chapters='))?.slice(11).split(',').map(Number)
const started = Date.now()

const workers = Array.from({ length: Math.min(8, availableParallelism()) }, () => new Worker(new URL('./pick-arrows-worker.mjs', import.meta.url)))
const poolsFor = (jobs) => new Promise((resolve) => {
  const result = []
  let next = 0
  let pending = jobs.length
  const feed = (worker) => {
    if (next >= jobs.length) return
    const id = next
    next += 1
    worker.postMessage({ id, ...jobs[id], tries: TRIES })
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

const seeds = []
const rows = []
const belowFloor = []
const notRising = []
for (const [ci, chapter] of ARROWS_CHAPTERS.entries()) {
  if (ONLY && !ONLY.includes(ci)) { seeds.push(...ARROWS_LEVEL_SEEDS.slice(chapter.from - 1, chapter.to)); continue }
  const pieces = ARROWS_CHAPTERS.slice(0, ci + 1).map((c) => c.piece)
  const jobs = Array.from({ length: 10 }, (_, k) => ({
    spec: ARROWS_LEVEL_SPECS[chapter.from - 1 + k],
    name: `level-${chapter.from + k}`,
    // The first chapter has no new piece on its lesson board (level 1).
    need: ci === 0 ? [] : k === 0 ? [chapter.piece] : pieces,
  }))
  const pools = await poolsFor(jobs)
  if (pools.some((p) => !p.length)) {
    pools.forEach((p, k) => { if (!p.length) console.log(`NONE: level ${chapter.from + k} has no valid seed in ${TRIES}`) })
    throw new Error(`chapter ${chapter.name}: a level has no usable seed`)
  }
  const lo = Math.min(...pools[0].map((s) => s.difficulty))
  const hi = Math.max(...pools[9].map((s) => s.difficulty))
  let prev = -Infinity
  pools.forEach((pool, k) => {
    const n = chapter.from + k
    const target = lo + ((hi - lo) * k) / 9
    const rising = pool.filter((s) => s.difficulty > prev)
    const dist = (s) => Math.abs(s.difficulty - target)
    const byTarget = (list) => list.slice().sort((a, b) => dist(a) - dist(b))[0]
    const byCoverage = (list) => list.slice().sort((a, b) => b.coverage - a.coverage || dist(a) - dist(b))[0]
    const solid = (list) => list.filter((s) => s.coverage >= FLOOR)
    // Floor and rising first; then rising at the best coverage; then the floor
    // alone; then the best coverage there is.
    let pick
    if (solid(rising).length) pick = byTarget(solid(rising))
    else if (rising.length) pick = byCoverage(rising)
    else if (solid(pool).length) pick = byTarget(solid(pool))
    else pick = byCoverage(pool)
    const isRising = pick.difficulty > prev
    if (pick.coverage < FLOOR) belowFloor.push(n)
    if (!isRising && k > 0) notRising.push(n)
    prev = pick.difficulty
    seeds.push(pick.seed)
    const spec = ARROWS_LEVEL_SPECS[n - 1]
    rows.push(`L${String(n).padStart(3)} ${chapter.name.padEnd(15)} ${String(spec.cols).padStart(2)}x${String(spec.rows).padEnd(2)} ${(spec.shape ?? '-').padEnd(9)} seed ${String(pick.seed).padStart(4)} pool ${String(pool.length).padStart(3)} arrows ${String(pick.arrows).padStart(3)} waves ${String(pick.layers).padStart(2)} diff ${String(pick.difficulty).padStart(5)} cover ${Math.round(100 * pick.coverage)}%${pick.coverage < FLOOR ? ' BELOW FLOOR' : ''}${!isRising && k > 0 ? ' NOT RISING' : ''}`)
    if (pick.coverage < FLOOR) console.log(`warning: level ${n} covers ${Math.round(100 * pick.coverage)}% (floor ${Math.round(100 * FLOOR)}%), best of ${pool.length} valid seeds`)
  })
  console.log(rows.slice(-10).join('\n'))
}
for (const worker of workers) await worker.terminate()

const text = `[\n${Array.from({ length: 17 }, (_, i) => `  ${seeds.slice(i * 10, i * 10 + 10).join(', ')},`).join('\n')}\n]`
console.log(`\nexport const ARROWS_LEVEL_SEEDS = ${text}`)
console.log(`\n${seeds.length} levels, ${TRIES} seeds each, ${((Date.now() - started) / 1000).toFixed(0)} s`)
console.log(`below the ${Math.round(100 * FLOOR)}% coverage floor: ${belowFloor.length ? belowFloor.join(', ') : 'none'}`)
console.log(`not rising within the chapter: ${notRising.length ? notRising.join(', ') : 'none'}`)
if (WRITE) {
  const file = new URL('../src/lib/arrowsLevelsLogic.js', import.meta.url)
  const src = fs.readFileSync(file, 'utf8')
  const next = src.replace(/export const ARROWS_LEVEL_SEEDS = (\[[^\]]*\]|Array\.from\([^\n]*\))/, `export const ARROWS_LEVEL_SEEDS = ${text}`)
  if (next === src) throw new Error('ARROWS_LEVEL_SEEDS not found')
  fs.writeFileSync(file, next)
  console.log('wrote ARROWS_LEVEL_SEEDS')
}
