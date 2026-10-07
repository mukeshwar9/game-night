import { useState } from 'react'
import ArrowsBoard from './ArrowsBoard'
import ArrowsLesson from './ArrowsLesson'
import { ARROWS_ENDLESS_EXAMPLES, ARROWS_LESSONS, lessonLevel } from '../lib/arrowsLessonsLogic'
import { ARROWS_TWIST_TIPS, isLevelUnlocked } from '../lib/arrowsLevelsLogic'
import { readArrowsProgress } from '../lib/arrowsProgress'
import { cn } from '@/lib/utils'

// ARROW TYPES: every special arrow with a TRY IT that replays its lesson in
// place. Shown in Arrows' HOW TO PLAY (registry `RulesExtra`) and behind the
// "?" in a solo level's header. Kinds the player has not reached in the
// campaign stay hidden behind "MEET IT AT LEVEL N" so they are not spoiled.
// `highlight` (kind keys) marks the kinds on the current board.
export default function ArrowTypes({ highlight = [] }) {
  const [open, setOpen] = useState(null)
  const [progress] = useState(readArrowsProgress)

  if (open) {
    return (
      <section className="space-y-2">
        <button onClick={() => setOpen(null)} className="min-h-11 -ml-1 px-1 font-pixel text-[9px] text-retro-dim hover:text-retro-text">‹ ARROW TYPES</button>
        <ArrowsLesson kind={open} onDone={() => setOpen(null)} doneLabel="DONE" />
      </section>
    )
  }

  return (
    <section className="space-y-1.5">
      <p className="font-pixel text-[9px] text-retro-cta tracking-widest">ARROW TYPES</p>
      <ul>
        {ARROWS_LESSONS.map((lesson) => {
          const reached = isLevelUnlocked(progress, lesson.level)
          const here = highlight.includes(lesson.kind)
          return (
            <li key={lesson.kind} className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 py-1.5 border-b border-retro-border/50">
              {reached ? (
                <ArrowsBoard level={lessonLevel(lesson)} gone={Array(lesson.board.arrows.length).fill(false)} compact label={`${lesson.name} example`} />
              ) : (
                <span className="aspect-square flex items-center justify-center rounded border border-retro-border bg-retro-surface font-pixel text-[10px] text-retro-dim" aria-hidden="true">?</span>
              )}
              <span className="min-w-0">
                <span className={cn('block font-pixel text-[8px] leading-relaxed', reached ? 'text-retro-text' : 'text-retro-dim')}>
                  {reached ? lesson.name : '???'}
                  {here && <span className="ml-1.5 text-retro-cta">· ON THIS BOARD</span>}
                </span>
                <span className="block font-pixel text-[7px] text-retro-dim leading-relaxed">
                  {reached ? `FROM LEVEL ${lesson.level}` : `MEET IT AT LEVEL ${lesson.level}`}
                </span>
              </span>
              {reached ? (
                <button
                  onClick={() => setOpen(lesson.kind)}
                  aria-label={`Try the ${lesson.name.toLowerCase()} lesson`}
                  className="min-h-9 px-2.5 py-1.5 font-pixel text-[8px] rounded border border-retro-border text-retro-dim hover:border-retro-cta/50 hover:text-retro-text press"
                >
                  TRY IT
                </button>
              ) : <span />}
            </li>
          )
        })}
      </ul>
      {/* Endless-only twists: no lesson, just a dotted route and the rule. */}
      <p className="pt-2 font-pixel text-[9px] text-retro-cta tracking-widest">ENDLESS TWISTS</p>
      <ul>
        {ARROWS_ENDLESS_EXAMPLES.map((ex) => (
          <li key={ex.kind} className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3 py-1.5 border-b border-retro-border/50">
            <ArrowsBoard level={lessonLevel(ex)} gone={[false]} preview={0} compact label={`${ex.name} example`} />
            <span className="min-w-0">
              <span className="block font-pixel text-[8px] leading-relaxed text-retro-text">
                {ex.name}
                {highlight.includes(ex.kind) && <span className="ml-1.5 text-retro-cta">· ON THIS BOARD</span>}
              </span>
              <span className="block font-pixel text-[7px] text-retro-dim leading-relaxed">{ARROWS_TWIST_TIPS[ex.kind]}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
