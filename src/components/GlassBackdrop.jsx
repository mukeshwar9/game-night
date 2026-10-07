import { useMemo, useSyncExternalStore } from 'react'
import { glassGlyphs } from '../lib/glassLogic'
import useGlassLens from '../hooks/useGlassLens'
import useGlassRuntime from '../hooks/useGlassRuntime'

// The GLASS theme's art, loaded on demand by ThemeBackdrop: soft colour fields
// plus sharp arcade glyphs (X, O, arrows, dots, #). The glyphs give the liquid
// lens edges to bend; the fields give the frost something to be seen over.
// Decorative only: aria-hidden, no pointer events. Everything is drawn from the
// --c-art-* / --c-p* tokens (index.css .glass-backdrop), the fields drift and the
// glyphs float, and both freeze when `still` (game screens), under reduced
// motion and in the low-end step-down.
//
// This chunk is also the GLASS theme's host: it runs the runtime (engine verdict,
// low-end step-down, highlight) and the document-wide lens while it is mounted,
// so none of that code is in the entry bundle for other themes.

const GLYPH_SEED = 7

// One <symbol> per glyph in a 24-unit box, stroked in currentColor with square
// caps (the arcade look). Each placement is a <use> carrying its own size,
// rotation and token colour.
function GlyphDefs() {
  return (
    <defs>
      <symbol id="glass-g-x" viewBox="0 0 24 24"><path d="M4 4 20 20M20 4 4 20" /></symbol>
      <symbol id="glass-g-o" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /></symbol>
      <symbol id="glass-g-up" viewBox="0 0 24 24"><path d="M12 21V4M5 11l7-7 7 7" /></symbol>
      <symbol id="glass-g-down" viewBox="0 0 24 24"><path d="M12 3v17M5 13l7 7 7-7" /></symbol>
      <symbol id="glass-g-right" viewBox="0 0 24 24"><path d="M3 12h17M13 5l7 7-7 7" /></symbol>
      <symbol id="glass-g-dot" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" /></symbol>
      <symbol id="glass-g-hash" viewBox="0 0 24 24"><path d="M9 3 7 21M17 3l-2 18M3 9h18M3 15h18" /></symbol>
      <symbol id="glass-g-diamond" viewBox="0 0 24 24"><path d="M12 3 21 12 12 21 3 12Z" /></symbol>
    </defs>
  )
}

// The viewport, rounded to 100 px so a resize re-scatters only when it crosses a
// bucket (and a phone's address bar sliding never does).
function bucket() {
  if (typeof window === 'undefined') return '390x844'
  return `${Math.ceil(window.innerWidth / 100) * 100}x${Math.ceil(window.innerHeight / 100) * 100}`
}

function subscribe(onChange) {
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}

export default function GlassBackdrop({ still = false }) {
  useGlassRuntime()
  useGlassLens()
  const size = useSyncExternalStore(subscribe, bucket, () => '390x844')
  const glyphs = useMemo(() => {
    const [w, h] = size.split('x').map(Number)
    return { w, h, items: glassGlyphs(GLYPH_SEED, w, h) }
  }, [size])

  return (
    <div className={still ? 'glass-backdrop glass-backdrop--still' : 'glass-backdrop'} aria-hidden="true">
      <div className="glass-backdrop__fields" />
      <svg
        className="glass-backdrop__glyphs"
        viewBox={`0 0 ${glyphs.w} ${glyphs.h}`}
        preserveAspectRatio="xMidYMin slice"
        fill="none"
        strokeWidth="3"
        strokeLinecap="square"
        strokeLinejoin="miter"
      >
        <GlyphDefs />
        {glyphs.items.map((g, i) => (
          <use
            key={i}
            href={`#glass-g-${g.kind}`}
            x={g.x}
            y={g.y}
            width={g.size}
            height={g.size}
            transform={`rotate(${g.rotate} ${g.x + g.size / 2} ${g.y + g.size / 2})`}
            style={{ stroke: `rgb(var(${g.tone}))`, fill: g.kind === 'dot' ? `rgb(var(${g.tone}))` : 'none' }}
          />
        ))}
      </svg>
    </div>
  )
}
