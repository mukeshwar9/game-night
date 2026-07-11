import { useRegisterSW } from 'virtual:pwa-register/react'
import useBusy from '../hooks/useBusy'

export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()
  const [busy, run] = useBusy()

  if (!needRefresh) return null

  return (
    <div className="fixed top-0 inset-x-0 z-50 flex justify-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pointer-events-none">
      <div
        role="status"
        className="pointer-events-auto flex items-center gap-3 border-2 border-retro-cta bg-retro-card
          rounded px-4 py-2.5 shadow-neon-cta animate-[update-drop_0.35s_steps(6)_both]"
      >
        <span className="font-pixel text-[10px] text-retro-cta text-glow-cta tracking-wider">
          UPDATE READY
        </span>
        <button
          onClick={() => run(() => updateServiceWorker(true))}
          disabled={busy}
          className="px-4 py-1.5 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded
            hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50"
        >
          {busy ? 'RELOADING…' : 'RELOAD'}
        </button>
        <button
          onClick={() => setNeedRefresh(false)}
          className="border border-retro-border text-retro-dim font-pixel text-[10px] px-3 py-1.5 rounded
            hover:border-retro-dim transition-colors"
        >
          LATER
        </button>
      </div>
    </div>
  )
}
