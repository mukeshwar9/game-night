import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ref, runTransaction, set } from 'firebase/database'
import { cn } from '@/lib/utils'
import { sounds } from '../lib/sounds'
import { db } from '../lib/firebase'
import { serverNow } from '../lib/serverClock'
import useTurnDeadlineEnforcer from '../hooks/useTurnDeadlineEnforcer'
import { SIMON_PAD_META, simonPadVar, simonPadName } from '../lib/simonPads'
import { simonFlashTiming } from '../lib/simonLogic'
import useGameKeys from '../hooks/useGameKeys'

// Pad colours are the fixed --simon-* palette (src/lib/simonPads.js), not theme
// tokens; each pad's glyph points at its own corner as the non-colour cue.
const padStyle = i => ({ '--pad': simonPadVar(i) })
const PRESS_LIGHT_MS = 180 // how long a pad stays lit after your own press

// Keyboard: 1–4 in reading order, or Q W / A S as a 2×2 block; R replays the flash.
const PAD_KEYS = { 1: 0, 2: 1, 3: 2, 4: 3, q: 0, w: 1, a: 2, s: 3 }
const TURN_DEADLINE_MS = 30000 // idle-opponent forfeit window, armed once the flash ends

// A true memory duel: when it's your turn to recall, the whole sequence flashes
// once (and is otherwise hidden), then you must replay it from memory before
// adding one new pad. Pad colours are concealed at every moment EXCEPT the flash,
// so neither player can read the answer off the board.
export default function SimonBoard({
  onMove, disabled, simonSequence, simonProgress, simonMiss = null, finished = false,
  currentTurn = null, mySymbol,
  // What the label says while the board is disabled mid-game (solo uses it for the
  // pause between rounds; duels leave the opponent wording).
  waitingLabel = null,
  // Room state that survives a reload: a live deadline means this turn's flash already
  // played, and simonReplayUsed means WATCH AGAIN is spent.
  simonDeadline = null, simonReplayUsed = false,
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
  const [pressedPad, setPressedPad] = useState(-1)  // lights your own press, like a real Simon
  const pressTimerRef = useRef(null)
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
    const { on, gap } = simonFlashTiming(seq.length)
    const step = on + gap
    seq.forEach((padIdx, i) => {
      timersRef.current.push(setTimeout(() => { setFlashIndex(i); sounds.simPad(padIdx) }, i * step))
      timersRef.current.push(setTimeout(() => setFlashIndex(-1), i * step + on))
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
    if (simonDeadline != null) {
      // Remounted (e.g. a reload) after this turn's flash already ran: reloading must
      // not buy a fresh look, or a free WATCH AGAIN if it was already spent.
      setReplayAvailable(!simonReplayUsed)
      return
    }
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
  useEffect(() => () => { clearTimers(); clearTimeout(pressTimerRef.current) }, [])

  const canClick = isMyTurn && !watching
  const litPad   = watching ? (flashIndex >= 0 ? seq[flashIndex] : -1) : pressedPad

  const handlePad = (i) => {
    if (!canClick) return
    sounds.simPad(i)
    clearTimeout(pressTimerRef.current)
    setPressedPad(i)
    pressTimerRef.current = setTimeout(() => setPressedPad(-1), PRESS_LIGHT_MS)
    onMove(i)
  }

  const handleReplay = () => {
    if (!replayAvailable || watching || !needsRecall || !isMyTurn) return
    setReplayAvailable(false)
    if (gameId) set(ref(db, `games/${gameId}/simonReplayUsed`), true).catch(() => {})
    runFlash(true)
  }

  useGameKeys((e) => {
    const k = e.key.toLowerCase()
    if (k === 'r' && isMyTurn && needsRecall && !watching && replayAvailable) { handleReplay(); return true }
    const pad = PAD_KEYS[k]
    if (pad === undefined || !canClick) return false
    handlePad(pad)
    return true
  })

  // Once the round is over, everyone sees the whole sequence in colour, with the
  // step that was missed marked.
  const showAnswer = finished && seq.length > 0
  const isSpectator = mySymbol === null
  const missAt = showAnswer && simonMiss != null ? progress : -1

  const missGlyphs = missAt >= 0 && SIMON_PAD_META[simonMiss] && SIMON_PAD_META[seq[missAt]]
    ? `YOU PRESSED ${SIMON_PAD_META[simonMiss].glyph}, IT WAS ${SIMON_PAD_META[seq[missAt]].glyph}`
    : null
  const label =
    showAnswer   ? (missAt >= 0 ? `WRONG PAD — ${missGlyphs ?? 'HERE IS THE SEQUENCE'}` : 'ROUND OVER') :
    !isMyTurn    ? (waitingLabel ?? (isSpectator && (currentTurn === 'X' || currentTurn === 'O') ? `${currentTurn} IS RECALLING` : 'OPPONENT’S TURN')) :
    watching     ? 'WATCH CAREFULLY' :
    needsRecall  ? `REPEAT FROM MEMORY · ${progress}/${seq.length}` :
    'ADD A NEW PAD'

  const labelClass =
    showAnswer  ? 'text-retro-text' :
    !isMyTurn   ? (waitingLabel ? 'text-retro-win text-glow-win' : 'text-retro-dim') :
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
                  style={isFlashing || showAnswer ? padStyle(padIdx) : undefined}
                  className={cn(
                    'relative w-5 h-5 rounded-sm border transition-all duration-100',
                    isFlashing
                      ? 'simon-chip scale-125'
                      : showAnswer
                        // An outline, not a ring: theme rules that restyle box-shadow
                        // (Matcha's .shadow-neon-cta) used to hide the miss marker.
                        ? cn('simon-chip', isMissed && 'outline outline-2 outline-offset-2 outline-retro-danger')
                        : recalled
                          ? 'bg-retro-win/60 border-retro-win/60'
                          : 'bg-retro-card border-retro-border',
                  )}
                >
                  {showAnswer && (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] leading-none" aria-hidden="true">
                      {SIMON_PAD_META[padIdx]?.glyph}
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

      {/* Replay — recovers a missed flash without unlimited free re-watches. Its row is
          always reserved, so the pads never jump when it appears after the flash. */}
      <div className="h-9">
        {isMyTurn && needsRecall && !watching && replayAvailable && (
          <button
            onClick={handleReplay}
            className="w-full h-9 bg-retro-surface border-2 border-retro-border text-retro-cta font-pixel text-[8px] rounded hover:border-retro-cta/60 active:scale-95 tracking-widest"
          >
            WATCH AGAIN (1)
          </button>
        )}
      </div>

      {/* 2 × 2 pad grid */}
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => {
          const lit = litPad === i
          return (
            <button
              key={i}
              aria-label={`${simonPadName(i)}${lit ? ', lit' : ''}`}
              disabled={!canClick}
              onClick={() => handlePad(i)}
              style={padStyle(i)}
              className={cn(
                'simon-pad aspect-square rounded-xl border-2 active:scale-95',
                'flex items-center justify-center',
                lit && 'is-lit',
                !lit && (canClick ? 'cursor-pointer hover:brightness-105' : 'cursor-default opacity-70'),
              )}
            >
              <span className={cn('text-2xl leading-none select-none', !lit && 'opacity-70')} aria-hidden="true">
                {SIMON_PAD_META[i].glyph}
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
