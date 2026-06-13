import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { sounds } from '../lib/sounds'

// Static classes per pad — must be complete strings for Tailwind's scanner
const PAD = [
  { active: 'bg-retro-p1 shadow-neon-p1 border-retro-p1',   dim: 'bg-retro-tint-p1 border-retro-p1/30' },
  { active: 'bg-retro-p2 shadow-neon-p2 border-retro-p2',   dim: 'bg-retro-tint-p2 border-retro-p2/30' },
  { active: 'bg-retro-cta shadow-neon-cta border-retro-cta', dim: 'bg-retro-tint-cta border-retro-cta/30' },
  { active: 'bg-retro-win shadow-neon-win border-retro-win', dim: 'bg-retro-win/10 border-retro-win/30' },
]

const FLASH_ON_MS  = 480
const FLASH_GAP_MS = 240

// A true memory duel: when it's your turn to recall, the whole sequence flashes
// once (and is otherwise hidden), then you must replay it from memory before
// adding one new pad. Pad colours are concealed at every moment EXCEPT the flash,
// so neither player can read the answer off the board.
export default function SimonBoard({ onMove, disabled, simonSequence, simonProgress }) {
  const seq      = simonSequence ?? []
  const progress = simonProgress ?? 0
  const isMyTurn    = !disabled
  const needsRecall = progress < seq.length        // a sequence is waiting to be replayed
  const inAppend    = isMyTurn && progress >= seq.length

  const [flashIndex, setFlashIndex] = useState(-1) // seq position lit during the watch flash
  const [watching, setWatching]     = useState(false)
  const watchedLenRef = useRef(null)               // seq length already flashed this turn
  const timersRef     = useRef([])

  const clearTimers = () => { timersRef.current.forEach(clearTimeout); timersRef.current = [] }

  // Flash the sequence once at the start of each recall turn, then hide it.
  useEffect(() => {
    if (!isMyTurn) {
      clearTimers(); setWatching(false); setFlashIndex(-1); watchedLenRef.current = null
      return
    }
    if (!needsRecall) { clearTimers(); setWatching(false); setFlashIndex(-1); return }
    if (watchedLenRef.current === seq.length) return // already flashed for this turn
    watchedLenRef.current = seq.length

    clearTimers()
    setWatching(true)
    setFlashIndex(-1)
    const step = FLASH_ON_MS + FLASH_GAP_MS
    seq.forEach((padIdx, i) => {
      timersRef.current.push(setTimeout(() => { setFlashIndex(i); sounds.simPad(padIdx) }, i * step))
      timersRef.current.push(setTimeout(() => setFlashIndex(-1), i * step + FLASH_ON_MS))
    })
    timersRef.current.push(setTimeout(() => setWatching(false), seq.length * step))
    return clearTimers
  }, [isMyTurn, needsRecall, seq.length])

  // Clear any pending timers on unmount
  useEffect(() => clearTimers, [])

  const canClick = isMyTurn && !watching
  const litPad   = watching && flashIndex >= 0 ? seq[flashIndex] : -1

  const handlePad = (i) => {
    if (!canClick) return
    sounds.simPad(i)
    onMove(i)
  }

  const label =
    !isMyTurn    ? 'OPPONENT’S TURN' :
    watching     ? 'WATCH CAREFULLY' :
    needsRecall  ? `REPEAT FROM MEMORY · ${progress}/${seq.length}` :
    'ADD A NEW PAD'

  const labelClass =
    !isMyTurn   ? 'text-retro-dim' :
    watching    ? 'text-retro-cta text-glow-cta animate-pulse' :
    needsRecall ? 'text-retro-win text-glow-win' :
    'text-retro-cta text-glow-cta animate-pulse'

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
              return (
                <div
                  key={i}
                  className={cn(
                    'w-3.5 h-3.5 rounded-sm border transition-all duration-100',
                    isFlashing
                      ? cn(PAD[padIdx].active, 'scale-125')
                      : recalled
                        ? 'bg-retro-win/60 border-retro-win/60'
                        : 'bg-retro-card border-retro-border',
                  )}
                />
              )
            })
          )}
          {/* Slot for the new pad the player will add after recalling */}
          {inAppend && (
            <div className="w-3.5 h-3.5 rounded-sm border-2 border-dashed border-retro-cta/60 animate-pulse" />
          )}
        </div>
      </div>

      {/* Phase label */}
      <p className="font-pixel text-[9px] text-center leading-relaxed">
        <span className={labelClass}>{label}</span>
      </p>

      {/* 2 × 2 pad grid */}
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => {
          const lit = litPad === i
          const p   = PAD[i]
          return (
            <button
              key={i}
              aria-label={`simon-pad-${i}`}
              disabled={!canClick}
              onClick={() => handlePad(i)}
              className={cn(
                'aspect-square rounded-xl border-2 transition-all duration-100 active:scale-95',
                lit
                  ? cn(p.active, 'scale-105 ring-2 ring-white/40')
                  : cn(p.dim, canClick ? 'hover:opacity-90 cursor-pointer' : 'cursor-default opacity-60'),
              )}
            />
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
