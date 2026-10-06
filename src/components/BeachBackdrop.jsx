import { useEffect, useId, useMemo, useState } from 'react'
import { SHORE_TILE, foamBubbles, shorePath, washPhase } from '../lib/beachLogic'

// SHORELINE's scene, loaded on demand by ThemeBackdrop: the sea at the top
// edge with the header floating on it, waves washing up the sand and back,
// wet patches, shells and crabs. Decorative only: aria-hidden, no pointer
// events. The sand layer sits behind all content (index.css .beach-backdrop,
// z-index -1); the surf sits above the page but under the header
// (.beach-surf), so the header floats on the water and content scrolls under
// it.
//
// Everything that moves is transform or opacity on its own layer, so the
// compositor animates it without repainting the page. Reduced motion (the
// Settings switch or the OS) stops the animation in index.css.

// Two wave layers: the darker back wave, half a cycle out of step, and the
// front swash with its foam line and bubbles. Each SVG holds the whole sea from
// the top of the screen down to its shoreline; index.css places the strip so
// the header's bottom edge falls at SEA_DEEP (the water stays deep, and the
// white header ink readable, down to there).
const BACK = { base: 170, amp: 7, phase: 1.3 }
const FRONT = { base: 160, amp: 9, phase: 0 }
const WAVE_H = 200
const SEA_DEEP = 126

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
            <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={shape.base + shape.amp}>
              <stop offset={back ? SEA_DEEP / (shape.base + shape.amp) : 0.62} style={{ stopColor: back ? 'rgb(var(--c-sea))' : 'rgb(var(--c-sea) / 0)' }} />
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

export default function BeachBackdrop() {
  const width = useStripWidth()
  // Start the waves where the shared wave clock says we are, so the surf
  // ambience (musicAmbience.js) swells as the water reaches the sand.
  const [delay] = useState(() => -washPhase(typeof performance === 'undefined' ? 0 : performance.now()))
  const clock = { '--wash-delay': `${delay.toFixed(3)}s` }
  return (
    <>
      <div className="beach-backdrop" aria-hidden="true" style={clock}>
        {/* The waterline (wet sand and what lies on it) leaves with the surf
            when the header hides on scroll; the open sand stays. */}
        <div className="beach-shoreline">
          <div className="beach-wet" />
          <Dressing wide={false} />
        </div>
        <Dressing wide />
      </div>
      <div className="beach-surf" aria-hidden="true" style={clock}>
        <Wave width={width} shape={BACK} back />
        <Wave width={width} shape={FRONT} />
      </div>
    </>
  )
}

function Dressing({ wide }) {
  const mine = (p) => !!p.wide === wide
  return (
    <>
      {PATCHES.filter(mine).map((p, i) => <div key={i} className="beach-patch" style={place(p)} />)}
      {SHELLS.filter(mine).map((p, i) => (
        <div key={i} className="beach-item" style={place(p)}>
          {p.kind === 'scallop' ? <Scallop /> : <Snail />}
        </div>
      ))}
      {CRABS.filter(mine).map((p, i) => (
        <div key={i} className="beach-item beach-crab" style={place(p)}>
          <Crab />
        </div>
      ))}
    </>
  )
}

// Where the sand dressing lies. `x` is a share of the screen width (negative
// `x` measures from the right edge); `y` is px below the header's bottom edge, or a share
// of the screen height when `vh` is set. `wide` pieces lie on the open sand and
// only show on screens with sand beside the content column (index.css hides
// them on phones, where the cards cover the sand); the rest line the water.
const PATCHES = [
  { x: -0.08, y: 62, w: 200, h: 50, rot: -4 },
  { x: -0.62, y: 80, w: 210, h: 54, rot: 3 },
  { x: 0.03, vh: 0.42, w: 220, h: 64, rot: 8, wide: true },
  { x: -0.04, vh: 0.6, w: 240, h: 70, rot: -6, wide: true },
  { x: 0.08, vh: 0.82, w: 180, h: 54, rot: 2, wide: true },
  { x: -0.12, vh: 0.3, w: 160, h: 48, rot: 5, wide: true },
]
const SHELLS = [
  { kind: 'scallop', x: -0.03, y: 98, rot: 18 },
  { kind: 'snail', x: 0.12, vh: 0.5, rot: -20, wide: true },
  { kind: 'scallop', x: 0.05, vh: 0.72, rot: -12, wide: true },
  { kind: 'scallop', x: -0.1, vh: 0.44, rot: 30, wide: true },
  { kind: 'snail', x: -0.06, vh: 0.86, rot: 40, wide: true },
  { kind: 'snail', x: -0.05, y: 162, rot: 10 },
]
const CRABS = [
  { x: 0.025, y: 88, rot: -6 },
  { x: -0.14, vh: 0.66, rot: 8, wide: true, delay: -4.5 },
]

function place({ x, y, vh, rot = 0, w, h, delay }) {
  const style = {
    [x < 0 ? 'right' : 'left']: `${Math.abs(x) * 100}%`,
    top: vh == null ? `calc(var(--beach-shore) + ${y}px)` : `${vh * 100}%`,
    '--rot': `${rot}deg`,
  }
  if (w) { style.width = w; style.height = h }
  if (delay) style.animationDelay = `${delay}s`
  return style
}

// The shells and the crab: flat little drawings in theme tokens, so they
// recolour with the theme like everything else.
function Scallop() {
  const ribs = [-50, -30, -10, 10, 30, 50]
  return (
    <svg width="22" height="20" viewBox="0 0 22 20">
      <path d="M11 18.5 L2.2 8.4 Q3 1.6 11 1 Q19 1.6 19.8 8.4 Z" strokeLinejoin="round"
        style={{ fill: 'rgb(var(--c-tint-p2))', stroke: 'rgb(var(--c-p2) / .55)', strokeWidth: 1.2 }} />
      {ribs.map(a => {
        const r = (a * Math.PI) / 180
        return <line key={a} x1="11" y1="17" x2={(11 + Math.sin(r) * 11).toFixed(1)} y2={(17 - Math.cos(r) * 14).toFixed(1)}
          style={{ stroke: 'rgb(var(--c-p2) / .4)', strokeWidth: 1 }} />
      })}
      <path d="M8 18.6 H14 L13 20 H9 Z" style={{ fill: 'rgb(var(--c-p2) / .55)' }} />
    </svg>
  )
}

function Snail() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <circle cx="9" cy="9" r="7.6" style={{ fill: 'rgb(var(--c-card))', stroke: 'rgb(var(--c-dim) / .6)', strokeWidth: 1.2 }} />
      <path d="M9.6 9.2 a1 1 0 1 0 -1.6 -0.6 a2.6 2.6 0 1 0 4 -1.6 a4.6 4.6 0 1 0 -6.8 5.4" fill="none" strokeLinecap="round"
        style={{ stroke: 'rgb(var(--c-p4) / .75)', strokeWidth: 1.3 }} />
    </svg>
  )
}

function Crab() {
  const body = { fill: 'rgb(var(--c-cta))' }
  const leg = { stroke: 'rgb(var(--c-cta))', strokeWidth: 1.6, strokeLinecap: 'round', fill: 'none' }
  return (
    <svg width="34" height="24" viewBox="0 0 34 24">
      <ellipse cx="17" cy="21.5" rx="11" ry="2" style={{ fill: 'rgb(var(--c-text) / .12)' }} />
      <path d="M10 15 L5 18.5 M10.5 17 L6.5 21 M12 18.4 L9.5 22 M24 15 L29 18.5 M23.5 17 L27.5 21 M22 18.4 L24.5 22" style={leg} />
      <path d="M11 12 L6.5 8.5 M23 12 L27.5 8.5" style={leg} />
      <path d="M6.8 9.6 C2.6 9.4 2.2 4.2 5.6 3.4 L5.4 6.4 L7.6 4.4 C9.4 5.6 9 9 6.8 9.6 Z" style={body} />
      <path d="M27.2 9.6 C31.4 9.4 31.8 4.2 28.4 3.4 L28.6 6.4 L26.4 4.4 C24.6 5.6 25 9 27.2 9.6 Z" style={body} />
      <path d="M14.4 11 V7.6 M19.6 11 V7.6" style={{ ...leg, strokeWidth: 1.2 }} />
      <ellipse cx="17" cy="14.2" rx="7.8" ry="5.2" style={body} />
      <path d="M12.4 13 Q17 10.4 21.6 13" fill="none" style={{ stroke: 'rgb(var(--c-card) / .35)', strokeWidth: 1.1, strokeLinecap: 'round' }} />
      {[14.4, 19.6].map(cx => (
        <g key={cx}>
          <circle cx={cx} cy="6.4" r="1.7" style={{ fill: 'rgb(var(--c-card))' }} />
          <circle cx={cx} cy="6.6" r="0.9" style={{ fill: 'rgb(var(--c-text))' }} />
        </g>
      ))}
    </svg>
  )
}
