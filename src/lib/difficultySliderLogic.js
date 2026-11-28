// @ts-check
// Pure rules for the one-drag difficulty slider (DifficultySlider.jsx): which
// stop a stored level sits on, how a stop reads in words, and the pixel face
// that gets grumpier as the stops get harder. No DOM, no storage: the level ids
// themselves (easy / normal / hard, see botLevels.js) are never renamed here.

/** Width and height of the face grid, in cells. */
export const FACE_SIZE = 12

/** Mood 0 is the friendliest face, MOOD_COUNT - 1 the grumpiest. */
export const MOOD_COUNT = 4

/** Theme colour role behind each mood (a Tailwind `retro-*` token name). */
export const MOOD_TOKENS = /** @type {const} */ (['win', 'cta', 'p2', 'danger'])

/** @type {Record<string, { label: string, blurb: string }>} */
const LEVEL_COPY = {
  easy: { label: 'EASY', blurb: 'Goes easy on you.' },
  normal: { label: 'NORMAL', blurb: 'A fair fight.' },
  hard: { label: 'HARD', blurb: 'Plays to win.' },
}

/**
 * The words for a level; an id with no copy of its own reads as itself.
 * @param {string} level
 */
export function levelCopy(level) {
  return LEVEL_COPY[level] ?? { label: String(level).toUpperCase(), blurb: '' }
}

/**
 * The stop a stored level sits on. A value that is not one of `levels` lands on
 * NORMAL when there is one, otherwise on the first stop.
 * @param {readonly string[]} levels
 * @param {unknown} value
 */
export function stopIndex(levels, value) {
  const found = levels.indexOf(/** @type {string} */ (value))
  if (found >= 0) return found
  return Math.max(0, levels.indexOf('normal'))
}

/**
 * Where a stop sits along the bar, 0 to 100.
 * @param {number} index
 * @param {number} count
 */
export function stopPercent(index, count) {
  if (count < 2) return 0
  const clamped = Math.min(Math.max(index, 0), count - 1)
  return (clamped / (count - 1)) * 100
}

/**
 * The face mood for a stop: the first stop is always the friendliest, the last
 * always the grumpiest, and a middle stop sits in between.
 * @param {number} index
 * @param {number} count
 */
export function moodFor(index, count) {
  if (count < 2) return 1
  const clamped = Math.min(Math.max(index, 0), count - 1)
  return Math.min(MOOD_COUNT - 1, Math.floor((clamped / (count - 1)) * (MOOD_COUNT - 1) + 1e-9))
}

/** @typedef {{ x: number, y: number }} Cell */

/** Head outline: a 12 x 12 square with its four corners clipped. */
function headRows() {
  const outline = []
  for (let x = 1; x <= 10; x += 1) { outline.push({ x, y: 0 }, { x, y: 11 }) }
  for (let y = 1; y <= 10; y += 1) { outline.push({ x: 0, y }, { x: 11, y }) }
  return outline
}

/** Every cell inside the outline. */
function headFill() {
  const fill = []
  for (let y = 1; y <= 10; y += 1) for (let x = 1; x <= 10; x += 1) fill.push({ x, y })
  return fill
}

/** @type {Cell[]} */
const EYES = [
  { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 3, y: 5 }, { x: 4, y: 5 },
  { x: 7, y: 4 }, { x: 8, y: 4 }, { x: 7, y: 5 }, { x: 8, y: 5 },
]

/** @type {Record<number, Cell[]>} */
const FEATURES = {
  // Grin: eyes and a smile that curls up at both ends.
  0: [...EYES, { x: 3, y: 7 }, { x: 8, y: 7 }, { x: 4, y: 8 }, { x: 5, y: 8 }, { x: 6, y: 8 }, { x: 7, y: 8 }],
  // Flat: eyes and a straight mouth.
  1: [...EYES, { x: 3, y: 8 }, { x: 4, y: 8 }, { x: 5, y: 8 }, { x: 6, y: 8 }, { x: 7, y: 8 }, { x: 8, y: 8 }],
  // Smirk: level brows, a mouth that lifts on one side.
  2: [
    ...EYES, { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 7, y: 3 }, { x: 8, y: 3 },
    { x: 4, y: 8 }, { x: 5, y: 8 }, { x: 6, y: 8 }, { x: 7, y: 8 }, { x: 8, y: 7 },
  ],
  // Grumpy: brows slanting down to the middle and a frown.
  3: [
    ...EYES, { x: 2, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 9, y: 2 }, { x: 8, y: 3 }, { x: 7, y: 3 },
    { x: 4, y: 7 }, { x: 5, y: 7 }, { x: 6, y: 7 }, { x: 7, y: 7 }, { x: 3, y: 8 }, { x: 8, y: 8 },
  ],
}

/**
 * The face for a mood as two cell lists: `ink` (outline and features) and
 * `fill` (the face colour behind them). An unknown mood draws the flat face.
 * @param {number} mood
 * @returns {{ ink: Cell[], fill: Cell[] }}
 */
export function faceCells(mood) {
  const features = FEATURES[mood] ?? FEATURES[1]
  const ink = [...headRows(), ...features]
  const inked = new Set(ink.map(({ x, y }) => `${x},${y}`))
  return { ink, fill: headFill().filter(({ x, y }) => !inked.has(`${x},${y}`)) }
}
