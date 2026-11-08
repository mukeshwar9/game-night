import { useState } from 'react'
import BottomSheet from './BottomSheet'
import {
  DRAW_CHOICES, DRAW_TIME_CHOICES, HINT_CHOICES, DRAWS_BLURB, HINTS_BLURB,
  resolveSketchSetup, sketchSetupSummary, estimateLines,
} from '../lib/sketchConfigLogic'
import { timersOff } from '../lib/timerScale'
import { cn } from '@/lib/utils'

// SKETCH's match setup in the lobby: one summary line everyone reads
// ("2 DRAWS · 75 S · 2 HINTS", defaults included), with EDIT for the host,
// which opens the MATCH SETUP sheet. Each tap saves at once (`onSave` is the
// page's busy-wrapped write); START copies the values into the round.
//
// The sheet's rows end with the estimate; `children` renders after it and
// before DONE, the place for further setup rows (custom words).
export default function SketchSetup({ config, playerCount, timerScale, canEdit, saving = false, onSave, children }) {
  const [open, setOpen] = useState(false)
  const setup = resolveSketchSetup(config, playerCount)
  const summary = sketchSetupSummary(setup)
  const sheetOpen = open && canEdit

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
            onClick={() => setOpen(true)}
            className="shrink-0 min-h-11 px-3 rounded border-2 border-retro-cta text-retro-cta font-pixel text-[9px] transition press hover:shadow-neon-cta"
          >
            EDIT
          </button>
        )}
      </div>

      {sheetOpen && (
        <BottomSheet onClose={() => setOpen(false)} ariaLabel="Match setup">
          <SetupSheet
            setup={setup}
            playerCount={playerCount}
            timerScale={timerScale}
            saving={saving}
            onSave={onSave}
            onDone={() => setOpen(false)}
          >
            {children}
          </SetupSheet>
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
      <div className="flex items-center justify-between gap-2">
        <p className="font-pixel text-[10px] text-retro-cta text-glow-cta tracking-widest">MATCH SETUP</p>
        <span className="font-pixel text-[7px] text-retro-dim" aria-live="polite">
          {saving ? 'SAVING…' : 'HOST ONLY · LOCKS AT START'}
        </span>
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
