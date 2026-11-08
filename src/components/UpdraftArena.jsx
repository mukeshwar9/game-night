import { forwardRef, memo } from 'react'
import {
  HOPPER_H, HOPPER_W, JUMP_V, PICKUP_SIZE, PLAT_H, PLAT_W, UNITS_PER_M, VENT_H, VENT_W, VIEW_H, WORLD_W,
  platformX, toMetres,
} from '../lib/updraftLogic'
import { railFraction } from '../lib/updraftStageLogic'
import useMotionPref from '../hooks/useMotionPref'
import Avatar from './Avatar'
import UpdraftIcon from './UpdraftIcons'
import { cn } from '@/lib/utils'

// UPDRAFT's playfield: a portrait window onto the tower, drawn with DOM
// blocks on theme tokens (no canvas, no images). Rendering only — the page
// owns the sim. World → screen: x as a % of WORLD_W, height as a % of VIEW_H
// above the camera's floor (`run.camY`).
//
// Platforms keep a shape-distinct look so they read without colour: normal =
// slab with a lit top lip, moving = slab with end caps, spring = slab with a
// coil, crumble = three loose segments, cursed = slab with a crack. The feel
// layer (squash and stretch, landing dust, falling crumble pieces, a coil
// that compresses) is derived from the sim's last landing, so it costs the
// sim nothing; reduced motion drops it and keeps the camera hard-locked.
//
// The arena fills whatever the stage gives it (`size`): on a tall phone the
// window shows more of the tower above you (`viewH` ≥ VIEW_H, see
// updraftStageLogic.fitStage) while the sim's camera is unchanged. Each
// climber wears their avatar's face; a 0–goal rail down the right edge carries
// both faces. In-play text is never under 10 px.

const GRID = 48
const BAND = 100 * UNITS_PER_M
const SQUASH_S = 0.08
const DUST_S = 0.25
const PIECES_S = 0.45
// Where an off-screen rival waits, in world units from the window's edges.
const GHOST_TOP = 165
const GHOST_BOTTOM = 100

const pctX = (x) => `${(x / WORLD_W) * 100}%`
const pctY = (y, camY, vh) => `${((y - camY) / vh) * 100}%`
const pctW = (w) => `${(w / WORLD_W) * 100}%`
const pctH = (h, vh) => `${(h / vh) * 100}%`

const Coil = ({ squashed }) => (
  <svg
    viewBox="0 0 16 12"
    className="absolute left-1/2 bottom-full w-4 h-3 -translate-x-1/2 stroke-retro-cta fill-none origin-bottom transition-transform duration-fast"
    style={{ transform: `translateX(-50%) scaleY(${squashed ? 0.45 : 1})` }}
    aria-hidden="true"
  >
    <path d="M2 11H14M3 9L13 7M3 5L13 7M3 5L13 3M2 1H14" strokeWidth="2" />
  </svg>
)

const Crack = () => (
  <svg viewBox="0 0 64 10" preserveAspectRatio="none" className="absolute inset-0 w-full h-full stroke-retro-danger fill-none" aria-hidden="true">
    <path d="M10 0L16 5L12 10M34 0L30 4L38 7L35 10M52 0L56 6" strokeWidth="2.5" />
  </svg>
)

const Platform = memo(function Platform({ p, x, camY, vh, cursed, marked, squashed }) {
  const box = { left: pctX(x), bottom: pctY(p.y - PLAT_H, camY, vh), width: pctW(PLAT_W), height: pctH(PLAT_H, vh) }
  const ring = marked && 'outline outline-2 outline-offset-2 outline-retro-danger'
  if (p.kind === 'crumble') {
    return (
      <div className={cn('absolute flex gap-[3px]', ring)} style={box}>
        {[0, 1, 2].map(i => (
          <span key={i} className={cn('flex-1 rounded-[1px] bg-retro-danger/70 border-t-2 border-retro-danger', i === 1 && 'translate-y-px rotate-3')} />
        ))}
      </div>
    )
  }
  return (
    <div
      className={cn(
        'absolute rounded-[2px] bg-retro-dim border-t-2 border-retro-text',
        p.kind === 'moving' && 'border-x-4 border-x-retro-text/70',
        ring,
      )}
      style={box}
    >
      {cursed && <Crack />}
      {p.kind === 'spring' && !cursed && <Coil squashed={squashed} />}
    </div>
  )
})

/** Pieces of a platform that broke under the hopper, tumbling for PIECES_S. */
function Pieces({ x, y, camY, vh, age }) {
  const k = age / PIECES_S
  return [0, 1, 2].map(i => (
    <span
      key={i}
      className="absolute rounded-[1px] bg-retro-danger/70"
      style={{
        left: pctX(x + i * (PLAT_W / 3)), bottom: pctY(y - PLAT_H, camY, vh), width: pctW(PLAT_W / 3 - 3), height: pctH(PLAT_H, vh),
        transform: `translateY(${k * k * 260}%) rotate(${(i - 1) * k * 40}deg)`, opacity: 1 - k,
      }}
      aria-hidden="true"
    />
  ))
}

/** A three-pixel dust puff where the hopper landed. */
function Dust({ x, y, camY, vh, age }) {
  const k = age / DUST_S
  return [-1, 0, 1].map(i => (
    <span
      key={i}
      className="absolute w-[3px] h-[3px] bg-retro-text/50"
      style={{ left: pctX(x + i * (6 + k * 16)), bottom: pctY(y + 2 + k * 6 * (i === 0 ? 1.5 : 1), camY, vh), opacity: 1 - k }}
      aria-hidden="true"
    />
  ))
}

const HOPPER_TONE = {
  X: { solid: 'bg-retro-p1', ghost: 'border-retro-p1 bg-retro-p1/10', eye: 'bg-retro-p1', tag: 'text-retro-p1', ring: 'border-retro-p1' },
  O: { solid: 'bg-retro-p2', ghost: 'border-retro-p2 bg-retro-p2/10', eye: 'bg-retro-p2', tag: 'text-retro-p2', ring: 'border-retro-p2' },
}

function Hopper({ x, y, camY, vh, side, ghost = false, dead = false, shape = 1, look = 0, tag = null, avatar = null }) {
  const tone = HOPPER_TONE[side === 'O' ? 'O' : 'X']
  const eye = ghost ? tone.eye : 'bg-retro-deep'
  const scale = shape === 'squash' ? 'scale(1.25, 0.75)' : shape === 'stretch' ? 'scale(0.85, 1.18)' : undefined
  return (
    <div
      className={cn('absolute', dead && 'opacity-30')}
      style={{ left: pctX(x), bottom: pctY(y, camY, vh), width: pctW(HOPPER_W), height: pctH(HOPPER_H, vh) }}
      aria-hidden="true"
    >
      {tag && (
        <span className={cn('absolute left-1/2 -translate-x-1/2 bottom-full mb-1 px-1 py-0.5 rounded-sm bg-retro-deep/80 font-pixel text-[10px] whitespace-nowrap', tone.tag)}>
          {tag}
        </span>
      )}
      {avatar ? (
        // The climber's own face: a ringed avatar tile, ringed in their seat colour.
        <div className="absolute inset-0 origin-bottom" style={{ transform: scale }}>
          <div
            className={cn(
              'absolute inset-0 flex items-center justify-center overflow-hidden rounded-[5px] border-2 bg-retro-card',
              tone.ring, ghost && 'border-dashed opacity-85',
            )}
          >
            <Avatar id={avatar} size={24} tile={false} className="shrink-0" />
          </div>
          {!ghost && (
            <span className="absolute -bottom-1 left-[15%] right-[15%] h-[3px] flex justify-between" aria-hidden="true">
              <span className="w-[30%] bg-retro-text" /><span className="w-[30%] bg-retro-text" />
            </span>
          )}
        </div>
      ) : (
        <div
          className={cn(
            'absolute inset-0 origin-bottom rounded-t-[4px] rounded-b-[2px] border-2',
            ghost ? cn('border-dashed opacity-80', tone.ghost) : cn(tone.solid, 'border-retro-text/80'),
          )}
          style={{ transform: scale }}
        >
          <span className={cn('absolute top-[28%] left-[20%] w-[18%] h-[18%]', eye)} style={{ transform: `translateX(${look * 60}%)` }} />
          <span className={cn('absolute top-[28%] right-[20%] w-[18%] h-[18%]', eye)} style={{ transform: `translateX(${look * 60}%)` }} />
          {!ghost && (
            <span className="absolute -bottom-1 left-[15%] right-[15%] h-[3px] flex justify-between" aria-hidden="true">
              <span className="w-[30%] bg-retro-text" /><span className="w-[30%] bg-retro-text" />
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function Vent({ v, camY, vh }) {
  return (
    <div
      className="absolute border-x border-dashed border-retro-win/60 bg-gradient-to-t from-retro-win/25 to-transparent pointer-events-none overflow-hidden"
      style={{ left: pctX(v.x), bottom: pctY(v.y, camY, vh), width: pctW(VENT_W), height: pctH(VENT_H, vh) }}
      aria-hidden="true"
    >
      {[[50, 0], [25, -0.3], [75, -0.6]].map(([left, delay]) => (
        <i key={left} className="updraft-air absolute bottom-0 w-[2px] h-[10%] bg-retro-win/80" style={{ left: `${left}%`, animationDelay: `${delay}s` }} />
      ))}
      <span className="absolute inset-x-0 bottom-0 h-1 bg-retro-win/70" />
    </div>
  )
}

const PICKUP_LOOK = {
  gem: { icon: 'gem', cls: 'text-retro-cta bg-retro-tint-cta border-retro-cta' },
  feather: { icon: 'feather', cls: 'text-retro-win bg-retro-deep border-retro-win updraft-bob' },
  boost: { icon: 'boost', cls: 'text-retro-p1 bg-retro-tint-p1 border-retro-p1 updraft-bob' },
}

/**
 * The 0–goal rail down the right edge: both climbers' faces at their best
 * heights, my climb filled in, the flag at the top. Faces that would overlap
 * sit side by side.
 */
function SideRail({ goal, marks, mySide, avatars }) {
  const fracs = marks.map(m => railFraction(m.y, goal))
  const crowded = marks.length > 1 && Math.abs(fracs[0] - fracs[1]) < 0.08
  return (
    <div className="absolute right-5 top-24 bottom-28 w-2 pointer-events-none" aria-hidden="true">
      <span className="absolute inset-0 rounded-sm bg-retro-border/70" />
      {marks.filter(m => m.side === mySide).map(m => (
        <span
          key={m.side}
          className={cn('absolute inset-x-0 bottom-0 rounded-sm', m.side === 'X' ? 'bg-retro-p1/70' : 'bg-retro-p2/70')}
          style={{ height: `${railFraction(m.y, goal) * 100}%` }}
        />
      ))}
      <span className="absolute -top-6 right-[-6px] flex items-center gap-1 font-pixel text-[10px] text-retro-cta text-glow-cta whitespace-nowrap">
        {toMetres(goal)}m<UpdraftIcon name="flag" />
      </span>
      {marks.map((m, i) => {
        const tone = m.side === 'X' ? 'border-retro-p1' : 'border-retro-p2'
        const mine = m.side === mySide
        return (
          <span
            key={m.side}
            className={cn(
              'absolute flex items-center justify-center w-7 h-7 rounded-md border-2 bg-retro-card overflow-hidden',
              tone, m.dead && 'opacity-40 grayscale', mine ? 'z-10' : 'z-0',
            )}
            style={{ left: `calc(50% - 14px - ${crowded && !mine ? 32 : 0}px)`, bottom: `calc(${fracs[i] * 100}% - 14px)` }}
          >
            {avatars?.[m.side]
              ? <Avatar id={avatars[m.side]} size={24} tile={false} className="shrink-0" />
              : <span className={cn('font-pixel text-[10px]', m.side === 'X' ? 'text-retro-p1' : 'text-retro-p2')}>{m.side}</span>}
            {m.dead && <UpdraftIcon name="cross" className="absolute text-retro-danger text-[14px]" />}
          </span>
        )
      })}
    </div>
  )
}

function Gate({ g, camY, vh }) {
  return (
    <div className="absolute inset-x-0 h-2" style={{ bottom: pctY(g.y, camY, vh) }} aria-hidden="true">
      <div className={cn('absolute inset-0 border-y border-dashed border-retro-win/50 transition-opacity duration-page', !g.open && 'opacity-0')} />
      <div
        className={cn('absolute inset-x-0 bottom-0 h-5 bg-retro-p2/85 transition duration-page ease-exit', g.open && 'opacity-0')}
        style={{
          transform: g.open ? 'translateY(-160%)' : undefined,
          backgroundImage: 'repeating-linear-gradient(90deg, transparent 0 12px, rgb(var(--c-deep)) 12px 16px), linear-gradient(rgb(var(--c-deep)) 0 2px, transparent 2px)',
        }}
      />
      {g.label && (
        <span className={cn(
          'absolute left-1/2 -translate-x-1/2 -top-5 flex items-center gap-1 px-1 py-0.5 rounded-sm bg-retro-deep/80 font-pixel text-[10px] whitespace-nowrap',
          g.open ? 'text-retro-win' : 'text-retro-p2',
        )}
        >
          <UpdraftIcon name={g.open ? 'key' : 'lock'} />{g.label}
        </span>
      )}
    </div>
  )
}

/**
 * @param {{ tower, run, mySide: 'X'|'O', ghost?: { x: number, y: number, dead: boolean } | null,
 *   ghostSide?: 'X'|'O', ghostTag?: string | null, goal: number, pickups?: readonly string[],
 *   gates?: Array<{ y: number, open: boolean, label?: string }>, keysOn?: boolean, fog?: boolean, gust?: number,
 *   marked?: readonly number[], rail?: Array<{ side: 'X'|'O', y: number, dead?: boolean }>,
 *   avatars?: { X?: string | null, O?: string | null } | null,
 *   size?: { w: number, h: number, viewH: number } | null,
 *   hud?: import('react').ReactNode, foot?: import('react').ReactNode,
 *   banner?: { id: string, text: string, fuseMs?: number } | null,
 *   notice?: string | null, overlay?: import('react').ReactNode, label: string }} props
 */
const UpdraftArena = forwardRef(function UpdraftArena({
  tower, run, mySide, ghost = null, ghostSide, ghostTag = null, goal, pickups = [], gates = [], keysOn = false,
  fog = false, gust = 0, marked = [], rail = [], avatars = null, size = null, hud, foot, banner, notice = null, overlay, label,
}, ref) {
  const { reduced } = useMotionPref()
  // The window onto the tower, in world units: a stage that is taller than the
  // classic 9:16 shows more of the tower above you.
  const vh = size?.viewH ?? VIEW_H
  // Reduced motion keeps the hard camera lock (never below the sim's eased
  // camera, which is also the fall line).
  const camY = reduced ? Math.max(run.camY, run.lockY ?? run.camY) : run.camY

  const lo = camY - 40
  const hi = camY + vh + 40
  const inView = (y) => y >= lo && y <= hi
  const visible = tower ? tower.platforms.filter(p => inView(p.y) && !run.broken[p.id]) : []
  // A rival off screen waits at the edge: under the top strip, over the thumb rail.
  const ghostOn = !!ghost && ghost.y >= camY - 6 && ghost.y <= camY + vh - HOPPER_H + 6
  const ghostY = !ghost ? 0 : ghostOn ? ghost.y : ghost.y > camY ? camY + vh - GHOST_TOP : camY + GHOST_BOTTOM
  const markedSet = new Set(marked)

  const land = run.land ?? null
  const age = land ? run.t - land.t : Infinity
  const feel = !reduced && !run.dead
  const shape = !feel ? 1 : age < SQUASH_S ? 'squash' : run.vy > 0.6 * JUMP_V ? 'stretch' : 1
  const look = run.dead ? 0 : Math.sign(run.vx || 0)
  const brokenLand = land && run.broken[land.id] && age < PIECES_S && feel ? tower?.platforms.find(p => p.id === land.id) : null
  const sky = Math.min(1, Math.max(0, camY / goal))
  // The next closed gate, announced at the top while it is still above the screen.
  const nextGate = gates.some(g => !g.open && inView(g.y)) ? null : gates.find(g => !g.open && g.y > hi && g.label)

  return (
    <div
      ref={ref}
      role="img"
      aria-label={label}
      className={cn('relative mx-auto scroll-mt-3 overflow-hidden bg-retro-deep select-none touch-none', size ? '' : 'rounded-lg border-2 border-retro-border')}
      // On the stage the page hands over the exact box. Inline (the room
      // column, with the app chrome around it) the arena is never wider than
      // fits the screen height with 8.5rem of chrome below it.
      style={size
        ? { width: size.w, height: size.h }
        : { aspectRatio: `${WORLD_W} / ${VIEW_H}`, width: `min(100%, calc((100dvh - 8.5rem) * ${WORLD_W / VIEW_H}))` }}
    >
      {/* The sky deepens with altitude. */}
      <div className="absolute inset-0 bg-gradient-to-b from-retro-tint-p2 to-retro-tint-p1 pointer-events-none" style={{ opacity: sky * 0.45 }} aria-hidden="true" />
      {/* Faint rungs that scroll with the camera, so climbing reads as motion. */}
      {Array.from({ length: Math.ceil(vh / GRID) + 1 }, (_, i) => (Math.ceil(camY / GRID) + i) * GRID).map(y => (
        <div key={y} className="absolute inset-x-0 h-px bg-retro-border/25 pointer-events-none" style={{ bottom: pctY(y, camY, vh) }} aria-hidden="true" />
      ))}
      {/* A band every 100 m. */}
      {Array.from({ length: Math.ceil(vh / BAND) + 1 }, (_, i) => (Math.ceil(camY / BAND) + i) * BAND)
        .filter(y => y > 0 && y < goal)
        .map(y => (
          <div key={`b${y}`} className="absolute inset-x-0 h-px bg-retro-text/25 pointer-events-none" style={{ bottom: pctY(y, camY, vh) }} aria-hidden="true">
            <span className="absolute left-1.5 -top-3.5 font-pixel text-[10px] text-retro-text/50">{toMetres(y)}m</span>
          </div>
        ))}
      {inView(goal) && (
        <div className="absolute inset-x-0 h-1 bg-retro-cta shadow-neon-cta" style={{ bottom: pctY(goal, camY, vh) }} aria-hidden="true">
          <span className="absolute left-2 -top-4 flex items-center gap-1 font-pixel text-[10px] text-retro-cta"><UpdraftIcon name="flag" />{toMetres(goal)}m</span>
        </div>
      )}
      {tower?.vents?.filter(v => inView(v.y) || inView(v.y + VENT_H)).map(v => <Vent key={v.id} v={v} camY={camY} vh={vh} />)}
      {gates.filter(g => inView(g.y)).map(g => <Gate key={g.y} g={g} camY={camY} vh={vh} />)}
      {visible.map(p => (
        <Platform
          key={p.id}
          p={p}
          x={platformX(p, run.t)}
          camY={camY}
          vh={vh}
          cursed={!!run.cursed[p.id]}
          marked={markedSet.has(p.id)}
          squashed={feel && land?.id === p.id && age < SQUASH_S * 2}
        />
      ))}
      {brokenLand && <Pieces x={platformX(brokenLand, land.t)} y={brokenLand.y} camY={camY} vh={vh} age={age} />}
      {feel && land && age < DUST_S && land.kind !== 'crumble' && <Dust x={land.x} y={land.y} camY={camY} vh={vh} age={age} />}
      {tower?.pickups.filter(k => pickups.includes(k.kind) && !run.taken[k.id] && inView(k.y)).map(k => {
        const skin = PICKUP_LOOK[k.kind] ?? PICKUP_LOOK.gem
        return (
          <span
            key={k.id}
            className={cn('absolute flex items-center justify-center rounded-[3px] border-2 text-[10px]', skin.cls)}
            style={{ left: pctX(k.x - PICKUP_SIZE / 2), bottom: pctY(k.y - PICKUP_SIZE / 2, camY, vh), width: pctW(PICKUP_SIZE), height: pctH(PICKUP_SIZE, vh) }}
            aria-hidden="true"
          ><UpdraftIcon name={skin.icon} /></span>
        )
      })}
      {keysOn && tower?.keys.filter(k => !run.keys[k.gate] && inView(k.y)).map(k => (
        <span
          key={k.gate}
          className="absolute flex items-center justify-center text-[11px] text-retro-deep bg-retro-win rounded-sm border-2 border-retro-text"
          style={{ left: pctX(k.x - PICKUP_SIZE / 2), bottom: pctY(k.y - PICKUP_SIZE / 2, camY, vh), width: pctW(PICKUP_SIZE), height: pctH(PICKUP_SIZE, vh) }}
          aria-hidden="true"
        ><UpdraftIcon name="key" /></span>
      ))}
      {ghost && <Hopper x={ghost.x} y={ghostY} camY={camY} vh={vh} side={ghostSide} ghost dead={ghost.dead} tag={ghostTag} avatar={avatars?.[ghostSide]} />}
      <Hopper x={run.x} y={run.y} camY={camY} vh={vh} side={mySide} dead={run.dead} shape={shape} look={look} avatar={avatars?.[mySide]} />
      {fog && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle at ${((run.x + HOPPER_W / 2) / WORLD_W) * 100}% ${100 - ((run.y + HOPPER_H / 2 - camY) / vh) * 100}%, transparent 0 14%, rgb(var(--c-deep) / 0.97) 26%)`,
          }}
          aria-hidden="true"
        />
      )}
      {gust !== 0 && (
        <div className="absolute inset-y-0 w-full pointer-events-none text-retro-text/30 text-[18px] flex items-center justify-around" aria-hidden="true">
          {[0, 1, 2].map(i => <UpdraftIcon key={i} name="wind" flip={gust < 0} />)}
        </div>
      )}
      {rail.length > 0 && <SideRail goal={goal} marks={rail} mySide={mySide} avatars={avatars} />}
      {hud && <div className="absolute inset-x-0 top-0 z-10 p-2 font-pixel text-[10px] pointer-events-none">{hud}</div>}
      {nextGate && (
        <div className="absolute left-1/2 -translate-x-1/2 top-[88px] flex items-center gap-1 px-1.5 py-1 rounded-sm bg-retro-deep/80 font-pixel text-[10px] text-retro-p2 whitespace-nowrap pointer-events-none">
          <UpdraftIcon name="lock" />{nextGate.label}
        </div>
      )}
      {banner && (
        <div key={banner.id} className="absolute left-1/2 -translate-x-1/2 top-[88px] overflow-hidden rounded bg-retro-danger text-retro-bg font-pixel text-[10px] whitespace-nowrap shadow-neon-danger" role="status">
          <span className="flex items-center gap-1.5 px-2.5 py-1.5"><UpdraftIcon name="warn" />{banner.text}</span>
          {banner.fuseMs > 0 && <span className="updraft-fuse block h-1 bg-retro-bg/80" style={{ animationDuration: `${banner.fuseMs}ms` }} aria-hidden="true" />}
        </div>
      )}
      {notice && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-28 px-2.5 py-1.5 rounded bg-retro-cta text-retro-bg font-pixel text-[10px] whitespace-nowrap shadow-neon-cta" role="status">
          {notice}
        </div>
      )}
      {foot && <div className="absolute inset-x-0 bottom-0 z-10 pointer-events-none">{foot}</div>}
      {overlay}
    </div>
  )
})

export default UpdraftArena
