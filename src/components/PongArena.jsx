import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import PongCourt from './PongCourt'
import { fitCourt, getMode, isSuddenDeath } from '../lib/pongLogic'
import { cn } from '@/lib/utils'

// Responsive Pong stage: a HUD around a court that fills whatever space is
// left. `fullscreen` pins it over the whole viewport (solo play); otherwise it
// sizes itself from its own top edge down to the bottom of the viewport so it
// sits under the room header (multiplayer). The court turns portrait when the
// space is taller than wide — paddles top and bottom, the viewer's own side
// nearest their thumbs.
//
// Writes the live { orientation, nearSide } into `viewRef` so the controls
// hook can map screen input back into sim space.

const INLINE_WIDTH = 'min(calc(100vw - 24px), 64rem)'

const EFFECT_LABELS = [
  ['grow', 'BIG', 'text-retro-win border-retro-win/60'],
  ['shrink', 'SMALL', 'text-retro-danger border-retro-danger/60'],
  ['shield', 'WALL', 'text-retro-p4 border-retro-p4/60'],
]

function PlayerChip({ side, name, points, rounds, effects, me, align = 'left', label = 'PTS' }) {
  const col = side === 'X' ? 'text-retro-p1' : 'text-retro-p2'
  const glow = side === 'X' ? 'text-glow-p1' : 'text-glow-p2'
  const e = effects?.[side]
  return (
    <div className={cn('min-w-0 flex items-center gap-2', align === 'right' && 'flex-row-reverse text-right')}>
      <span className={cn('font-pixel text-2xl tabular-nums leading-none', col, me && glow)} aria-label={`${points} ${label}`}>
        {points}
      </span>
      <div className={cn('min-w-0 space-y-1', align === 'right' && 'flex flex-col items-end')}>
        <p className={cn('font-pixel text-[8px] truncate max-w-[9rem]', col)}>
          {(name || side).toUpperCase()}{me && name?.toUpperCase() !== 'YOU' ? ' (YOU)' : ''}
        </p>
        <div className={cn('flex items-center gap-1 flex-wrap', align === 'right' && 'justify-end')}>
          {rounds && Array.from({ length: rounds.target }, (_, i) => (
            <span
              key={i}
              className={cn('inline-block w-1.5 h-1.5 rounded-[1px] border', i < rounds.won
                ? (side === 'X' ? 'bg-retro-p1 border-retro-p1' : 'bg-retro-p2 border-retro-p2')
                : 'border-retro-border')}
            />
          ))}
          {EFFECT_LABELS.map(([k, text, tone]) => e?.[k] > 0 && (
            <span key={k} className={cn('font-pixel text-[8px] px-1 py-px border rounded-sm tabular-nums', tone)}>
              {text} {Math.ceil(e[k])}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function Status({ view, lives, best }) {
  const mode = getMode(view.mode)
  const clock = mode.timeLimit ? Math.ceil(view.clock ?? 0) : null
  const sudden = isSuddenDeath({ mode: view.mode, clock: view.clock, score: view.score || { X: 0, O: 0 } })
  return (
    <div className="flex flex-col items-center gap-1 shrink-0 text-center">
      <span className="font-pixel text-[8px] text-retro-dim tracking-widest">{mode.label}</span>
      {clock != null && (
        <span className={cn('font-pixel text-sm tabular-nums', sudden || clock <= 10 ? 'text-retro-danger text-glow-danger' : 'text-retro-text')}>
          {sudden ? 'SUDDEN DEATH' : `${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, '0')}`}
        </span>
      )}
      {mode.lives ? (
        <span className="flex gap-1" aria-label={`${lives} lives left`}>
          {Array.from({ length: mode.lives }, (_, i) => (
            <span key={i} className={cn('inline-block w-2 h-2 rounded-[1px]', i < lives ? 'bg-retro-danger shadow-neon-danger' : 'border border-retro-border')} />
          ))}
        </span>
      ) : null}
      {best != null && <span className="font-pixel text-[8px] text-retro-dim">BEST {best}</span>}
      <span className={cn('font-pixel text-[8px] tabular-nums transition-opacity', (view.rally ?? 0) >= 3 ? 'text-retro-cta opacity-100' : 'opacity-0')}>
        RALLY {view.rally ?? 0}
      </span>
    </div>
  )
}

export default function PongArena({
  fullscreen = false, mySide, names = {}, points, rounds, view, fx, overlay, dim,
  actions, footer, courtRef, touchRef, viewRef, best,
}) {
  const nearSide = mySide === 'O' ? 'O' : 'X'
  const farSide = nearSide === 'X' ? 'O' : 'X'
  const stageRef = useRef(null)
  const rootRef = useRef(null)
  const [court, setCourt] = useState({ orientation: 'portrait', w: 0, h: 0 })
  const [inlineH, setInlineH] = useState(null)

  // Inline mode: fill from our top edge to the bottom of the viewport.
  useLayoutEffect(() => {
    if (fullscreen) return
    const measure = () => {
      const el = rootRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top + window.scrollY
      setInlineH(Math.max(340, Math.floor(window.innerHeight - top - 12)))
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [fullscreen])

  // Size the court to the stage whenever the stage changes size.
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => setCourt(fitCourt(el.clientWidth, el.clientHeight))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (viewRef) viewRef.current = { orientation: court.orientation, nearSide }
  }, [viewRef, court.orientation, nearSide])

  // Fullscreen owns the viewport: stop the page behind it from scrolling.
  useEffect(() => {
    if (!fullscreen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [fullscreen])

  const portrait = court.orientation === 'portrait'
  // Keep the HUD as wide as the court so scores sit over their own ends.
  const hudStyle = court.w ? { maxWidth: Math.max(court.w, 320) } : undefined
  const survival = !!getMode(view.mode).wall
  const chip = (side, align) => survival && side === 'O'
    ? <div className={cn('font-pixel text-[8px] text-retro-p2', align === 'right' && 'text-right')}>THE WALL</div>
    : (
      <PlayerChip
        side={side} name={names[side]} points={points[side]} me={mySide === side}
        rounds={rounds ? { won: rounds[side] ?? 0, target: rounds.target } : null}
        effects={view.effects} align={align} label={survival ? 'RETURNS' : 'PTS'}
      />
    )
  // Keys only mean something with a keyboard: phones see just the gesture.
  const hint = <>DRAG ANYWHERE<span className="kbd-hint">{portrait ? ' · ← → / A D' : ' · ↑ ↓ / W S'}</span></>

  return (
    <div
      ref={(el) => { rootRef.current = el; if (touchRef) touchRef.current = el }}
      className={cn(
        'flex flex-col gap-2 touch-none select-none',
        fullscreen
          ? 'fixed inset-0 z-50 bg-retro-bg px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))]'
          : 'max-w-none',
      )}
      // Inline: break out of the room's narrow column so desktop gets a wide
      // court — centred on the column via margin (a transform would re-anchor
      // any fixed-position descendants).
      style={fullscreen ? undefined : {
        height: inlineH ?? 480,
        width: INLINE_WIDTH,
        marginLeft: `calc(50% - ${INLINE_WIDTH} / 2)`,
      }}
    >
      {/* Top HUD — the far player in portrait; both players in landscape */}
      <div className="flex items-center gap-2 mx-auto w-full" style={hudStyle}>
        {portrait ? (
          <>
            <div className="flex-1 min-w-0">{chip(farSide, 'left')}</div>
            <Status view={view} lives={view.lives} best={best} />
            <div className="flex-1 flex justify-end items-center gap-1">{actions}</div>
          </>
        ) : (
          <>
            <div className="flex-1 min-w-0">{chip(nearSide, 'left')}</div>
            <Status view={view} lives={view.lives} best={best} />
            <div className="flex-1 min-w-0">{chip(farSide, 'right')}</div>
            {actions && <div className="flex items-center gap-1">{actions}</div>}
          </>
        )}
      </div>

      <div ref={stageRef} className="flex-1 min-h-0 flex items-center justify-center">
        <PongCourt
          ref={courtRef}
          view={view}
          orientation={court.orientation}
          nearSide={nearSide}
          width={court.w}
          height={court.h}
          fx={fx}
          overlay={overlay}
          dim={dim}
        />
      </div>

      {/* Bottom HUD — your side in portrait, plus the control hint */}
      <div className="group mx-auto w-full space-y-1" style={hudStyle}>
        {portrait && <div>{chip(nearSide, 'left')}</div>}
        {/* Hidden while the first-run TouchCoachmark (in `footer`) says the same thing */}
        <p className="text-center font-pixel text-[8px] text-retro-dim/80 [@media(max-height:420px)]:hidden group-has-[[data-coachmark]]:hidden">{hint}</p>
        {footer}
      </div>
    </div>
  )
}
