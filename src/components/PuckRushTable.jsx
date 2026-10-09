import { cn } from '@/lib/utils'
import { COURT_W, COURT_H, PUCK_R, WALL_Y, WALL_HALF, GAP_HALF_W, sideOf } from '../lib/puckrushLogic'

// Puck Rush table — DOM/CSS, themed via retro tokens. Positions arrive in
// court coords (w=1 × h=COURT_H). `mySide` picks which half is drawn nearest
// the player: the O seat sees the table turned around.
//
// A puck wears the colour of the half it is on, so "the green ones are mine
// to get rid of" needs no legend. Colour is backed by position: the wall
// splits the two sets.

const BAND_INSET = 0.075
const pct = (v, of) => `${(v / of) * 100}%`

export function PuckRushHud({ left, names, mySide = 'X' }) {
  const order = mySide === 'O' ? ['O', 'X'] : ['X', 'O']
  return (
    <div className="flex items-center justify-between gap-2 font-pixel">
      {order.map((side, k) => (
        <div
          key={side}
          className={cn('flex items-center gap-2 min-w-0', k === 1 && 'flex-row-reverse text-right', side === 'X' ? 'text-retro-p1' : 'text-retro-p2')}
          data-testid={`puckrush-left-${side}`}
          aria-label={`${names[side]}: ${left[side]} pucks left`}
        >
          <span className="text-xl leading-none tabular-nums">{left[side]}</span>
          <span className="min-w-0 space-y-1">
            <span className="block text-[8px] truncate">{names[side]} · LEFT</span>
            <span className={cn('flex gap-0.5 h-1.5', k === 1 && 'justify-end')} aria-hidden="true">
              {Array.from({ length: left[side] }, (_, i) => <i key={i} className="w-1.5 h-1.5 rounded-full bg-current" />)}
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}

export default function PuckRushTable({
  pucks = [],
  held = { X: null, O: null },
  aims = { X: null, O: null },   // { i, from, to } while a side is pulling a puck back
  mySide = 'X',
  flash = null,                  // 'X' | 'O': a puck just left that side
  tableRef,
  dim = false,
  overlay,
  labels = { X: 'YOUR HALF', O: 'THEIR HALF' },
}) {
  const flip = mySide === 'O'
  const vx = (x) => (flip ? COURT_W - x : x)
  const vy = (y) => (flip ? COURT_H - y : y)
  const layer = (x, y) => ({ transform: `translate3d(${pct(vx(x), COURT_W)}, ${pct(vy(y), COURT_H)}, 0)` })
  // Which side's half is drawn at the top / bottom of the screen.
  const top = flip ? 'X' : 'O'
  const bottom = flip ? 'O' : 'X'
  const tint = { X: 'bg-retro-tint-p1', O: 'bg-retro-tint-p2' }
  const ink = { X: 'text-retro-p1', O: 'text-retro-p2' }
  const gapL = COURT_W / 2 - GAP_HALF_W
  const gapR = COURT_W / 2 + GAP_HALF_W
  const wallTop = pct(WALL_Y - WALL_HALF, COURT_H)
  const wallH = pct(WALL_HALF * 2, COURT_H)

  // Elastic bands and the aim line share one overlay in court units.
  const band = (side) => {
    const y = side === 'X' ? COURT_H - BAND_INSET : BAND_INSET
    const a = aims[side]
    const near = a && Math.abs(a.to.y - y) < 0.16
    const mid = near ? ` L${vx(a.to.x)} ${vy(a.to.y + (side === 'X' ? PUCK_R : -PUCK_R))}` : ''
    return `M0.045 ${vy(y)}${mid} L${COURT_W - 0.045} ${vy(y)}`
  }
  const arrow = (a) => {
    const dx = a.from.x - a.to.x
    const dy = a.from.y - a.to.y
    if (Math.hypot(dx, dy) < 0.02) return null
    const x1 = vx(a.from.x), y1 = vy(a.from.y)
    const x2 = vx(a.from.x + dx * 1.6), y2 = vy(a.from.y + dy * 1.6)
    const ang = Math.atan2(y2 - y1, x2 - x1)
    const h = 0.04
    return {
      line: `M${x1} ${y1} L${x2} ${y2}`,
      head: `M${x2 - Math.cos(ang - 0.5) * h} ${y2 - Math.sin(ang - 0.5) * h} L${x2} ${y2} L${x2 - Math.cos(ang + 0.5) * h} ${y2 - Math.sin(ang + 0.5) * h}`,
    }
  }

  return (
    <div
      ref={tableRef}
      data-testid="puckrush-table"
      className={cn(
        'relative mx-auto rounded-2xl border-4 border-retro-text bg-retro-deep overflow-hidden select-none touch-none shadow-[0_4px_0_rgb(var(--c-structure))]',
        dim && 'opacity-60',
      )}
      style={{ aspectRatio: `${COURT_W} / ${COURT_H}`, width: `min(100%, calc((100dvh - 330px) / ${COURT_H}))` }}
    >
      {/* Halves, tinted in their owner's colour */}
      <div className={cn('absolute inset-x-0 top-0 h-1/2', tint[top])} />
      <div className={cn('absolute inset-x-0 bottom-0 h-1/2', tint[bottom])} />
      <div className="absolute inset-x-0 top-0 h-1.5 bg-retro-text/10" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[31%] aspect-square rounded-full border-2 border-retro-card" />
      <span className={cn('absolute left-2 font-pixel text-[7px] opacity-75 pointer-events-none', ink[top])} style={{ top: '43%' }}>{labels[top]}</span>
      <span className={cn('absolute right-2 font-pixel text-[7px] opacity-75 pointer-events-none', ink[bottom])} style={{ top: '54%' }}>{labels[bottom]}</span>

      {/* The gap: the only way across */}
      <div
        className={cn('absolute bg-retro-card/75 transition-colors duration-fast', flash && (flash === 'X' ? 'bg-retro-p1/50' : 'bg-retro-p2/50'))}
        style={{ left: pct(gapL, COURT_W), width: pct(gapR - gapL, COURT_W), top: pct(WALL_Y - WALL_HALF * 1.6, COURT_H), height: pct(WALL_HALF * 3.2, COURT_H) }}
      />
      <svg
        className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-[9%] stroke-retro-cta animate-pulse pointer-events-none" style={{ top: '50%' }}
        viewBox="0 0 24 18" fill="none" strokeWidth="3" aria-hidden="true"
      >
        <path d="M2 16 12 9 22 16" /><path d="M2 9 12 2 22 9" opacity="0.5" />
      </svg>

      {/* Wall, with a lit top edge and a shadow on the ice below */}
      {[{ left: 0, width: pct(gapL, COURT_W) }, { left: pct(gapR, COURT_W), right: 0 }].map((pos, k) => (
        <div key={k} className="absolute" style={{ ...pos, top: wallTop, height: wallH }}>
          <div className="absolute inset-0 bg-retro-text shadow-[0_3px_0_rgb(var(--c-text)/0.18)]" />
          <div className="absolute inset-x-0 top-[18%] h-[14%] bg-retro-card/35" />
        </div>
      ))}
      {[gapL, gapR].map((gx) => (
        <div
          key={gx}
          className="absolute -translate-x-1/2 rounded-sm bg-retro-cta border-2 border-retro-text"
          style={{ left: pct(gx, COURT_W), top: pct(WALL_Y - WALL_HALF * 1.6, COURT_H), height: pct(WALL_HALF * 3.2, COURT_H), width: '3.4%' }}
        />
      ))}

      {/* Bands, pegs, the pulled puck's start ring and the aim arrow */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${COURT_W} ${COURT_H}`} preserveAspectRatio="none" fill="none" aria-hidden="true">
        {['O', 'X'].map((side) => (
          <g key={side}>
            <path d={band(side)} className="stroke-retro-text" strokeWidth="0.024" strokeLinejoin="round" />
            <path d={band(side)} className={side === 'X' ? 'stroke-retro-p1' : 'stroke-retro-p2'} strokeWidth="0.012" strokeLinejoin="round" />
            {[0.045, COURT_W - 0.045].map((x) => (
              <circle key={x} cx={x} cy={vy(side === 'X' ? COURT_H - BAND_INSET : BAND_INSET)} r="0.02" className="fill-retro-text" />
            ))}
          </g>
        ))}
        {['X', 'O'].map((side) => {
          const a = aims[side]
          const ar = a && arrow(a)
          if (!a) return null
          return (
            <g key={side}>
              <circle cx={vx(a.from.x)} cy={vy(a.from.y)} r={PUCK_R} className="stroke-retro-text/40" strokeWidth="0.007" strokeDasharray="0.012 0.014" />
              {ar && <path d={ar.line} className="stroke-retro-cta" strokeWidth="0.011" strokeDasharray="0.018 0.02" />}
              {ar && <path d={ar.head} className="stroke-retro-cta" strokeWidth="0.012" strokeLinejoin="round" strokeLinecap="round" />}
            </g>
          )
        })}
      </svg>

      {/* Pucks */}
      {pucks.map((p, i) => {
        const side = sideOf(p.y)
        const isHeld = held.X === i || held.O === i
        return (
          <div key={i} className="absolute inset-0 pointer-events-none" style={layer(p.x, p.y)}>
            <div
              className={cn(
                'absolute left-0 top-0 rounded-full border-2 border-retro-text transition-colors duration-fast',
                side === 'X' ? 'bg-retro-p1' : 'bg-retro-p2',
                isHeld ? 'shadow-[0_0_0_4px_rgb(var(--c-cta)/0.55)]' : 'shadow-[0_3px_0_rgb(var(--c-text)/0.3)]',
              )}
              style={{ width: pct(PUCK_R * 2, COURT_W), aspectRatio: '1', transform: 'translate(-50%, -50%)' }}
            >
              <div className="absolute inset-[26%] rounded-full bg-retro-card/50" />
            </div>
          </div>
        )
      })}

      {overlay && (
        <div data-testid="puckrush-overlay" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-retro-bg/70 backdrop-blur-[1px]">
          {overlay}
        </div>
      )}
    </div>
  )
}
