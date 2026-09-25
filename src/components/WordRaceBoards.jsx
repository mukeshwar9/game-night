import { cn } from '@/lib/utils'
import MarkTile from './MarkTile'
import { ghostSummary, raceProgress, MAX_GUESSES, WORD_LENGTH } from '../lib/wordraceLogic'

const MARK_COPY = {
  G: 'correct',
  Y: 'misplaced',
  B: 'absent',
}

function rowLabel(guesses, row, who) {
  const guess = guesses[row]
  if (!guess) return `${who} row ${row + 1}: empty`
  const marks = guess.marks || ''
  const summary = marks.split('').map(mark => MARK_COPY[mark] || 'pending').join(', ')
  return `${who} row ${row + 1}: ${guess.word || 'pending'}; ${summary}`
}

// Mid-race opponent view. Both players race the SAME word, so showing which
// positions the leader has right would let the other side copy them — only
// rows used, greens in their best row, and SOLVED are shown until the reveal.
function HiddenBoard({ guesses, label, compact }) {
  const { rows, bestGreens, solved } = ghostSummary(guesses)
  return (
    <section className="space-y-1" aria-label={`${label}: ${rows} of ${MAX_GUESSES} guesses used, best row ${bestGreens} of ${WORD_LENGTH} correct${solved ? ', solved' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <p className={cn('font-pixel tracking-widest text-retro-p2', compact ? 'text-[8px]' : 'text-[9px]')}>{label}</p>
        {solved && <span className="font-pixel text-[8px] text-retro-win">✓ SOLVED</span>}
      </div>
      <div className="flex flex-col gap-0.5" aria-hidden="true">
        {Array.from({ length: MAX_GUESSES }, (_, row) => (
          <div
            key={row}
            className={cn(
              'h-2.5 rounded-sm border',
              row < rows ? 'bg-retro-structure border-retro-border' : 'bg-retro-deep border-retro-border/50',
            )}
          />
        ))}
      </div>
      <p className="font-pixel text-[8px] text-retro-dim tracking-wider" aria-hidden="true">
        {rows}/{MAX_GUESSES} USED · BEST ROW {bestGreens}/{WORD_LENGTH} ✓
      </p>
    </section>
  )
}

// A full board (letters + glyph marks). `ghost` without `reveal` renders the
// hidden mid-race summary instead.
export function WordRaceBoard({ guesses = [], currentGuess = '', ghost = false, reveal = false, compact = false, label, solved = false }) {
  if (ghost && !reveal) return <HiddenBoard guesses={guesses} label={label} compact={compact} />
  const who = ghost ? 'opponent' : 'your'
  const rows = []
  for (let row = 0; row < MAX_GUESSES; row++) {
    const guess = guesses[row]
    const isPreview = !ghost && !guess && row === guesses.length && currentGuess
    const word = guess?.word || (isPreview ? currentGuess : '')
    const marks = guess?.marks || ''
    rows.push(
      <div
        key={row}
        className={cn('flex', compact ? 'gap-0.5' : 'gap-1')}
        aria-label={rowLabel(guesses, row, who)}
      >
        {Array.from({ length: WORD_LENGTH }, (_, col) => (
          <MarkTile
            key={`${row}-${col}-${word}-${marks}`}
            size={compact ? 'sm' : 'lg'}
            letter={word[col] || ''}
            mark={marks[col] || null}
            pending={!!isPreview}
            className={cn(guess?.marks && 'word-race-flip')}
          />
        ))}
      </div>,
    )
  }

  return (
    <section className={cn('space-y-2', compact && 'space-y-1')} aria-label={label}>
      <div className="flex items-center justify-between gap-2">
        <p className={cn('font-pixel tracking-widest', compact ? 'text-[8px]' : 'text-[9px]', ghost ? 'text-retro-p2' : 'text-retro-p1')}>
          {label}
        </p>
        {solved && <span className="font-pixel text-[8px] text-retro-win">✓ SOLVED</span>}
      </div>
      <div className={cn('flex flex-col', compact ? 'gap-0.5' : 'gap-1')}>
        {rows}
      </div>
    </section>
  )
}

// Closeness meter: each side's best row (greens + half yellows), never the
// number of guesses spent. Colours follow the real seats (X = p1, O = p2).
export function WordRaceMeter({ myGuesses = [], opponentGuesses = [], mySymbol = 'X', myLabel = 'YOU', opponentLabel = 'OPPONENT' }) {
  const mine = Math.round(raceProgress(myGuesses) * 100)
  const theirs = Math.round(raceProgress(opponentGuesses) * 100)
  const oppSymbol = mySymbol === 'X' ? 'O' : 'X'
  const tone = (sym) => (sym === 'X'
    ? { text: 'text-retro-p1', bar: 'bg-retro-p1', dot: 'shadow-neon-p1', fill: 'rgb(var(--c-p1))' }
    : { text: 'text-retro-p2', bar: 'bg-retro-p2', dot: 'shadow-neon-p2', fill: 'rgb(var(--c-p2))' })
  const me = tone(mySymbol)
  const opp = tone(oppSymbol)
  return (
    <div className="space-y-1.5" role="img" aria-label={`Race meter: ${myLabel.toLowerCase()} ${mine}% close, ${opponentLabel.toLowerCase()} ${theirs}% close`}>
      <div className="flex items-center justify-between font-pixel text-[8px] tracking-widest text-retro-dim" aria-hidden="true">
        <span className={me.text}>{myLabel}</span>
        <span>CLOSENESS</span>
        <span className={opp.text}>{opponentLabel}</span>
      </div>
      <div className="relative h-3 rounded-full border border-retro-border bg-retro-deep" aria-hidden="true">
        <div className={cn('absolute inset-y-0 left-0 rounded-full transition-all duration-500', me.bar)} style={{ width: `${mine}%` }} />
        <div className={cn('absolute inset-y-0 left-0 rounded-full opacity-50 transition-all duration-500', opp.bar)} style={{ width: `${theirs}%` }} />
        <span className={cn('absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-retro-bg transition-[left] duration-500', me.dot)} style={{ left: `calc(${mine}% - 8px)`, background: me.fill }} />
        <span className={cn('absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-retro-bg transition-[left] duration-500', opp.dot)} style={{ left: `calc(${theirs}% - 8px)`, background: opp.fill }} />
      </div>
    </div>
  )
}
