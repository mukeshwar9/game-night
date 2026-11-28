import { parseBirthYear, stepBirthYear } from '../../lib/premium'

// The age question's input: a number box with a stepper either side, in the
// theme's own controls (the old native <select> listed 101 years and opened the
// OS picker). The sheet that holds it keeps its buttons off until `value`
// parses as a year (parseBirthYear), so nothing can be skipped.
export default function YearField({ id, value, onChange, label }) {
  const step = (delta) => onChange(String(stepBirthYear(value, delta)))
  const stepBtn = 'min-h-11 min-w-11 rounded border border-retro-border bg-retro-surface text-retro-text font-pixel text-sm press'
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block font-mono text-[12px] text-retro-text leading-relaxed">{label}</label>
      <div className="flex items-stretch gap-2">
        <button type="button" onClick={() => step(-1)} aria-label="One year earlier" className={stepBtn}>−</button>
        <input
          id={id}
          data-testid="birth-year"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          placeholder="YYYY"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
          aria-invalid={value.length === 4 && parseBirthYear(value) === null}
          className="flex-1 min-w-0 min-h-11 rounded border-2 border-retro-border bg-retro-surface text-center font-mono text-lg tracking-widest text-retro-text placeholder:text-retro-dim focus:border-retro-cta"
        />
        <button type="button" onClick={() => step(1)} aria-label="One year later" className={stepBtn}>+</button>
      </div>
    </div>
  )
}
