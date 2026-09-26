import { forwardRef } from 'react'
import { BLOB_R, SHRINK_START, START_RADIUS } from '../lib/sumoLogic'
import { cn } from '@/lib/utils'

const pct = (n) => `${n * 100}%`

const fmtTime = (t) => {
  const s = Math.max(0, Math.floor(t))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Wrestler renders continuously (never unmounts on death) so the alive→dead
// transition can animate via CSS transition instead of swapping to a
// different element instantly. Dying shrinks, rotates and fades the sprite
// out in place; `flash` briefly brightens+bumps it on blob-blob collision.
function Wrestler({ blob, side, flash }) {
  const size = BLOB_R * 2
  const color = side === 'X' ? 'bg-retro-p1' : 'bg-retro-p2'
  const alive = !!blob?.alive
  const scale = alive ? (flash ? 1.15 : 1) : 0.3
  const rotate = alive ? 0 : 120
  return (
    <div
      className="absolute"
      style={{
        left: pct(blob.x), top: pct(blob.y),
        width: pct(size), height: pct(size),
        transition: 'transform 0.5s, opacity 0.5s, filter 0.15s',
        transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotate}deg)`,
        opacity: alive ? 1 : 0,
        filter: flash && alive ? 'brightness(1.6)' : 'none',
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
  { blobs, arenaR, t = 0, mySide, namesX = 'X', namesO = 'O', dim = false, overlay, flash = false },
  ref,
) {
  const diameter = arenaR * 2
  const X = blobs?.X
  const O = blobs?.O
  // Once the platform has started shrinking (or has already shrunk below its
  // starting size — covers the guest, which derives arenaR from the host's
  // snapshot rather than its own clock), upgrade the danger ring so the
  // shrink is actually noticeable.
  const shrinking = t > SHRINK_START || arenaR < START_RADIUS - 1e-6
  return (
    <div className="space-y-2 select-none">
      <div className="flex items-center justify-center gap-8 font-pixel">
        <span className={cn('text-[8px] tracking-widest', mySide === 'X' ? 'text-retro-p1 text-glow-p1' : 'text-retro-p1/80')}>
          {namesX?.toUpperCase()}{mySide === 'X' && namesX?.toUpperCase() !== 'YOU' ? ' (YOU)' : ''}
        </span>
        <span className="flex flex-col items-center">
          <span className="text-[8px] text-retro-dim tracking-widest">SUMO</span>
          <span className={cn('text-[8px] tracking-widest', shrinking ? 'text-retro-danger' : 'text-retro-dim')}>
            {fmtTime(t)}
          </span>
        </span>
        <span className={cn('text-[8px] tracking-widest', mySide === 'O' ? 'text-retro-p2 text-glow-p2' : 'text-retro-p2/80')}>
          {namesO?.toUpperCase()}{mySide === 'O' && namesO?.toUpperCase() !== 'YOU' ? ' (YOU)' : ''}
        </span>
      </div>

      {/* Arena — width is capped by both the container AND the viewport
          height (min() against a 100dvh-derived budget) so short/landscape
          phones still see the whole square arena instead of it overflowing. */}
      <div
        ref={ref}
        className={cn(
          'relative mx-auto rounded-lg border-2 border-retro-border bg-retro-deep overflow-hidden touch-none',
          dim && 'opacity-60',
        )}
        style={{ aspectRatio: '1 / 1', width: 'min(100%, calc(100dvh - 320px))' }}
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
        {/* Danger ring just inside the shrinking boundary — upgrades to a
            thicker, pulsing ring once the platform is actively shrinking. */}
        <div
          className={cn(
            'absolute rounded-full pointer-events-none',
            shrinking
              ? 'border-2 border-retro-danger animate-pulse'
              : 'border border-retro-p2/40',
          )}
          style={{
            left: pct(0.5 - arenaR + BLOB_R * 0.5),
            top: pct(0.5 - arenaR + BLOB_R * 0.5),
            width: pct(diameter - BLOB_R),
            height: pct(diameter - BLOB_R),
          }}
        />

        {X && <Wrestler blob={X} side="X" flash={flash} />}
        {O && <Wrestler blob={O} side="O" flash={flash} />}

        {overlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-retro-bg/70 backdrop-blur-[1px]">
            {overlay}
          </div>
        )}
      </div>
      <p className="text-center font-pixel text-[10px] text-retro-dim leading-relaxed">
        <span className="kbd-hint">SPACE / ENTER TO PUSH</span><span className="touch-hint">TAP PUSH BELOW</span>
      </p>
    </div>
  )
})

export default SumoArena