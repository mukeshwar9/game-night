// WIRE CROSSED Tech panel: RELAY. Stage lamps, the display (word · digit) and
// four labelled keys. Keys are addressed by position (left to right), never by
// label. The panel shows no press log: players keep it themselves. Every
// verdict comes from applyWireAction.
import { cn } from '@/lib/utils'
import { relayView } from '../../../lib/wire/modules/relay'

export default function RelayPanel({ module, wire, index, onAction, disabled, busy }) {
  const { stages, presses, stage, stageIndex, done } = relayView(module, wire, index)
  const press = (key) => onAction({ mod: index, kind: 'press', key })

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-2" role="img" aria-label={`Stage ${stageIndex + 1} of ${stages.length}`}>
        <span className="font-pixel text-[8px] text-retro-dim">STAGE</span>
        {stages.map((_, s) => (
          <span
            key={s}
            aria-hidden="true"
            className={cn(
              'inline-block w-3 h-3 rounded-sm border-2',
              s < presses.length ? 'bg-retro-win border-retro-win' : s === stageIndex ? 'bg-retro-deep border-retro-cta shadow-neon-cta' : 'bg-retro-deep border-retro-border',
            )}
          />
        ))}
      </div>
      <div
        className="w-full max-w-[20rem] rounded border-2 border-retro-border bg-retro-deep py-3 text-center font-pixel text-[16px] tracking-widest text-retro-cta text-glow-cta"
        aria-label={`Display: ${stage.word}, ${stage.digit}`}
      >
        {stage.word} · {stage.digit}
      </div>
      <div className="grid grid-cols-4 gap-2 w-full max-w-[20rem]" role="group" aria-label="Relay keys">
        {stage.labels.map((label, pos) => (
          <button
            key={pos}
            type="button"
            disabled={disabled || busy || done}
            aria-label={`Key position ${pos + 1}, label ${label}`}
            onClick={() => press(pos)}
            className="min-h-14 rounded border-2 border-retro-border bg-retro-deep font-pixel text-[14px] text-retro-text hover:border-retro-cta disabled:opacity-40"
          >
            {label}
          </button>
        ))}
      </div>
      <p className="font-pixel text-[8px] text-retro-dim text-center" aria-live="polite">
        {busy ? 'PRESSING…' : `STAGE ${stageIndex + 1} OF ${stages.length} · KEEP A LOG`}
      </p>
    </div>
  )
}
