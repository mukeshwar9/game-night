import { useEffect, useRef, useState } from 'react'
import ArrowsBoard from './ArrowsBoard'
import { getLesson, lessonLevel, lessonTap } from '../lib/arrowsLessonsLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// The short lesson for one arrow kind: an intro card, three guided taps on a
// tiny board (tap it while blocked, clear what blocks it, send it) and a done
// card. Practice only — taps never cost lives. Rendered inside a BottomSheet
// by the caller (before a level that introduces the kind, or from the arrow
// types list). `onDone` fires on SKIP and on the final button.

const BTN = 'min-h-11 px-4 py-2.5 font-pixel text-[10px] rounded transition active:scale-95'
const CTA = cn(BTN, 'bg-retro-cta text-retro-bg hover:shadow-neon-cta')
const SEC = cn(BTN, 'border border-retro-border text-retro-dim hover:border-retro-cta/50 hover:text-retro-text')
// How long the result line stays up before the next step.
const BLOCKED_PAUSE_MS = 1500
const CLEARED_PAUSE_MS = 1300

export default function ArrowsLesson({ kind, onDone, doneLabel = 'PLAY', badge = null }) {
  const lesson = getLesson(kind)
  const [level, setLevel] = useState(() => (lesson ? lessonLevel(lesson) : null))
  // screen: 'intro' | 'play' | 'done'
  const [screen, setScreen] = useState('intro')
  const [step, setStep] = useState(0)
  const [gone, setGone] = useState(() => Array(lesson?.board.arrows.length ?? 0).fill(false))
  const [feedback, setFeedback] = useState(null)
  const [message, setMessage] = useState(null)
  // Remounts the board on REPLAY so it forgets the arrows that left.
  const [attempt, setAttempt] = useState(0)
  const busy = useRef(false)
  const timer = useRef(0)

  useEffect(() => () => clearTimeout(timer.current), [])

  if (!lesson || !level) return null

  const restart = () => {
    clearTimeout(timer.current)
    busy.current = false
    setLevel(lessonLevel(lesson))
    setGone(Array(lesson.board.arrows.length).fill(false))
    setFeedback(null)
    setMessage(null)
    setStep(0)
    setAttempt((a) => a + 1)
    setScreen('play')
  }

  const handleTap = (index) => {
    if (busy.current || screen !== 'play') return
    const r = lessonTap(lesson, level, gone, step, index)
    if (r.outcome === 'nudge') {
      setMessage({ text: 'TRY THE GLOWING ARROW', nudge: true })
      return
    }
    busy.current = true
    setMessage({ text: lesson.steps[step].after })
    if (r.outcome === 'blocked') {
      setFeedback({ index, blocker: r.blocker, gap: r.gap, asleep: r.asleep, crate: r.crate, wall: r.wall, key: Date.now() })
      sounds.buzz()
    } else {
      setGone(r.gone)
      sounds.hit(step)
    }
    timer.current = setTimeout(() => {
      busy.current = false
      setMessage(null)
      if (r.next >= lesson.steps.length) {
        setScreen('done')
        sounds.win()
      } else {
        setStep(r.next)
      }
    }, r.outcome === 'blocked' ? BLOCKED_PAUSE_MS : CLEARED_PAUSE_MS)
  }

  const want = lesson.steps[step]
  const playing = screen === 'play'

  return (
    <div className="space-y-3" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        {badge ? <span className="font-pixel text-[7px] px-1.5 py-1 rounded bg-retro-cta text-retro-bg">{badge}</span> : <span />}
        {screen !== 'done' && (
          <button onClick={() => onDone('skip')} className="min-h-11 px-1 font-pixel text-[9px] text-retro-dim hover:text-retro-text">SKIP ›</button>
        )}
      </div>
      <p className="font-pixel text-[10px] text-retro-cta text-glow-cta tracking-widest">{screen === 'done' ? 'GOT IT!' : lesson.name}</p>
      {screen !== 'play' && (
        <p className="font-mono text-[11px] leading-relaxed text-retro-text">
          {screen === 'done' ? `${lesson.name}: ` : ''}{lesson.rule}
        </p>
      )}
      <div className="mx-auto w-[220px] max-w-full">
        <ArrowsBoard
          key={attempt}
          level={level}
          gone={gone}
          onTap={handleTap}
          interactive={playing}
          feedback={feedback}
          target={playing && !message ? want.tap : -1}
          preview={playing && !message && want.tap === 0 ? 0 : -1}
          label={`${lesson.name} lesson board`}
        />
      </div>
      {playing && (
        <>
          <p
            className={cn('font-pixel text-[9px] leading-relaxed text-center min-h-[3.4em]', message && !message.nudge ? 'text-retro-text' : 'text-retro-win')}
            role="status"
          >
            {message?.text ?? want.say}
          </p>
          <div className="flex justify-center gap-1.5" role="img" aria-label={`Step ${step + 1} of ${lesson.steps.length}`}>
            {lesson.steps.map((_, i) => (
              <span key={i} className={cn('w-2 h-2 rounded-sm', i <= step ? 'bg-retro-cta' : 'bg-retro-border')} />
            ))}
          </div>
          <p className="font-pixel text-[7px] text-retro-dim text-center">PRACTICE · NO LIVES LOST</p>
        </>
      )}
      {screen === 'intro' && (
        <div className="flex flex-wrap justify-center gap-2">
          <button onClick={restart} className={CTA}>SHOW ME · 3 TAPS</button>
          <button onClick={() => onDone('skip')} className={SEC}>SKIP</button>
        </div>
      )}
      {screen === 'done' && (
        <div className="flex flex-wrap justify-center gap-2">
          <button onClick={() => onDone('done')} className={CTA}>{doneLabel}</button>
          <button onClick={restart} className={SEC}>REPLAY</button>
        </div>
      )}
    </div>
  )
}
