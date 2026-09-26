import { forwardRef, memo } from 'react'
import {
  MAZE_W, MAZE_H, CELL_COUNT, CELL, cellAt, START_PELLETS, SPAWN, POWER_WARN_S,
} from '../lib/pacmacLogic'
import { cn } from '@/lib/utils'

// DOM/SVG PAC MAC arena. Every colour comes from the theme's --c-* tokens:
// X is --c-p1, O is --c-p2, the three ghosts are danger / cta / p4, and
// frightened ghosts turn --c-dim with a wobbly mouth (a shape change as well
// as a colour change, so it still reads in the monochrome themes).

const col = (token, alpha) => (alpha == null ? `rgb(var(--c-${token}))` : `rgb(var(--c-${token}) / ${alpha})`)
const SIDE_TOKEN = { X: 'p1', O: 'p2' }
const GHOST_TOKEN = { chaser: 'danger', ambush: 'cta', shy: 'p4' }
const WALL_INSET = 0.2

function isWallCell(x, y) {
  if (y < 0 || y >= MAZE_H) return true
  // Off the left/right edge: a wall unless that row is the open tunnel.
  if (x < 0 || x >= MAZE_W) return cellAt(y * MAZE_W) === CELL.WALL
  return cellAt(x + y * MAZE_W) === CELL.WALL
}

// One path for every wall tile, inset where it faces a corridor, so
// neighbouring wall tiles fuse into solid blocks separated by lanes. Each
// tile is built from four quadrants so an inside corner (walls on both sides,
// open diagonal) is trimmed too instead of poking a square into the lane.
function buildWallPath() {
  let d = ''
  const rect = (x0, y0, x1, y1) => {
    d += `M${Math.min(x0, x1)} ${Math.min(y0, y1)}H${Math.max(x0, x1)}V${Math.max(y0, y1)}H${Math.min(x0, x1)}Z`
  }
  for (let y = 0; y < MAZE_H; y++) {
    for (let x = 0; x < MAZE_W; x++) {
      if (!isWallCell(x, y)) continue
      const cx = x + 0.5
      const cy = y + 0.5
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          const h = isWallCell(x + sx, y)
          const v = isWallCell(x, y + sy)
          const outX = cx + sx * (h ? 0.5 : 0.5 - WALL_INSET)
          const outY = cy + sy * (v ? 0.5 : 0.5 - WALL_INSET)
          if (h && v && !isWallCell(x + sx, y + sy)) {
            rect(cx, cy, outX, outY - sy * WALL_INSET)
            rect(cx, cy, outX - sx * WALL_INSET, outY)
          } else {
            rect(cx, cy, outX, outY)
          }
        }
      }
    }
  }
  return d
}

const WALL_PATH = buildWallPath()
let DOOR = null
for (let i = 0; i < CELL_COUNT; i++) {
  if (cellAt(i) === CELL.DOOR) DOOR = { x: i % MAZE_W, y: Math.floor(i / MAZE_W) }
}

const MazeWalls = memo(function MazeWalls() {
  return (
    <g>
      <path d={WALL_PATH} style={{ fill: col('structure') }} />
      {DOOR && (
        <rect
          x={DOOR.x + 0.05} y={DOOR.y + 0.42} width={0.9} height={0.16} rx={0.08}
          style={{ fill: col('cta', 0.8) }}
        />
      )}
    </g>
  )
})

const Pellets = memo(function Pellets({ pellets }) {
  if (!pellets) return null
  const dots = []
  for (let i = 0; i < CELL_COUNT; i++) {
    const v = pellets[i]
    if (!v) continue
    const x = (i % MAZE_W) + 0.5
    const y = Math.floor(i / MAZE_W) + 0.5
    dots.push(v === 2
      ? <circle key={i} cx={x} cy={y} r={0.3} className="pacmac-power" style={{ fill: col('cta') }} />
      : <circle key={i} cx={x} cy={y} r={0.11} style={{ fill: col('text', 0.75) }} />)
  }
  return <g>{dots}</g>
})

// An actor box is exactly one tile; translate is relative to its own size,
// so (x - 0.5) * 100% puts its centre on tile coordinate x.
function tileBox(x, y, scale = 1) {
  return {
    width: `${100 / MAZE_W}%`,
    height: `${100 / MAZE_H}%`,
    transform: `translate(${(x - 0.5) * 100}%, ${(y - 0.5) * 100}%) scale(${scale})`,
  }
}

const FACE = { right: 'none', left: 'scaleX(-1)', up: 'rotate(-90deg)', down: 'rotate(90deg)' }

function Muncher({ side, p, mine, prey, showYou }) {
  const token = SIDE_TOKEN[side]
  const powered = p.power > 0
  const fading = powered && p.power <= POWER_WARN_S
  return (
    <div data-actor={side} className="absolute left-0 top-0 pointer-events-none" style={tileBox(p.x, p.y, powered ? 1.18 : 1)}>
      {mine && (
        <span
          className="absolute inset-[-14%] rounded-full border-2"
          style={{ borderColor: col(token, 0.75) }}
          aria-hidden="true"
        />
      )}
      <svg
        viewBox="0 0 32 32"
        className={cn(
          'block w-full h-full overflow-visible',
          p.shield > 0 && 'pacmac-blink',
          prey && 'pacmac-prey',
          fading && 'pacmac-blink',
        )}
        style={{
          transform: FACE[p.dir] || 'none',
          filter: powered ? `drop-shadow(0 0 5px ${col(token)})` : undefined,
        }}
        aria-hidden="true"
      >
        <path className="pacmac-mouth-open" style={{ fill: col(token) }} d="M16 16 L29 7 A14 14 0 1 0 29 25 Z" />
        <path className="pacmac-mouth-shut" style={{ fill: col(token) }} d="M16 16 L30 13.5 A14 14 0 1 0 30 18.5 Z" />
      </svg>
      {showYou && (
        <span
          className="absolute left-1/2 -translate-x-1/2 -top-[95%] font-pixel text-[8px] leading-none px-1 py-0.5 rounded whitespace-nowrap"
          style={{ background: col(token), color: col('bg') }}
        >
          YOU
        </span>
      )}
    </div>
  )
}

const EYE_DX = { left: -1.6, right: 1.6, up: 0, down: 0 }
const EYE_DY = { left: 0, right: 0, up: -1.8, down: 1.6 }

function Ghost({ g }) {
  const eaten = g.state === 'eaten' || g.state === 'enter'
  const fright = !eaten && g.fright > 0
  const ending = fright && g.fright <= POWER_WARN_S
  const body = fright ? col('dim') : col(GHOST_TOKEN[g.kind] || 'danger')
  const ex = EYE_DX[g.dir] ?? 0
  const ey = EYE_DY[g.dir] ?? 0
  // Eaten ghosts are just eyes on their way home: light sclera on the dark
  // themes, dark on the light ones — --c-text always contrasts --c-deep.
  const sclera = eaten ? col('text') : col('bg')
  const pupil = eaten ? col('bg') : col('text')
  return (
    <div className="absolute left-0 top-0 pointer-events-none" style={tileBox(g.x, g.y, 0.96)}>
      <svg viewBox="0 0 32 32" className={cn('block w-full h-full', ending && 'pacmac-fright-end')} aria-hidden="true">
        {!eaten && (
          <path
            d="M3 30 V15 A13 13 0 0 1 29 15 V30 L24.7 26 L20.3 30 L16 26 L11.7 30 L7.3 26 Z"
            style={{ fill: body }}
          />
        )}
        {fright ? (
          <>
            <rect x="10" y="11" width="4" height="4" style={{ fill: col('bg') }} />
            <rect x="18" y="11" width="4" height="4" style={{ fill: col('bg') }} />
            <path d="M7 22 L10 19.5 L13 22 L16 19.5 L19 22 L22 19.5 L25 22" fill="none" strokeWidth="1.8" style={{ stroke: col('bg') }} />
          </>
        ) : (
          <>
            <ellipse cx="11" cy="14" rx="4" ry="4.6" style={{ fill: sclera }} />
            <ellipse cx="21" cy="14" rx="4" ry="4.6" style={{ fill: sclera }} />
            <circle cx={11 + ex} cy={14 + ey} r="2.1" style={{ fill: pupil }} />
            <circle cx={21 + ex} cy={14 + ey} r="2.1" style={{ fill: pupil }} />
          </>
        )}
      </svg>
    </div>
  )
}

function SpawnMarker({ side }) {
  const s = SPAWN[side]
  return (
    <div className="absolute left-0 top-0 pointer-events-none" style={tileBox(s.x, s.y, 0.9)}>
      <span
        className="block w-full h-full rounded-full border-2 border-dashed animate-pulse"
        style={{ borderColor: col(SIDE_TOKEN[side], 0.8) }}
      />
    </div>
  )
}

function ScoreBlock({ side, score, name, mine, power, out }) {
  const token = SIDE_TOKEN[side]
  return (
    <div className={cn('min-w-0 flex-1', side === 'O' ? 'text-right' : 'text-left')}>
      <p
        className={cn('font-pixel text-lg leading-none tabular-nums', out && 'opacity-40')}
        style={{ color: col(token), textShadow: mine ? `0 0 8px ${col(token, 0.6)}` : undefined }}
      >
        {score}
      </p>
      <p className="mt-1 font-pixel text-[8px] tracking-widest text-retro-dim truncate">
        {(name || side).toUpperCase()}{mine && name?.toUpperCase() !== 'YOU' ? ' · YOU' : ''}
      </p>
      {power > 0 && (
        <p className="mt-0.5 font-pixel text-[8px] tracking-widest" style={{ color: col(token) }}>
          POWER {Math.ceil(power)}
        </p>
      )}
    </div>
  )
}

/**
 * HUD + maze. `players`/`ghosts`/`pellets` come straight from the sim (host,
 * demo) or from the guest's predicted view; `mySide` marks the local muncher.
 */
const PacmacArena = forwardRef(function PacmacArena(
  {
    pellets, players, ghosts, scoreX = 0, scoreO = 0, timeLeft = 0,
    mySide, namesX, namesO, overlay, dim = false, showYou = false,
  },
  ref,
) {
  const left = pellets ? pellets.reduce((n, v) => n + (v ? 1 : 0), 0) : START_PELLETS
  const secs = Math.max(0, Math.ceil(timeLeft ?? 0))
  const hurry = secs <= 10 && secs > 0
  const me = mySide && players?.[mySide]
  const rival = mySide && players?.[mySide === 'X' ? 'O' : 'X']
  const hunted = !!(me && rival && rival.power > 0 && !(me.power > 0) && !(me.out > 0))
  const hunting = !!(me && rival && me.power > 0 && !(rival.power > 0) && !(rival.out > 0))

  const status = hunted ? { text: 'RUN! THEY CAN EAT YOU', token: 'danger' }
    : hunting ? { text: 'HUNT! BUMP YOUR RIVAL', token: 'win' }
      : null

  return (
    <div className="space-y-2 select-none">
      <div className="flex items-start gap-2 px-1">
        <ScoreBlock side="X" score={scoreX} name={namesX} mine={mySide === 'X'} power={players?.X?.power} out={players?.X?.out > 0} />
        <div className="shrink-0 text-center w-20">
          <p className={cn('font-pixel text-lg leading-none tabular-nums', hurry ? 'text-retro-danger animate-pulse' : 'text-retro-text')}>
            {secs}
          </p>
          <div className="mt-1.5 h-1 w-full rounded-full bg-retro-card border border-retro-border overflow-hidden" aria-hidden="true">
            <div
              className="h-full bg-retro-cta transition-[width] duration-300"
              style={{ width: `${((START_PELLETS - left) / START_PELLETS) * 100}%` }}
            />
          </div>
          <p className="mt-1 font-pixel text-[8px] tracking-widest text-retro-dim">{left} LEFT</p>
        </div>
        <ScoreBlock side="O" score={scoreO} name={namesO} mine={mySide === 'O'} power={players?.O?.power} out={players?.O?.out > 0} />
      </div>

      <div
        ref={ref}
        className={cn(
          'relative mx-auto rounded-md overflow-hidden touch-none border-2 transition-opacity',
          dim ? 'opacity-60 border-retro-border' : 'border-retro-structure',
          status && 'pacmac-status-ring',
        )}
        style={{
          aspectRatio: `${MAZE_W} / ${MAZE_H}`,
          width: `min(100%, calc((100dvh - var(--pacmac-reserve, 300px)) * ${MAZE_W} / ${MAZE_H}))`,
          minWidth: 'min(100%, 240px)',
          background: col('deep'),
          '--pacmac-ring': status ? col(status.token) : undefined,
        }}
      >
        <svg viewBox={`0 0 ${MAZE_W} ${MAZE_H}`} className="absolute inset-0 w-full h-full" aria-hidden="true">
          <MazeWalls />
          <Pellets pellets={pellets} />
        </svg>

        {['X', 'O'].map(side => (players?.[side]?.out > 0 ? <SpawnMarker key={side} side={side} /> : null))}
        {ghosts?.map(g => <Ghost key={g.id} g={g} />)}
        {['X', 'O'].map(side => {
          const p = players?.[side]
          if (!p || p.out > 0) return null
          return (
            <Muncher
              key={side} side={side} p={p}
              mine={mySide === side}
              prey={mySide === side ? hunted : !!(me && me.power > 0 && !(p.power > 0))}
              showYou={showYou && mySide === side}
            />
          )
        })}

        {status && (
          <p
            className="absolute top-1 inset-x-0 text-center font-pixel text-[8px] tracking-widest pointer-events-none"
            style={{ color: col(status.token) }}
          >
            {status.text}
          </p>
        )}

        {overlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-retro-bg/70 z-10">
            {overlay}
          </div>
        )}
      </div>
    </div>
  )
})

export default PacmacArena

const PAD = [
  { dir: 'up', label: '▲', area: '1 / 2' },
  { dir: 'left', label: '◀', area: '2 / 1' },
  { dir: 'right', label: '▶', area: '2 / 3' },
  { dir: 'down', label: '▼', area: '3 / 2' },
]

/**
 * On-screen d-pad. Fires on pointerdown (no click delay); swiping anywhere on
 * the pad also steers because it sits inside the controls' swipe zone.
 */
export function PacmacDpad({ onPress, disabled = false, className }) {
  return (
    <div
      className={cn('grid w-max gap-1.5 mx-auto touch-none select-none', className)}
      style={{ gridTemplateColumns: 'repeat(3, 4.25rem)', gridTemplateRows: 'repeat(3, 2.75rem)' }}
    >
      {PAD.map(({ dir, label, area }) => (
        <button
          key={dir}
          type="button"
          aria-label={`Steer ${dir}`}
          disabled={disabled}
          onPointerDown={(e) => { e.preventDefault(); onPress(dir) }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPress(dir) } }}
          className="rounded-md border-2 border-retro-border bg-retro-surface text-retro-text font-pixel text-sm active:bg-retro-tint-cta active:border-retro-cta active:text-retro-cta disabled:opacity-40"
          style={{ gridArea: area }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
