// Retro pixel-art avatars. Renders from glyph data in src/lib/avatarSprites.js, tinted
// with theme role token(s) so they recolor with the active theme (per the
// no-hardcoded-hex rule in CLAUDE.md). Creature shapes render an 8x8 grid; humanoid
// shapes (boy/girl/kid/punk) render a 16x16 grid composited from layered part
// overlays (body/hair/cap/accessory) via composeHumanoidGrid — see that module for
// the char legend and layering order.

import { parseAvatar } from '../lib/avatars'
import { CREATURE_GLYPHS, ACCESSORY_TONES, composeHumanoidGrid, glyphFor } from '../lib/avatarSprites'

// Region char → part key for humanoid glyphs (recolored per-part via `parts`).
const PART_CHAR = { c: 'cap', s: 'shirt', p: 'pants', b: 'shoes' }

export default function Avatar({ id, size = 48, tile = true, className = '', animate = false }) {
  const { shape, tone, parts } = parseAvatar(id)
  const humanoid = Boolean(parts)
  const grid = humanoid ? composeHumanoidGrid(shape, parts) : (CREATURE_GLYPHS[shape] || glyphFor(shape).grid)
  const n = grid.length
  const knockout = tile ? 'rgb(var(--c-surface))' : 'rgb(var(--c-bg))'
  const fillFor = (ch) => {
    if (ch === 'o') return knockout
    if (ch === 'k') {
      if (humanoid && parts.skin) {
        const skinN = Number(parts.skin.slice(1))
        return `rgb(var(--c-skin-${skinN}))`
      }
      return 'rgb(var(--c-skin))'
    }
    if (ch === 'h') return `rgb(var(--c-${parts.hairColor}))`
    if (ch === 'g' || ch === 'u') return `rgb(var(--c-${ACCESSORY_TONES[parts?.acc] || 'text'}))`
    if (parts && PART_CHAR[ch]) return `rgb(var(--c-${parts[PART_CHAR[ch]]}))`
    return `rgb(var(--c-${tone}))`
  }
  const svg = (
    <svg
      viewBox={`0 0 ${n} ${n}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={animate && humanoid ? undefined : className}
      role="img"
      aria-label={`${shape} avatar`}
    >
      {tile && <rect x="0" y="0" width={n} height={n} rx={n * 0.1375} style={{ fill: knockout }} />}
      {grid.flatMap((row, y) =>
        row.split('').map((ch, x) => {
          if (ch === '.') return null
          return <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" style={{ fill: fillFor(ch) }} />
        }),
      )}
      {animate && humanoid &&
        grid.flatMap((row, y) =>
          row.split('').map((ch, x) => {
            if (ch !== 'o') return null
            const skinN = parts.skin ? Number(parts.skin.slice(1)) : 3
            return (
              <rect
                key={`eyelid-${x}-${y}`}
                x={x}
                y={y}
                width="1"
                height="1"
                className="avatar-eyelid"
                style={{ fill: `rgb(var(--c-skin-${skinN}))` }}
              />
            )
          }),
        )}
    </svg>
  )
  // Only wrap in a div (needed for the idle-bounce keyframes) when animate is
  // actually requested — every other caller gets the bare <svg> it always got, so
  // className passthrough (e.g. flex-shrink-0) keeps landing on the real flex item.
  if (animate && humanoid) {
    return <div className={`avatar-idle-anim ${className}`.trim()}>{svg}</div>
  }
  return svg
}
