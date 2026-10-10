import { FC_PACE_IDS, normalizeFcConfig } from '../lib/firstCutLogic'
import { cn } from '@/lib/utils'

// First Cut's table options: the two twists and the pace. Used by the host's
// lobby (RaceShell `Config`: change is a partial patch) and by the one-phone
// and bot pages (the page keeps the whole config).

const PACE_LABELS = { slow: 'SLOW', medium: 'MEDIUM' }
const PACE_HINTS = { slow: 'Each item stays 1.2–1.9 s', medium: 'Each item stays 0.95–1.5 s' }
const TWISTS = [
  ['flip', 'RULE FLIP', 'A card by the plate says what counts, and changes every few items.'],
  ['gold', 'GOLD & ROTTEN', 'Gold fruit is worth 3 and leaves fast. Rotten fruit costs a point. Far behind? You are freed sooner.'],
]

export default function FirstCutSettings({ config, disabled = false, busy = false, onChange, title = 'TABLE SETUP', note = null }) {
  const value = normalizeFcConfig(config)
  const blocked = disabled || busy
  const optionClass = (selected) => cn(
    'min-h-11 flex-1 rounded border px-3 py-2 font-pixel text-[9px] transition-colors motion-reduce:transition-none',
    selected
      ? 'border-retro-cta bg-retro-tint-cta text-retro-cta'
      : 'border-retro-border bg-retro-card text-retro-dim hover:border-retro-p1/60 hover:text-retro-text',
    blocked && 'cursor-not-allowed opacity-60',
  )
  return (
    <section className="bg-retro-card border border-retro-border rounded p-3 space-y-3" aria-label="First Cut setup">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-pixel text-[9px] text-retro-text">{title}</h3>
        <span className="font-pixel text-[8px] text-retro-dim">{busy ? 'SAVING…' : note}</span>
      </div>

      <fieldset disabled={blocked} className="space-y-1.5">
        <legend className="font-pixel text-[8px] text-retro-dim mb-1">PACE</legend>
        <div className="flex gap-1.5" role="group" aria-label="Pace">
          {FC_PACE_IDS.map(pace => (
            <button
              key={pace}
              type="button"
              aria-pressed={value.pace === pace}
              onClick={() => onChange?.({ pace })}
              className={optionClass(value.pace === pace)}
            >
              {PACE_LABELS[pace]}
            </button>
          ))}
        </div>
        <p className="font-mono text-[10px] text-retro-dim">{PACE_HINTS[value.pace]}</p>
      </fieldset>

      <div className="grid grid-cols-1 gap-2">
        {TWISTS.map(([key, label, hint]) => (
          <button
            key={key}
            type="button"
            aria-pressed={value[key]}
            disabled={blocked}
            onClick={() => onChange?.({ [key]: !value[key] })}
            className={cn(
              'min-h-11 rounded border px-2 py-2 text-left transition-colors motion-reduce:transition-none',
              value[key] ? 'border-retro-cta bg-retro-tint-cta' : 'border-retro-border bg-retro-surface',
              blocked && 'cursor-not-allowed opacity-60',
            )}
          >
            <span className={cn('block font-pixel text-[8px]', value[key] ? 'text-retro-cta' : 'text-retro-text')}>
              {label} · {value[key] ? 'ON' : 'OFF'}
            </span>
            <span className="block font-mono text-[10px] leading-relaxed text-retro-dim mt-1">{hint}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
