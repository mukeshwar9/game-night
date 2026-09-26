import { cn } from '@/lib/utils'

// Settings on/off row: the whole row is the tap target (a <label> around a
// real checkbox), drawn as a switch. The input keeps native checkbox
// semantics — role="switch" only changes how it is announced — so getByLabel /
// getByRole('switch') and keyboard Space all work unchanged.
export default function SwitchRow({ label, checked, onChange, ariaLabel, className = '' }) {
  return (
    <label className={cn('flex min-h-11 cursor-pointer items-center justify-between gap-3 font-pixel text-[9px] text-retro-text tracking-widest', className)}>
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        aria-label={ariaLabel}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative h-6 w-11 shrink-0 rounded-full border-2 border-retro-border bg-retro-surface transition-colors
          peer-checked:border-retro-cta peer-checked:bg-retro-tint-cta
          peer-focus-visible:ring-2 peer-focus-visible:ring-retro-p1
          after:absolute after:left-0.5 after:top-1/2 after:h-4 after:w-4 after:-translate-y-1/2 after:rounded-full after:bg-retro-dim after:transition-transform
          peer-checked:after:translate-x-5 peer-checked:after:bg-retro-cta"
      />
    </label>
  )
}
