import { toast } from 'sonner'
import useBusy from '../hooks/useBusy'
import { cn } from '@/lib/utils'

// Full-screen confirm for a host action (kick, lock, transfer host, new
// night) — same danger-toned vocabulary as Game.jsx's LEAVE MATCH? confirm.
// The confirm button follows the useBusy convention: busy set synchronously,
// disabled while busy, an "…ING" label, a toast on failure; the dialog closes
// once the action resolves.
export default function ConfirmDialog({ title, message, confirmLabel, busyLabel, errorMsg, onConfirm, onClose, danger = true }) {
  const [busy, run] = useBusy()
  const confirm = () => run(async () => {
    await onConfirm()
    onClose()
  }, () => toast.error(errorMsg || `${confirmLabel} FAILED — CHECK CONNECTION`))

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className={cn(
        'w-full max-w-xs bg-retro-card border-2 rounded p-5 text-center space-y-4',
        danger ? 'border-retro-danger/60' : 'border-retro-cta/60',
      )}>
        <p className={cn(
          'font-pixel text-[11px] tracking-widest',
          danger ? 'text-retro-danger text-glow-danger' : 'text-retro-cta text-glow-cta',
        )}>{title}</p>
        {message && <p className="font-mono text-[11px] text-retro-dim leading-relaxed">{message}</p>}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 px-4 py-2.5 border border-retro-border text-retro-text font-pixel text-[10px] rounded hover:border-retro-p1/50 transition-all active:scale-95 disabled:opacity-50"
          >
            CANCEL
          </button>
          <button
            onClick={confirm}
            disabled={busy}
            className={cn(
              'flex-1 px-4 py-2.5 text-retro-bg font-pixel text-[10px] rounded transition-all active:scale-95 disabled:opacity-50',
              danger ? 'bg-retro-danger hover:shadow-neon-danger' : 'bg-retro-cta hover:shadow-neon-cta',
            )}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
