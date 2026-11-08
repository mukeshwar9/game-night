// SKETCH's MATCH SETUP (S2): one summary line in the lobby that everyone sees
// ("2 DRAWS · 75 S · 2 HINTS"), with EDIT for the host, which opens a sheet
// with DRAWS EACH, DRAW TIME and LETTER HINTS. Each tap saves at once to the
// room's `sketchConfig`; START copies it into the round. Rules and numbers:
// src/lib/sketchConfigLogic.js.
import { useState } from 'react'
import { ref, set } from 'firebase/database'
import { toast } from 'sonner'
import { db } from '../lib/firebase'
import BottomSheet from './BottomSheet'
import useBusy from '@/hooks/useBusy'
import { normalizeTimerScale } from '../lib/timerScale'
import {
  DRAW_CHOICES, DRAW_TIME_CHOICES, HINT_CHOICES, DRAWS_SUB, HINTS_SUB,
  normalizeSketchConfig, withSetup, drawsFor, setupSummary, setupFooter,
} from '../lib/sketchConfigLogic'
import { cn } from '@/lib/utils'

function Choice({ label, sub, choices, value, format = String, onPick, saving, disabled }) {
  return (
    <div className={cn('space-y-1', disabled && 'opacity-50')} role="group" aria-label={label}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-pixel text-[9px] tracking-widest text-retro-text">{label}</p>
        {saving && <p className="font-pixel text-[8px] text-retro-cta">SAVING…</p>}
      </div>
      <div className="flex gap-1.5">
        {choices.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => onPick(c)}
            aria-pressed={value === c}
            disabled={disabled}
            className={cn(
              'min-h-11 flex-1 rounded border-2 font-pixel text-[10px] transition press',
              value === c ? 'border-retro-cta bg-retro-cta text-retro-bg' : 'border-retro-border text-retro-text',
            )}
          >
            {format(c)}
          </button>
        ))}
      </div>
      <p className="font-pixel text-[8px] leading-relaxed text-retro-dim">{sub}</p>
    </div>
  )
}

/**
 * @param {{ gameId: string, config: any, playerCount: number, timerScale: any, canEdit: boolean,
 *   wordsLabel?: string | null, wordsRow?: (open: (view: string) => void, turns: number) => any, wordsView?: (back: () => void, close: () => void) => any }} props
 * `wordsLabel` adds the custom-words count to the summary; `wordsRow` and
 * `wordsView` add the CUSTOM WORDS row and its second view inside the sheet.
 */
export default function SketchSetup({ gameId, config, playerCount, timerScale, canEdit, wordsLabel = null, wordsRow = null, wordsView = null }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState('setup')
  const [savingField, setSavingField] = useState(null)
  const [saving, runSave] = useBusy()
  const c = normalizeSketchConfig(config)
  const scale = normalizeTimerScale(timerScale)
  const draws = drawsFor(c, playerCount)

  const save = (field, value) => runSave(async () => {
    setSavingField(field)
    try {
      await set(ref(db, `games/${gameId}/sketchConfig`), withSetup(config, field, value))
    } finally {
      setSavingField(null)
    }
  }, () => toast.error("COULDN'T SAVE SETUP — TRY AGAIN"))

  const summary = `${setupSummary(c, playerCount)}${wordsLabel ? ` · ${wordsLabel}` : ''}`
  const close = () => { setOpen(false); setView('setup') }
  return (
    <>
      <div className="flex items-center justify-between gap-2 rounded border border-retro-border bg-retro-card px-3 py-1.5" data-testid="sketch-setup-line">
        <div className="min-w-0 text-left">
          <p className="font-pixel text-[8px] tracking-widest text-retro-dim">{canEdit ? 'MATCH SETUP' : 'HOST PICKS'}</p>
          <p className="font-pixel text-[9px] leading-relaxed text-retro-text">{summary}</p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => { setView('setup'); setOpen(true) }}
            className="min-h-11 shrink-0 rounded border border-retro-cta px-3 font-pixel text-[9px] text-retro-cta transition press"
          >
            EDIT
          </button>
        )}
      </div>
      {open && (
        <BottomSheet onClose={close} ariaLabel="Match setup">
          {view !== 'setup' && wordsView ? wordsView(() => setView('setup'), close) : (
            <div className="space-y-4 p-4" data-testid="sketch-setup-sheet">
              <div className="text-center">
                <p className="font-pixel text-[11px] tracking-widest text-retro-text">MATCH SETUP</p>
                <p className="mt-1 font-pixel text-[8px] text-retro-dim">HOST ONLY · LOCKS AT START</p>
              </div>
              <Choice
                label="DRAWS EACH"
                sub={DRAWS_SUB[draws]}
                choices={DRAW_CHOICES}
                value={draws}
                onPick={v => save('draws', v)}
                saving={saving && savingField === 'draws'}
              />
              <Choice
                label="DRAW TIME"
                sub="SECONDS A DRAWING"
                choices={DRAW_TIME_CHOICES}
                value={c.drawS}
                onPick={v => save('drawS', v)}
                saving={saving && savingField === 'drawS'}
                disabled={scale === 0}
              />
              <Choice
                label="LETTER HINTS"
                sub={HINTS_SUB[c.hints]}
                choices={HINT_CHOICES}
                value={c.hints}
                format={v => (v === 0 ? 'OFF' : String(v))}
                onPick={v => save('hints', v)}
                saving={saving && savingField === 'hints'}
              />
              <p className="text-center font-pixel text-[8px] leading-relaxed text-retro-cta" data-testid="sketch-setup-estimate">
                {setupFooter({ players: Math.max(playerCount, 2), draws, drawS: c.drawS, timerScale: scale })}
              </p>
              {wordsRow && wordsRow(setView, Math.max(playerCount, 2) * draws)}
              <button
                type="button"
                onClick={close}
                className="min-h-11 w-full rounded bg-retro-cta font-pixel text-[10px] text-retro-bg transition press"
              >
                DONE
              </button>
            </div>
          )}
        </BottomSheet>
      )}
    </>
  )
}
