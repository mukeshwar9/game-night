import { forwardRef } from 'react'
import { BLOB_R } from '../lib/sumoLogic'
import { cn } from '@/lib/utils'

const pct = (n) => `${n * 100}%`

function Wrestler({ blob, side }) {
  const size = BLOB_R * 2
  const color = side === 'X' ? 'bg-retro-p1' : 'bg-retro-p2'
  const rim = side === 'X' ? 'border-retro-p1' : 'border-retro-p2'
  if (!blob?.alive) {
    return (
      <div
        className={cn('absolute rounded-md border opacity-30', rim)}
        style={{
          left: pct(blob.x - BLOB_R), top: pct(blob.y - BLOB_R),
          width: pct(size), height: pct(size),
        }}
      />
    )
  }
  return (
    <div
      className="absolute"
      style={{
        left: pct(blob.x), top: pct(blob.y),
        width: pct(size), height: pct(size),
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* Head */}
      <div className={cn('absolute rounded-sm', color, 'opacity-90')}
        style={{ left: '28%', top: '0%', width: '44%', height: '38%' }} />
      {/* Body — wide rounded rectangle */}
      <div className={cn('absolute rounded-lg', color)}
        style={{ left: '8%', top: '32%', width: '84%', height: '52%' }} />
      {/* Left arm — extended outward (wide stance) */}
      <div className={cn('absolute rounded-sm', color, 'opacity-80')}
        style={{ left: '0%', top: '38%', width: '16%', height: '22%' }} />
      {/* Right arm */}
      <div className={cn('absolute rounded-sm', color, 'opacity-80')}
        style={{ left: '84%', top: '38%', width: '16%', height: '22%' }} />
      {/* Left leg — squatting */}
      <div className={cn('absolute rounded-sm', color, 'opacity-70')}
        style={{ left: '22%', top: '80%', width: '24%', height: '20%' }} />
      {/* Right leg */}
      <div className={cn('absolute rounded-sm', color, 'opacity-70')}
        style={{ left: '54%', top: '80%', width: '24%', height: '20%' }} />
    </div>
  )
}

const SumoArena = forwardRef(function SumoArena(
  { blobs, arenaR, mySide, namesX = 'X', namesO = 'O', dim = false, overlay },
  ref,
) {
  const diameter = arenaR * 2
  const X = blobs?.X
  const O = blobs?.O
  return (
    <div className="space-y-2 select-none">
      <div className="flex items-center justify-center gap-8 font-pixel">
        <span className={cn('text-[8px] tracking-widest', mySide === 'X' ? 'text-retro-p1 text-glow-p1' : 'text-retro-p1/80')}>
          {namesX?.toUpperCase()}{mySide === 'X' ? ' (YOU)' : ''}
        </span>
        <span className="text-[8px] text-retro-dim tracking-widest">SUMO</span>
        <span className={cn('text-[8px] tracking-widest', mySide === 'O' ? 'text-retro-p2 text-glow-p2' : 'text-retro-p2/80')}>
          {namesO?.toUpperCase()}{mySide === 'O' ? ' (YOU)' : ''}
        </span>
      </div>

      <div
        ref={ref}
        className={cn(
          'relative w-full rounded-lg border-2 border-retro-border bg-retro-deep overflow-hidden touch-none',
          dim && 'opacity-60',
        )}
        style={{ aspectRatio: '1 / 1' }}
      >
        {/* Circular platform */}
        <div
          className="absolute rounded-full bg-retro-surface border border-retro-border/60"
          style={{
            left: pct(0.5 - arenaR),
            top: pct(0.5 - arenaR),
            width: pct(diameter),
            height: pct(diameter),
          }}
        />
        {/* Danger ring just inside the shrinking boundary */}
        <div
          className="absolute rounded-full border border-retro-p2/40 pointer-events-none"
          style={{
            left: pct(0.5 - arenaR + BLOB_R * 0.5),
            top: pct(0.5 - arenaR + BLOB_R * 0.5),
            width: pct(diameter - BLOB_R),
            height: pct(diameter - BLOB_R),
          }}
        />

        {X && <Wrestler blob={X} side="X" />}
        {O && <Wrestler blob={O} side="O" />}

        {overlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-retro-bg/70 backdrop-blur-[1px]">
            {overlay}
          </div>
        )}
      </div>
    </div>
  )
})

export default SumoArena