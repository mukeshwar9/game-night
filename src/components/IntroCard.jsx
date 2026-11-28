import { useState } from 'react'
import { cn } from '@/lib/utils'
import { getGameConfig } from '../lib/games'
import { introPitch, introMeta } from '../lib/introCardLogic'
import { GameArt } from './GameArt'
import Avatar from './Avatar'
import LazyRulesModal from './LazyRulesModal'

const TONE = {
  p1: { box: 'border-retro-p1/50 bg-retro-tint-p1', text: 'text-retro-p1' },
  p2: { box: 'border-retro-p2/50 bg-retro-tint-p2', text: 'text-retro-p2' },
  dim: { box: 'border-retro-border bg-retro-card', text: 'text-retro-dim' },
}

// The one start card every game can use: a picture, a one-line pitch, who is
// playing, optional mode chips, extra controls (`children`: a difficulty
// slider, a bot count), then one big PLAY pinned to the bottom and the rules
// behind a single "?" (the lazy rules sheet, so rules.js stays out of the
// first load). Presentational: the page owns what PLAY does.
//
//   gameType   registry type; supplies title, picture, pitch and meta
//   seats      [{ key, name, avatar?, tone?: 'p1'|'p2'|'dim', you? }] (introSeats())
//   modes      [{ id, label }] chips, with `mode` (active id) and `onMode(id)`
//   children   extra controls, rendered between the chips and PLAY
//   onPlay     PLAY handler; `playLabel` renames it (default PLAY)
//   pitch/meta override the registry-derived text; `players` feeds the meta
export default function IntroCard({
  gameType, title, pitch, meta, players, seats = [], modes, mode, onMode,
  children, onPlay, playLabel = 'PLAY', playDisabled = false, busy = false,
}) {
  const cfg = getGameConfig(gameType)
  const [rulesOpen, setRulesOpen] = useState(false)
  const Icon = cfg?.Icon
  const name = title ?? cfg?.label ?? ''
  const pitchText = pitch ?? introPitch(cfg)
  const metaText = meta ?? introMeta(cfg, { players })

  return (
    <section aria-label={`${name} intro`} className="flex flex-col gap-4 text-left" data-testid="intro-card">
      <div className="relative h-32 rounded-xl border-2 border-retro-cta/40 bg-retro-tint-cta text-retro-cta overflow-hidden flex items-center justify-center">
        {Icon && <span className="w-16 h-16 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"><Icon /></span>}
        <GameArt type={cfg?.variantOf || cfg?.type} className="absolute inset-0 w-full h-full block object-contain" />
        <button
          type="button"
          onClick={() => setRulesOpen(true)}
          aria-label="How to play"
          title="How to play"
          className="absolute top-1 right-1 min-w-11 min-h-11 flex items-center justify-center rounded-full bg-retro-bg/70 text-retro-text hover:text-retro-cta transition-colors press"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>
      </div>

      <div className="space-y-1.5">
        <h2 className="font-pixel text-sm text-retro-cta text-glow-cta tracking-wider">{name}</h2>
        {pitchText && <p className="font-mono text-sm text-retro-text leading-snug">{pitchText}</p>}
        {metaText && <p className="font-mono text-[11px] text-retro-dim">{metaText}</p>}
      </div>

      {seats.length > 0 && (
        <div className="space-y-2">
          <p className="font-pixel text-[8px] text-retro-dim tracking-[0.2em]">WHO&apos;S PLAYING</p>
          <ul className="flex flex-wrap gap-2">
            {seats.map(seat => {
              const tone = TONE[seat.tone] ?? TONE.dim
              return (
                <li key={seat.key} className={cn('flex items-center gap-2 border rounded-full pl-1 pr-3 py-1 min-w-0', tone.box)}>
                  {seat.avatar
                    ? <Avatar id={seat.avatar} size={24} />
                    : <span aria-hidden="true" className="w-6 h-6 rounded bg-retro-p2" />}
                  <span className={cn('font-pixel text-[9px] truncate', tone.text)}>{seat.you ? 'YOU' : seat.name}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {modes?.length > 0 && (
        <div role="group" aria-label="Mode" className="flex flex-wrap gap-2">
          {modes.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => onMode?.(m.id)}
              aria-pressed={mode === m.id}
              className={cn(
                'min-h-11 px-4 font-pixel text-[9px] rounded border-2 transition press',
                mode === m.id
                  ? 'border-retro-cta text-retro-cta bg-retro-tint-cta'
                  : 'border-retro-border text-retro-dim hover:border-retro-cta/50',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {children}

      {/* Pinned: stays in reach on a long card (a tall bot roster, a small
          phone) and clears the home indicator. */}
      <div className="sticky bottom-0 z-10 -mx-1 px-1 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-retro-bg from-70% to-transparent">
        <button
          type="button"
          onClick={onPlay}
          disabled={playDisabled || busy}
          className="w-full min-h-14 bg-retro-cta text-retro-bg font-pixel text-sm rounded hover:shadow-neon-cta transition press disabled:opacity-60"
        >
          {busy ? 'STARTING…' : playLabel}
        </button>
      </div>

      {rulesOpen && <LazyRulesModal gameType={gameType} onClose={() => setRulesOpen(false)} />}
    </section>
  )
}
