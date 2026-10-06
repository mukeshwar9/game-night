import { useEffect, useId, useMemo, useState } from 'react'
import useThemeId from '../hooks/useThemeId'
import { themeBackdrop } from '../lib/theme'
import { SHORE_TILE, foamBubbles, shorePath, washPhase } from '../lib/beachLogic'

// Animated scene behind the menus for themes that declare a `backdrop` in
// THEMES (SHORELINE: the sea under the header, waves washing up the sand and
// back). Decorative only: aria-hidden, no pointer events, behind all content
// (z-index -1 on the root stacking context; index.css .beach-backdrop).
//
// Everything that moves is transform or opacity on its own layer, so the
// compositor animates it without repainting the page. Reduced motion (the
// Settings switch or the OS) stops the animation in index.css. `active` is
// false on game screens, where the waves would only compete with the board.
export default function ThemeBackdrop({ active }) {
  const theme = useThemeId()
  if (!active || themeBackdrop(theme) !== 'beach') return null
  return <BeachBackdrop />
}

// Two wave layers: the darker back wave, half a cycle out of step, and the
// front swash with its foam line and bubbles.
const BACK = { base: 60, amp: 7, phase: 1.3 }
const FRONT = { base: 48, amp: 9, phase: 0 }
const WAVE_H = 96

function useStripWidth() {
  const read = () => (typeof window === 'undefined' ? 0 : window.innerWidth) + SHORE_TILE
  const [width, setWidth] = useState(read)
  useEffect(() => {
    const onResize = () => setWidth(read())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  // Round up to whole tiles so a resize only re-renders on a tile boundary.
  return Math.ceil(width / SHORE_TILE) * SHORE_TILE
}

function Wave({ width, shape, back }) {
  // useId can hold characters url(#…) would need escaped.
  const id = 'beach' + useId().replace(/[^\w-]/g, '')
  const { fill, line } = useMemo(() => shorePath({ width, ...shape }), [width, shape])
  const bubbles = useMemo(() => (back ? [] : foamBubbles({ width, ...shape })), [width, shape, back])
  return (
    <div className={`beach-wave ${back ? 'is-back' : 'is-front'}`}>
      <div className="beach-drift" style={{ width }}>
        <svg width={width} height={WAVE_H} viewBox={`0 0 ${width} ${WAVE_H}`}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: back ? 'rgb(var(--c-sea))' : 'rgb(var(--c-sea) / 0)' }} />
              <stop offset="1" style={{ stopColor: `rgb(var(--c-shallow) / ${back ? 0.9 : 0.8})` }} />
            </linearGradient>
          </defs>
          <path d={fill} style={{ fill: `url(#${id})` }} />
          <path d={line} fill="none" strokeLinejoin="round" strokeLinecap="round"
            style={{ stroke: `rgb(var(--c-foam) / ${back ? 0.55 : 0.95})`, strokeWidth: back ? 2 : 3.5 }} />
          {bubbles.map((b, i) => <circle key={i} cx={b.x} cy={b.y} r={b.r} style={{ fill: 'rgb(var(--c-foam) / .85)' }} />)}
        </svg>
      </div>
    </div>
  )
}

export function BeachBackdrop() {
  const width = useStripWidth()
  // Start the waves where the shared wave clock says we are, so the surf
  // ambience (musicAmbience.js) swells as the water reaches the sand.
  const [delay] = useState(() => -washPhase(typeof performance === 'undefined' ? 0 : performance.now()))
  return (
    <div className="beach-backdrop" aria-hidden="true" style={{ '--wash-delay': `${delay.toFixed(3)}s` }}>
      <div className="beach-sea" />
      <div className="beach-wet" />
      <Wave width={width} shape={BACK} back />
      <Wave width={width} shape={FRONT} />
    </div>
  )
}
