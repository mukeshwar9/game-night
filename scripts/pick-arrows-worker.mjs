// Worker for scripts/pick-arrows-levels.mjs: generates and scores the seed
// pool of one level spec. Boards past level 60 take ~100 ms each, so the
// picker fans the pools out over a few threads.
import { parentPort } from 'node:worker_threads'
import { generateArrowsLevel, levelStats } from '../src/lib/arrowsLogic.js'
import { levelMeetsIntro } from '../src/lib/arrowsLevelsLogic.js'

parentPort.on('message', ({ id, spec, name, tries }) => {
  const out = []
  for (let seed = 1; seed <= tries; seed += 1) {
    const level = generateArrowsLevel(seed, { ...spec, name })
    const st = levelStats(level)
    if (st.solvable && levelMeetsIntro(spec, level)) out.push({ seed, ...st })
  }
  parentPort.postMessage({ id, out })
})
