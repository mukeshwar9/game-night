import {
  MATH_OPERATIONS, MATH_RANGES, normalizeMathConfig,
} from '../lib/mathLogic'
import { cn } from '@/lib/utils'

const OPERATION_LABELS = {
  add: ['Addition', '+'],
  subtract: ['Subtraction', '−'],
  multiply: ['Multiplication', '×'],
  divide: ['Exact division', '÷'],
}
const DIFFICULTIES = [
  ['easy', 'Easy'],
  ['progressive', 'Progressive'],
  ['hard', 'Hard'],
]
const DURATIONS = [60, 120, 180]

export default function MathSettings({ config, disabled = false, busy = false, onChange }) {
  const value = normalizeMathConfig(config)
  const blocked = disabled || busy
  const enabledCount = MATH_OPERATIONS.filter(op => value.operations[op]).length
  const optionClass = (selected) => cn(
    'min-h-11 flex-1 rounded border px-2 py-2 font-pixel text-[8px] transition-colors motion-reduce:transition-none',
    selected
      ? 'border-retro-cta bg-retro-tint-cta text-retro-cta'
      : 'border-retro-border bg-retro-card text-retro-dim hover:border-retro-p1/60 hover:text-retro-text',
    blocked && 'cursor-not-allowed opacity-60',
  )
  const patch = (changes) => onChange?.(changes)
  const setOperation = (operation) => {
    if (value.operations[operation] && enabledCount === 1) return
    patch({ operations: { [operation]: !value.operations[operation] } })
  }

  return (
    <section className="bg-retro-card border border-retro-border rounded p-3 space-y-3" aria-label="Mental Math setup">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-pixel text-[9px] text-retro-text">MATH SETUP</h3>
        <span className="font-pixel text-[8px] text-retro-dim">{busy ? 'SAVING…' : disabled ? 'HOST CONFIG' : 'HOST ONLY · LOCKS AT START'}</span>
      </div>

      <fieldset disabled={blocked} className="space-y-1.5">
        <legend className="font-pixel text-[8px] text-retro-dim mb-1">OPERATIONS</legend>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5" role="group" aria-label="Enabled operations">
          {MATH_OPERATIONS.map(operation => {
            const [label, symbol] = OPERATION_LABELS[operation]
            const selected = value.operations[operation]
            return (
              <button
                key={operation}
                type="button"
                aria-label={label}
                aria-pressed={selected}
                disabled={blocked || selected && enabledCount === 1}
                onClick={() => setOperation(operation)}
                className={cn(optionClass(selected), 'text-center disabled:cursor-not-allowed')}
              >
                <span className="block text-base leading-none">{symbol}</span>
                <span className="block mt-1">{label}</span>
              </button>
            )
          })}
        </div>
      </fieldset>

      <fieldset disabled={blocked} className="space-y-1.5">
        <legend className="font-pixel text-[8px] text-retro-dim mb-1">GAME TIME</legend>
        <div className="flex gap-1.5" role="group" aria-label="Game duration">
          {DURATIONS.map(duration => (
            <button
              key={duration}
              type="button"
              aria-label={`${duration} seconds`}
              aria-pressed={value.durationSeconds === duration}
              onClick={() => patch({ durationSeconds: duration })}
              className={optionClass(value.durationSeconds === duration)}
            >
              {duration}s
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={blocked} className="space-y-1.5">
        <legend className="font-pixel text-[8px] text-retro-dim mb-1">SHARED DIFFICULTY</legend>
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Shared difficulty">
          {DIFFICULTIES.map(([difficulty, label]) => (
            <button
              key={difficulty}
              type="button"
              aria-pressed={value.difficulty === difficulty}
              onClick={() => patch({ difficulty })}
              className={optionClass(value.difficulty === difficulty)}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={blocked} className="space-y-1.5">
        <legend className="font-pixel text-[8px] text-retro-dim mb-1">OPERAND RANGE</legend>
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Operand range">
          {MATH_RANGES.map(range => (
            <button
              key={range}
              type="button"
              aria-pressed={value.range === range}
              onClick={() => patch({ range })}
              className={optionClass(value.range === range)}
            >
              1–{range}
            </button>
          ))}
        </div>
      </fieldset>

      <p className="font-mono text-[10px] leading-relaxed text-retro-dim">
        Everyone gets same questions. Your answer clock is personal. Wrong answers reset streak and reveal solution; score never drops.
      </p>
    </section>
  )
}
