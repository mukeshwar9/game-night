import { cn } from '@/lib/utils'
import MarkTile from './MarkTile'

const MARK_COPY = {
  G: 'correct',
  Y: 'misplaced',
  B: 'absent',
}

function rowLabel(guesses, row, ghost, reveal) {
  const guess = guesses[row]
  if (!guess) return `${ghost ? 'opponent' : 'your'} row ${row + 1}: empty`
  if (!ghost || reveal) {
    const marks = guess.marks || ''
    const summary = marks.split('').map(mark => MARK_COPY[mark] || 'pending').join(', ')
    return `${ghost ? 'opponent' : 'your'} row ${row + 1}: ${guess.word || 'pending'}; ${summary}`
  }
  const summary = (guess.marks || '').split('').map(mark => MARK_COPY[mark] || 'pending').join(', ')
  return `opponent row ${row + 1}: ${summary || 'submitted'}`
}

export function WordRaceBoard({ guesses = [], currentGuess = '', ghost = false, reveal = false, compact = false, label, solved = false }) {
  const rows = []
  for (let row = 0; row < 6; row++) {
    const guess = guesses[row]
    const isPreview = !ghost && !guess && row === guesses.length && currentGuess
    const word = guess?.word || (isPreview ? currentGuess : '')
    const marks = guess?.marks || ''
    rows.push(
      <div
        key={row}
        className={cn('flex', compact ? 'gap-0.5' : 'gap-1')}
        aria-label={rowLabel(guesses, row, ghost, reveal)}
      >
        {Array.from({ length: 5 }, (_, col) => {
          const mark = marks[col] || null
          const letter = ghost && !reveal ? '' : word[col] || ''
          return (
            <MarkTile
              key={`${row}-${col}-${word}-${marks}`}
              size={compact ? 'sm' : 'lg'}
              letter={letter}
              mark={mark}
              pending={!!isPreview}
              className={cn(ghost && !mark && 'bg-retro-deep', guess?.marks && 'word-race-flip')}
            />
          )
        })}
      </div>,
    )
  }

  return (
    <section className={cn('space-y-2', compact && 'space-y-1')} aria-label={label}>
      <div className="flex items-center justify-between gap-2">
        <p className={cn('font-pixel tracking-widest', compact ? 'text-[8px]' : 'text-[9px]', ghost ? 'text-retro-p2' : 'text-retro-p1')}>
          {label}
        </p>
        {solved && <span className="font-pixel text-[8px] text-retro-win">SOLVED</span>}
      </div>
      <div className={cn('flex flex-col', compact ? 'gap-0.5' : 'gap-1')}>
        {rows}
      </div>
    </section>
  )
}

export function WordRaceMeter({ myGuesses = [], opponentGuesses = [], mySymbol = 'X' }) {
  const progress = (guesses) => Math.min(100, ((guesses.length + (guesses.at(-1)?.marks?.split('G').length - 1 || 0) * 0.15) / 6) * 100)
  const myColor = mySymbol === 'X' ? 'bg-retro-p1' : 'bg-retro-p2'
  const opponentColor = mySymbol === 'X' ? 'bg-retro-p2' : 'bg-retro-p1'
  return (
    <div className="space-y-1.5" aria-label="Race progress">
      <div className="flex items-center justify-between font-pixel text-[8px] tracking-widest text-retro-dim">
        <span className={mySymbol === 'X' ? 'text-retro-p1' : 'text-retro-p2'}>YOU</span>
        <span>RACE METER</span>
        <span className={mySymbol === 'X' ? 'text-retro-p2' : 'text-retro-p1'}>OPPONENT</span>
      </div>
      <div className="relative h-3 rounded-full border border-retro-border bg-retro-deep">
        <div className={cn('absolute inset-y-0 left-0 rounded-full transition-all duration-500', myColor)} style={{ width: `${progress(myGuesses)}%` }} />
        <div className={cn('absolute inset-y-0 left-0 rounded-full opacity-50 transition-all duration-500', opponentColor)} style={{ width: `${progress(opponentGuesses)}%` }} />
        <span className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-retro-bg shadow-neon-p1 transition-[left] duration-500" style={{ left: `calc(${progress(myGuesses)}% - 8px)`, background: 'rgb(var(--c-p1))' }} aria-hidden="true" />
        <span className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-retro-bg shadow-neon-p2 transition-[left] duration-500" style={{ left: `calc(${progress(opponentGuesses)}% - 8px)`, background: 'rgb(var(--c-p2))' }} aria-hidden="true" />
      </div>
    </div>
  )
}

