// Pixel-art glyph data + composition for avatars. Pure module: no DOM/React/Firebase.
// Two families:
//   - Creature shapes (invader, ghost, ...) — single static 8x8 grid each, '#'/'o'/'.'.
//     Moved verbatim from src/components/Avatar.jsx; byte-identical (partyBots.js and
//     PairsBoard.jsx depend on these exact silhouettes).
//   - Humanoid shapes (boy, girl, kid, punk) — layered 16x16 overlays composited by
//     composeHumanoidGrid(shape, parts) instead of one baked grid per combo. Keeps the
//     ~15-18 hand-drawn glyphs here in sync with SHAPES/HAIR_STYLES/ACCESSORIES in
//     src/lib/avatars.js (avatarSprites.test.js pins the key sets).
//
// Shared head box: every body glyph's head pixels ('k' skin + 'o' eye knockouts) sit
// strictly inside rows 1-6, cols 4-11 (inclusive). That lets HAIR_GLYPHS/CAP_GLYPHS/
// the head-adjacent ACCESSORY_GLYPHS be a single shared set that aligns on every body,
// instead of one per body. Enforced by avatarSprites.test.js — respect it if you touch
// a body glyph.

export const CREATURE_GLYPHS = {
  invader: [
    '..#..#..',
    '#..##..#',
    '#.####.#',
    '########',
    '##o##o##',
    '########',
    '..#..#..',
    '.#.##.#.',
  ],
  robot: [
    '.#....#.',
    '.######.',
    '########',
    '#o#..#o#',
    '########',
    '#.####.#',
    '.######.',
    '.#....#.',
  ],
  ghost: [
    '..####..',
    '.######.',
    '########',
    '#o#..#o#',
    '########',
    '########',
    '########',
    '#.#.#.#.',
  ],
  alien: [
    '..####..',
    '.######.',
    '########',
    '#oo##oo#',
    '########',
    '.######.',
    '..####..',
    '...##...',
  ],
  skull: [
    '.######.',
    '########',
    '#o#..#o#',
    '########',
    '.##..##.',
    '.######.',
    '.#.#.#..',
    '.######.',
  ],
  cat: [
    '##....##',
    '########',
    '#o#..#o#',
    '########',
    '#..##..#',
    '########',
    '.######.',
    '#.#..#.#',
  ],
  ufo: [
    '...##...',
    '..####..',
    '.######.',
    '########',
    '#o#oo#o#',
    '########',
    '..#..#..',
    '.#....#.',
  ],
  wizard: [
    '...#....',
    '..###...',
    '.#####..',
    '#######.',
    '.######.',
    '.#o#o#..',
    '.######.',
    '..####..',
  ],
  ninja: [
    '..####..',
    '.######.',
    '########',
    '#oo##oo#',
    '########',
    '###..###',
    '########',
    '#.#..#.#',
  ],
  crown: [
    '........',
    '#.#..#.#',
    '#.#..#.#',
    '#o#oo#o#',
    '########',
    '########',
    '........',
    '........',
  ],
  dino: [
    '.....###',
    '....####',
    '#...o###',
    '##..####',
    '########',
    '########',
    '.##..##.',
    '.#....#.',
  ],
  heart: [
    '.##..##.',
    '########',
    '########',
    '########',
    '.######.',
    '..####..',
    '...##...',
    '........',
  ],
  frog: [
    '.##..##.',
    '########',
    '#o####o#',
    '########',
    '########',
    '.######.',
    '..#..#..',
    '.##..##.',
  ],
  star: [
    '...##...',
    '...##...',
    '########',
    '.######.',
    '..####..',
    '.##..##.',
    '##....##',
    '........',
  ],
  mushroom: [
    '..####..',
    '.######.',
    '#o####o#',
    '########',
    '########',
    '..####..',
    '..####..',
    '..####..',
  ],
  bolt: [
    '....###.',
    '...###..',
    '..###...',
    '..#####.',
    '....###.',
    '...###..',
    '..###...',
    '..##....',
  ],
  moon: [
    '..####..',
    '.####...',
    '####....',
    '####....',
    '####....',
    '####....',
    '.####...',
    '..####..',
  ],
  fish: [
    '........',
    '........',
    '...###..',
    '#.#####.',
    '######o#',
    '#.#####.',
    '...###..',
    '........',
  ],
  sword: [
    '...##...',
    '...##...',
    '...##...',
    '...##...',
    '.######.',
    '...##...',
    '...##...',
    '..####..',
  ],
  slime: [
    '...##...',
    '..####..',
    '.######.',
    '########',
    '#o####o#',
    '########',
    '########',
    '........',
  ],
}

// Humanoid body glyphs — 16x16. Chars: '.' empty, 'o' knockout eye, 'k' skin,
// 's' shirt, 'p' pants, 'b' shoes. No 'c' (cap is a shared overlay, see CAP_GLYPHS).
// Every body keeps its head ('k'/'o') inside rows 1-6, cols 4-11 — see file header.
export const BODY_GLYPHS = {
  // boy — straight, evenly-proportioned build.
  boy: [
    '................',
    '....kkkkkkkk....',
    '....kkkkkkkk....',
    '....kkokkokk....',
    '....kkkkkkkk....',
    '....kkkkkkkk....',
    '....kkkkkkkk....',
    '.....ssssss.....',
    '...ssssssssss...',
    '...ssssssssss...',
    '...ssssssssss...',
    '.....ssssss.....',
    '.....pppppp.....',
    '.....pp..pp.....',
    '....bbb..bbb....',
    '................',
  ],
  // girl — narrower waist, flared triangular skirt (drawn in the 'pants' color).
  girl: [
    '................',
    '....kkkkkkkk....',
    '....kkkkkkkk....',
    '....kkokkokk....',
    '....kkkkkkkk....',
    '....kkkkkkkk....',
    '....kkkkkkkk....',
    '.....ssssss.....',
    '....ssssssss....',
    '.....ssssss.....',
    '.....pppppp.....',
    '....pppppppp....',
    '...pppppppppp...',
    '..pppppppppppp..',
    '....bb....bb....',
    '................',
  ],
  // kid — small round build: chubby torso, stubby close-set legs.
  kid: [
    '................',
    '....kkkkkkkk....',
    '....kkkkkkkk....',
    '....kkokkokk....',
    '....kkkkkkkk....',
    '....kkkkkkkk....',
    '....kkkkkkkk....',
    '....ssssssss....',
    '...ssssssssss...',
    '...ssssssssss...',
    '....ssssssss....',
    '....pppppppp....',
    '....pppppppp....',
    '....pp....pp....',
    '....bb....bb....',
    '................',
  ],
  // punk — tall lean build: narrow shoulders/hips, long thin legs.
  punk: [
    '................',
    '....kkkkkkkk....',
    '....kkkkkkkk....',
    '....kkokkokk....',
    '....kkkkkkkk....',
    '....kkkkkkkk....',
    '....kkkkkkkk....',
    '......ssss......',
    '.....ssssss.....',
    '.....ssssss.....',
    '.....ssssss.....',
    '......ssss......',
    '......pppp......',
    '......pp.pp.....',
    '......bb.bb.....',
    '................',
  ],
}

// Shared head box every body's 'k'/'o' pixels must stay inside (rows/cols inclusive).
export const HEAD_BOX = { rowStart: 1, rowEnd: 6, colStart: 4, colEnd: 11 }

const EMPTY_16 = Array.from({ length: 16 }, () => '.'.repeat(16))

// Hair overlays — 'h' chars only, anchored to the shared head box. 'none' has no entry
// (composeHumanoidGrid treats it as "skip this layer").
export const HAIR_GLYPHS = {
  short: [
    '....hhhhhhhh....',
    ...EMPTY_16.slice(1),
  ],
  spiky: [
    '....h.h..h.h....',
    '....hhhhhhhh....',
    ...EMPTY_16.slice(2),
  ],
  long: [
    '....hhhhhhhh....',
    '....h......h....',
    '....h......h....',
    '....h......h....',
    '....h......h....',
    '....h......h....',
    '....h......h....',
    '....h......h....',
    '...h........h...',
    '...h........h...',
    ...EMPTY_16.slice(10),
  ],
  bob: [
    '....hhhhhhhh....',
    '....h......h....',
    '....h......h....',
    '....h......h....',
    '....hhhhhhhh....',
    ...EMPTY_16.slice(5),
  ],
  curly: [
    '...hhhhhhhhhh...',
    '..hhhhhhhhhhhh..',
    '..hhhhhhhhhhhh..',
    ...EMPTY_16.slice(3),
  ],
}

// Shared cap overlay — 'c' chars, sits over the hair region. Same for every body/hair.
export const CAP_GLYPHS = {
  cap: [
    '....cccccccc....',
    '...cccccccccc...',
    ...EMPTY_16.slice(2),
  ],
}

// Accessory overlays. 'over' layers ('g') composite last (on top of hair/cap); the
// cape's 'under' layer ('u') composites first, so it only shows in cells the body
// silhouette doesn't cover (reads as draped behind the body).
export const ACCESSORY_GLYPHS = {
  glasses: {
    over: [
      '................',
      '................',
      '................',
      '.....gggggg.....',
      ...EMPTY_16.slice(4),
    ],
  },
  headphones: {
    over: [
      '...gggggggggg...',
      '................',
      '...g........g...',
      '...g........g...',
      '...g........g...',
      ...EMPTY_16.slice(5),
    ],
  },
  crown: {
    over: [
      '....g.g..g.g....',
      '....gggggggg....',
      ...EMPTY_16.slice(2),
    ],
  },
  cape: {
    under: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '..uuuuuuuuuuuu..',
      '.uuuuuuuuuuuuuu.',
      '.uuuuuuuuuuuuuu.',
      '.uuuuuuuuuuuuuu.',
      '.uuuuuuuuuuuuuu.',
      '.uuuuuuuuuuuuuu.',
      '.uuuuuuuuuuuuuu.',
      '.uuuuuuuuuuuuuu.',
      '................',
    ],
  },
}

// Fixed tone role per accessory — no extra wire slot needed.
export const ACCESSORY_TONES = { glasses: 'text', headphones: 'dim', crown: 'cta', cape: 'p2' }

function overlayInto(grid, overlay, { onlyIntoEmpty = false } = {}) {
  if (!overlay) return grid
  const next = grid.slice()
  for (let y = 0; y < overlay.length; y++) {
    const row = overlay[y]
    if (!row) continue
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]
      if (ch === '.') continue
      if (onlyIntoEmpty && next[y][x] !== '.') continue
      next[y] = next[y].slice(0, x) + ch + next[y].slice(x + 1)
    }
  }
  return next
}

// Deterministic, pure composite of a humanoid's 16x16 render grid from its parts map.
// Layer order: cape under-layer (only into still-empty cells) -> body -> hair -> cap
// (when parts.cap !== 'none') -> accessory front layer.
export function composeHumanoidGrid(shape, parts) {
  let grid = EMPTY_16.slice()
  if (parts?.acc === 'cape' && ACCESSORY_GLYPHS.cape.under) {
    grid = overlayInto(grid, ACCESSORY_GLYPHS.cape.under, { onlyIntoEmpty: true })
  }
  grid = overlayInto(grid, BODY_GLYPHS[shape] || BODY_GLYPHS.boy)
  if (parts?.hair && parts.hair !== 'none') {
    grid = overlayInto(grid, HAIR_GLYPHS[parts.hair])
  }
  if (parts?.cap && parts.cap !== 'none') {
    grid = overlayInto(grid, CAP_GLYPHS.cap)
  }
  const accOver = parts?.acc && ACCESSORY_GLYPHS[parts.acc]?.over
  if (accOver) {
    grid = overlayInto(grid, accOver)
  }
  return grid
}

// Creature-shape glyph lookup ({ grid, size }). Humanoid callers use
// composeHumanoidGrid directly instead — see src/components/Avatar.jsx.
export function glyphFor(shape) {
  return { grid: CREATURE_GLYPHS[shape] || CREATURE_GLYPHS.invader, size: 8 }
}
