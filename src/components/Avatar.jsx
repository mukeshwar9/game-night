// Retro pixel-art avatars: 8x8 monochrome sprites drawn from a char map, tinted
// with a theme role token so they recolor with the active theme (per the
// no-hardcoded-hex rule in CLAUDE.md). '#' = body, 'o' = knocked-out (tile color,
// for eyes/holes), '.' = empty. Keep the keys in sync with AVATARS in
// src/lib/avatars.js.

const GLYPHS = {
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
}

// Theme role token per avatar — gives within-theme variety while staying themed.
const TONE = {
  invader: '--c-win',
  robot: '--c-p1',
  ghost: '--c-text',
  alien: '--c-win',
  skull: '--c-text',
  cat: '--c-p2',
  ufo: '--c-cta',
  wizard: '--c-p1',
  ninja: '--c-text',
  crown: '--c-cta',
  dino: '--c-win',
  heart: '--c-p2',
}

export default function Avatar({ id, size = 48, tile = true, className = '' }) {
  const glyph = GLYPHS[id] || GLYPHS.invader
  const tone = TONE[id] || '--c-p1'
  const knockout = tile ? 'rgb(var(--c-surface))' : 'rgb(var(--c-bg))'
  return (
    <svg
      viewBox="0 0 8 8"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
      role="img"
      aria-label={`${id} avatar`}
    >
      {tile && <rect x="0" y="0" width="8" height="8" rx="1.1" style={{ fill: knockout }} />}
      {glyph.flatMap((row, y) =>
        row.split('').map((ch, x) => {
          if (ch === '.') return null
          const fill = ch === 'o' ? knockout : `rgb(var(${tone}))`
          return <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" style={{ fill }} />
        }),
      )}
    </svg>
  )
}
