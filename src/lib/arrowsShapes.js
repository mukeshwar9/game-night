// @ts-check
// Arrows — outlines for shaped boards. A shape is a `mask`: one string per
// row, '#' for a playable cell and '.' for a void (see arrowsLogic.js, where
// a void is an edge). The campaign specs call shapeMask() once at load and the
// baked boards store the finished rows, so a tweak here never reshapes a level
// players have already starred. Pure: no DOM, no Firebase, no React.

export const ARROWS_SHAPES = ['diamond', 'cross', 'donut', 'heart', 'lantern', 'arrow']

// Is the cell at normalised (u, v) ∈ [-1, 1]² (v grows downward) inside?
/** @type {Record<string, (u: number, v: number) => boolean>} */
const INSIDE = {
  diamond: (u, v) => Math.abs(u) + Math.abs(v) <= 1.04,
  cross: (u, v) => Math.abs(u) <= 0.4 || Math.abs(v) <= 0.4,
  // A ring: the hole is empty space, so it is an edge like the outline.
  donut: (u, v) => u * u + v * v <= 1.02 && u * u + v * v >= 0.17,
  heart: (u, v) => {
    const x = u * 1.2
    const y = -v * 1.15 + 0.2
    return (x * x + y * y - 1) ** 3 - x * x * y ** 3 <= 0
  },
  // An octagon with a small diamond window.
  lantern: (u, v) => Math.abs(u) + Math.abs(v) <= 1.5 && Math.abs(u) + Math.abs(v) >= 0.3,
  // An up arrow: a triangular head over a shaft.
  arrow: (u, v) => (v <= 0.02 ? Math.abs(u) <= (v + 1.07) * 0.98 : Math.abs(u) <= 0.34),
}

/**
 * The mask of `shape` on a cols × rows grid.
 * @param {string} shape
 * @param {number} cols
 * @param {number} rows
 * @returns {string[]}
 */
export function shapeMask(shape, cols, rows) {
  const inside = INSIDE[shape]
  if (!inside) throw new Error(`unknown arrows shape: ${shape}`)
  const out = []
  for (let y = 0; y < rows; y += 1) {
    let row = ''
    for (let x = 0; x < cols; x += 1) {
      row += inside(((x + 0.5) / cols) * 2 - 1, ((y + 0.5) / rows) * 2 - 1) ? '#' : '.'
    }
    out.push(row)
  }
  return out
}

/** Number of playable cells in a mask. */
export function maskCells(mask) {
  let n = 0
  for (const row of mask) for (const ch of row) if (ch === '#') n += 1
  return n
}

/** Do the playable cells form one piece (4-neighbour connected)? */
export function maskConnected(mask) {
  const rows = mask.length
  const cols = rows ? mask[0].length : 0
  const total = maskCells(mask)
  if (total === 0) return false
  let start = -1
  for (let i = 0; i < rows * cols && start < 0; i += 1) if (mask[Math.floor(i / cols)][i % cols] === '#') start = i
  const seen = new Set([start])
  const queue = [start]
  while (queue.length) {
    const c = /** @type {number} */ (queue.pop())
    const x = c % cols
    const y = Math.floor(c / cols)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const u = x + dx
      const v = y + dy
      if (u < 0 || v < 0 || u >= cols || v >= rows || mask[v][u] !== '#') continue
      const n = v * cols + u
      if (!seen.has(n)) { seen.add(n); queue.push(n) }
    }
  }
  return seen.size === total
}
