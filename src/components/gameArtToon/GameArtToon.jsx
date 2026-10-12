// TOON game art: one SVG builder per game (builders/), drawn in a 64×64 box
// with an ink outline, flat fills and faces, plus short squash-and-stretch
// CSS loops (toon.css). Lazy chunk: GameArt.jsx loads it only for players on
// the TOON style. The tile pauses while off screen and stays on its resting
// pose under reduced motion (see toon.css).
import { useEffect, useMemo, useRef } from 'react'
import { observeInView } from '../../lib/inView'
import { F } from './toonPalette'
import { BUILDERS } from './builders'
import './toon.css'
import './toonSamples.css'

export default function GameArtToon({ type, className }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    return observeInView(el, (visible) => { el.dataset.live = visible ? '1' : '0' })
  }, [])
  const build = BUILDERS[type]
  const art = useMemo(() => (build ? build() : null), [build])
  if (!art) return null
  return (
    <svg
      ref={ref}
      viewBox="0 0 64 64"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      data-live="0"
      className={`${className || ''} toon-art`}
    >
      <g stroke={F.ink} strokeWidth="2.1" strokeLinejoin="round" strokeLinecap="round">{art}</g>
    </svg>
  )
}
