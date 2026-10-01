import { forwardRef, memo } from 'react'
import {
  HOPPER_H, HOPPER_W, PICKUP_SIZE, PLAT_H, PLAT_W, VIEW_H, WORLD_W, platformX, toMetres,
} from '../lib/updraftLogic'
import { cn } from '@/lib/utils'

// UPDRAFT's playfield: a portrait window onto the tower, drawn with DOM
// blocks on theme tokens (no canvas, no images). Rendering only — the page
// owns the sim. World → screen: x as a % of WORLD_W, height as a % of VIEW_H
// above the camera's floor (`run.camY`).
//
// Platforms keep a glyph-free but shape-distinct look so they read without
// colour: normal = solid slab, moving = slab with end caps, spring = slab
// with a coil on top, crumble / cursed = broken dashed slab.

const GRID = 48

const pctX = (x) => `${(x / WORLD_W) * 100}%`
const pctY = (y, camY) => `${((y - camY) / VIEW_H) * 100}%`
const pctW = (w) => `${(w / WORLD_W) * 100}%`
const pctH = (h) => `${(h / VIEW_H) * 100}%`

const Platform = memo(function Platform({ p, x, camY, cursed }) {
  const crumbly = p.kind === 'crumble' || cursed
  return (
    <div
      className={cn(
        'absolute rounded-[2px]',
        crumbly ? 'border-2 border-dashed border-retro-danger/80 bg-retro-tint-danger/30'
          : p.kind === 'moving' ? 'bg-retro-structure border-x-4 border-retro-text/60'
            : 'bg-retro-structure',
      )}
      style={{ left: pctX(x), bottom: pctY(p.y - PLAT_H, camY), width: pctW(PLAT_W), height: pctH(PLAT_H) }}
    >
      {p.kind === 'spring' && !cursed && (
        <span
          className="absolute left-1/2 -translate-x-1/2 bottom-full w-3 h-2.5 border-2 border-retro-cta bg-retro-tint-cta rounded-sm"
          aria-hidden="true"
        />
      )}
    </div>
  )
})

const HOPPER_TONE = {
  X: { solid: 'bg-retro-p1', ghost: 'border-retro-p1', eye: 'bg-retro-p1' },
  O: { solid: 'bg-retro-p2', ghost: 'border-retro-p2', eye: 'bg-retro-p2' },
}

function Hopper({ x, y, camY, side, ghost = false, dead = false }) {
  const tone = HOPPER_TONE[side === 'O' ? 'O' : 'X']
  const eye = ghost ? tone.eye : 'bg-retro-deep'
  return (
    <div
      className={cn(
        'absolute rounded-[3px] border-2',
        ghost ? cn('border-dashed opacity-80', tone.ghost) : cn(tone.solid, 'border-retro-text/80'),
        dead && 'opacity-30',
      )}
      style={{ left: pctX(x), bottom: pctY(y, camY), width: pctW(HOPPER_W), height: pctH(HOPPER_H) }}
      aria-hidden="true"
    >
      <span className={cn('absolute top-[28%] left-[20%] w-[18%] h-[18%]', eye)} />
      <span className={cn('absolute top-[28%] right-[20%] w-[18%] h-[18%]', eye)} />
    </div>
  )
}

/** Height rail: both climbers' best heights against the goal. */
function Rail({ goal, marks }) {
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
    </div>
  )
}

/**
 * @param {{ tower, run, mySide: 'X'|'O', ghost?: { x: number, y: number, dead: boolean } | null,
 *   ghostSide?: 'X'|'O', goal: number, pickupsOn?: boolean, gates?: Array<{ y: number, open: boolean, label?: string }>,
 *   keysOn?: boolean, fog?: boolean, gust?: number, rail?: Array<{ side: 'X'|'O', y: number }>,
 *   hud?: import('react').ReactNode, banner?: import('react').ReactNode, overlay?: import('react').ReactNode,
 *   label: string }} props
 */
const UpdraftArena = forwardRef(function UpdraftArena({
  tower, run, mySide, ghost = null, ghostSide, goal, pickupsOn = false, gates = [], keysOn = false,
  fog = false, gust = 0, rail = [], hud, banner, overlay, label,
}, ref) {
  const camY = run.camY
  const lo = camY - 40
  const hi = camY + VIEW_H + 40
  const inView = (y) => y >= lo && y <= hi
  const visible = tower ? tower.platforms.filter(p => inView(p.y) && !run.broken[p.id]) : []
  const ghostY = ghost ? Math.max(camY - 6, Math.min(camY + VIEW_H - HOPPER_H + 6, ghost.y)) : 0
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
      {/* Faint rungs that scroll with the camera, so climbing reads as motion. */}
      {Array.from({ length: Math.ceil(VIEW_H / GRID) + 1 }, (_, i) => (Math.ceil(camY / GRID) + i) * GRID).map(y => (
        <div key={y} className="absolute inset-x-0 h-px bg-retro-border/25 pointer-events-none" style={{ bottom: pctY(y, camY) }} aria-hidden="true" />
      ))}
      {inView(goal) && (
        <div className="absolute inset-x-0 h-1 bg-retro-cta shadow-neon-cta" style={{ bottom: pctY(goal, camY) }} aria-hidden="true">
          <span className="absolute left-2 -top-4 font-pixel text-[7px] text-retro-cta">⚑ {toMetres(goal)}m</span>
        </div>
      )}
      {gates.filter(g => inView(g.y)).map(g => (
        <div
          key={g.y}
          className={cn('absolute inset-x-0 h-2', g.open ? 'border-y border-dashed border-retro-win/50' : 'bg-retro-p2/80')}
          style={{
            bottom: pctY(g.y, camY),
            backgroundImage: g.open ? undefined : 'repeating-linear-gradient(90deg, transparent 0 14px, rgb(var(--c-deep)) 14px 20px)',
          }}
          aria-hidden="true"
        >
          {g.label && (
            <span className={cn('absolute left-1/2 -translate-x-1/2 -top-4 font-pixel text-[7px] whitespace-nowrap', g.open ? 'text-retro-win' : 'text-retro-p2')}>
              {g.label}
            </span>
          )}
        </div>
      ))}
      {visible.map(p => (
        <Platform key={p.id} p={p} x={platformX(p, run.t)} camY={camY} cursed={!!run.cursed[p.id]} />
      ))}
      {pickupsOn && tower?.pickups.filter(k => !run.taken[k.id] && inView(k.y)).map(k => (
        <span
          key={k.id}
          className="absolute rotate-45 border-2 border-retro-text bg-retro-cta shadow-neon-cta"
          style={{ left: pctX(k.x - PICKUP_SIZE / 2), bottom: pctY(k.y - PICKUP_SIZE / 2, camY), width: pctW(PICKUP_SIZE * 0.8), height: pctH(PICKUP_SIZE * 0.8) }}
          aria-hidden="true"
        />
      ))}
      {keysOn && tower?.keys.filter(k => !run.keys[k.gate] && inView(k.y)).map(k => (
        <span
          key={k.gate}
          className="absolute flex items-center justify-center font-pixel text-[9px] text-retro-deep bg-retro-win rounded-sm border-2 border-retro-text"
          style={{ left: pctX(k.x - PICKUP_SIZE / 2), bottom: pctY(k.y - PICKUP_SIZE / 2, camY), width: pctW(PICKUP_SIZE), height: pctH(PICKUP_SIZE) }}
          aria-hidden="true"
        >⚷</span>
      ))}
      {ghost && <Hopper x={ghost.x} y={ghostY} camY={camY} side={ghostSide} ghost dead={ghost.dead} />}
      <Hopper x={run.x} y={run.y} camY={camY} side={mySide} dead={run.dead} />
      {fog && (
        <div
          className="absolute inset-x-0 top-0 h-3/4 pointer-events-none bg-gradient-to-b from-retro-deep via-retro-deep/95 to-transparent"
          aria-hidden="true"
        />
      )}
      {gust !== 0 && (
        <div className="absolute inset-y-0 w-full pointer-events-none font-pixel text-retro-text/30 text-[18px] flex items-center justify-around" aria-hidden="true">
          <span>{gust > 0 ? '»' : '«'}</span><span>{gust > 0 ? '»' : '«'}</span><span>{gust > 0 ? '»' : '«'}</span>
        </div>
      )}
      {rail.length > 0 && <Rail goal={goal} marks={rail} />}
      {hud && <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-2 font-pixel text-[8px] pointer-events-none">{hud}</div>}
      {banner && (
        <div className="absolute left-1/2 -translate-x-1/2 top-9 px-2.5 py-1.5 rounded bg-retro-danger text-retro-bg font-pixel text-[8px] whitespace-nowrap shadow-neon-danger" role="status">
          {banner}
        </div>
      )}
      {overlay}
    </div>
  )
})

export default UpdraftArena
