import { cn } from '@/lib/utils'

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
]

const MARK_COPY = {
  G: 'correct',
  Y: 'misplaced',
  B: 'absent',
}

function tileClasses(mark, ghost) {
  if (mark === 'G') return 'bg-retro-win border-retro-win text-white'
  if (mark === 'Y') return 'bg-retro-cta border-retro-cta text-white'
  if (mark === 'B') return 'bg-retro-dim border-retro-dim text-retro-bg'
  return ghost ? 'bg-retro-deep border-retro-border text-retro-dim' : 'bg-retro-card border-retro-border text-retro-text'
}

function markLabel(mark) {
  if (mark === 'G') return '✓'
  if (mark === 'Y') return '•'
  if (mark === 'B') return '×'
  return ''
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
          const mark = reveal || !ghost ? marks[col] : marks[col]
          const letter = ghost && !reveal ? '' : word[col] || ''
          const pending = isPreview && letter
          return (
            <div
              key={`${row}-${col}-${word}-${marks}`}
              aria-label={`${ghost ? 'opponent' : 'your'} row ${row + 1} column ${col + 1}${letter ? ` ${letter}` : ' empty'}${mark ? `, ${MARK_COPY[mark]}` : ''}`}
              className={cn(
                'flex items-center justify-center rounded border-2 uppercase select-none font-bold',
                compact ? 'w-6 h-6 text-[9px] border' : 'w-10 h-10 sm:w-12 sm:h-12 text-base sm:text-xl',
                tileClasses(mark, ghost),
                pending && 'border-retro-cta text-retro-text',
                guess?.marks && 'word-race-flip',
              )}
            >
              {ghost && !reveal ? markLabel(mark) : letter}
            </div>
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

export function WordRaceKeyboard({ keyState = {}, onKey, disabled = false }) {
  return (
    <div className="flex w-full max-w-md flex-col gap-1.5 mx-auto" aria-label="On-screen keyboard">
      {KEYBOARD_ROWS.map((row, rowIndex) => (
        <div key={rowIndex} className="flex gap-1 w-full">
          {rowIndex === 2 && (
            <button
              type="button"
              onClick={() => onKey('BACK')}
              disabled={disabled}
              aria-label="Backspace"
              className="min-h-11 flex-[1.5] rounded bg-retro-structure text-retro-text font-bold text-xs disabled:opacity-30"
            >⌫</button>
          )}
          {row.map(letter => {
            const state = keyState[letter]
            return (
              <button
                key={letter}
                type="button"
                onClick={() => onKey(letter)}
                disabled={disabled}
                aria-label={`${letter}${state ? `, ${MARK_COPY[state]}` : ''}`}
                className={cn(
                  'min-h-11 flex-1 min-w-0 rounded font-bold text-xs sm:text-sm transition-colors disabled:opacity-30',
                  state === 'G' && 'bg-retro-win text-white',
                  state === 'Y' && 'bg-retro-cta text-white',
                  state === 'B' && 'bg-retro-dim text-retro-bg',
                  !state && 'bg-retro-structure text-retro-text hover:bg-retro-border',
                )}
              >{letter}</button>
            )
          })}
          {rowIndex === 2 && (
            <button
              type="button"
              onClick={() => onKey('ENTER')}
              disabled={disabled}
              aria-label="Submit guess"
              className="min-h-11 flex-[1.5] rounded bg-retro-structure text-retro-text font-bold text-xs disabled:opacity-30"
            >↵</button>
          )}
        </div>
      ))}
    </div>
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

