import { useEffect, useId, useMemo, useState } from 'react'
import { SHORE_TILE, foamBubbles, shorePath, washPhase } from '../lib/beachLogic'

// SHORELINE's scene, loaded on demand by ThemeBackdrop: midday, seen from
// above. The sea fills the top of the page (index.css --beach-sea, about a
// third of the screen) with the header floating on it, and ends in a white
// foamy edge that washes up the sand and back; below it, wet sand, soft damp
// patches, a shell or two and a crab. Decorative only: aria-hidden, no
// pointer events, and always behind the page (index.css .beach-backdrop,
// z-index -1), so cards and game boards are opaque and the waves never cross
// them. The scene scrolls with the page, like the beach under it.
//
// Everything that moves is transform or opacity on its own layer, so the
// compositor animates it without repainting the page. Reduced motion (the
// Settings switch or the OS) stops the animation in index.css.

// The approved design's art (390x844 board, variant A): a darker back wave,
// half a cycle out of step, and the front swash with its foam line and spray.
// Each strip is WAVE_H tall with its shoreline near FRONT.base; index.css
// places the strip so that line sits at --beach-sea.
const BACK = { base: 120, amp: 9, phase: 1.3 }
const FRONT = { base: 102, amp: 11, phase: 0 }
const WAVE_H = 170

// Glints of foam on the open water: [share of the width, share of the sea's depth].
const GLINTS = [[0.15, 0.25], [0.38, 0.84], [0.64, 0.39], [0.85, 0.94], [0.26, 0.6], [0.52, 0.12], [0.92, 0.5], [0.06, 0.78]]

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

export default function BeachBackdrop() {
  const width = useStripWidth()
  // Start the waves where the shared wave clock says we are, so the surf
  // ambience (musicAmbience.js) swells as the water reaches the sand.
  const [delay] = useState(() => -washPhase(typeof performance === 'undefined' ? 0 : performance.now()))
  return (
    <>
      <div className="beach-backdrop" aria-hidden="true" style={{ '--wash-delay': `${delay.toFixed(3)}s` }}>
        <div className="beach-wet" />
        <Dressing wide={false} />
        <Wave width={width} shape={BACK} back />
        <Wave width={width} shape={FRONT} />
        {/* Deep water under the header ink, fading into the waves. */}
        <div className="beach-deep" />
        {GLINTS.map(([x, y], i) => (
          <span key={i} className="beach-glint" style={{ left: `${x * 100}%`, top: `calc(var(--beach-sea) * ${y})`, animationDelay: `${(-i * 0.9).toFixed(1)}s` }} />
        ))}
      </div>
      {/* Wider screens have open sand beside the content column: more of
          the same, spread down the screen (hidden on phones in index.css). */}
      <div className="beach-sand" aria-hidden="true">
        <Dressing wide />
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
// `x` measures from the right edge); `y` is px below the waterline
// (--beach-sea), or a share of the screen height when `vh` is set. `wide`
// pieces lie on the open sand beside the content column; the rest lie in the
// wash zone between the waterline and the page's first line, where the
// waves run over them.
const PATCHES = [
  { x: -0.1, y: 30, w: 170, h: 40, rot: -4 },
  { x: -0.66, y: 36, w: 180, h: 44, rot: 3 },
  { x: 0.03, vh: 0.5, w: 220, h: 64, rot: 8, wide: true },
  { x: -0.04, vh: 0.66, w: 240, h: 70, rot: -6, wide: true },
  { x: 0.08, vh: 0.86, w: 180, h: 54, rot: 2, wide: true },
]
const SHELLS = [
  { kind: 'scallop', x: -0.04, y: 30, rot: 18 },
  { kind: 'snail', x: 0.12, vh: 0.56, rot: -20, wide: true },
  { kind: 'scallop', x: 0.05, vh: 0.76, rot: -12, wide: true },
  { kind: 'snail', x: -0.06, vh: 0.88, rot: 40, wide: true },
]
const CRABS = [
  { x: 0.03, y: 26, rot: -6 },
  { x: -0.14, vh: 0.72, rot: 8, wide: true, delay: -4.5 },
]

function place({ x, y, vh, rot = 0, w, h, delay }) {
  const style = {
    [x < 0 ? 'right' : 'left']: `${Math.abs(x) * 100}%`,
    top: vh == null ? `calc(var(--beach-sea) + ${y}px)` : `${vh * 100}%`,
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
