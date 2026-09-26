import { cn } from '@/lib/utils'
import { CLUE_POINTS, MAX_CLUES, MAX_ROUNDS, MAX_TEAM_SCORE, STAR_THRESHOLDS, starRating } from '../lib/passwordLogic'

function playerName(players, symbol, mySymbol) {
  if (symbol && symbol === mySymbol) return 'YOU'
  return (players?.[symbol]?.name || symbol || '?').toUpperCase()
}

/** ★★☆ for a team total, with the count spelled out for screen readers. */
export function StarRow({ teamScore, className }) {
  const stars = starRating(teamScore)
  return (
    <span className={cn('tracking-[0.2em]', className)} role="img" aria-label={`${stars} of ${STAR_THRESHOLDS.length} stars`}>
      {STAR_THRESHOLDS.map((threshold, index) => (
        <span key={threshold} className={index < stars ? 'text-retro-win text-glow-win' : 'text-retro-dim/50'}>
          {index < stars ? '★' : '☆'}
        </span>
      ))}
    </span>
  )
}

// Co-op header: one team total (both seats share every point), the stars it
// has earned so far, the next star's threshold, and the round counter.
function TeamRail({ teamScore = 0, roundNum = 1 }) {
  const nextStar = STAR_THRESHOLDS.find(threshold => teamScore < threshold)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded border border-retro-border bg-retro-card px-3 py-2">
      <div className="min-w-0">
        <p className="font-pixel text-[8px] tracking-widest text-retro-dim">TEAM SCORE</p>
        <p className="mt-1 font-pixel leading-none">
          <span className="text-2xl text-retro-cta text-glow-cta tabular-nums">{teamScore}</span>
          <span className="text-[10px] text-retro-dim"> / {MAX_TEAM_SCORE}</span>
        </p>
      </div>
      <div className="text-right">
        <p className="font-pixel text-[10px]"><StarRow teamScore={teamScore} /></p>
        <p className="mt-1 font-pixel text-[8px] text-retro-dim">
          {nextStar ? `NEXT ★ AT ${nextStar}` : 'ALL STARS!'}
        </p>
        <p className="mt-1 font-pixel text-[8px] text-retro-dim">ROUND {roundNum}/{MAX_ROUNDS}</p>
      </div>
    </div>
  )
}

export default function PasswordCard({
  phase, word, wordPattern, canSeeSecret, clues = [], guesses = [], roundNum = 1,
  teamScore = 0, players, mySymbol, clueGiver, guesser,
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
    <div className="space-y-3">
      <TeamRail teamScore={teamScore} roundNum={roundNum} />
      <div className="flex items-center justify-between gap-2">
        <span className={cn(
          'font-pixel text-[9px] tracking-wider px-2 py-1 rounded border',
          mySymbol === clueGiver ? 'text-retro-cta border-retro-cta/50 bg-retro-tint-cta' : 'text-retro-p1 border-retro-p1/40 bg-retro-tint-p1',
        )}>{role}</span>
        <span className="font-pixel text-[8px] text-retro-dim truncate">
          {playerName(players, clueGiver, mySymbol)} → {playerName(players, guesser, mySymbol)}
        </span>
      </div>

      <div key={`${roundNum}-${phase}`} className={cn(
        'modal-pop scanline relative overflow-hidden rounded-lg border-2 px-4 py-6 text-center',
        reveal ? 'border-retro-win bg-retro-tint-p1 shadow-neon-win' :
          canSeeSecret ? 'border-retro-cta bg-retro-tint-cta shadow-neon-cta' : 'border-retro-p1/60 bg-retro-card',
      )}>
        <p className="font-pixel text-[9px] tracking-[0.25em] text-retro-dim">{status}</p>
        <p className={cn(
          'mt-4 font-pixel text-2xl sm:text-3xl tracking-widest uppercase break-words',
          // Hidden blanks stay on one row: a 7+ letter word wrapped 6+1 at 390px.
          !showWord && 'whitespace-nowrap tracking-normal',
          !showWord && Number(wordPattern) > 6 && 'text-xl sm:text-2xl',
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
                {clue?.timeout ? 'NO CLUE · TIME' : clue?.text || '· · ·'}
                {(guess?.text || (guess?.timeout && !guess?.noClue)) && (
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
      <p className="font-mono text-[9px] text-retro-dim text-center">CO-OP · EARLY GUESSES SCORE MORE FOR THE TEAM · {CLUE_POINTS.join(' ')}</p>
    </div>
  )
}

/**
 * Co-op match result: team total out of MAX_TEAM_SCORE, the star rating, the
 * best round and a round-by-round recap. `history` entries carry `word`
 * (resolved from the deck by the page).
 */
export function PasswordMatchResult({ teamScore = 0, history = [], best, players, mySymbol, endedEarly = false }) {
  const stars = starRating(teamScore)
  const verdict = ['KEEP PRACTICING', 'NICE TEAMWORK', 'GREAT TEAMWORK', 'PERFECT PARTNERS'][stars]
  return (
    <div className="space-y-4">
      <div className="rounded-lg border-2 border-retro-cta bg-retro-tint-cta px-4 py-5 text-center shadow-neon-cta">
        <p className="font-pixel text-[9px] tracking-widest text-retro-dim">TEAM SCORE</p>
        <p className="mt-2 font-pixel leading-none">
          <span className="text-4xl text-retro-cta text-glow-cta tabular-nums">{teamScore}</span>
          <span className="text-sm text-retro-dim"> / {MAX_TEAM_SCORE}</span>
        </p>
        <p className="mt-3 font-pixel text-xl"><StarRow teamScore={teamScore} /></p>
        <p className="mt-2 font-pixel text-[10px] text-retro-win">{verdict}</p>
        <p className="mt-2 font-mono text-[9px] text-retro-dim">
          {STAR_THRESHOLDS.map((threshold, index) => `${'★'.repeat(index + 1)} ${threshold}`).join(' · ')}
        </p>
        {endedEarly && (
          <p className="mt-2 font-mono text-[9px] text-retro-dim">ENDED EARLY · {history.length} OF {MAX_ROUNDS} ROUNDS PLAYED</p>
        )}
      </div>

      {best && (
        <p className="text-center font-pixel text-[9px] text-retro-win">
          BEST ROUND: {String(best.word || '').toUpperCase()} · +{best.points} ON CLUE {best.clueNumber}
          {' '}({playerName(players, best.clueGiver, mySymbol)} → {playerName(players, best.guesser, mySymbol)})
        </p>
      )}

      {history.length > 0 && (
        <ol className="space-y-1" aria-label="Round by round">
          {history.map(entry => {
            const isBest = best && entry.roundNum === best.roundNum
            return (
              <li key={entry.roundNum} className={cn(
                'grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 rounded border px-2.5 py-1.5',
                isBest ? 'border-retro-win bg-retro-tint-p1' : 'border-retro-border bg-retro-surface',
              )}>
                <span className="font-pixel text-[9px] text-retro-dim">R{entry.roundNum}</span>
                <span className="min-w-0">
                  <span className="block truncate font-pixel text-[10px] uppercase text-retro-text">{entry.word || '—'}</span>
                  <span className="block truncate font-mono text-[9px] text-retro-dim">
                    {playerName(players, entry.clueGiver, mySymbol)} → {playerName(players, entry.guesser, mySymbol)}
                  </span>
                </span>
                <span className={cn('font-pixel text-[9px] whitespace-nowrap text-right', entry.points ? 'text-retro-win' : 'text-retro-dim')}>
                  {entry.points ? `+${entry.points} · CLUE ${entry.clueNumber}` : 'MISSED'}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
