// @ts-check
// Arrows — outlines for shaped boards. A shape is a `mask`: one string per
// row, '#' for a playable cell and '.' for a void (see arrowsLogic.js, where
// a void is an edge). The campaign specs call shapeMask() once at load and the
// baked boards store the finished rows, so a tweak here never reshapes a level
// players have already starred. Pure: no DOM, no Firebase, no React.

// The six outlines of the original endless pool. Endless boards draw only
// from this list (see ARROWS_ENDLESS_SHAPES), so adding an outline to the
// library below never reshapes them.
export const ARROWS_SHAPES = ['diamond', 'cross', 'donut', 'heart', 'lantern', 'arrow']

// Is the cell at normalised (u, v) ∈ [-1, 1]² (v grows downward) inside?
/** @type {Record<string, (u: number, v: number) => boolean>} */
const INSIDE = {
  octagon: (u, v) => Math.abs(u) + Math.abs(v) <= 1.45,
  diamond: (u, v) => Math.abs(u) + Math.abs(v) <= 1.04,
  cross: (u, v) => Math.abs(u) <= 0.4 || Math.abs(v) <= 0.4,
  hexagon: (u, v) => Math.abs(v) <= 0.98 && Math.abs(u) + 0.55 * Math.abs(v) <= 1.02,
  // A square frame: the middle is empty space.
  ring: (u, v) => Math.max(Math.abs(u), Math.abs(v)) >= 0.42,
  tee: (u, v) => v <= -0.3 || Math.abs(u) <= 0.36,
  hourglass: (u, v) => Math.abs(u) <= 0.28 + 0.74 * Math.abs(v),
  ell: (u, v) => u <= -0.15 || v >= 0.25,
  // A ring: the hole is empty space, so it is an edge like the outline.
  donut: (u, v) => u * u + v * v <= 1.02 && u * u + v * v >= 0.17,
  triangle: (u, v) => Math.abs(u) <= 0.14 + (v + 1) * 0.46,
  heart: (u, v) => {
    const x = u * 1.2
    const y = -v * 1.15 + 0.2
    return (x * x + y * y - 1) ** 3 - x * x * y ** 3 <= 0
  },
  peanut: (u, v) => u * u + ((v + 0.48) / 0.55) ** 2 <= 1 || u * u + ((v - 0.48) / 0.55) ** 2 <= 1 || Math.abs(u) <= 0.34,
  // An octagon with a small diamond window.
  lantern: (u, v) => Math.abs(u) + Math.abs(v) <= 1.5 && Math.abs(u) + Math.abs(v) >= 0.3,
  zigzag: (u, v) => Math.abs(u - 0.5 * Math.sin(v * Math.PI * 1.5)) <= 0.55,
  window: (u, v) => Math.max(Math.abs(u), Math.abs(v)) >= 0.6 || Math.abs(u) <= 0.16 || Math.abs(v) <= 0.13,
  // An up arrow: a triangular head over a shaft.
  arrow: (u, v) => (v <= 0.02 ? Math.abs(u) <= (v + 1.07) * 0.98 : Math.abs(u) <= 0.34),
  star: (u, v) => Math.abs(u) ** 0.55 + Math.abs(v) ** 0.55 <= 1.32,
}

// Every outline, in the order the campaign widens its pool chapter by chapter.
export const ARROWS_SHAPE_ORDER = Object.keys(INSIDE)

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

/**
 * Smallest frame (same aspect as `aspect` = rows / cols) whose `shape` holds
 * at least `cells` playable cells and is one piece, capped at maxC × maxR.
 * Falls back to the largest connected frame; null when none is connected.
 * @param {string} shape
 * @param {number} cells
 * @param {number} aspect
 * @param {number} maxC
 * @param {number} maxR
 * @returns {{ cols: number, rows: number, mask: string[] } | null}
 */
export function shapeFrame(shape, cells, aspect, maxC, maxR) {
  /** @type {{ cols: number, rows: number, mask: string[] } | null} */
  let last = null
  for (let c = 5; c <= maxC; c += 1) {
    const r = Math.min(maxR, Math.round(c * aspect))
    const mask = shapeMask(shape, c, r)
    if (!maskConnected(mask)) continue
    last = { cols: c, rows: r, mask }
    if (maskCells(mask) >= cells) return last
  }
  return last
}
