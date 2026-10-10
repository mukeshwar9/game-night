import { useEffect, useRef } from 'react'
import { drawThumb, readPalette } from './bonkDraw'
import { arenaById } from '../lib/bonkArenas'
import { TARGET } from '../lib/bonkLogic'
import { cn } from '@/lib/utils'

// The words and numbers around the BONK BUGGIES arena: the two score cards,
// the tide chip, the banner stamped over the arena and the loser's two arena
// cards. All of it is driven by the HUD facts from lib/bonkFx.js (hudOf).
//
// A seat is its colour AND a shape (triangle pennant / round pennant) and a
// pip row, so the two cards never rely on colour alone.

const SEAT = [
  { ink: 'text-retro-p1', border: 'border-retro-p1', tint: 'bg-retro-tint-p1', fill: 'bg-retro-p1', shape: '▲' },
  { ink: 'text-retro-p2', border: 'border-retro-p2', tint: 'bg-retro-tint-p2', fill: 'bg-retro-p2', shape: '●' },
]

export function BonkScoreCard({ seat, name, score, lid, testId }) {
  const s = SEAT[seat]
  return (
    <div
      data-testid={testId}
      aria-label={`${name}: ${score} of ${TARGET} points${lid ? ', spare lid ready' : ''}`}
      className={cn('flex-1 min-w-0 rounded-md border-2 px-2 py-1.5 font-pixel', s.border, s.tint)}
    >
      <div className="flex items-center justify-between gap-1">
        <span className={cn('text-[8px] truncate', s.ink)}><span aria-hidden="true">{s.shape} </span>{name}</span>
        <span className={cn('text-base leading-none tabular-nums', s.ink)} aria-hidden="true">{score}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-1">
        <span className="flex gap-1" aria-hidden="true">
          {Array.from({ length: TARGET }, (_, i) => (
            <i
              key={i}
              className={cn(
                'w-2 h-2 rounded-full border border-current',
                s.ink,
                i < score ? `${s.fill} ${i === score - 1 ? 'bonk-pip' : ''}` : 'opacity-40',
              )}
            />
          ))}
        </span>
        {lid && <span className="text-[7px] text-retro-cta tracking-wide">SPARE LID</span>}
      </div>
    </div>
  )
}

export function BonkTideChip({ tide }) {
  return (
    <span
      className={cn(
        'inline-block px-2 py-0.5 rounded border font-pixel text-[8px] tabular-nums',
        tide.hot ? 'border-retro-danger text-retro-danger bg-retro-tint-danger'
          : tide.warn ? 'border-retro-cta text-retro-cta' : 'border-retro-border text-retro-dim',
      )}
    >
      {tide.text}
    </span>
  )
}

export function BonkBanner({ banner }) {
  if (!banner) return null
  const tone = banner.kind === 'ko' ? 'text-retro-cta text-glow-cta' : banner.kind === 'go' ? 'text-retro-win text-glow-win' : 'text-retro-text'
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-live="polite">
      <div key={`${banner.kind}-${banner.big}`} className="bonk-stamp text-center">
        <p className={cn('font-pixel text-3xl leading-none drop-shadow', tone)}>{banner.big}</p>
        {banner.small && <p className="mt-2 font-pixel text-[9px] text-retro-text bg-retro-bg/70 rounded px-2 py-0.5 inline-block">{banner.small}</p>}
      </div>
    </div>
  )
}

function ArenaThumb({ id }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) drawThumb(ref.current, id, readPalette())
  }, [id])
  return <canvas ref={ref} width={160} height={72} className="w-full h-auto rounded border border-retro-border block" aria-hidden="true" />
}

/** The loser's two cards. `mine` = this screen's player is choosing. */
export function BonkPickSheet({ pick, name, mine, onPick }) {
  if (!pick) return null
  return (
    <div className="absolute inset-0 bg-retro-bg/75 flex flex-col items-center justify-center gap-2 p-3" data-testid="bonk-pick">
      <p className="font-pixel text-[9px] text-retro-text text-center">
        {mine ? 'YOU LOST THAT ONE: PICK THE NEXT ARENA' : `${name} PICKS THE NEXT ARENA`}
      </p>
      <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
        {pick.options.map((id) => {
          const a = arenaById(id)
          return (
            <button
              key={id}
              type="button"
              disabled={!mine}
              onClick={() => onPick?.(id)}
              data-testid={`bonk-pick-${id}`}
              className="press-card text-left rounded-md border-2 border-retro-border bg-retro-card p-1.5 space-y-1 enabled:hover:border-retro-cta disabled:opacity-80"
            >
              <ArenaThumb id={id} />
              <span className="block font-pixel text-[8px] text-retro-cta">{a.name}</span>
              <span className="block font-mono text-[9px] leading-snug text-retro-dim">{a.blurb}</span>
            </button>
          )
        })}
      </div>
      <p className="font-pixel text-[8px] text-retro-dim tabular-nums" aria-hidden="true">{pick.secs}</p>
    </div>
  )
}
