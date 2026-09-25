import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ref, runTransaction } from 'firebase/database'
import { cn } from '@/lib/utils'
import { sounds } from '../lib/sounds'
import { db } from '../lib/firebase'
import { serverNow } from '../lib/serverClock'
import useTurnDeadlineEnforcer from '../hooks/useTurnDeadlineEnforcer'

// Static classes per pad — must be complete strings for Tailwind's scanner
const PAD = [
  { active: 'bg-retro-p1 shadow-neon-p1 border-retro-p1',   dim: 'bg-retro-tint-p1 border-retro-p1/30' },
  { active: 'bg-retro-p2 shadow-neon-p2 border-retro-p2',   dim: 'bg-retro-tint-p2 border-retro-p2/30' },
  { active: 'bg-retro-cta shadow-neon-cta border-retro-cta', dim: 'bg-retro-tint-cta border-retro-cta/30' },
  { active: 'bg-retro-win shadow-neon-win border-retro-win', dim: 'bg-retro-win/10 border-retro-win/30' },
]

// Position glyphs so pads carry a non-color signal (aria + visible on the pad itself)
const PAD_GLYPH = ['▲', '▼', '◀', '▶']

const FLASH_ON_MS  = 480
const FLASH_GAP_MS = 240
const TURN_DEADLINE_MS = 30000 // idle-opponent forfeit window, armed once the flash ends

// A true memory duel: when it's your turn to recall, the whole sequence flashes
// once (and is otherwise hidden), then you must replay it from memory before
// adding one new pad. Pad colours are concealed at every moment EXCEPT the flash,
// so neither player can read the answer off the board.
export default function SimonBoard({
  onMove, disabled, simonSequence, simonProgress, simonMiss = null, finished = false,
  currentTurn = null, mySymbol,
}) {
  const { gameId } = useParams() // present under /game/:gameId; undefined in demo/solo — writes below no-op there
  useTurnDeadlineEnforcer(gameId, 'simon', 'simonDeadline')

  const seq      = simonSequence ?? []
  const progress = simonProgress ?? 0
  const isMyTurn    = !disabled
  const needsRecall = progress < seq.length        // a sequence is waiting to be replayed
  const inAppend    = isMyTurn && progress >= seq.length

  const [flashIndex, setFlashIndex]   = useState(-1) // seq position lit during the watch flash
  const [watching, setWatching]       = useState(false)
  const [replayAvailable, setReplayAvailable] = useState(true) // one manual re-flash per recall turn
  const watchedKeyRef = useRef(null)                // sequence signature already flashed this turn
  const flashDoneRef  = useRef(true)                // false while a flash is mid-animation
  const timersRef     = useRef([])

  const clearTimers = () => { timersRef.current.forEach(clearTimeout); timersRef.current = [] }

  // `restart` gives a fresh full window (after WATCH AGAIN, whose replay would
  // otherwise eat into the recall time); otherwise only the first writer wins.
  const armDeadline = (restart = false) => {
    if (!gameId) return
    runTransaction(
      ref(db, `games/${gameId}/simonDeadline`),
      cur => (restart || cur == null ? serverNow() + TURN_DEADLINE_MS : cur),
    ).catch(() => {})
  }

  const runFlash = (restartDeadline = false) => {
    clearTimers()
    flashDoneRef.current = false
    setWatching(true)
    setFlashIndex(-1)
    const step = FLASH_ON_MS + FLASH_GAP_MS
    seq.forEach((padIdx, i) => {
      timersRef.current.push(setTimeout(() => { setFlashIndex(i); sounds.simPad(padIdx) }, i * step))
      timersRef.current.push(setTimeout(() => setFlashIndex(-1), i * step + FLASH_ON_MS))
    })
    timersRef.current.push(setTimeout(() => {
      flashDoneRef.current = true
      setWatching(false)
      armDeadline(restartDeadline)
    }, seq.length * step))
  }

  const seqKey = seq.join('-')

  // Flash the sequence once at the start of each recall turn, then hide it.
  useEffect(() => {
    if (!isMyTurn) {
      clearTimers()
      // eslint-disable-next-line react-hooks/set-state-in-effect -- turn flip must synchronously clear the flash/watch display before the opponent's turn paints (timing-critical recall)
      setWatching(false); setFlashIndex(-1); watchedKeyRef.current = null; setReplayAvailable(true)
      return
    }
    if (!needsRecall) {
      // Nothing to watch — either the append-only step of this turn, or a
      // brand-new empty sequence. The deadline still applies to this action.
      clearTimers(); setWatching(false); setFlashIndex(-1)
      armDeadline()
      return
    }
    if (watchedKeyRef.current === seqKey) return // already flashed this exact sequence this turn
    watchedKeyRef.current = seqKey
    setReplayAvailable(true)
    runFlash()
    return () => {
      clearTimers()
      // An interrupted flash (StrictMode's double mount, a dependency blip) must
      // replay on the next run instead of leaving the board stuck in WATCH mode.
      if (!flashDoneRef.current) watchedKeyRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the sequence's own content (seqKey), not identity, so a re-render with the same pattern never restarts the flash
  }, [isMyTurn, needsRecall, seqKey])

  // Recover a flash that was hidden (tab backgrounded) mid-animation — timers
  // still fire while hidden, but the player saw nothing, so replay it clean.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && watching) runFlash()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only re-subscribes on `watching` so the handler always reads the latest watching flag
  }, [watching])

  // Clear any pending timers on unmount
  useEffect(() => clearTimers, [])

  const canClick = isMyTurn && !watching
  const litPad   = watching && flashIndex >= 0 ? seq[flashIndex] : -1

  const handlePad = (i) => {
    if (!canClick) return
    sounds.simPad(i)
    onMove(i)
  }

  const handleReplay = () => {
    if (!replayAvailable || watching || !needsRecall || !isMyTurn) return
    setReplayAvailable(false)
    runFlash(true)
  }

  // Once the round is over, everyone sees the whole sequence in colour, with the
  // step that was missed marked.
  const showAnswer = finished && seq.length > 0
  const isSpectator = mySymbol === null
  const missAt = showAnswer && simonMiss != null ? progress : -1

  const label =
    showAnswer   ? (missAt >= 0 ? 'WRONG PAD — HERE IS THE SEQUENCE' : 'ROUND OVER') :
    !isMyTurn    ? (isSpectator && (currentTurn === 'X' || currentTurn === 'O') ? `${currentTurn} IS RECALLING` : 'OPPONENT’S TURN') :
    watching     ? 'WATCH CAREFULLY' :
    needsRecall  ? `REPEAT FROM MEMORY · ${progress}/${seq.length}` :
    'ADD A NEW PAD'

  const labelClass =
    showAnswer  ? 'text-retro-text' :
    !isMyTurn   ? 'text-retro-dim' :
    watching    ? 'text-retro-cta text-glow-cta arcade-blink' :
    needsRecall ? 'text-retro-win text-glow-win' :
    'text-retro-cta text-glow-cta arcade-blink'

  return (
    <div className="w-full max-w-xs mx-auto space-y-4">

      {/* Progress strip — colours stay hidden except the pad flashing during the watch */}
      <div className="bg-retro-surface border-2 border-retro-border rounded p-3">
        <p className="font-pixel text-[8px] text-retro-dim text-center mb-2 tracking-widest">SEQUENCE</p>
        <div className="flex flex-wrap justify-center gap-1.5 min-h-5">
          {seq.length === 0 ? (
            <span className="font-pixel text-[8px] text-retro-border self-center">NONE YET</span>
          ) : (
            seq.map((padIdx, i) => {
              const isFlashing = watching && i === flashIndex
              const recalled   = !watching && i < progress
              const isMissed   = i === missAt
              return (
                <div
                  key={i}
                  className={cn(
                    'relative w-5 h-5 rounded-sm border transition-all duration-100',
                    isFlashing
                      ? cn(PAD[padIdx].active, 'scale-125')
                      : showAnswer
                        ? cn(PAD[padIdx].active, 'shadow-none', isMissed && 'ring-2 ring-retro-danger ring-offset-1 ring-offset-retro-surface')
                        : recalled
                          ? 'bg-retro-win/60 border-retro-win/60'
                          : 'bg-retro-card border-retro-border',
                  )}
                >
                  {showAnswer && (
                    <span className="absolute inset-0 flex items-center justify-center font-pixel text-[8px] leading-none text-retro-bg" aria-hidden="true">
                      {PAD_GLYPH[padIdx]}
                    </span>
                  )}
                </div>
              )
            })
          )}
          {/* Slot for the new pad the player will add after recalling */}
          {inAppend && (
            <div className="w-5 h-5 rounded-sm border-2 border-dashed border-retro-cta/60 arcade-blink" />
          )}
        </div>
      </div>

      {/* Phase label */}
      <p className="font-pixel text-[9px] text-center leading-relaxed">
        <span className={labelClass}>{label}</span>
      </p>

      {/* Replay — recovers a missed flash without unlimited free re-watches */}
      {isMyTurn && needsRecall && !watching && replayAvailable && (
        <button
          onClick={handleReplay}
          className="w-full py-2 bg-retro-surface border-2 border-retro-border text-retro-cta font-pixel text-[8px] rounded hover:border-retro-cta/60 active:scale-95 tracking-widest"
        >
          WATCH AGAIN (1)
        </button>
      )}

      {/* 2 × 2 pad grid */}
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => {
          const lit = litPad === i
          const p   = PAD[i]
          return (
            <button
              key={i}
              aria-label={`simon pad ${PAD_GLYPH[i]}${lit ? ', lit' : ''}`}
              disabled={!canClick}
              onClick={() => handlePad(i)}
              className={cn(
                'aspect-square rounded-xl border-2 transition-all duration-100 active:scale-95',
                'flex items-center justify-center',
                lit
                  ? cn(p.active, 'scale-105 ring-2 ring-retro-text/40')
                  : cn(p.dim, canClick ? 'hover:opacity-90 cursor-pointer' : 'cursor-default opacity-60'),
              )}
            >
              <span
                className={cn('font-pixel text-lg select-none', lit ? 'text-retro-bg' : 'text-retro-text/35')}
                aria-hidden="true"
              >
                {PAD_GLYPH[i]}
              </span>
            </button>
          )
        })}
      </div>

      {/* Sequence length */}
      <p className="font-pixel text-[8px] text-retro-dim text-center tracking-widest">
        LENGTH: {seq.length}
      </p>
    </div>
  )
}
