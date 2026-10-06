import { toast } from 'sonner'
import useBusy from '../hooks/useBusy'
import { cn } from '@/lib/utils'
import BottomSheet from './BottomSheet'

// Full-screen confirm for a host action (kick, lock, transfer host, new
// night) — same danger-toned vocabulary as Game.jsx's LEAVE MATCH? confirm.
// The confirm button follows the useBusy convention: busy set synchronously,
// disabled while busy, an "…ING" label, a toast on failure; the dialog closes
// once the action resolves. A centred BottomSheet: it animates in and out,
// traps focus, and Escape or a backdrop tap close it unless busy. No history
// marker: the confirm stays out of the back stack, as before.
export default function ConfirmDialog({ title, message, confirmLabel, busyLabel, errorMsg, onConfirm, onClose, danger = true }) {
  const [busy, run] = useBusy()
  const confirm = () => run(async () => {
    await onConfirm()
    onClose()
  }, () => toast.error(errorMsg || `${confirmLabel} FAILED — CHECK CONNECTION`))

  return (
    <BottomSheet
      centered
      onClose={() => { if (!busy) onClose() }}
      history={false}
      ariaLabel={title}
      layerClassName="z-[70]"
      className={cn('text-center space-y-4', danger ? 'border-retro-danger/60' : 'border-retro-cta/60')}
    >
      <p className={cn(
        'font-pixel text-[11px] tracking-widest',
        danger ? 'text-retro-danger text-glow-danger' : 'text-retro-cta text-glow-cta',
      )}>{title}</p>
      {message && <p className="font-mono text-[11px] text-retro-dim leading-relaxed">{message}</p>}
      <div className="flex gap-2">
        <button
          onClick={onClose}
          disabled={busy}
          className="flex-1 px-4 py-2.5 border border-retro-border text-retro-text font-pixel text-[10px] rounded hover:border-retro-p1/50 transition press disabled:opacity-50"
        >
          CANCEL
        </button>
        <button
          onClick={confirm}
          disabled={busy}
          className={cn(
            'flex-1 px-4 py-2.5 text-retro-bg font-pixel text-[10px] rounded transition press disabled:opacity-50',
            danger ? 'bg-retro-danger hover:shadow-neon-danger' : 'bg-retro-cta hover:shadow-neon-cta',
          )}
        >
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </BottomSheet>
  )
}
