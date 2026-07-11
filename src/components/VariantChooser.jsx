import { cn } from '@/lib/utils'
import BottomSheet from './BottomSheet'

// Pre-start "choose a mode" step for games that have variants (e.g. Tic Tac Toe
// → Classic / Ultimate, Connect Four → Classic / Pop Out). `base` is the base
// registry entry; `variants` are its variant entries (those with `variantOf`).
// Runs on the shared BottomSheet primitive (M-73).
export default function VariantChooser({ base, variants, onPick, onClose }) {
  const Icon = base.Icon
  const options = [
    { type: base.type, name: 'CLASSIC', blurb: base.classicBlurb || `The original ${base.label}.` },
    ...variants.map(v => ({ type: v.type, name: v.variantLabel || v.label, blurb: v.variantBlurb || v.desc })),
  ]

  return (
    <BottomSheet onClose={onClose} ariaLabel={`${base.label} — pick a mode`} className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 text-retro-cta flex items-center justify-center">{Icon && <Icon />}</span>
          <p className="font-pixel text-[10px] text-retro-text tracking-widest">{base.label} — PICK A MODE</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="font-pixel text-[10px] text-retro-dim hover:text-retro-text transition-colors p-3 -m-2"
        >
          ✕
        </button>
      </div>

      <div className="space-y-2">
        {options.map((o, i) => (
          <button
            key={o.type}
            onClick={() => onPick(o.type)}
            className={cn(
              'w-full text-left p-3 rounded border-2 transition-all active:scale-[0.98]',
              'bg-retro-card hover:shadow-neon-cta',
              i === 0 ? 'border-retro-border hover:border-retro-cta/60' : 'border-retro-cta/40 hover:border-retro-cta',
            )}
          >
            <div className="flex items-center justify-between">
              <span className={cn('font-pixel text-[11px]', i === 0 ? 'text-retro-text' : 'text-retro-cta text-glow-cta')}>
                {o.name}
              </span>
              {i > 0 && <span className="font-pixel text-[7px] text-retro-cta/70 tracking-wider">NEW</span>}
            </div>
            <p className="font-mono text-[11px] text-retro-dim mt-1 leading-snug">{o.blurb}</p>
          </button>
        ))}
      </div>
    </BottomSheet>
  )
}
