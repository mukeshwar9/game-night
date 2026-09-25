import { useState, useRef, useEffect } from 'react'
import TypingKeyboard from '../../components/TypingKeyboard'
import { cn } from '@/lib/utils'

const DEMO_PASSAGE = "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How quickly daft jumping zebras vex."
const BOT_WPM = 55

export default function TypingDemo() {
  const [phase, setPhase]             = useState('idle')
  const [countdownSec, setCDown]      = useState(3)
  const [typed, setTyped]             = useState('')
  const [botProgress, setBotProgress] = useState(0)
  const [playerWpm, setPlayerWpm]     = useState(null)
  const [playerAcc, setPlayerAcc]     = useState(null)
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

  // Bot at BOT_WPM chars/min (types correctly); detects its own finish inline
  useEffect(() => {
    if (phase !== 'racing') return
    const msPerChar = Math.round(60_000 / (BOT_WPM * 5))
    let progress = 0
    botIntervalRef.current = setInterval(() => {
      progress = Math.min(progress + 1, DEMO_PASSAGE.length)
      setBotProgress(progress)
      if (progress >= DEMO_PASSAGE.length) {
        clearInterval(botIntervalRef.current)
        setPhase('done')
      }
    }, msPerChar)
    return () => clearInterval(botIntervalRef.current)
  }, [phase])

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
      if (typed.length >= DEMO_PASSAGE.length) return
      newTyped = typed + char
    }
    setTyped(newTyped)
    if (newTyped.length === DEMO_PASSAGE.length) {
      finishedRef.current = true
      clearInterval(botIntervalRef.current)
      const elapsed = Date.now() - startTimeRef.current
      const wpm = Math.max(1, Math.round((DEMO_PASSAGE.length / 5) / (elapsed / 60_000)))
      let matches = 0
      for (let i = 0; i < newTyped.length; i++) {
        if (newTyped[i] === DEMO_PASSAGE[i]) matches++
      }
      const acc = Math.round((matches / DEMO_PASSAGE.length) * 100)
      setPlayerWpm(wpm)
      setPlayerAcc(acc)
      setPhase('done')
    }
  }

  const reset = () => {
    clearInterval(botIntervalRef.current)
    setPhase('idle'); setCDown(3)
    setTyped(''); setBotProgress(0)
    setPlayerWpm(null); setPlayerAcc(null)
    finishedRef.current = false
  }

  if (phase === 'done') {
    const youFinished = playerWpm != null
    const botAcc = 100
    const botEffWpm = Math.round(BOT_WPM * botAcc / 100)
    const playerEffWpm = youFinished ? Math.round(playerWpm * (playerAcc ?? 100) / 100) : 0
    const youWon = youFinished && playerEffWpm > botEffWpm
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'YOU', wpm: playerWpm, acc: playerAcc, eff: youFinished ? playerEffWpm : null, col: 'retro-p1', won: youWon },
            { label: 'BOT', wpm: BOT_WPM,  acc: botAcc,    eff: botEffWpm,                          col: 'retro-p2', won: !youWon },
          ].map(({ label, wpm, acc, eff, col, won }) => (
            <div key={label} className={`bg-retro-card border border-${col}/50 rounded p-3 text-center space-y-1`}>
              <p className={`font-pixel text-[8px] text-${col}`}>{label}</p>
              {wpm != null ? (
                <>
                  <p className={cn('font-pixel text-xl tabular-nums', won ? 'text-retro-win text-glow-win' : 'text-retro-text')}>{wpm}</p>
                  <p className="font-pixel text-[8px] text-retro-dim">WPM</p>
                  {acc != null && <p className="font-pixel text-[8px] text-retro-cta">{acc}% ACC</p>}
                  {eff != null && <p className="font-pixel text-[8px] text-retro-dim">{eff} EFF</p>}
                </>
              ) : (
                <p className="font-pixel text-lg text-retro-dim">DNF</p>
              )}
            </div>
          ))}
        </div>
        <p className="font-pixel text-[8px] text-retro-dim text-center">
          {youWon ? <span className="text-retro-win">YOU WIN!</span> : youFinished ? <span className="text-retro-p2">BOT WINS!</span> : <span className="text-retro-p2">BOT FINISHED FIRST!</span>}
        </p>
        <button onClick={reset}
          className="w-full py-2 font-pixel text-[9px] border border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 active:scale-95">
          PLAY AGAIN
        </button>
      </div>
    )
  }

  const isRacing = phase === 'racing'
  return (
    <div className="space-y-3">
      {phase !== 'idle' && (
        <div className="space-y-1">
          {[
            { label: 'YOU', val: typed.length,  color: 'text-retro-p1' },
            { label: 'BOT', val: botProgress, color: 'text-retro-p2' },
          ].map(({ label, val, color }) => {
            const pct = Math.round((val / DEMO_PASSAGE.length) * 100)
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
        </div>
      )}

      <div className="bg-retro-surface border border-retro-border rounded p-3 font-mono text-[13px] leading-6 break-words min-h-[80px]">
        {phase === 'idle' && (
          <div className="flex flex-col items-center gap-3 py-2">
            <p className="font-pixel text-[9px] text-retro-dim text-center">BEAT THE BOT · ERRORS HIGHLIGHTED · ⌫ CORRECTS</p>
            <button onClick={() => setPhase('countdown')}
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
        {(isRacing || phase === 'done') && (
          <p>
            {DEMO_PASSAGE.split('').map((char, i) => {
              const isTyped   = i < typed.length
              const isCorrect = isTyped && typed[i] === DEMO_PASSAGE[i]
              const isWrong   = isTyped && !isCorrect
              const isCursor  = isRacing && i === typed.length
              const isGhost   = isRacing && botProgress > 0 && i === botProgress && i !== typed.length
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
