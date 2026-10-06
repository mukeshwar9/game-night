import { useState } from 'react'
import { cn } from '@/lib/utils'
import usePhaseClock from '../../hooks/usePhaseClock'
import { tagStudyMs, tagMatches } from '../../lib/nameTagsLogic'
import { sounds } from '../../lib/sounds'
import Avatar from '../Avatar'
import { CountdownCover, PhaseBar, BoardHint } from './MemoryParts'

// Name Tags board for one level: study faces with their names, the tags come off and
// the faces shuffle; pick a name, then tap its face. A wrong match ends the level.
export default function NameTagsBoard({ deal, level, startAt, clock, disabled, answer = false, revealOnFail = true, onProgress, onDone, onFail }) {
  const studyMs = tagStudyMs(level)
  const { phase, left } = usePhaseClock(startAt, [['study', studyMs]], clock)
  const [selected, setSelected] = useState(null) // a name
  const [matched, setMatched] = useState({})     // id → name
  const [wrong, setWrong] = useState(null)       // { id, name }
  const recall = phase === 'recall'
  const live = recall && !disabled && !answer && !wrong
  const order = recall ? deal.recallOrder : deal.studyOrder
  const person = id => deal.people.find(p => p.id === id)
  const cols = deal.people.length <= 4 ? 2 : deal.people.length <= 6 ? 3 : 4

  const tapFace = (id) => {
    if (!live || !selected || matched[id]) return
    if (tagMatches(deal, id, selected)) {
      const next = { ...matched, [id]: selected }
      setMatched(next)
      setSelected(null)
      sounds.step()
      const n = Object.keys(next).length
      onProgress?.(n)
      if (n === deal.people.length) { sounds.go(); onDone?.() }
    } else {
      setWrong({ id, name: selected })
      sounds.miss()
      onFail?.({ id, name: selected })
    }
  }

  const reveal = answer || (revealOnFail && wrong)
  const used = new Set(Object.values(matched))
  const hint = wrong && !reveal ? `NOT ${wrong.name}`
    : wrong ? `THAT WAS ${person(wrong.id)?.name}, NOT ${wrong.name}`
    : phase === 'study' ? 'REMEMBER WHO IS WHO'
      : !recall ? ''
        : Object.keys(matched).length === deal.people.length ? 'EVERYONE TAGGED!'
          : disabled ? '' : selected ? `NOW TAP ${selected}'S FACE` : 'PICK A NAME, THEN TAP THE FACE'

  return (
    <div className="w-full max-w-sm mx-auto space-y-3">
      <PhaseBar left={phase === 'study' ? left : null} total={studyMs} />
      <div className="relative bg-retro-surface border-2 border-retro-border rounded p-2.5">
        {phase === 'countdown' && <CountdownCover msLeft={left} label={`LEVEL ${level} · ${deal.people.length} FACES`} />}
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {order.map(id => {
            const p = person(id)
            const tag = phase === 'study' || reveal ? p.name : matched[id]
            const isWrong = wrong?.id === id
            return (
              <button
                key={id}
                type="button"
                disabled={!live || !selected || !!matched[id]}
                onClick={() => tapFace(id)}
                aria-label={tag ? `face tagged ${tag}` : 'untagged face'}
                className={cn(
                  'rounded-lg border-2 bg-retro-card p-1.5 flex flex-col items-center gap-1',
                  matched[id] ? 'border-retro-win' : isWrong ? 'border-retro-danger pairs-mismatch-shake' : 'border-retro-border/60',
                  live && selected && !matched[id] && 'cursor-pointer hover:border-retro-p1/60 press',
                )}
              >
                <Avatar id={p.avatar} size={72} className="w-full h-auto" />
                <span className={cn('font-pixel text-[9px] min-h-[1.4em] leading-tight', tag ? 'text-retro-text' : 'text-retro-dim')}>
                  {tag || '?'}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      {recall && !reveal && (
        <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Names">
          {deal.names.map(name => (
            <button
              key={name}
              type="button"
              disabled={!live || used.has(name)}
              onClick={() => setSelected(name)}
              aria-pressed={selected === name}
              className={cn(
                'min-h-11 px-3 rounded border-2 font-pixel text-[10px] transition-colors',
                used.has(name) ? 'border-retro-border/40 text-retro-dim line-through' : selected === name ? 'border-retro-cta bg-retro-tint-cta text-retro-text' : 'border-retro-border bg-retro-card text-retro-text hover:border-retro-p1/60',
              )}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <BoardHint tone={wrong ? 'danger' : phase === 'study' ? 'cta' : 'text'}>{hint}</BoardHint>
    </div>
  )
}
