// Shared helpers for the WIRE CROSSED unit tests (not imported by app code).
import { applyWireAction, armWire } from '../wireLogic'
import { makeRng } from './rng'
import { makeShell } from './shell'
import { MODULES } from './modules'

/** A one-module bomb around a freshly generated module, for property tests. */
export function soloBomb(type, seed, tier = 1) {
  const rng = makeRng(`kit:${type}:${seed}`)
  const shell = makeShell(rng)
  const module = MODULES[type].generate(rng, tier, { level: 1, mode: 'easy', serial: shell.serial, indicators: shell.indicators })
  return { seed: String(seed), level: 1, ...shell, modules: [module], durationMs: 180_000 }
}

/** An armed wire node for `bomb` with a comfortable clock. */
export function armedFor(bomb, now = 1000) {
  const ready = { seed: bomb.seed, level: bomb.level, mode: bomb.mode ?? 'easy', run: { booms: 0, ms: 0 }, tech: 'X', phase: 'ready', strikes: 0 }
  return armWire(ready, now, 600_000)
}

/** Drive module `i` to solved with solveNext; returns the final { wire, steps }. */
export function clearModule(bomb, wire, i, now = 2000) {
  const module = bomb.modules[i]
  let steps = 0
  let cur = wire
  while (!cur.solved?.[i] && cur.phase === 'armed') {
    if (++steps > 500) throw new Error(`${module.type} did not clear in 500 steps`)
    const action = MODULES[module.type].solveNext(module, bomb, cur, i, now)
    const res = applyWireAction(cur, bomb, action, now, 'X')
    if (!res || !res.ok) throw new Error(`${module.type} solveNext gave a bad action ${JSON.stringify(action)}`)
    cur = res.wire
  }
  return { wire: cur, steps }
}
