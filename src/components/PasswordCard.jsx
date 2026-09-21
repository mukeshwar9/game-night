import { cn } from '@/lib/utils'
import { CLUE_POINTS, MAX_CLUES, MAX_ROUNDS, TARGET_SCORE } from '../lib/passwordLogic'

function ScoreRail({ scores, players, mySymbol }) {
  const score = { X: scores?.X || 0, O: scores?.O || 0 }
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded border border-retro-border bg-retro-card px-3 py-2">
      {['X'].map((symbol) => (
        <div key={symbol} className="min-w-0">
          <p className={cn('font-pixel text-[8px] tracking-wider truncate', symbol === mySymbol ? 'text-retro-cta' : 'text-retro-dim')}>
            {symbol === mySymbol ? 'YOU' : (players?.[symbol]?.name || symbol).toUpperCase()}
          </p>
          <p className={cn('font-pixel text-lg leading-none mt-1', symbol === 'X' ? 'text-retro-p1' : 'text-retro-p2')}>
            {score[symbol]}
          </p>
        </div>
      ))}
      <div className="text-center text-retro-dim">
        <p className="font-pixel text-[8px]">TO</p>
        <p className="font-pixel text-[10px] text-retro-cta">{TARGET_SCORE}</p>
      </div>
      {['O'].map((symbol) => (
        <div key={symbol} className="min-w-0 text-right">
          <p className={cn('font-pixel text-[8px] tracking-wider truncate', symbol === mySymbol ? 'text-retro-cta' : 'text-retro-dim')}>
            {symbol === mySymbol ? 'YOU' : (players?.[symbol]?.name || symbol).toUpperCase()}
          </p>
          <p className="font-pixel text-lg leading-none mt-1 text-retro-p2">{score[symbol]}</p>
        </div>
      ))}
    </div>
  )
}

export default function PasswordCard({
  phase, word, wordPattern, canSeeSecret, clues = [], guesses = [], roundNum = 1,
  scores, players, mySymbol, clueGiver, guesser,
}) {
  const reveal = phase === 'reveal' || phase === 'finished'
  const showWord = reveal || canSeeSecret
  const role = mySymbol === clueGiver ? 'YOU GIVE CLUES' : mySymbol === guesser ? 'YOU GUESS' : 'SPECTATOR'
  const status = phase === 'intro'
    ? 'GET READY…'
    : phase === 'clue'
      ? mySymbol === clueGiver ? 'YOUR CLUE' : 'WAITING FOR CLUE…'
      : phase === 'guess'
        ? mySymbol === guesser ? 'YOUR GUESS' : 'WAITING FOR GUESS…'
        : reveal ? 'ROUND REVEAL' : 'MATCH OVER'

  return (
    <div className="space-y-3" aria-live="polite">
      <ScoreRail scores={scores} players={players} mySymbol={mySymbol} />
      <div className="flex items-center justify-between gap-2">
        <span className={cn(
          'font-pixel text-[9px] tracking-wider px-2 py-1 rounded border',
          mySymbol === clueGiver ? 'text-retro-cta border-retro-cta/50 bg-retro-tint-cta' : 'text-retro-p1 border-retro-p1/40 bg-retro-tint-p1',
        )}>{role}</span>
        <span className="font-pixel text-[9px] text-retro-dim">ROUND {roundNum}/{MAX_ROUNDS}</span>
      </div>

      <div key={`${roundNum}-${phase}`} className={cn(
        'modal-pop scanline relative overflow-hidden rounded-lg border-2 px-4 py-6 text-center',
        reveal ? 'border-retro-win bg-retro-tint-p1 shadow-neon-win' :
          canSeeSecret ? 'border-retro-cta bg-retro-tint-cta shadow-neon-cta' : 'border-retro-p1/60 bg-retro-card',
      )}>
        <p className="font-pixel text-[9px] tracking-[0.25em] text-retro-dim">{status}</p>
        <p className={cn(
          'mt-4 font-pixel text-2xl sm:text-3xl tracking-widest uppercase break-words',
          reveal ? 'text-retro-win text-glow-win' : canSeeSecret ? 'text-retro-cta text-glow-cta' : 'text-retro-p1 text-glow-p1',
        )}>
          {showWord ? (word || '—') : (wordPattern ? `_${' _'.repeat(Math.max(0, Number(wordPattern) - 1))}` : '＿ ＿ ＿')}
        </p>
        <p className="mt-3 font-mono text-[10px] text-retro-dim">
          {showWord ? `${word?.length || wordPattern || 0} LETTERS` : `${wordPattern || '?'} LETTERS · LOCKED`}
        </p>
      </div>

      <div className="space-y-1.5" aria-label="Clue history">
        {Array.from({ length: MAX_CLUES }, (_, index) => {
          const clue = clues[index]
          const guess = guesses[index]
          const correct = guess?.correct
          return (
            <div key={index} className={cn(
              'grid grid-cols-[2rem_1fr_auto] items-center gap-2 min-h-10 rounded border px-2.5',
              correct ? 'border-retro-win bg-retro-tint-p1 text-retro-win' :
                guess ? 'border-retro-danger/50 bg-retro-tint-danger text-retro-dim' :
                  clue ? 'border-retro-border bg-retro-surface text-retro-text' : 'border-retro-border/50 text-retro-dim/50',
            )}>
              <span className="font-pixel text-[9px]">{index + 1}</span>
              <span className="min-w-0 truncate font-mono text-xs">
                {clue?.text || '· · ·'}
                {(guess?.text || guess?.timeout) && (
                  <span className="ml-2 text-[10px] text-retro-dim">{guess.text || 'TIME OUT'}</span>
                )}
              </span>
              <span className="font-pixel text-[8px] text-right whitespace-nowrap">
                {correct ? '✓' : guess ? 'MISS' : clue ? 'GUESS…' : 'OPEN'}
              </span>
            </div>
          )
        })}
      </div>
      <p className="font-mono text-[9px] text-retro-dim text-center">EARLY GUESSES SCORE MORE · {CLUE_POINTS.join(' ')}</p>
    </div>
  )
}
