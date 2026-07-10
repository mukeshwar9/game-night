// Retro pixel-art avatars: 8x8 sprites drawn from a char map, tinted with theme role
// token(s) so they recolor with the active theme (per the no-hardcoded-hex rule in
// CLAUDE.md). '#' = body (single-tone shapes), 'o' = knocked-out (tile color, for
// eyes/holes), '.' = empty. Humanoid shapes (boy/girl) use per-region chars instead
// of '#': 'c' = cap, 's' = shirt, 'p' = pants, 'b' = shoes (each tinted from the
// avatar's `parts` map), 'k' = skin (tinted from --c-skin). Keep the keys in sync
// with SHAPES in src/lib/avatars.js.

import { parseAvatar } from '../lib/avatars'

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
  boy: [
    '..cccc..',
    '.cccccc.',
    '..kkkk..',
    '..koko..',
    '.ssssss.',
    '.kssssk.',
    '..p..p..',
    '.bb..bb.',
  ],
  girl: [
    '..cccc..',
    '.cccccc.',
    '.ckkkkc.',
    '.ckokoc.',
    '.ssssss.',
    '.kssssk.',
    '.pppppp.',
    '..b..b..',
  ],
}

// Region char → part key for humanoid glyphs (recolored per-part via `parts`).
const PART_CHAR = { c: 'cap', s: 'shirt', p: 'pants', b: 'shoes' }

export default function Avatar({ id, size = 48, tile = true, className = '' }) {
  const { shape, tone, parts } = parseAvatar(id)
  const glyph = GLYPHS[shape] || GLYPHS.invader
  const knockout = tile ? 'rgb(var(--c-surface))' : 'rgb(var(--c-bg))'
  const fillFor = (ch) => {
    if (ch === 'o') return knockout
    if (ch === 'k') return 'rgb(var(--c-skin))'
    if (parts && PART_CHAR[ch]) return `rgb(var(--c-${parts[PART_CHAR[ch]]}))`
    return `rgb(var(--c-${tone}))`
  }
  return (
    <svg
      viewBox="0 0 8 8"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
      role="img"
      aria-label={`${shape} avatar`}
    >
      {tile && <rect x="0" y="0" width="8" height="8" rx="1.1" style={{ fill: knockout }} />}
      {glyph.flatMap((row, y) =>
        row.split('').map((ch, x) => {
          if (ch === '.') return null
          return <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" style={{ fill: fillFor(ch) }} />
        }),
      )}
    </svg>
  )
}
