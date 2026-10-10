// @ts-check
// What Changed?: a grid of objects (the Pairs faces) is shown, blanks out, and
// comes back with one change. Tap where it changed. Pure.
import { PAIRS_FACES } from './pairsLogic'

export function wcSide(level) { return level <= 5 ? 4 : 5 }
// Objects on the board: 4 at level 1, one more per level, at most cells − 4.
export function wcCount(level) { return Math.min(wcSide(level) ** 2 - 4, 3 + level) }
// Study time (posture B starting value): 2.5 s plus 0.25 s per object, at most 6 s.
export function wcStudyMs(level) { return Math.min(6000, 2500 + wcCount(level) * 250) }
export const WC_BLANK_MS = 700

const CHANGES = ['move', 'swap', 'gone']

function shuffled(arr, rand) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

/**
 * @returns {{ side: number, before: string[], after: string[], change: { type: string, cells: number[] } }}
 * `before`/`after` are face names or '' per cell; `cells` are the taps that count.
 */
export function dealWhatChanged(level, rand = Math.random) {
  const side = wcSide(level)
  const cellsN = side * side
  const count = wcCount(level)
  const faces = shuffled(PAIRS_FACES, rand)
  const spots = shuffled(Array.from({ length: cellsN }, (_, i) => i), rand)
  const before = Array(cellsN).fill('')
  spots.slice(0, count).forEach((c, i) => { before[c] = faces[i] })
  const after = [...before]
  const type = CHANGES[Math.floor(rand() * CHANGES.length)]
  const target = spots[Math.floor(rand() * count)]
  let cells
  if (type === 'move') {
    const to = spots[count + Math.floor(rand() * (cellsN - count))]
    after[to] = after[target]
    after[target] = ''
    cells = [target, to] // either end of the move counts
  } else if (type === 'swap') {
    after[target] = faces[count] // a face that was not on the board
    cells = [target]
  } else {
    after[target] = ''
    cells = [target]
  }
  return { side, before, after, change: { type, cells } }
}
