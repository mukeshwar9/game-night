import { forwardRef, useMemo } from 'react'
import { MAZE_W, MAZE_H, CELL_COUNT, wallAt, START_PELLETS } from '../lib/pacmacLogic'
import { cn } from '@/lib/utils'

function solid(x, y) {
  if (x < 0 || y < 0 || x >= MAZE_W || y >= MAZE_H) return true
  return wallAt(x + y * MAZE_W) === 1
}

function wallClass(i) {
  const x = i % MAZE_W
  const y = Math.floor(i / MAZE_W)
  const up = solid(x, y - 1)
  const down = solid(x, y + 1)
  const left = solid(x - 1, y)
  const right = solid(x + 1, y)
  return cn(
    'w-full h-full bg-retro-structure',
    !up && !left && 'rounded-tl-[45%]',
    !up && !right && 'rounded-tr-[45%]',
    !down && !left && 'rounded-bl-[45%]',
    !down && !right && 'rounded-br-[45%]',
  )
}
const GHOST_TONE = ['bg-retro-cta', 'bg-retro-win', 'bg-retro-danger', 'bg-retro-structure']
const DIR_DEG = { right: 0, down: 90, left: 180, up: 270 }

function actorStyle(p, scale = 0.86, rotate = true) {
  const w = 100 / MAZE_W
  const h = 100 / MAZE_H
  const s = {
    width: `${w * scale}%`,
    height: `${h * scale}%`,
    left: `${((p.x - 0.5 * scale) / MAZE_W) * 100}%`,
    top: `${((p.y - 0.5 * scale) / MAZE_H) * 100}%`,
  }
  if (rotate) s.transform = `rotate(${DIR_DEG[p.dir] ?? 0}deg)`
  return s
}

const PacmacArena = forwardRef(function PacmacArena(
  {
    pellets, players, ghosts, scoreX = 0, scoreO = 0, timeLeft = 0,
    mySide, namesX = 'X', namesO = 'O', overlay, dim = false,
  },
  ref,
) {
  const cells = useMemo(() => (
    Array.from({ length: CELL_COUNT }, (_, i) => {
      const w = wallAt(i)
      if (w === 1) {
        return <div key={i} className={cn(wallClass(i), 'shadow-[inset_0_0_6px_rgb(var(--c-p1)/0.12)]')} />
      }
      if (w === 2) {
        return <div key={i} className="w-full h-full bg-retro-card border-t-2 border-retro-cta/70 flex items-center justify-center"><span className="w-3/5 h-[2px] bg-retro-cta/60 rounded-full" /></div>
      }
      return <div key={i} className="w-full h-full bg-retro-deep" />
    })
  ), [])

  const dots = useMemo(() => {
    if (!pellets) return null
    const out = []
    for (let i = 0; i < CELL_COUNT; i++) {
      const v = pellets[i]
      if (!v) continue
      const x = i % MAZE_W
      const y = Math.floor(i / MAZE_W)
      const power = v === 2
      out.push(
        <div
          key={i}
          className="absolute pointer-events-none flex items-center justify-center"
          style={{
            width: `${100 / MAZE_W}%`,
            height: `${100 / MAZE_H}%`,
            left: `${(x / MAZE_W) * 100}%`,
            top: `${(y / MAZE_H) * 100}%`,
          }}
        >
          <span
            className={cn(
              'rounded-full',
              power
                ? 'w-[38%] h-[38%] bg-retro-cta shadow-glow-dot pacmac-power-pulse'
                : 'w-[18%] h-[18%] bg-retro-text',
            )}
          />
        </div>,
      )
    }
    return out
  }, [pellets])

  const left = pellets ? pellets.reduce((n, v) => n + (v ? 1 : 0), 0) : START_PELLETS
  const secs = Math.max(0, Math.ceil(timeLeft ?? 0))
  const flashClock = secs <= 10 && secs > 0
  const pelletPct = START_PELLETS ? ((START_PELLETS - left) / START_PELLETS) * 100 : 0
  const isDead = (side) => (players?.[side]?.dead ?? 0) > 0

  return (
    <div className="space-y-2 select-none">
      <div className="flex items-center justify-center gap-6 font-pixel">
        <div className="flex items-center gap-2">
          <span className={cn('text-2xl tabular-nums', mySide === 'X' ? 'text-retro-p1 text-glow-p1' : 'text-retro-p1/80', isDead('X') && 'opacity-40')}>
            {scoreX}
          </span>
          <span className={cn('w-2 h-2 rounded-full border', isDead('X') ? 'bg-retro-border border-retro-border opacity-40' : 'bg-retro-p1 border-retro-p1 shadow-glow-dot')} aria-hidden="true" />
        </div>
        <div className="text-center min-w-[64px]">
          <p className={cn('text-xl tabular-nums', flashClock ? 'text-retro-p2 animate-pulse' : 'text-retro-text')}>
            {secs}
          </p>
          <p className="text-[7px] text-retro-dim tracking-widest">{left} LEFT</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full border', isDead('O') ? 'bg-retro-border border-retro-border opacity-40' : 'bg-retro-p2 border-retro-p2 shadow-glow-dot')} aria-hidden="true" />
          <span className={cn('text-2xl tabular-nums', mySide === 'O' ? 'text-retro-p2 text-glow-p2' : 'text-retro-p2/80', isDead('O') && 'opacity-40')}>
            {scoreO}
          </span>
        </div>
      </div>
      <div className="h-1.5 w-full rounded-full bg-retro-card border border-retro-border overflow-hidden">
        <div
          className="h-full bg-retro-cta transition-all duration-300 ease-out"
          style={{ width: `${pelletPct}%` }}
          aria-hidden="true"
        />
      </div>

      <div
        ref={ref}
        className={cn(
          'relative mx-auto rounded-lg border-2 overflow-hidden touch-none transition-shadow duration-200',
          dim ? 'border-retro-border bg-retro-deep opacity-60' : 'border-retro-structure bg-retro-deep shadow-[0_0_18px_rgb(var(--c-p1)/0.18),0_0_36px_rgb(var(--c-p1)/0.08)]',
          flashClock && !dim && 'border-retro-p2/60 shadow-[0_0_20px_rgb(var(--c-p2)/0.25)]',
        )}
        style={{
          aspectRatio: `${MAZE_W} / ${MAZE_H}`,
          cursor: dim ? undefined : 'none',
          width: 'min(100%, calc(100dvh - 260px))',
        }}
      >
        <div
          className="grid w-full h-full"
          style={{ gridTemplateColumns: `repeat(${MAZE_W}, 1fr)`, gridTemplateRows: `repeat(${MAZE_H}, 1fr)` }}
        >
          {cells}
        </div>

        {dots}

        {ghosts?.map((g, i) => {
          const fright = g.mode === 'frightened'
          const eaten = g.mode === 'eaten'
          return (
          <div
            key={i}
            style={actorStyle(g, eaten ? 0.68 : 0.82, false)}
            className={cn(
              'absolute pointer-events-none transition-all duration-100',
              eaten && 'opacity-50',
            )}
          >
            <div
              className={cn(
                'w-full h-full pacmac-ghost',
                fright ? 'bg-retro-win pacmac-fright' : eaten ? 'bg-retro-text border border-retro-p1/40' : GHOST_TONE[i] || 'bg-retro-cta',
                !fright && !eaten && i === 0 && 'shadow-neon-cta',
                !fright && !eaten && i === 1 && 'shadow-neon-win',
              )}
            />
            {!eaten && (
              <>
                <div className={cn('absolute top-[22%] left-[18%] w-[22%] h-[22%] rounded-full', fright ? 'bg-retro-text/90' : 'bg-retro-text')} />
                <div className={cn('absolute top-[22%] right-[18%] w-[22%] h-[22%] rounded-full', fright ? 'bg-retro-text/90' : 'bg-retro-text')} />
                <div className={cn('absolute top-[30%] left-[24%] w-[10%] h-[10%] rounded-full', fright ? 'bg-retro-bg' : 'bg-retro-p1')} />
                <div className={cn('absolute top-[30%] right-[24%] w-[10%] h-[10%] rounded-full', fright ? 'bg-retro-bg' : 'bg-retro-p1')} />
              </>
            )}
            {eaten && (
              <>
                <div className="absolute top-[26%] left-[18%] w-[22%] h-[22%] rounded-full bg-retro-p1 border border-retro-card" />
                <div className="absolute top-[26%] right-[18%] w-[22%] h-[22%] rounded-full bg-retro-p1 border border-retro-card" />
                <div className="absolute top-[33%] left-[24%] w-[8%] h-[8%] rounded-full bg-retro-text" />
                <div className="absolute top-[33%] right-[24%] w-[8%] h-[8%] rounded-full bg-retro-text" />
              </>
            )}
          </div>
          )
        })}

        {['X', 'O'].map(side => {
          const p = players?.[side]
          if (!p) return null
          const p1 = side === 'X'
          const dead = (p.dead ?? 0) > 0
          return (
            <div
              key={side}
              style={actorStyle(p, 0.88)}
              className={cn(
                'absolute pointer-events-none overflow-visible transition-opacity duration-150',
                dead && 'pacmac-muncher-dead opacity-35 grayscale animate-pulse',
              )}
            >
              <svg
                viewBox="0 0 32 32"
                className="block w-full h-full overflow-visible"
                aria-hidden="true"
                style={{
                  filter: p1
                    ? 'drop-shadow(0 0 4px rgb(var(--c-p1) / 0.7))'
                    : 'drop-shadow(0 0 4px rgb(var(--c-p2) / 0.7))',
                }}
              >
                {/* Simple OG Pac — yellow pie + black eye. Two paths cross-fade for chomp */}
                <path
                  className="pacmac-muncher-open"
                  fill="#FFCC00"
                  stroke="#000"
                  strokeWidth="0.9"
                  d="M16 16 L28.2 5.2 A13.2 13.2 0 1 1 28.2 26.8 Z"
                />
                <path
                  className="pacmac-muncher-shut"
                  fill="#FFCC00"
                  stroke="#000"
                  strokeWidth="0.9"
                  d="M16 16 L29.2 13.2 A13.2 13.2 0 1 1 29.2 18.8 Z"
                />
                <circle cx="18.8" cy="9.2" r="2" fill="black" />
              </svg>
            </div>
          )
        })}

        {overlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-retro-bg/70 backdrop-blur-[1px] z-10">
            {overlay}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-1 font-pixel text-[9px] tracking-widest">
        <span className={cn('truncate', isDead('X') ? 'text-retro-dim' : 'text-retro-p1')}>{namesX?.toUpperCase()}{mySide === 'X' ? ' (YOU)' : ''}{isDead('X') ? ' · OUT' : ''}</span>
        <span className="hidden sm:inline text-retro-dim">↑ ↓ ← → · WASD · SWIPE</span>
        <span className="sm:hidden text-retro-dim">SWIPE</span>
        <span className={cn('truncate text-right', isDead('O') ? 'text-retro-dim' : 'text-retro-p2')}>{namesO?.toUpperCase()}{mySide === 'O' ? ' (YOU)' : ''}{isDead('O') ? ' · OUT' : ''}</span>
      </div>
    </div>
  )
})

export default PacmacArena
