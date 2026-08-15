import { useState } from 'react'
import { cn } from '@/lib/utils'
import useBusy from '../hooks/useBusy'
import useModalHistory from '../hooks/useModalHistory'

export default function FirstMoverModal({ players, defaultValue = 'X', title = 'WHO GOES FIRST', onConfirm, onCancel }) {
  const [goesFirst, setGoesFirst] = useState(
    defaultValue === 'O' || defaultValue === 'random' ? defaultValue : 'X',
  )
  const [busy, run] = useBusy()
  useModalHistory(onCancel)

  const nameX = (players?.X?.name || 'PLAYER 1').toUpperCase()
  const nameO = (players?.O?.name || 'PLAYER 2').toUpperCase()

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-xs bg-retro-card border-2 border-retro-cta/60 rounded p-5 text-center space-y-4">
        <p className="font-pixel text-[11px] text-retro-cta text-glow-cta tracking-widest">{title}</p>
        <div className="flex flex-col gap-2">
          {[
            { id: 'X', label: nameX },
            { id: 'O', label: nameO },
            { id: 'random', label: 'RANDOM' },
          ].map(opt => (
            <button
              key={opt.id}
              disabled={busy}
              onClick={() => setGoesFirst(opt.id)}
              className={cn(
                'min-h-11 px-3 font-pixel text-[9px] rounded border-2 transition-all active:scale-95 truncate',
                goesFirst === opt.id
                  ? 'border-retro-cta bg-retro-tint-cta text-retro-cta shadow-neon-cta'
                  : 'border-retro-border bg-retro-surface text-retro-dim hover:border-retro-cta/40',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 px-4 py-2.5 border border-retro-border text-retro-text font-pixel text-[10px] rounded hover:border-retro-p1/50 transition-all active:scale-95 disabled:opacity-50"
          >
            CANCEL
          </button>
          <button
            onClick={() => run(() => onConfirm(goesFirst))}
            disabled={busy}
            className="flex-1 px-4 py-2.5 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50"
          >
            {busy ? 'STARTING…' : 'START'}
          </button>
        </div>
      </div>
    </div>
  )
}
