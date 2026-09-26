import { useState, useRef, useEffect } from 'react'
import TypingKeyboard from '../../components/TypingKeyboard'
import { cn } from '@/lib/utils'
import { PASSAGES, countCorrectChars, computeWpm, computeAccuracy, computeEffWpm } from '../../lib/typingLogic'

const BOT_WPM = 55

// Scored like the room game: a random passage from its list, WPM and
// accuracy from correctly typed characters (typingLogic), ranked by
// accuracy-weighted effective WPM.
// The bot types cleanly at BOT_WPM; finishing first doesn't end your race.
export default function TypingDemo() {
  const [phase, setPhase]             = useState('idle')
  const [passage, setPassage]         = useState(PASSAGES[0])
  const [countdownSec, setCDown]      = useState(3)
  const [typed, setTyped]             = useState('')
  const [botProgress, setBotProgress] = useState(0)
  const [player, setPlayer]           = useState(null) // { wpm, acc, eff }
  const startTimeRef   = useRef(null)
  const finishedRef    = useRef(false)
  const botIntervalRef = useRef(null)

  // Countdown
  useEffect(() => {
    if (phase !== 'countdown') return
    let c = 3
    const id = setInterval(() => {
      c--
      if (c <= 0) { clearInterval(id); startTimeRef.current = Date.now(); setPhase('racing') }
      else setCDown(c)
    }, 1000)
    return () => clearInterval(id)
  }, [phase])

  // Bot at BOT_WPM (5 chars per word), typing every character correctly
  useEffect(() => {
    if (phase !== 'racing') return
    const msPerChar = Math.round(60_000 / (BOT_WPM * 5))
    let progress = 0
    botIntervalRef.current = setInterval(() => {
      progress = Math.min(progress + 1, passage.length)
      setBotProgress(progress)
      if (progress >= passage.length) clearInterval(botIntervalRef.current)
    }, msPerChar)
    return () => clearInterval(botIntervalRef.current)
  }, [phase, passage])

  const start = () => {
    setPassage(PASSAGES[Math.floor(Math.random() * PASSAGES.length)])
    setPhase('countdown')
  }

  const handleKey = (char) => {
    if (phase !== 'racing' || finishedRef.current) return
    let newTyped
    if (char === 'BACKSPACE') {
      newTyped = typed.slice(0, -1)
    } else if (char === 'WORD_BACKSPACE') {
      const trimmed = typed.trimEnd()
      const lastSpace = trimmed.lastIndexOf(' ')
      newTyped = lastSpace === -1 ? '' : typed.slice(0, lastSpace + 1)
      if (newTyped.length === typed.length) newTyped = typed.slice(0, -1)
    } else {
      if (typed.length >= passage.length) return
      newTyped = typed + char
    }
    setTyped(newTyped)
    if (newTyped.length === passage.length) {
      finishedRef.current = true
      clearInterval(botIntervalRef.current)
      const correct = countCorrectChars(newTyped, passage)
      const wpm = computeWpm(correct, Date.now() - startTimeRef.current)
      const acc = computeAccuracy(correct, passage.length)
      setPlayer({ wpm, acc, eff: computeEffWpm(wpm, acc) })
      setPhase('done')
    }
  }

  const reset = () => {
    clearInterval(botIntervalRef.current)
    setPhase('idle'); setCDown(3)
    setTyped(''); setBotProgress(0)
    setPlayer(null)
    finishedRef.current = false
  }

  if (phase === 'done') {
    const botEff = computeEffWpm(BOT_WPM, 100)
    const outcome = player.eff > botEff ? 'win' : player.eff < botEff ? 'lose' : 'draw'
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'YOU', ...player, col: 'retro-p1', won: outcome === 'win' },
            { label: 'BOT', wpm: BOT_WPM, acc: 100, eff: botEff, col: 'retro-p2', won: outcome === 'lose' },
          ].map(({ label, wpm, acc, eff, col, won }) => (
            <div key={label} className={`bg-retro-card border border-${col}/50 rounded p-3 text-center space-y-1`}>
              <p className={`font-pixel text-[8px] text-${col}`}>{label}</p>
              <p className={cn('font-pixel text-xl tabular-nums', won ? 'text-retro-win text-glow-win' : 'text-retro-text')}>{wpm}</p>
              <p className="font-pixel text-[8px] text-retro-dim">WPM</p>
              <p className="font-pixel text-[8px] text-retro-cta">{acc}% ACC</p>
              <p className="font-pixel text-[8px] text-retro-dim">{eff} EFF</p>
            </div>
          ))}
        </div>
        <p className="font-pixel text-[8px] text-retro-dim text-center">
          {outcome === 'win' ? <span className="text-retro-win">YOU WIN!</span>
            : outcome === 'draw' ? <span className="text-retro-text">DRAW!</span>
            : <span className="text-retro-p2">BOT WINS!</span>}
        </p>
        <p className="font-mono text-[10px] text-retro-dim text-center">WPM counts correct characters only · EFF = WPM × accuracy</p>
        <button onClick={reset}
          className="w-full py-2 font-pixel text-[9px] border border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 active:scale-95">
          PLAY AGAIN
        </button>
      </div>
    )
  }

  const isRacing = phase === 'racing'
  const botDone = botProgress >= passage.length
  return (
    <div className="space-y-3">
      {phase !== 'idle' && (
        <div className="space-y-1">
          {[
            { label: 'YOU', val: typed.length,  color: 'text-retro-p1' },
            { label: 'BOT', val: botProgress, color: 'text-retro-p2' },
          ].map(({ label, val, color }) => {
            const pct = Math.round((val / passage.length) * 100)
            return (
              <div key={label} className="flex items-center gap-2">
                <span className={cn('font-pixel text-[8px] w-8', color)}>{label}</span>
                <div className="flex-1 h-2 bg-retro-surface rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all duration-200', color === 'text-retro-p1' ? 'bg-retro-p1' : 'bg-retro-p2')}
                    style={{ width: `${pct}%` }} />
                </div>
                <span className="font-pixel text-[8px] text-retro-dim w-8 text-right tabular-nums">{pct}%</span>
              </div>
            )
          })}
          {isRacing && botDone && (
            <p className="font-pixel text-[8px] text-retro-p2 text-center" aria-live="polite">
              BOT FINISHED AT {BOT_WPM} WPM — FINISH YOURS, ACCURACY COUNTS
            </p>
          )}
        </div>
      )}

      <div className="bg-retro-surface border border-retro-border rounded p-3 font-mono text-[13px] leading-6 break-words min-h-[80px]">
        {phase === 'idle' && (
          <div className="flex flex-col items-center gap-3 py-2">
            <p className="font-pixel text-[9px] text-retro-dim text-center">BEAT THE BOT · ERRORS HIGHLIGHTED · ⌫ CORRECTS</p>
            <button onClick={start}
              className="px-6 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95">
              START
            </button>
          </div>
        )}
        {phase === 'countdown' && (
          <div className="flex flex-col items-center gap-2 py-2">
            <p className="font-pixel text-5xl text-retro-win text-glow-win">{countdownSec}</p>
            <p className="font-pixel text-[9px] text-retro-dim arcade-blink">GET READY!</p>
          </div>
        )}
        {isRacing && (
          <p>
            {passage.split('').map((char, i) => {
              const isTyped   = i < typed.length
              const isCorrect = isTyped && typed[i] === passage[i]
              const isWrong   = isTyped && !isCorrect
              const isCursor  = i === typed.length
              const isGhost   = botProgress > 0 && i === botProgress && i !== typed.length
              return (
                <span key={i} className={cn(
                  isCorrect ? 'text-retro-text' :
                  isWrong   ? 'text-retro-p2 bg-retro-p2/20' : 'text-retro-dim',
                  isCursor ? 'border-l-2 border-retro-cta' : '',
                  isGhost  ? 'border-b-2 border-retro-p2/60' : '',
                )}>
                  {char}
                </span>
              )
            })}
          </p>
        )}
      </div>

      {(isRacing || phase === 'countdown') && (
        <TypingKeyboard onKey={handleKey} disabled={!isRacing} />
      )}
    </div>
  )
}
