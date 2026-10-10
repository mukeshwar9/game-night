// Pixel-art avatars. A string is either a kit look ('K1…', see src/lib/avatarKit) or a
// legacy id: the four old humanoid builders migrate to a kit look on the fly, and the 27
// classic critters keep their frozen 8x8 sprites (drawn here as SVG, in the fixed
// avatar palette so they no longer change colour with the theme).
//
// Sizes snap onto the 24 / 48 / 72 / 96 (/ 144 for the editor) ladder so every art pixel is a whole number of
// screen pixels. `view="bust"` (head-and-shoulders) is for chips, seat cards and
// lists; `view="hero"` is the full body with a pose, for profile and Playground.

import { useLayoutEffect, useMemo, useRef } from 'react'
import { resolveAvatar, snapSize, TONE_TO_RAMP, RAMPS } from '../lib/avatarKit'
import { mountAvatar } from '../lib/avatarKit/canvas'
import { parseAvatar, TONES } from '../lib/avatars'
import { CREATURE_GLYPHS, glyphFor } from '../lib/avatarSprites'

function ClassicCreature({ id, size, tile, className }) {
  const { shape, tone } = parseAvatar(id)
  const grid = CREATURE_GLYPHS[shape] || glyphFor(shape).grid
  const n = grid.length
  const ramp = RAMPS[TONE_TO_RAMP[TONES.includes(tone) ? tone : 'p1']]
  const body = ramp ? `rgb(${ramp[2].join(' ')})` : 'rgb(var(--c-text))'
  const knockout = tile ? 'rgb(var(--c-surface))' : 'rgb(var(--c-bg))'
  return (
    <svg
      viewBox={`0 0 ${n} ${n}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
      role="img"
      aria-label={`${shape} avatar`}
    >
      {tile && <rect x="0" y="0" width={n} height={n} rx={n * 0.1375} style={{ fill: knockout }} />}
      {grid.flatMap((row, y) =>
        row.split('').map((ch, x) => {
          if (ch === '.') return null
          return <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" style={{ fill: ch === 'o' ? knockout : body }} />
        }),
      )}
    </svg>
  )
}

function KitCanvas({ look, size, view, tile, pose, className }) {
  const ref = useRef(null)
  const lookKey = JSON.stringify(look)
  useLayoutEffect(() => {
    const canvas = ref.current
    if (!canvas) return undefined
    return mountAvatar(canvas, look, { view, size, tile, pose })
    // look is derived from lookKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookKey, view, size, tile, pose])
  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
      role="img"
      aria-label="avatar"
    />
  )
}

export default function Avatar({ id, size = 48, tile = true, className = '', animate = false, view = 'bust', pose }) {
  const resolved = useMemo(() => resolveAvatar(id), [id])
  const px = snapSize(size)
  if (resolved.kind === 'classic') {
    return <ClassicCreature id={resolved.id} size={px} tile={tile} className={animate ? undefined : className} />
  }
  const canvas = <KitCanvas look={resolved.look} size={px} view={view} tile={tile} pose={pose} className={animate ? undefined : className} />
  // The wrapper (needed for the idle-bounce keyframes) only exists when animate is
  // requested, so every other caller gets the bare canvas and className lands on the
  // real flex item.
  if (animate) return <div className={`avatar-idle-anim ${className}`.trim()}>{canvas}</div>
  return canvas
}
