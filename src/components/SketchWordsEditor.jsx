// SKETCH custom words (S3): the second view of the MATCH SETUP sheet, where
// the host types or pastes their own words and picks MIX WITH DECK or CUSTOM
// ONLY. Every change saves to the room's `sketchWords` at once; START copies
// the list into the round. Rules and checks: src/lib/sketchWordsLogic.js.
import { useState } from 'react'
import { ref, set } from 'firebase/database'
import { toast } from 'sonner'
import { db } from '../lib/firebase'
import useBusy from '@/hooks/useBusy'
import {
  MAX_CUSTOM, MIN_LETTERS, MAX_LETTERS, MAX_WORDS_IN_ONE,
  normalizeWords, addWords, addMessage, wordsValue, shortListWarning,
} from '../lib/sketchWordsLogic'
import { cn } from '@/lib/utils'

const SAVE_FAIL = "COULDN'T SAVE YOUR WORDS — TRY AGAIN"

/** The CUSTOM WORDS row inside the setup sheet (host). */
export function CustomWordsRow({ words, turns, onOpen }) {
  const w = normalizeWords(words)
  const warn = shortListWarning({ mode: w.mode, count: w.list.length, turns })
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full min-h-11 rounded border-2 border-retro-border px-3 py-2 text-left transition press-card"
      data-testid="sketch-words-row"
    >
      <span className="flex items-center justify-between gap-2 font-pixel text-[9px] text-retro-text">
        <span>CUSTOM WORDS · {w.list.length} WORD{w.list.length === 1 ? '' : 'S'} · {w.mode === 'only' ? 'ONLY' : 'MIXED IN'}</span>
        <span aria-hidden="true">›</span>
      </span>
      {warn && <span className="mt-1 block font-pixel text-[8px] leading-relaxed text-retro-p2">{warn}</span>}
    </button>
  )
}

export default function SketchWordsEditor({ gameId, words, mySeat, onBack, onDone }) {
  const w = normalizeWords(words)
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState('')
  const [saving, runSave] = useBusy()

  const save = (next) => runSave(async () => {
    await set(ref(db, `games/${gameId}/sketchWords`), wordsValue({ by: mySeat, mode: next.mode, list: next.list }))
  }, () => toast.error(SAVE_FAIL))

  const add = () => {
    const r = addWords(w.list, draft)
    setNote(addMessage(r))
    if (r.added) save({ mode: w.mode, list: r.list })
    setDraft('')
  }
  const remove = (i) => save({ mode: w.mode, list: w.list.filter((_, j) => j !== i) })
  const mode = (m) => { if (m !== w.mode) save({ mode: m, list: w.list }) }
  const modeBtn = (id, title, sub) => (
    <button
      type="button"
      onClick={() => mode(id)}
      aria-pressed={w.mode === id}
      disabled={saving}
      className={cn(
        'w-full min-h-11 rounded border-2 px-3 py-1.5 text-left transition press-card disabled:opacity-60',
        w.mode === id ? 'border-retro-cta bg-retro-tint-cta' : 'border-retro-border',
      )}
    >
      <span className="block font-pixel text-[9px] text-retro-text">{title}</span>
      <span className="mt-0.5 block font-pixel text-[8px] leading-relaxed text-retro-dim">{sub}</span>
    </button>
  )

  return (
    <div className="space-y-3 p-4" data-testid="sketch-words-editor">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onBack} className="min-h-11 pr-2 font-pixel text-[9px] text-retro-cta transition press">← SETUP</button>
        <p className="font-pixel text-[11px] tracking-widest text-retro-text">CUSTOM WORDS</p>
        <p className="min-w-[4rem] text-right font-pixel text-[9px] tabular-nums text-retro-dim">{saving ? 'SAVING…' : `${w.list.length} / ${MAX_CUSTOM}`}</p>
      </div>
      <div className="space-y-1">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={3}
          aria-label="Custom words"
          placeholder="ONE PER LINE, OR SPLIT WITH COMMAS"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded border-2 border-retro-border bg-retro-surface px-3 py-2 font-mono text-[12px] text-retro-text focus:border-retro-p1 focus:outline-none"
        />
        <div className="flex items-center justify-between gap-2">
          <p className="font-pixel text-[8px] text-retro-dim">{MIN_LETTERS}–{MAX_LETTERS} LETTERS · UP TO {MAX_WORDS_IN_ONE} WORDS</p>
          <button
            type="button"
            onClick={add}
            disabled={!draft.trim() || saving || w.list.length >= MAX_CUSTOM}
            className="min-h-11 rounded bg-retro-cta px-4 font-pixel text-[9px] text-retro-bg transition press disabled:opacity-40"
          >
            ADD
          </button>
        </div>
        {note && <p role="status" className="font-pixel text-[8px] leading-relaxed text-retro-p2">{note}</p>}
      </div>
      {w.list.length > 0 && (
        <ul className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto" aria-label="Your words">
          {w.list.map((word, i) => (
            <li key={`${i}:${word}`} className="flex items-center gap-1 rounded border border-retro-border bg-retro-card pl-2 font-mono text-[11px] text-retro-text">
              {word}
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={saving}
                aria-label={`Remove ${word}`}
                className="flex h-8 w-8 items-center justify-center text-retro-dim transition press disabled:opacity-40"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {modeBtn('mix', 'MIX WITH DECK', 'ONE OF THE 3 CHOICES EACH TURN IS YOURS')}
      {modeBtn('only', 'CUSTOM ONLY', 'ALL 3 CHOICES ARE YOURS UNTIL THEY RUN OUT')}
      <p className="font-pixel text-[8px] leading-relaxed text-retro-dim">STORED IN THE ROOM — DON&apos;T ADD ANYTHING PRIVATE. WHEN YOUR WORD COMES UP YOU WATCH INSTEAD OF GUESSING.</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => { setNote(''); save({ mode: 'mix', list: [] }) }}
          disabled={saving || (w.list.length === 0 && w.mode === 'mix')}
          className="min-h-11 rounded border border-retro-p2 font-pixel text-[9px] text-retro-p2 transition press disabled:opacity-40"
        >
          CLEAR ALL
        </button>
        <button type="button" onClick={onDone} className="min-h-11 rounded bg-retro-cta font-pixel text-[9px] text-retro-bg transition press">
          DONE
        </button>
      </div>
    </div>
  )
}
