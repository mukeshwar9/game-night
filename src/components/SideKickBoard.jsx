import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { PIPS } from '../lib/sideKickLogic'
import { W, H, createSideKickRenderer } from './sideKickRender'
import { SEAT } from './sideKickSeats'

// SIDE KICK's play surface: the road canvas, the glass HUD chips over it and
// the thumb pad under it. Rendering only: the rules are in lib/sideKickLogic.js,
// the loop in hooks/useSideKickRun.js, the colours come from the theme tokens.

const chip = 'absolute rounded-xl border border-retro-border/70 bg-retro-card/80 backdrop-blur-sm font-pixel pointer-events-none'

/** The road. `avatars` is one avatar string (or null) per seat; the renderer draws the riders from them. */
export function SideKickArena({ rendererRef, avatars, children, className }) {
  const canvasRef = useRef(null)
  const avatarKey = (avatars || []).join('|')
  const avatarKeyRef = useRef(avatarKey)
  useEffect(() => { avatarKeyRef.current = avatarKey })
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const renderer = createSideKickRenderer(canvas)
    renderer.setAvatars(avatarKeyRef.current ? avatarKeyRef.current.split('|').map((s) => s || null) : [])
    rendererRef.current = renderer
    return () => {
      renderer.dispose()
      rendererRef.current = null
    }
  }, [rendererRef])
  useEffect(() => {
    rendererRef.current?.setAvatars(avatarKey ? avatarKey.split('|').map((s) => s || null) : [])
  }, [avatarKey, rendererRef])

  return (
    <div className={cn('relative w-full overflow-hidden rounded-lg border border-retro-border bg-retro-deep', className)} style={{ aspectRatio: `${W} / ${H}` }}>
      <canvas ref={canvasRef} data-testid="sidekick-arena" className="block h-full w-full" role="img" aria-label="Road ahead: your bike seen from behind, the other riders, traffic and the mirrors" />
      {children}
    </div>
  )
}

function Rail({ rail }) {
  return (
    <div className={cn(chip, 'left-1/2 top-[42px] h-3 w-[38%] -translate-x-1/2 !rounded-full p-0')} aria-hidden="true" data-testid="sidekick-rail">
      <span className="absolute -right-0.5 -top-1 h-[18px] w-[5px] rounded-sm" style={{ background: 'repeating-linear-gradient(rgb(var(--c-text)) 0 3px, rgb(var(--c-bg)) 3px 6px)' }} />
      {rail.map((r) => (
        <span
          key={r.i}
          className={cn('absolute left-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-retro-card', SEAT[r.i % 4].bg, r.down && 'opacity-50')}
          style={{ left: `calc((100% - 10px) * ${r.at})`, zIndex: r.me ? 2 : 1 }}
        />
      ))}
    </div>
  )
}

/** Glass chips over the road: place, clock, speed, balance, bonus chip, one toast, the countdown. */
export function SideKickHud({ hud, toast, ordinalOf }) {
  if (!hud) return null
  return (
    <div className="absolute inset-0 pointer-events-none" data-testid="sidekick-hud">
      <div className={cn(chip, 'left-2.5 top-2.5 px-2.5 pb-1.5 pt-2.5 text-xl text-retro-p1 tabular-nums')} data-testid="sidekick-place">
        {ordinalOf(hud.place)}<small className="ml-0.5 text-[8px] text-retro-dim">/{hud.total}</small>
      </div>
      <div className={cn(chip, 'left-1/2 top-2.5 -translate-x-1/2 px-2 pb-1 pt-2 text-[9px] text-retro-text tabular-nums')} data-testid="sidekick-time">{hud.time}</div>
      <Rail rail={hud.rail} />
      <div className={cn(chip, 'right-2.5 top-2.5 px-2.5 pb-1.5 pt-2.5 text-right text-base text-retro-text tabular-nums')}>
        {String(hud.speed).padStart(3, '0')}<small className="mt-1 block text-[7px] text-retro-dim">KM/H</small>
      </div>
      <div className={cn(chip, 'bottom-2.5 left-2.5 flex items-center gap-1.5 px-2 pb-1.5 pt-2 text-[7px] text-retro-dim')} data-testid="sidekick-pips" aria-label={`Balance ${hud.pips} of ${PIPS}`}>
        {Array.from({ length: PIPS }, (_, i) => (
          <i key={i} className={cn('block h-[11px] w-[15px] rounded transition-colors', i < hud.pips ? (hud.hurt ? 'bg-retro-cta' : 'bg-retro-p1') : 'bg-retro-border')} />
        ))}
        <span>BALANCE</span>
      </div>
      {hud.chip && hud.phase === 'race' && (
        <div className={cn(chip, 'bottom-2.5 right-2.5 px-2 pb-1.5 pt-2 text-[7px] text-retro-cta')} data-testid="sidekick-chip">{hud.chip}</div>
      )}
      {hud.marked && hud.phase === 'race' && (
        <div className={cn(chip, 'bottom-11 right-2.5 px-2 pb-1.5 pt-2 text-[7px] text-retro-danger')} data-testid="sidekick-grudge">GRUDGE · {hud.marked}</div>
      )}
      {toast && (
        <div className="absolute left-1/2 top-[27%] -translate-x-1/2">
          <div
            key={toast.id}
            className={cn(
              chip, 'seat-pop relative whitespace-nowrap px-3 pb-1.5 pt-2.5 text-[9px]',
              toast.tone === 'bad' ? 'bg-retro-danger/90 text-retro-bg border-transparent'
                : toast.tone === 'good' ? 'bg-retro-win/90 text-retro-bg border-transparent'
                  : toast.tone === 'dim' ? 'text-retro-dim' : 'text-retro-text',
            )}
            role="status"
          >
            {toast.text}
          </div>
        </div>
      )}
      {(hud.count != null || hud.go) && (
        <div key={hud.count ?? 'go'} className="arrival-count absolute inset-x-0 top-[34%] text-center font-pixel text-6xl text-retro-card" style={{ textShadow: '0 5px 0 rgb(var(--c-cta))', WebkitTextStroke: '2px rgb(var(--c-text))' }} data-testid="sidekick-count">
          {hud.count != null ? hud.count : 'GO!'}
        </div>
      )}
    </div>
  )
}

const ico = {
  left: 'M19 5 8 15l11 10',
  right: 'M11 5l11 10-11 10',
  boost: 'M17 3 7 17h7l-2 10 11-15h-7z',
  kickL: 'M26 6v10H12l-8 3v5h22',
  kickR: 'M4 6v10h14l8 3v5H4',
}

function PadButton({ label, icon, fill = false, className, children, ...handlers }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'press relative flex min-h-[68px] touch-none select-none flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border-2 font-pixel text-[8px] transition-colors',
        'border-retro-border bg-retro-card/80 text-retro-text data-[down]:bg-retro-tint-p1',
        className,
      )}
      {...handlers}
    >
      {children}
      <svg viewBox="0 0 30 30" className="h-6 w-6" aria-hidden="true">
        <path d={icon} fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={fill ? 0 : 4.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{label}</span>
    </button>
  )
}

/** The thumb pad: STEER ← →, BOOST, KICK L / R. Kick buttons carry the strain bar. */
export function SideKickPad({ bind, hud, enabled = true, className }) {
  const risk = !!hud && hud.strain > 0.6
  const kickClass = (extra) => cn(extra, hud?.cool && 'opacity-60', risk && 'border-retro-danger text-retro-danger', !enabled && 'opacity-50')
  const strainBar = (
    <i
      aria-hidden="true"
      className={cn('absolute inset-x-0 bottom-0 block origin-left transition-transform duration-fast', risk ? 'bg-retro-danger' : 'bg-retro-cta')}
      style={{ height: 4, transform: `scaleX(${hud?.strain ?? 0})` }}
    />
  )
  return (
    <div className={cn('grid grid-cols-[1fr_1fr_0.8fr_1fr_1fr] gap-1.5', className)} data-testid="sidekick-pad" role="group" aria-label="Controls">
      <PadButton label="STEER L" icon={ico.left} className="text-retro-p1" {...bind.steer(-1)} />
      <PadButton label="STEER R" icon={ico.right} className="text-retro-p1" {...bind.steer(1)} />
      <PadButton label="BOOST" icon={ico.boost} fill className={cn('text-retro-cta', hud?.boostReady && 'border-retro-cta', hud?.boosting && 'bg-retro-tint-cta')} {...bind.boost}>
        <i
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 block bg-retro-cta/30"
          style={{ height: `${Math.round((hud?.boost ?? 0.5) * 100)}%` }}
        />
      </PadButton>
      <PadButton label="KICK L" icon={ico.kickL} className={kickClass('text-retro-p2')} data-testid="sidekick-kick-l" {...bind.kick(-1)}>{strainBar}</PadButton>
      <PadButton label="KICK R" icon={ico.kickR} className={kickClass('text-retro-p2')} data-testid="sidekick-kick-r" {...bind.kick(1)}>{strainBar}</PadButton>
    </div>
  )
}
