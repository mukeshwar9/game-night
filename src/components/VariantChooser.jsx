import { useEffect } from 'react'
import { cn } from '@/lib/utils'

// Pre-start "choose a mode" step for games that have variants (e.g. Tic Tac Toe
// → Classic / Ultimate, Connect Four → Classic / Pop Out). `base` is the base
// registry entry; `variants` are its variant entries (those with `variantOf`).
export default function VariantChooser({ base, variants, onPick, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const Icon = base.Icon
  const options = [
    { type: base.type, name: 'CLASSIC', blurb: base.classicBlurb || `The original ${base.label}.` },
    ...variants.map(v => ({ type: v.type, name: v.variantLabel || v.label, blurb: v.variantBlurb || v.desc })),
  ]

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-retro-bg border-2 border-retro-border rounded p-4 space-y-3"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 text-retro-cta flex items-center justify-center">{Icon && <Icon />}</span>
            <p className="font-pixel text-[10px] text-retro-text tracking-widest">{base.label} — PICK A MODE</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="font-pixel text-[10px] text-retro-dim hover:text-retro-text transition-colors px-1"
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
      </div>
    </div>
  )
}
