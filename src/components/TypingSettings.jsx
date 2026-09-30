import { normalizeTypingConfig, TYPING_LENGTHS } from '../lib/typingLogic'
import { cn } from '@/lib/utils'

const LENGTH_LABELS = { short: 'Short', medium: 'Medium', long: 'Long' }

export default function TypingSettings({ config, disabled = false, busy = false, onChange }) {
  const value = normalizeTypingConfig(config)
  const blocked = disabled || busy
  const optionClass = (selected) => cn(
    'min-h-11 flex-1 rounded border px-3 py-2 font-pixel text-[9px] transition-colors motion-reduce:transition-none',
    selected
      ? 'border-retro-cta bg-retro-tint-cta text-retro-cta'
      : 'border-retro-border bg-retro-card text-retro-dim hover:border-retro-p1/60 hover:text-retro-text',
    blocked && 'cursor-not-allowed opacity-60',
  )

  const patch = (changes) => onChange?.(changes)
  return (
    <section className="bg-retro-card border border-retro-border rounded p-3 space-y-3" aria-label="Typing Race setup">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-pixel text-[9px] text-retro-text">QUOTE SETUP</h3>
        <span className="font-pixel text-[8px] text-retro-dim">{busy ? 'SAVING…' : disabled ? 'HOST CONFIG' : 'HOST ONLY · LOCKS AT START'}</span>
      </div>

      <fieldset disabled={blocked} className="space-y-1.5">
        <legend className="font-pixel text-[8px] text-retro-dim mb-1">QUOTE LENGTH</legend>
        <div className="flex gap-1.5" role="group" aria-label="Quote length">
          {TYPING_LENGTHS.map(length => (
            <button
              key={length}
              type="button"
              aria-pressed={value.length === length}
              onClick={() => patch({ length })}
              className={optionClass(value.length === length)}
            >
              {LENGTH_LABELS[length]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        {[
          ['punctuation', 'Punctuation', 'Commas · periods · apostrophes · ?'],
          ['numbers', 'Numbers', 'Use digits 0–9'],
        ].map(([key, label, hint]) => (
          <button
            key={key}
            type="button"
            aria-pressed={value[key]}
            disabled={blocked}
            onClick={() => patch({ [key]: !value[key] })}
            className={cn(
              'min-h-11 rounded border px-2 py-2 text-left transition-colors motion-reduce:transition-none',
              value[key] ? 'border-retro-cta bg-retro-tint-cta' : 'border-retro-border bg-retro-surface',
              blocked && 'cursor-not-allowed opacity-60',
            )}
          >
            <span className={cn('block font-pixel text-[8px]', value[key] ? 'text-retro-cta' : 'text-retro-text')}>
              {label} · {value[key] ? 'ON' : 'OFF'}
            </span>
            <span className="block font-mono text-[9px] text-retro-dim mt-1">{hint}</span>
          </button>
        ))}
      </div>

      <p className="font-mono text-[10px] leading-relaxed text-retro-dim">
        Same original quote and settings for every racer. Time and word modes wait for vetted shared content and fair stop rules.
      </p>
    </section>
  )
}
