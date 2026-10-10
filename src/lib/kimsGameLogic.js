// @ts-check
// Lost & Found (Kim's Game): study a tray of objects, it is covered, then shown
// again — shuffled, with one object gone. Pick the missing one from six choices.
// Pure.
import { PAIRS_FACES } from './pairsLogic'

export const KIM_CHOICES = 6
export function kimTraySize(level) { return Math.min(PAIRS_FACES.length - (KIM_CHOICES - 1), 4 + level) }
// Study time (posture B): 7 s, one second less every three levels, never under 4 s.
export function kimStudyMs(level) { return Math.max(4000, 7000 - Math.floor((level - 1) / 3) * 1000) }

function shuffled(arr, rand) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

/**
 * @returns {{ tray: string[], missing: string, after: string[], choices: string[] }}
 * Decoys are objects that were never on the tray, so the answer needs memory,
 * not a scan of the second tray.
 */
export function dealKim(level, rand = Math.random) {
  const faces = shuffled(PAIRS_FACES, rand)
  const size = kimTraySize(level)
  const tray = faces.slice(0, size)
  const missing = tray[Math.floor(rand() * size)]
  const after = shuffled(tray.filter(f => f !== missing), rand)
  const choices = shuffled([missing, ...faces.slice(size, size + KIM_CHOICES - 1)], rand)
  return { tray, missing, after, choices }
}
