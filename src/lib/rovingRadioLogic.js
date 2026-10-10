// @ts-check
// Keyboard model for option grids drawn as a radiogroup (the avatar editor's
// tiles and swatches, the pet sheet). The group is one Tab stop: the checked
// option (or the first, when none is checked) holds tabIndex 0. Arrow keys move
// and check, as in the WAI-ARIA radio group pattern; in a grid, Up and Down move
// by a row. Left and Right wrap around the whole group; Up and Down stop at the
// first and last row.

/**
 * The index focus moves to, or null when the key is not a radio-group key.
 * @param {string} key KeyboardEvent.key
 * @param {number} index the focused option (-1 when focus is elsewhere)
 * @param {number} count options in the group
 * @param {number} [columns] options per row (1 for a single row of options)
 * @returns {number | null}
 */
export function nextRadioIndex(key, index, count, columns = 1) {
  if (count <= 0) return null
  const i = Math.min(Math.max(index, 0), count - 1)
  const cols = Math.max(1, Math.floor(columns))
  switch (key) {
    case 'ArrowRight': return (i + 1) % count
    case 'ArrowLeft': return (i - 1 + count) % count
    case 'ArrowDown': return cols === 1 ? (i + 1) % count : Math.min(i + cols, count - 1)
    case 'ArrowUp': return cols === 1 ? (i - 1 + count) % count : Math.max(i - cols, 0)
    case 'Home': return 0
    case 'End': return count - 1
    default: return null
  }
}

/**
 * Options per row, from the options' top offsets in layout order: the run of
 * options that share the first one's row.
 * @param {number[]} tops
 * @returns {number}
 */
export function columnsFromTops(tops) {
  if (!tops.length) return 1
  let n = 1
  while (n < tops.length && Math.abs(tops[n] - tops[0]) < 2) n++
  return n
}

/**
 * The option that holds the group's single Tab stop.
 * @param {boolean[]} checked
 * @returns {number}
 */
export function tabStopIndex(checked) {
  const i = checked.indexOf(true)
  return i < 0 ? 0 : i
}
