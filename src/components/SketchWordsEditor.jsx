import { useState } from 'react'
import {
  MAX_CUSTOM_WORDS, WORD_MODES, MODE_COPY,
  addWords, addFeedback, onlyModeWarning,
} from '../lib/sketchWordsLogic'
import { cn } from '@/lib/utils'

// SKETCH's custom word editor: the second view of the MATCH SETUP sheet
// (SketchSetup), never a sheet of its own — the app does not stack sheets.
// Every action saves at once through `onSave(change)` (the page's busy-wrapped
// transaction, resolving true on success); the text box stays local until ADD.
// `words` is the room's list, normalized (sketchWordsLogic.normalizeSketchWords).
export default function SketchWordsEditor({ words, turns, saving = false, onSave, onBack, onDone }) {
  const [text, setText] = useState('')
  const [feedback, setFeedback] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const count = words.list.length
  const warning = onlyModeWarning({ count, mode: words.mode, turns })

  const add = async () => {
    const result = addWords(words.list, text)
    setFeedback(addFeedback(result))
    if (result.added === 0) return // keep the text, so a refused word can be fixed
    if (await onSave?.({ add: text })) setText('')
  }

  const clearAll = async () => {
    if (!confirmClear) { setConfirmClear(true); return }
    setConfirmClear(false)
    setFeedback('')
    await onSave?.({ clear: true })
  }

  return (
    <div className="space-y-3 text-left" data-testid="sketch-words-editor">
      <button
        type="button"
        onClick={onBack}
        className="min-h-11 -ml-1 px-1 font-pixel text-[9px] text-retro-cta transition press"
      >
        ← SETUP
      </button>

      <div className="flex items-baseline justify-between gap-2">
        <div className="space-y-1.5">
          <p className="font-pixel text-[10px] text-retro-cta text-glow-cta tracking-widest">CUSTOM WORDS</p>
          <p className="font-pixel text-[7px] text-retro-dim" aria-live="polite">
            {saving ? 'SAVING…' : 'HOST ONLY · LOCKS AT START'}
          </p>
        </div>
        <p className="shrink-0 font-pixel text-[9px] text-retro-text tabular-nums" data-testid="sketch-words-count">
          {count} / {MAX_CUSTOM_WORDS}
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="sketch-words-input" className="block font-pixel text-[7px] text-retro-dim leading-relaxed">
          ONE PER LINE, OR SPLIT WITH COMMAS
        </label>
        <div className="flex gap-1.5">
          <textarea
            id="sketch-words-input"
            value={text}
            onChange={(e) => { setText(e.target.value); setFeedback('') }}
            rows={2}
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="GRANDMA, TUK TUK, THE OFFICE"
            className="min-h-11 min-w-0 flex-1 resize-none rounded border-2 border-retro-border bg-retro-surface px-2 py-1.5 font-mono text-[12px] text-retro-text placeholder:text-retro-dim focus:border-retro-cta focus:outline-none"
          />
          <button
            type="button"
            onClick={add}
            disabled={saving || !text.trim() || count >= MAX_CUSTOM_WORDS}
            className="min-h-11 shrink-0 self-stretch rounded bg-retro-cta px-3 font-pixel text-[9px] text-retro-bg transition press disabled:opacity-40"
          >
            {saving ? 'ADDING…' : 'ADD'}
          </button>
        </div>
        <p className="font-pixel text-[7px] text-retro-dim">2–24 LETTERS · UP TO 3 WORDS</p>
        {feedback && (
          <p role="status" className="font-pixel text-[7px] text-retro-p2 leading-relaxed">{feedback}</p>
        )}
      </div>

      {count > 0 && (
        <ul className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto" aria-label="Custom words">
          {words.list.map((word) => (
            <li key={word} className="flex items-center rounded border border-retro-border bg-retro-surface pl-2 font-mono text-[11px] text-retro-text">
              <span className="py-1">{word.toUpperCase()}</span>
              <button
                type="button"
                onClick={() => onSave?.({ remove: word })}
                disabled={saving}
                aria-label={`Remove ${word}`}
                className="min-h-9 min-w-9 px-2 font-pixel text-[9px] text-retro-dim transition press hover:text-retro-p2 disabled:opacity-40"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <fieldset disabled={saving} className="space-y-1.5">
        <legend className="font-pixel text-[8px] text-retro-dim tracking-widest mb-1">HOW THEY'RE USED</legend>
        <div className="space-y-1.5" role="radiogroup" aria-label="How custom words are used">
          {WORD_MODES.map((mode) => {
            const on = words.mode === mode
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => { if (!on) onSave?.({ mode }) }}
                className={cn(
                  'w-full min-h-11 rounded border-2 px-3 py-2 text-left transition press',
                  on ? 'border-retro-cta bg-retro-tint-cta shadow-neon-cta' : 'border-retro-border bg-retro-surface hover:border-retro-cta/40',
                )}
              >
                <span className={cn('block font-pixel text-[9px]', on ? 'text-retro-cta' : 'text-retro-text')}>
                  {on ? '● ' : '○ '}{MODE_COPY[mode].label}
                </span>
                <span className="mt-1 block font-pixel text-[7px] text-retro-dim leading-relaxed">{MODE_COPY[mode].blurb}</span>
              </button>
            )
          })}
        </div>
        {warning && <p className="font-pixel text-[7px] text-retro-p2 leading-relaxed" data-testid="sketch-words-warning">{warning}</p>}
      </fieldset>

      <p className="font-pixel text-[7px] text-retro-dim leading-relaxed">
        STORED IN THE ROOM — DON&apos;T ADD ANYTHING PRIVATE. YOU SIT OUT THE ROUNDS THAT DRAW ONE.
      </p>

      <div className="flex gap-2">
        {count > 0 && (
          <button
            type="button"
            onClick={clearAll}
            onBlur={() => setConfirmClear(false)}
            disabled={saving}
            className="min-h-11 flex-1 rounded border border-retro-p2 font-pixel text-[9px] text-retro-p2 transition press disabled:opacity-40"
          >
            {confirmClear ? 'TAP AGAIN TO CLEAR' : 'CLEAR ALL'}
          </button>
        )}
        <button
          type="button"
          onClick={onDone}
          className="min-h-11 flex-1 rounded bg-retro-cta text-retro-bg font-pixel text-xs transition press hover:shadow-neon-cta"
        >
          DONE
        </button>
      </div>
    </div>
  )
}
