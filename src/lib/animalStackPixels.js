// animalStackPixels.js — ANIMAL STACK animal art as hand-authored pixel grids.
// Pure data + geometry, no DOM. The grid IS the physics hull: buildPixelPiece
// turns the drawn cells (outline ring included) into axis-aligned boxes, so
// what you see is what collides. 1 cell = 1/16 m, animals face right (+x).
// Legend: B base  L light  S shade  P pale  D dark detail  W eye white
//         K pupil  O orange accent  R pink accent  . empty
// An outline ring ('#') is added one cell outside every filled cell.
// Rows may be ragged; short rows are padded with empty cells.
export const CELL = 1 / 16

export const GRIDS = {
  elephant: { tone: 'dim', rows: [
    '..........LLLLLLLLLLL..........',
    '.......LLBBBBBBBBBBBBBB..SSSS...',
    '.....BBBBBBBBBBBBBBBBBBBSSSSSSBB.',
    '....BBBBBBBBBBBBBBBBBBBBSSSSSSBBB',
    '....BBBBBBBBBBBBBBBBBBBBSSSSSSBWK',
    '...BBBBBBBBBBBBBBBBBBBBBSSSSSSBBB',
    '...BBBBBBBBBBBBBBBBBBBBBBSSSSBBBB',
    '..DBBBBBBBBBBBBBBBBBBBBBBBSSBBBBB',
    '..DBBBBBBBBBBBBBBBBBBBBBBBBBBBPBB',
    '..DBBBBBBBBBBBBBBBBBBBBBBBBBBPP.BB',
    '...BBBBBBBBBBBBBBBBBBBBBBBBB....BB',
    '...SSSSSSSSSSSSSSSSSSSSSSSSS....BB',
    '....BBBB..BBBB......BBBB..BBBB..BB',
    '....BBBB..BBBB......BBBB..BBBB..BB',
    '....BBBB..BBBB......BBBB..BBBB..DB',
    '....PPPP..PPPP......PPPP..PPPP.....',
  ] },
  giraffe: { tone: 'kam3', rows: [
    '..............D..D..',
    '..............BBBB..',
    '.............BBBBBBB',
    '.............BWKBBBB',
    '.............BBBBBSB',
    '............DBBBB...',
    '............DBSBB...',
    '............DBBBB...',
    '............DBBSB...',
    '............DBBBB...',
    '............DSBBB...',
    '............DBBBB...',
    '............DBBSB...',
    '............DBBBB...',
    '..........DDBBBBB...',
    '.BBBBBBBBBBBBBBBB...',
    'BBSBBBSSBBBBSBBBB...',
    'BBSSBBBBBSSBBBBSB...',
    'BBBBBSBBBBBBSSBBB...',
    'BSSBBBBBSBBBBBBBB...',
    '.BBBBBBBBBBSBBBB....',
    '.BB.BB......BB.BB...',
    '.BB.BB......BB.BB...',
    '.BB.BB......BB.BB...',
    '.BB.BB......BB.BB...',
    '.BB.BB......BB.BB...',
    '.BB.BB......BB.BB...',
    '.DD.DD......DD.DD...',
  ] },
  penguin: { tone: 'text', rows: [
    '....BBBBBB....',
    '..BBBBBBBBBB..',
    '.BBBPPBBPPBBB.',
    '.BBPWKPPKWPBB.',
    '.BBPPPOOPPPBB.',
    'BBBBPPPOPPPBBB',
    'BSBBPPPPPPBBSB',
    'BSBPPPPPPPPBSB',
    'BSBPPPPPPPPBSB',
    'BSBPPPPPPPPBSB',
    '.SBPPPPPPPPBS.',
    '.BBPPPPPPPPBB.',
    '..BBPPPPPPBB..',
    '...BBBBBBBB...',
    '..OOOO..OOOO..',
  ] },
  hippo: { tone: 'kam5', rows: [
    '...........LLLLLLLLL...B.B....',
    '.......BBBBBBBBBBBBBBBBBBBB...',
    '....BBBBBBBBBBBBBBBBBBBBBBBBB..',
    '...BBBBBBBBBBBBBBBBBBBBBBWKBBB.',
    '..BBBBBBBBBBBBBBBBBBBBBBBBBBBBBD',
    '.DBBBBBBBBBBBBBBBBBBBBBBSSSSSSBB',
    '.DBBBBBBBBBBBBBBBBBBBBBSSSSSSSSB',
    '..BBBBBBBBBBBBBBBBBBBBBSDDDDDDDB',
    '..BBBBBBBBBBBBBBBBBBBBBSSPSSSPSS',
    '..SSSSSSSSSSSSSSSSSSSSSSSSSSSSS.',
    '...BBBBB.BBBBB.....BBBBB.BBBBB..',
    '...BBBBB.BBBBB.....BBBBB.BBBBB..',
  ] },
  snake: { tone: 'kam2', rows: [
    '.........................BBBBBB..',
    '........................BBBBWKBB.',
    '.......................BBBBBBBBBB',
    '....................SSBBBBB..R.RR',
    '..BBSSBBBSSBBBSSBBBSSBBBB......R.',
    '.BBBSSBBBSSBBBSSBBBSSBBB.........',
    'BBBBSSBBBSSBBBSSBBBSSBB..........',
    'PPPPPPPPPPPPPPPPPPPPPP...........',
  ] },
  turtle: { tone: 'kam1', rows: [
    '..........DDDDDDDDD............',
    '.......DDLLLLDLLLLLDD..........',
    '.....DLLLLLLDLLLLLLLLD.........',
    '....DLLLLLLDSSSSDLLLLLD...BBBB.',
    '...DLLLLLLDSSSSSSDLLLLLD.BBBWKB',
    '...DLLLLLLDSSSSSSDLLLLLD.BBBBBB',
    '..DDDDDDDDDDDDDDDDDDDDDDDBBBBB.',
    '.BPPPPPPPPPPPPPPPPPPPPPPPBB....',
    'BBBBBBBBBBBBBBBBBBBBBBBBBBB....',
    '...BBBB..............BBBB......',
  ] },
  frog: { tone: 'win', rows: [
    '...WWW........WWW...',
    '..WWKWW......WWKWW..',
    '..BWWWBBBBBBBBWWWB..',
    '.BBBBBBBBBBBBBBBBBB.',
    'BBBSBBBBBBBBBBBBSBBB',
    'BBBBBDDBBBBBBDDBBBBB',
    'BBRRBBBDDDDDDBBBRRBB',
    'BBBBBBBBBBBBBBBBBBBB',
    'BSBBPPPPPPPPPPPPBBSB',
    'SSBPPPPPPPPPPPPPPBSS',
    'SSSBPPPPPPPPPPPPBSSS',
    'SSSSBBBBBBBBBBBBSSSS',
  ] },
  pig: { tone: 'kam4', rows: [
    '..............SS..SS....',
    '.....LLLLLLLLLSSSSSS....',
    '...BBBBBBBBBBBBBBBBBB...',
    '..BBBBBBBBBBBBBBBBBBBB..',
    '.DBBBBBBBBBBBBBBBBWKBBB.',
    'D.BBBBBBBBBBBBBBBBBBBBLLL',
    '.DBBBBBBBBBBBBBBBBBRRBLDL',
    '..BBBBBBBBBBBBBBBBBRRBLDL',
    '..BBBBBBBBBBBBBBBBBBBBLLL',
    '..SSSSSSSSSSSSSSSSSSSS..',
    '...BBB..BBB....BBB..BBB.',
    '...BBB..BBB....BBB..BBB.',
    '...DDD..DDD....DDD..DDD.',
  ] },
  croc: { tone: 'kam1', rows: [
    '..............................WK.......',
    '.....S.S.S.S.S.S.S.S.S.S....BBBBB......',
    '..BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    '.BBBBBBBBBBBBBBBBBBBBBBBBBBBDDDDDDDDDDD',
    '..PPPPPPPPPPPPPPPPPPPPPPPPPPBPBPBPBPBPB',
    '....BBB.........BBB.....BBBBBBBBBBBBB..',
  ] },
  owl: { tone: 'kam0', rows: [
    'BB..........BB',
    'BBB........BBB',
    'BBBBBBBBBBBBBB',
    'BPPPPPBBPPPPPB',
    'PPWWWPPPPWWWPP',
    'PWWKKWPPWKKWWP',
    'PPWWWPOOPWWWPP',
    'BPPPPPOOPPPPPB',
    'SBBBBBBBBBBBBS',
    'SBBLLLLLLLLBBS',
    'SSBLDLLLLDLBSS',
    'SSBLLLDDLLLBSS',
    'SSBLLLLLLLLBSS',
    'SSBLDLLLLDLBSS',
    '.SBBLLLLLLBBS.',
    '..BBBBBBBBBB..',
    '..OO......OO..',
  ] },
  rhino: { tone: 'kam6', rows: [
    '..............................P..',
    '.............................PP..',
    '.........LLLLLLLLLL....B....PPP..',
    '.....BBBBBBBBBBBBBBBBBBBBBB.PPP..',
    '...BBBBBBBBBBBBBBBBBBBBBBBBBBPP..',
    '..BBBBBBBDBBBBBBBBDBBBBBBBBBBBB..',
    '.BBBBBBBBDBBBBBBBBDBBBBBBWKBBBBB.',
    '.BBBBBBBBDBBBBBBBBDBBBBBBBBBBBBBB',
    '.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    '.SBBBBBBBBBBBBBBBBBBBBBBBBBBBDDDB',
    '..SSSSSSSSSSSSSSSSSSSSSSBBBBBBBB.',
    '...BBBBB.BBBBB.....BBBBB.BBBBB...',
    '...BBBBB.BBBBB.....BBBBB.BBBBB...',
  ] },
  chick: { tone: 'cta', rows: [
    '....D.D....',
    '...BBBBBB..',
    '..BBBBWKBB.',
    '..BBBBBBBOO',
    '.BBBBBRBBOO',
    'BBSSSSBBBB.',
    'BBBSSSBBBB.',
    'BBBBBBBBBB.',
    '.BBBBBBBBB.',
    '..BBBBBBB..',
    '..O...O....',
  ] },
}

// ─── Grid to physics hull ───────────────────────────────────────────────────
/**
 * Grid to { grid, w, h, parts }: `grid` is the padded cell matrix with the outline
 * ring, `parts` are boxes (metres, origin at the grid centre, y up) covering
 * every drawn cell. Integer maths on a fixed grid, so identical on every client.
 */
export function buildPixelPiece(rows, cell, { tol = 1 } = {}) {
  const h = rows.length + 2
  const w = Math.max(...rows.map(r => r.length)) + 2
  const grid = Array.from({ length: h }, () => Array(w).fill('.'))
  rows.forEach((r, y) => [...r].forEach((c, x) => { grid[y + 1][x + 1] = c }))
  // outline: 4-neighbour ring around every filled cell
  const filled = (x, y) => x >= 0 && y >= 0 && x < w && y < h && grid[y][x] !== '.' && grid[y][x] !== '#'
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (grid[y][x] !== '.') continue
    if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) grid[y][x] = '#'
  }
  // slabs of near-identical row runs → boxes
  const slabs = []
  let open = []
  for (let y = 0; y < h; y++) {
    const runs = []
    for (let x = 0; x < w;) {
      if (grid[y][x] === '.') { x++; continue }
      const x0 = x
      while (x < w && grid[y][x] !== '.') x++
      runs.push([x0, x])
    }
    const next = []
    for (const [x0, x1] of runs) {
      const s = open.find(o => !o.used && Math.abs(o.x0 - x0) <= tol && Math.abs(o.x1 - x1) <= tol)
      if (s) { s.used = true; s.rows.push([x0, x1]); s.y1 = y + 1; next.push(s) } else next.push({ rows: [[x0, x1]], y0: y, y1: y + 1 })
    }
    for (const o of open) if (!o.used) slabs.push(o)
    open = next.map(o => ({ ...o, used: false }))
  }
  slabs.push(...open)
  const med = (a) => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)] }
  const cx = w / 2, cy = h / 2
  const parts = slabs.map(s => {
    const x0 = med(s.rows.map(r => r[0])), x1 = med(s.rows.map(r => r[1]))
    const X0 = (x0 - cx) * cell, X1 = (x1 - cx) * cell
    const Y0 = (cy - s.y1) * cell, Y1 = (cy - s.y0) * cell
    return [[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]]
  })
  return { grid, w, h, parts }
}

/** Every animal built once: `{ tone, grid, w, h, parts }`. */
export const PIXELS = Object.fromEntries(
  Object.entries(GRIDS).map(([id, g]) => [id, { tone: g.tone, ...buildPixelPiece(g.rows, CELL) }]),
)
