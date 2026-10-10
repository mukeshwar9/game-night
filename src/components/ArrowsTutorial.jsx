import { useState } from 'react'
import ArrowsLesson from './ArrowsLesson'
import { ARROWS_LESSONS, getLesson } from '../lib/arrowsLessonsLogic'
import { TUTORIAL_DONE_KEY, markTutorialDone, nextTutorialKind, parseTutorialDone } from '../lib/arrowsTutorialLogic'
import { cn } from '@/lib/utils'

// The guided TUTORIAL track: every Arrows lesson in campaign order, a done mark
// per lesson kept on this device, NEXT LESSON after each one. Taps are practice
// and never cost lives (ArrowsLesson). `startKind` opens straight into that
// lesson; `onExit` fires on BACK from the list.

const readDone = () => {
  try { return parseTutorialDone(localStorage.getItem(TUTORIAL_DONE_KEY)) } catch { return [] }
}
const writeDone = (done) => {
  try { localStorage.setItem(TUTORIAL_DONE_KEY, JSON.stringify(done)) } catch { /* storage blocked: the marks last this visit only */ }
}

const BTN = 'min-h-11 px-3 py-2 font-pixel text-[9px] rounded transition press'

export default function ArrowsTutorial({ onExit, startKind = null }) {
  const [done, setDone] = useState(readDone)
  const [open, setOpen] = useState(() => (getLesson(startKind) ? startKind : null))
  // Bumped so a NEXT LESSON into a fresh kind remounts ArrowsLesson.
  const [run, setRun] = useState(0)

  const finish = (how) => {
    if (how === 'done' && open) {
      const next = markTutorialDone(done, open)
      if (next !== done) { setDone(next); writeDone(next) }
    }
    setOpen(null)
  }

  if (open) {
    const next = nextTutorialKind(open)
    const lesson = getLesson(open)
    return (
      <section className="space-y-2">
        <button onClick={() => setOpen(null)} className="min-h-11 -ml-1 px-1 font-pixel text-[9px] text-retro-dim hover:text-retro-text press">‹ TUTORIAL</button>
        <ArrowsLesson
          key={`${open}-${run}`}
          kind={open}
          badge={`LESSON ${ARROWS_LESSONS.indexOf(lesson) + 1} OF ${ARROWS_LESSONS.length}`}
          doneLabel={next ? 'NEXT LESSON' : 'FINISH'}
          onDone={(how) => {
            if (how === 'done' && next) {
              const marked = markTutorialDone(done, open)
              if (marked !== done) { setDone(marked); writeDone(marked) }
              setRun((r) => r + 1)
              setOpen(next)
            } else finish(how)
          }}
        />
      </section>
    )
  }

  const left = ARROWS_LESSONS.filter((l) => !done.includes(l.kind))
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button onClick={onExit} className="min-h-11 -ml-1 px-1 font-pixel text-[9px] text-retro-dim hover:text-retro-text press">‹ BACK</button>
        <span className="font-pixel text-[8px] text-retro-dim">{done.length} / {ARROWS_LESSONS.length} DONE</span>
      </div>
      <p className="font-pixel text-[10px] text-retro-cta text-glow-cta tracking-widest">TUTORIAL</p>
      <p className="font-mono text-[11px] leading-relaxed text-retro-text">
        EVERY ARROW TYPE, THREE TAPS EACH. NO LIVES LOST. THE LEVEL SHOWN IS WHERE THE CAMPAIGN MEETS IT.
      </p>
      {left.length > 0 && (
        <button onClick={() => setOpen(left[0].kind)} className={cn(BTN, 'w-full bg-retro-cta text-retro-bg hover:shadow-neon-cta')}>
          {done.length === 0 ? 'START HERE' : 'CONTINUE'} · {left[0].name}
        </button>
      )}
      <ul>
        {ARROWS_LESSONS.map((lesson, i) => {
          const isDone = done.includes(lesson.kind)
          return (
            <li key={lesson.kind} className="border-b border-retro-border/50">
              <button
                onClick={() => setOpen(lesson.kind)}
                aria-label={`${lesson.name}, ${isDone ? 'done' : 'not done yet'}`}
                className="w-full min-h-11 grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 py-1.5 text-left hover:bg-retro-surface/40 press-card"
              >
                <span className={cn('font-pixel text-[10px] text-center', isDone ? 'text-retro-win' : 'text-retro-dim')} aria-hidden="true">{isDone ? '✓' : i + 1}</span>
                <span className={cn('font-pixel text-[8px] leading-relaxed', isDone ? 'text-retro-text' : 'text-retro-dim')}>{lesson.name}</span>
                <span className="font-pixel text-[7px] text-retro-dim">LEVEL {lesson.level}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
