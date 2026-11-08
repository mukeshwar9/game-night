import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { PIPS } from '../lib/sideKickLogic'
import { COCKPIT, kickLabel } from '../lib/sideKickCockpitLogic'
import { W, H, createSideKickRenderer } from './sideKickRender'
import { SEAT } from './sideKickSeats'

// SIDE KICK's play surface: the road canvas, one glass HUD strip over its top and
// the two thumb zones over its bottom (left thumb steers, right thumb has KICK and BOOST). Rendering only: the rules are in lib/sideKickLogic.js,
// the loop in hooks/useSideKickRun.js, the colours come from the theme tokens.

const glass = 'rounded-xl border border-retro-border/70 bg-retro-card/80 backdrop-blur-sm font-pixel'
const chip = cn('absolute pointer-events-none', glass)

/** The road. `avatars` is one avatar string (or null) per seat; the renderer draws the riders from them. */
export function SideKickArena({ rendererRef, avatars, children, className, dust = false }) {
  const canvasRef = useRef(null)
  const avatarKey = (avatars || []).join('|')
  const avatarKeyRef = useRef(avatarKey)
  useEffect(() => { avatarKeyRef.current = avatarKey })
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const renderer = createSideKickRenderer(canvas, { dust })
    renderer.setAvatars(avatarKeyRef.current ? avatarKeyRef.current.split('|').map((s) => s || null) : [])
    rendererRef.current = renderer
    return () => {
      renderer.dispose()
      rendererRef.current = null
    }
  }, [rendererRef, dust])
  useEffect(() => {
    rendererRef.current?.setAvatars(avatarKey ? avatarKey.split('|').map((s) => s || null) : [])
  }, [avatarKey, rendererRef])

  return (
    <div className={cn('relative w-full overflow-hidden rounded-lg border border-retro-border bg-retro-deep', className)} style={{ aspectRatio: `${W} / ${H}` }}>
      <canvas ref={canvasRef} data-testid="sidekick-arena" className="block h-full w-full" role="img" aria-label={dust ? 'Trail ahead: your horse seen from behind, the other riders, hay, hazards and a warning on each edge when a rider closes in from behind' : 'Road ahead: your bike seen from behind, the other riders, traffic and a warning on each edge when a rider closes in from behind'} />
      {children}
    </div>
  )
}

/** The race track as a thin rail with one dot per rider, the finish flag at the right end. */
function Rail({ rail }) {
  return (
    <div className="relative h-3.5 w-full" aria-hidden="true" data-testid="sidekick-rail">
      <i className="absolute inset-x-0 top-[3px] block h-2 rounded-full bg-retro-border/80" />
      <span className="absolute -right-0.5 top-0 h-3.5 w-[5px] rounded-sm" style={{ background: 'repeating-linear-gradient(rgb(var(--c-text)) 0 3px, rgb(var(--c-bg)) 3px 6px)' }} />
      {rail.map((r) => (
        <span
          key={r.i}
          className={cn('absolute top-0.5 h-2.5 w-2.5 rounded-full border-2 border-retro-card', SEAT[r.i % 4].bg, r.down && 'opacity-50')}
          style={{ left: `calc((100% - 10px) * ${r.at})`, zIndex: r.me ? 2 : 1 }}
        />
      ))}
    </div>
  )
}

/**
 * One HUD strip over the top of the road: place, balance, clock and the camera switch on the first line,
 * the race rail under it. A bonus chip or a grudge shows below it only while one is active.
 */
export function SideKickHud({ hud, toast, ordinalOf, camera = 'chase', onCamera = null }) {
  if (!hud) return null
  return (
    <div className="absolute inset-0 pointer-events-none" data-testid="sidekick-hud">
      <div className={cn(glass, 'absolute inset-x-2 top-2 space-y-1.5 px-2.5 pb-2 pt-2.5')} data-testid="sidekick-strip">
        <div className="flex items-center gap-1.5">
          <span className="font-pixel text-lg leading-none text-retro-p1 tabular-nums" data-testid="sidekick-place">
            {ordinalOf(hud.place)}<small className="ml-0.5 text-[8px] text-retro-dim">/{hud.total}</small>
          </span>
          <span className="flex items-center gap-[3px]" data-testid="sidekick-pips" role="img" aria-label={`Balance ${hud.pips} of ${PIPS}`}>
            {Array.from({ length: PIPS }, (_, i) => (
              <i key={i} className={cn('block h-[9px] w-[13px] rounded-[3px] transition-colors', i < hud.pips ? (hud.hurt ? 'bg-retro-cta' : 'bg-retro-p1') : 'bg-retro-border')} />
            ))}
          </span>
          <span className="ml-auto text-[9px] leading-none text-retro-text tabular-nums" data-testid="sidekick-time">{hud.time}</span>
          {onCamera && (
            <button
              type="button"
              onClick={(e) => { onCamera(); e.currentTarget.blur() /* Space stays BOOST, not a second press of this button */ }}
              data-testid="sidekick-cam"
              aria-pressed={camera === 'first'}
              aria-label={camera === 'first' ? 'Camera: first person. Switch to chase camera' : 'Camera: chase. Switch to first person'}
              className="press pointer-events-auto -my-1 min-h-8 whitespace-nowrap rounded-lg border border-retro-border/70 px-1 pt-0.5 text-[7px] leading-none text-retro-text"
            >
              {camera === 'first' ? '1ST PERSON' : 'CHASE CAM'}
            </button>
          )}
        </div>
        <Rail rail={hud.rail} />
      </div>
      {hud.phase === 'race' && (hud.chip || hud.marked) && (
        <div className="absolute right-2.5 top-[68px] flex flex-col items-end gap-1">
          {hud.chip && <div className={cn(glass, 'px-2 pb-1.5 pt-2 text-[8px] text-retro-cta')} data-testid="sidekick-chip">{hud.chip}</div>}
          {hud.marked && <div className={cn(glass, 'px-2 pb-1.5 pt-2 text-[8px] text-retro-danger')} data-testid="sidekick-grudge">GRUDGE · {hud.marked}</div>}
        </div>
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
  boot: 'M9 3v13l-5 5v6h20v-5l-7-3V3z',
}

function Icon({ path, size = 24, fill = false }) {
  return (
    <svg viewBox="0 0 30 30" width={size} height={size} aria-hidden="true">
      <path d={path} fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={fill ? 0 : 4.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const zoneBtn = 'press relative flex touch-none select-none flex-col items-center justify-center overflow-hidden border-2 font-pixel leading-none transition-colors data-[down]:bg-retro-tint-p1'

/** The left thumb, tilt on: a needle shows the steer; a tap re-centres. */
function TiltGauge({ lean, onCenter }) {
  return (
    <button
      type="button"
      aria-label="Tilt steering. Tap to centre"
      data-testid="sidekick-tilt"
      onClick={onCenter}
      className={cn(zoneBtn, 'pointer-events-auto gap-2 rounded-2xl border-retro-border bg-retro-card/80 text-[8px] text-retro-p1 backdrop-blur-sm')}
      style={{ width: COCKPIT.steerW * 2 + 6, height: COCKPIT.steerH }}
    >
      <span className="relative block h-2 w-[80%] rounded-full bg-retro-border" aria-hidden="true">
        <i className="absolute left-1/2 top-[-3px] block h-[14px] w-[2px] -translate-x-1/2 bg-retro-dim" />
        <i
          className="absolute top-[-4px] block h-4 w-4 -translate-x-1/2 rounded-full border-2 border-retro-card bg-retro-p1"
          style={{ left: `${50 + Math.max(-1, Math.min(1, lean ?? 0)) * 45}%` }}
        />
      </span>
      <span>TILT · TAP TO CENTRE</span>
    </button>
  )
}

/** A ring drawn round a round button: `fill` 0..1 of its circumference. */
function Ring({ size, fill, className }) {
  const r = size / 2 - 3
  const len = 2 * Math.PI * r
  return (
    <svg className="pointer-events-none absolute inset-0" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="5" strokeLinecap="round" className={className} strokeDasharray={`${len * Math.max(0, Math.min(1, fill))} ${len}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray 150ms' }} />
    </svg>
  )
}

/**
 * The thumb zones over the bottom of the road. Left thumb: STEER (or the tilt gauge). Right thumb: the big KICK
 * button (one, aiming itself at the rider in reach; or KICK L / KICK R with the two-button setting) with BOOST
 * beside it, and in DUST KICK a LASSO above BOOST only while a rope coil is in hand. The strain bar is a ring
 * round KICK. BOOST sits left of KICK, not above it, so the road beside you stays clear for the kick target.
 */
export function SideKickPad({ bind, hud, enabled = true, className, tilt = null, dust = false, kickMode = 'auto' }) {
  const risk = !!hud && hud.strain > 0.6
  const dim = !enabled && 'opacity-50'
  const kickWord = dust ? 'BUCK' : 'KICK'
  const aimed = hud?.aim ?? null
  const boostFill = hud?.boosting ? hud.boostLeft : (hud?.boost ?? 0)
  const showLasso = dust && hud?.rope && hud.phase === 'race' && !hud.down && enabled && bind.lasso

  const lassoBtn = showLasso && (
    <button
      type="button"
      {...bind.lasso}
      data-testid="dustkick-lasso"
      aria-label="Throw the lasso"
      className={cn(zoneBtn, 'pointer-events-auto rounded-full border-retro-cta bg-retro-card/90 text-[8px] text-retro-cta', hud.winding && 'bg-retro-tint-cta')}
      style={{ width: COCKPIT.boost, height: COCKPIT.boost }}
    >
      {hud.winding ? 'ROPE!' : 'LASSO'}
    </button>
  )
  const boostBtn = (
    <div
      className="relative"
      style={{ width: COCKPIT.boost, height: COCKPIT.boost }}
      data-testid="sidekick-boost"
      role="meter"
      aria-label="Boost meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(boostFill * 100)}
    >
      <button
        type="button"
        aria-label={dust ? 'SPURS' : 'BOOST'}
        data-testid="sidekick-boost-btn"
        className={cn(zoneBtn, 'pointer-events-auto h-full w-full gap-1 rounded-full border-retro-border bg-retro-card/90 text-[8px] text-retro-cta backdrop-blur-sm', hud?.boostReady && 'border-retro-cta', hud?.boosting && 'bg-retro-tint-cta', dim)}
        {...bind.boost}
      >
        <Icon path={ico.boost} size={22} fill />
        <span>{dust ? 'SPURS' : 'BOOST'}</span>
      </button>
      <Ring size={COCKPIT.boost} fill={boostFill} className={hud?.boosting || hud?.wake ? 'stroke-retro-win' : 'stroke-retro-cta'} />
    </div>
  )
  const kickPair = (
    <div className="flex gap-1.5">
      {[[-1, 'L', ico.kickL, 'sidekick-kick-l'], [1, 'R', ico.kickR, 'sidekick-kick-r']].map(([side, tag, path, id]) => (
        <button
          key={tag}
          type="button"
          aria-label={`${kickWord} ${tag}`}
          data-testid={id}
          className={cn(zoneBtn, 'pointer-events-auto gap-1.5 rounded-2xl border-retro-border bg-retro-card/90 text-[8px] text-retro-p2 backdrop-blur-sm', aimed?.side === side && 'border-retro-cta', hud?.cool && 'opacity-60', risk && 'border-retro-danger text-retro-danger', dim)}
          style={{ width: COCKPIT.kickPair, height: 76 }}
          {...bind.kick(side)}
        >
          <Icon path={path} size={26} />
          <span>{kickWord} {tag}</span>
          <i aria-hidden="true" className={cn('absolute inset-x-0 bottom-0 block origin-left transition-transform duration-fast', risk ? 'bg-retro-danger' : 'bg-retro-cta')} style={{ height: 4, transform: `scaleX(${hud?.strain ?? 0})` }} />
        </button>
      ))}
    </div>
  )
  const kickOne = (
    <div className="relative" style={{ width: COCKPIT.kick, height: COCKPIT.kick }}>
      <button
        type="button"
        aria-label={kickWord}
        data-testid="sidekick-kick"
        data-aimed={aimed ? aimed.side : undefined}
        className={cn(
          zoneBtn, 'pointer-events-auto h-full w-full gap-1 rounded-full border-retro-cta bg-retro-cta text-[10px] text-retro-bg shadow-[0_5px_0_rgb(var(--c-text)/0.45)] data-[down]:bg-retro-cta data-[down]:brightness-90',
          aimed ? 'shadow-neon-cta' : 'opacity-85', hud?.cool && 'opacity-60', risk && 'border-retro-danger', dim,
        )}
        {...bind.kickAuto}
      >
        <Icon path={ico.boot} size={30} fill />
        <span data-testid="sidekick-kick-label">{kickLabel({ dust, side: aimed?.side ?? 0 })}</span>
      </button>
      <Ring size={COCKPIT.kick} fill={hud?.strain ?? 0} className={risk ? 'stroke-retro-danger' : 'stroke-retro-text/70'} />
    </div>
  )

  return (
    <div className={cn('pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-2', className)} data-testid="sidekick-pad" role="group" aria-label="Controls">
      <div data-testid="sidekick-zone-left">
        {tilt?.on ? (
          <TiltGauge lean={hud?.lean} onCenter={tilt.recenter} />
        ) : (
          <div className="flex gap-1.5">
            {[[-1, 'STEER L', ico.left], [1, 'STEER R', ico.right]].map(([side, label, path]) => (
              <button
                key={label}
                type="button"
                aria-label={label}
                className={cn(zoneBtn, 'pointer-events-auto rounded-2xl border-retro-border bg-retro-card/80 text-retro-p1 backdrop-blur-sm', dim)}
                style={{ width: COCKPIT.steerW, height: COCKPIT.steerH }}
                {...bind.steer(side)}
              >
                <Icon path={path} size={30} />
              </button>
            ))}
          </div>
        )}
      </div>
      {kickMode === 'two' ? (
        <div className="flex flex-col items-end gap-2" data-testid="sidekick-zone-right">{lassoBtn}{boostBtn}{kickPair}</div>
      ) : (
        <div className="flex items-end gap-2" data-testid="sidekick-zone-right">
          <div className="flex flex-col items-end gap-2">{lassoBtn}{boostBtn}</div>
          {kickOne}
        </div>
      )}
    </div>
  )
}
