// Worker for scripts/pick-arrows-levels.mjs: generates and scores the seed
// pool of one level spec. Big boards take ~100 ms each, so the picker fans
// the pools out over a few threads.
import { parentPort } from 'node:worker_threads'
import { generateArrowsLevel, levelStats } from '../src/lib/arrowsLogic.js'
import { diagonalUsesMods, levelMeetsIntro, twistsIn } from '../src/lib/arrowsLevelsLogic.js'
import { maskCells } from '../src/lib/arrowsShapes.js'

// Share of the playable cells that an arrow covers.
function coverage(level) {
  const playable = level.mask ? maskCells(level.mask) : level.cols * level.rows
  return level.arrows.reduce((sum, a) => sum + a.cells.length, 0) / playable
}

parentPort.on('message', ({ id, spec, name, tries, need }) => {
  const out = []
  for (let seed = 1; seed <= tries; seed += 1) {
    const level = generateArrowsLevel(seed, { ...spec, name })
    const st = levelStats(level)
    if (!st.solvable || !levelMeetsIntro(spec, level)) continue
    // A diagonal may only meet a mirror, ring or tunnel once the mods are taught.
    if (!spec.diagMods && diagonalUsesMods(level)) continue
    // Every piece taught so far must show (the lesson board: just the new one).
    const shown = new Set(twistsIn(level))
    if (need.some((piece) => !shown.has(piece))) continue
    out.push({ seed, difficulty: st.difficulty, arrows: st.arrows, layers: st.layers, free: st.initialFree, coverage: coverage(level) })
  }
  parentPort.postMessage({ id, out })
})
