import { useState } from 'react'
import BottomSheet from './BottomSheet'
import {
  DRAW_CHOICES, DRAW_TIME_CHOICES, HINT_CHOICES, DRAWS_BLURB, HINTS_BLURB,
  resolveSketchSetup, sketchSetupSummary, estimateLines,
} from '../lib/sketchConfigLogic'
import { wordsSummary, wordsRowLabel, onlyModeWarning } from '../lib/sketchWordsLogic'
import { timersOff } from '../lib/timerScale'
import SketchWordsEditor from './SketchWordsEditor'
import { cn } from '@/lib/utils'

// SKETCH's match setup in the lobby: one summary line everyone reads
// ("2 DRAWS · 75 S · 2 HINTS · 12 WORDS", defaults included), with EDIT for
// the host, which opens the MATCH SETUP sheet. Each tap saves at once
// (`onSave` / `onSaveWords` are the page's busy-wrapped writes); START copies
// the values and the custom words into the round.
//
// The sheet has two views: the setup rows, ending with the CUSTOM WORDS row,
// and the custom word editor that row opens (with a back link), so there is
// never a second sheet on top of the first. `words` is the room's custom
// words, normalized (sketchWordsLogic.normalizeSketchWords).
export default function SketchSetup({
  config, playerCount, timerScale, canEdit, saving = false, onSave,
  words, wordsSaving = false, onSaveWords,
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState('setup')
  const setup = resolveSketchSetup(config, playerCount)
  const wordCount = words?.list.length ?? 0
  const summary = [sketchSetupSummary(setup), wordsSummary(wordCount, canEdit)].filter(Boolean).join(' · ')
  const sheetOpen = open && canEdit
  const close = () => { setOpen(false); setView('setup') }
  const turns = Math.max(1, playerCount) * setup.draws

  return (
    <>
      <div
        className="bg-retro-surface border border-retro-border rounded px-3 py-2 flex items-center justify-between gap-2 text-left"
        data-testid="sketch-setup-line"
      >
        <div className="min-w-0">
          <p className="font-pixel text-[7px] text-retro-dim tracking-widest">{canEdit ? 'MATCH SETUP' : 'HOST PICKS'}</p>
          <p className="font-pixel text-[9px] text-retro-text mt-1 leading-relaxed" aria-label={`Match setup: ${summary}`}>{summary}</p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => { setView('setup'); setOpen(true) }}
            className="shrink-0 min-h-11 px-3 rounded border-2 border-retro-cta text-retro-cta font-pixel text-[9px] transition press hover:shadow-neon-cta"
          >
            EDIT
          </button>
        )}
      </div>

      {sheetOpen && (
        <BottomSheet onClose={close} ariaLabel={view === 'words' ? 'Custom words' : 'Match setup'}>
          {view === 'words' && words ? (
            <SketchWordsEditor
              words={words}
              turns={turns}
              saving={wordsSaving}
              onSave={onSaveWords}
              onBack={() => setView('setup')}
              onDone={close}
            />
          ) : (
            <SetupSheet
              setup={setup}
              playerCount={playerCount}
              timerScale={timerScale}
              saving={saving}
              onSave={onSave}
              onDone={close}
            >
              {words && (
                <WordsRow
                  count={wordCount}
                  mode={words.mode}
                  warning={onlyModeWarning({ count: wordCount, mode: words.mode, turns })}
                  onOpen={() => setView('words')}
                />
              )}
            </SetupSheet>
          )}
        </BottomSheet>
      )}
    </>
  )
}

function SetupSheet({ setup, playerCount, timerScale, saving, onSave, onDone, children }) {
  const off = timersOff(timerScale)
  const option = (selected) => cn(
    'min-h-11 flex-1 rounded border-2 px-1 py-1.5 font-pixel text-[11px] tabular-nums transition press',
    selected
      ? 'border-retro-cta bg-retro-tint-cta text-retro-cta shadow-neon-cta'
      : 'border-retro-border bg-retro-surface text-retro-dim hover:border-retro-cta/40',
    saving && 'cursor-not-allowed opacity-60',
  )
  const row = (label, choices, value, field, render, blurb, extraClass) => (
    <fieldset disabled={saving} className={cn('space-y-1.5', extraClass)}>
      <legend className="font-pixel text-[8px] text-retro-dim tracking-widest mb-1">{label}</legend>
      <div className="flex gap-1.5" role="group" aria-label={label}>
        {choices.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={value === c}
            onClick={() => { if (value !== c) onSave?.({ [field]: c }) }}
            className={option(value === c)}
          >
            {render(c)}
          </button>
        ))}
      </div>
      <p className="font-pixel text-[7px] text-retro-dim leading-relaxed">{blurb}</p>
    </fieldset>
  )

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="font-pixel text-[10px] text-retro-cta text-glow-cta tracking-widest">MATCH SETUP</p>
        <p className="font-pixel text-[7px] text-retro-dim" aria-live="polite">
          {saving ? 'SAVING…' : 'HOST ONLY · LOCKS AT START'}
        </p>
      </div>

      {row('DRAWS EACH', DRAW_CHOICES, setup.draws, 'draws', (n) => n, DRAWS_BLURB[setup.draws])}
      {row('DRAW TIME', DRAW_TIME_CHOICES, setup.drawS, 'drawS', (s) => s, 'SECONDS A DRAWING', off && 'opacity-60')}
      {row('LETTER HINTS', HINT_CHOICES, setup.hints, 'hints', (n) => (n === 0 ? 'OFF' : n), HINTS_BLURB[setup.hints])}

      <div className="border-t border-retro-border pt-3 space-y-1" data-testid="sketch-setup-estimate">
        {estimateLines({ players: playerCount, draws: setup.draws, drawS: setup.drawS, timerScale }).map((line) => (
          <p key={line} className="font-pixel text-[8px] text-retro-text leading-relaxed">{line}</p>
        ))}
      </div>

      {children}

      <button
        type="button"
        onClick={onDone}
        className="w-full min-h-11 rounded bg-retro-cta text-retro-bg font-pixel text-xs transition press hover:shadow-neon-cta"
      >
        DONE
      </button>
    </div>
  )
}

// The setup view's CUSTOM WORDS row: "CUSTOM WORDS · 12 WORDS · MIXED IN ›".
function WordsRow({ count, mode, warning, onOpen }) {
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={onOpen}
        className="w-full min-h-11 rounded border-2 border-retro-border bg-retro-surface px-3 py-2 flex items-center justify-between gap-2 text-left transition press hover:border-retro-cta/40"
        data-testid="sketch-words-row"
      >
        <span className="min-w-0">
          <span className="block font-pixel text-[8px] text-retro-dim tracking-widest">CUSTOM WORDS</span>
          <span className="mt-1 block font-pixel text-[9px] text-retro-text">{wordsRowLabel(count, mode)}</span>
        </span>
        <span aria-hidden="true" className="shrink-0 font-pixel text-[11px] text-retro-cta">›</span>
      </button>
      {warning && <p className="font-pixel text-[7px] text-retro-p2 leading-relaxed text-left">{warning}</p>}
    </div>
  )
}
