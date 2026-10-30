import { forwardRef, memo } from 'react'
import {
  HOPPER_H, HOPPER_W, JUMP_V, PICKUP_SIZE, PLAT_H, PLAT_W, UNITS_PER_M, VENT_H, VENT_W, VIEW_H, WORLD_W,
  platformX, toMetres,
} from '../lib/updraftLogic'
import useMotionPref from '../hooks/useMotionPref'
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

const GRID = 48
const BAND = 100 * UNITS_PER_M
const SQUASH_S = 0.08
const DUST_S = 0.25
const PIECES_S = 0.45

const pctX = (x) => `${(x / WORLD_W) * 100}%`
const pctY = (y, camY) => `${((y - camY) / VIEW_H) * 100}%`
const pctW = (w) => `${(w / WORLD_W) * 100}%`
const pctH = (h) => `${(h / VIEW_H) * 100}%`

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

const Platform = memo(function Platform({ p, x, camY, cursed, marked, squashed }) {
  const box = { left: pctX(x), bottom: pctY(p.y - PLAT_H, camY), width: pctW(PLAT_W), height: pctH(PLAT_H) }
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
function Pieces({ x, y, camY, age }) {
  const k = age / PIECES_S
  return [0, 1, 2].map(i => (
    <span
      key={i}
      className="absolute rounded-[1px] bg-retro-danger/70"
      style={{
        left: pctX(x + i * (PLAT_W / 3)), bottom: pctY(y - PLAT_H, camY), width: pctW(PLAT_W / 3 - 3), height: pctH(PLAT_H),
        transform: `translateY(${k * k * 260}%) rotate(${(i - 1) * k * 40}deg)`, opacity: 1 - k,
      }}
      aria-hidden="true"
    />
  ))
}

/** A three-pixel dust puff where the hopper landed. */
function Dust({ x, y, camY, age }) {
  const k = age / DUST_S
  return [-1, 0, 1].map(i => (
    <span
      key={i}
      className="absolute w-[3px] h-[3px] bg-retro-text/50"
      style={{ left: pctX(x + i * (6 + k * 16)), bottom: pctY(y + 2 + k * 6 * (i === 0 ? 1.5 : 1), camY), opacity: 1 - k }}
      aria-hidden="true"
    />
  ))
}

const HOPPER_TONE = {
  X: { solid: 'bg-retro-p1', ghost: 'border-retro-p1 bg-retro-p1/10', eye: 'bg-retro-p1', tag: 'text-retro-p1' },
  O: { solid: 'bg-retro-p2', ghost: 'border-retro-p2 bg-retro-p2/10', eye: 'bg-retro-p2', tag: 'text-retro-p2' },
}

function Hopper({ x, y, camY, side, ghost = false, dead = false, shape = 1, look = 0, tag = null }) {
  const tone = HOPPER_TONE[side === 'O' ? 'O' : 'X']
  const eye = ghost ? tone.eye : 'bg-retro-deep'
  const scale = shape === 'squash' ? 'scale(1.25, 0.75)' : shape === 'stretch' ? 'scale(0.85, 1.18)' : undefined
  return (
    <div
      className={cn('absolute', dead && 'opacity-30')}
      style={{ left: pctX(x), bottom: pctY(y, camY), width: pctW(HOPPER_W), height: pctH(HOPPER_H) }}
      aria-hidden="true"
    >
      {tag && (
        <span className={cn('absolute left-1/2 -translate-x-1/2 bottom-full mb-1 px-1 py-0.5 rounded-sm bg-retro-deep/80 font-pixel text-[6px] whitespace-nowrap', tone.tag)}>
          {tag}
        </span>
      )}
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
    </div>
  )
}

function Vent({ v, camY }) {
  return (
    <div
      className="absolute border-x border-dashed border-retro-win/60 bg-gradient-to-t from-retro-win/25 to-transparent pointer-events-none overflow-hidden"
      style={{ left: pctX(v.x), bottom: pctY(v.y, camY), width: pctW(VENT_W), height: pctH(VENT_H) }}
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

/** Height rail: both climbers' best heights against the goal, and my lead. */
function Rail({ goal, marks, lead }) {
  return (
    <div className="absolute right-1.5 top-10 bottom-6 w-2 rounded-sm border border-retro-text/30 pointer-events-none" aria-hidden="true">
      <span className="absolute -top-4 right-[-6px] font-pixel text-[7px] text-retro-cta">{toMetres(goal)}</span>
      {marks.map(({ side, y }) => (
        <span
          key={side}
          className={cn('absolute -right-1 w-4 h-1.5 rounded-[1px]', side === 'X' ? 'bg-retro-p1' : 'bg-retro-p2')}
          style={{ bottom: `${Math.min(100, (y / goal) * 100)}%` }}
        />
      ))}
      {lead != null && (
        <span className={cn('absolute -bottom-5 right-[-4px] font-pixel text-[7px] tabular-nums', lead >= 0 ? 'text-retro-win' : 'text-retro-danger')}>
          {lead >= 0 ? '+' : '−'}{Math.abs(lead)}m
        </span>
      )}
    </div>
  )
}

function Gate({ g, camY }) {
  return (
    <div className="absolute inset-x-0 h-2" style={{ bottom: pctY(g.y, camY) }} aria-hidden="true">
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
          'absolute left-1/2 -translate-x-1/2 -top-5 flex items-center gap-1 px-1 py-0.5 rounded-sm bg-retro-deep/80 font-pixel text-[7px] whitespace-nowrap',
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
 *   marked?: readonly number[], rail?: Array<{ side: 'X'|'O', y: number }>, lead?: number | null,
 *   hud?: import('react').ReactNode, banner?: { id: string, text: string, fuseMs?: number } | null,
 *   notice?: string | null, overlay?: import('react').ReactNode, label: string }} props
 */
const UpdraftArena = forwardRef(function UpdraftArena({
  tower, run, mySide, ghost = null, ghostSide, ghostTag = null, goal, pickups = [], gates = [], keysOn = false,
  fog = false, gust = 0, marked = [], rail = [], lead = null, hud, banner, notice = null, overlay, label,
}, ref) {
  const { reduced } = useMotionPref()
  // Reduced motion keeps the hard camera lock (never below the sim's eased
  // camera, which is also the fall line).
  const camY = reduced ? Math.max(run.camY, run.lockY ?? run.camY) : run.camY

  const lo = camY - 40
  const hi = camY + VIEW_H + 40
  const inView = (y) => y >= lo && y <= hi
  const visible = tower ? tower.platforms.filter(p => inView(p.y) && !run.broken[p.id]) : []
  const ghostY = ghost ? Math.max(camY - 6, Math.min(camY + VIEW_H - HOPPER_H + 6, ghost.y)) : 0
  const markedSet = new Set(marked)

  const land = run.land ?? null
  const age = land ? run.t - land.t : Infinity
  const feel = !reduced && !run.dead
  const shape = !feel ? 1 : age < SQUASH_S ? 'squash' : run.vy > 0.6 * JUMP_V ? 'stretch' : 1
  const look = run.dead ? 0 : Math.sign(run.vx || 0)
  const brokenLand = land && run.broken[land.id] && age < PIECES_S && feel ? tower?.platforms.find(p => p.id === land.id) : null
  const sky = Math.min(1, Math.max(0, camY / goal))

  return (
    <div
      ref={ref}
      role="img"
      aria-label={label}
      className="relative mx-auto scroll-mt-3 overflow-hidden rounded-lg border-2 border-retro-border bg-retro-deep select-none touch-none"
      // Tall arena: never wider than fits the screen height with the steer
      // strip and chrome (8.5rem) below it, so the tower you climb into is
      // not pushed under the header or off the bottom.
      style={{ aspectRatio: `${WORLD_W} / ${VIEW_H}`, width: `min(100%, calc((100dvh - 8.5rem) * ${WORLD_W / VIEW_H}))` }}
    >
      {/* The sky deepens with altitude. */}
      <div className="absolute inset-0 bg-gradient-to-b from-retro-tint-p2 to-retro-tint-p1 pointer-events-none" style={{ opacity: sky * 0.45 }} aria-hidden="true" />
      {/* Faint rungs that scroll with the camera, so climbing reads as motion. */}
      {Array.from({ length: Math.ceil(VIEW_H / GRID) + 1 }, (_, i) => (Math.ceil(camY / GRID) + i) * GRID).map(y => (
        <div key={y} className="absolute inset-x-0 h-px bg-retro-border/25 pointer-events-none" style={{ bottom: pctY(y, camY) }} aria-hidden="true" />
      ))}
      {/* A band every 100 m. */}
      {Array.from({ length: Math.ceil(VIEW_H / BAND) + 1 }, (_, i) => (Math.ceil(camY / BAND) + i) * BAND)
        .filter(y => y > 0 && y < goal)
        .map(y => (
          <div key={`b${y}`} className="absolute inset-x-0 h-px bg-retro-text/25 pointer-events-none" style={{ bottom: pctY(y, camY) }} aria-hidden="true">
            <span className="absolute left-1.5 -top-3 font-pixel text-[6px] text-retro-text/50">{toMetres(y)}m</span>
          </div>
        ))}
      {inView(goal) && (
        <div className="absolute inset-x-0 h-1 bg-retro-cta shadow-neon-cta" style={{ bottom: pctY(goal, camY) }} aria-hidden="true">
          <span className="absolute left-2 -top-4 flex items-center gap-1 font-pixel text-[7px] text-retro-cta"><UpdraftIcon name="flag" />{toMetres(goal)}m</span>
        </div>
      )}
      {tower?.vents?.filter(v => inView(v.y) || inView(v.y + VENT_H)).map(v => <Vent key={v.id} v={v} camY={camY} />)}
      {gates.filter(g => inView(g.y)).map(g => <Gate key={g.y} g={g} camY={camY} />)}
      {visible.map(p => (
        <Platform
          key={p.id}
          p={p}
          x={platformX(p, run.t)}
          camY={camY}
          cursed={!!run.cursed[p.id]}
          marked={markedSet.has(p.id)}
          squashed={feel && land?.id === p.id && age < SQUASH_S * 2}
        />
      ))}
      {brokenLand && <Pieces x={platformX(brokenLand, land.t)} y={brokenLand.y} camY={camY} age={age} />}
      {feel && land && age < DUST_S && land.kind !== 'crumble' && <Dust x={land.x} y={land.y} camY={camY} age={age} />}
      {tower?.pickups.filter(k => pickups.includes(k.kind) && !run.taken[k.id] && inView(k.y)).map(k => {
        const skin = PICKUP_LOOK[k.kind] ?? PICKUP_LOOK.gem
        return (
          <span
            key={k.id}
            className={cn('absolute flex items-center justify-center rounded-[3px] border-2 text-[10px]', skin.cls)}
            style={{ left: pctX(k.x - PICKUP_SIZE / 2), bottom: pctY(k.y - PICKUP_SIZE / 2, camY), width: pctW(PICKUP_SIZE), height: pctH(PICKUP_SIZE) }}
            aria-hidden="true"
          ><UpdraftIcon name={skin.icon} /></span>
        )
      })}
      {keysOn && tower?.keys.filter(k => !run.keys[k.gate] && inView(k.y)).map(k => (
        <span
          key={k.gate}
          className="absolute flex items-center justify-center text-[11px] text-retro-deep bg-retro-win rounded-sm border-2 border-retro-text"
          style={{ left: pctX(k.x - PICKUP_SIZE / 2), bottom: pctY(k.y - PICKUP_SIZE / 2, camY), width: pctW(PICKUP_SIZE), height: pctH(PICKUP_SIZE) }}
          aria-hidden="true"
        ><UpdraftIcon name="key" /></span>
      ))}
      {ghost && <Hopper x={ghost.x} y={ghostY} camY={camY} side={ghostSide} ghost dead={ghost.dead} tag={ghostTag} />}
      <Hopper x={run.x} y={run.y} camY={camY} side={mySide} dead={run.dead} shape={shape} look={look} />
      {fog && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle at ${((run.x + HOPPER_W / 2) / WORLD_W) * 100}% ${100 - ((run.y + HOPPER_H / 2 - camY) / VIEW_H) * 100}%, transparent 0 14%, rgb(var(--c-deep) / 0.97) 26%)`,
          }}
          aria-hidden="true"
        />
      )}
      {gust !== 0 && (
        <div className="absolute inset-y-0 w-full pointer-events-none text-retro-text/30 text-[18px] flex items-center justify-around" aria-hidden="true">
          {[0, 1, 2].map(i => <UpdraftIcon key={i} name="wind" flip={gust < 0} />)}
        </div>
      )}
      {rail.length > 0 && <Rail goal={goal} marks={rail} lead={lead} />}
      {hud && <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-2 font-pixel text-[8px] pointer-events-none">{hud}</div>}
      {banner && (
        <div key={banner.id} className="absolute left-1/2 -translate-x-1/2 top-9 overflow-hidden rounded bg-retro-danger text-retro-bg font-pixel text-[8px] whitespace-nowrap shadow-neon-danger" role="status">
          <span className="flex items-center gap-1.5 px-2.5 py-1.5"><UpdraftIcon name="warn" />{banner.text}</span>
          {banner.fuseMs > 0 && <span className="updraft-fuse block h-1 bg-retro-bg/80" style={{ animationDuration: `${banner.fuseMs}ms` }} aria-hidden="true" />}
        </div>
      )}
      {notice && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-3 px-2.5 py-1.5 rounded bg-retro-cta text-retro-bg font-pixel text-[8px] whitespace-nowrap shadow-neon-cta" role="status">
          {notice}
        </div>
      )}
      {overlay}
    </div>
  )
})

export default UpdraftArena
