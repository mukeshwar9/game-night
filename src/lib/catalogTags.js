// @ts-check
// Catalogue tags: the START HERE row and the POPULAR / NEW marks on cards.
//
// Nothing in the repo records play counts, so POPULAR and START HERE come from
// one short hand-picked list: easy to learn, quick, and good with a mixed
// group. Edit START_HERE to change both. NEW is not guessed: it follows the
// registry's `addedAt` date (isNewGame, 14-day window).

/** Hand-picked, in display order. Unknown or hidden types are skipped. */
export const START_HERE = [
  'tictactoe',
  'connectfour',
  'sketch',
  'chameleon',
  'justone',
  'trivia',
  'animalstack',
  'pong',
]

/**
 * The START HERE entries, in list order.
 * @template {{ type: string }} T
 * @param {T[]} entries games the picker currently shows
 * @returns {T[]}
 */
export function getStartHere(entries) {
  const byType = new Map(entries.map(e => [e.type, e]))
  return START_HERE.flatMap(type => {
    const entry = byType.get(type)
    return entry ? [entry] : []
  })
}

/**
 * The mark for one card. POPULAR wins over NEW.
 * @param {string} type
 * @param {Set<string>} newTypes types inside the NEW window
 * @returns {'popular' | 'new' | null}
 */
export function getCardTag(type, newTypes) {
  if (START_HERE.includes(type)) return 'popular'
  if (newTypes.has(type)) return 'new'
  return null
}
