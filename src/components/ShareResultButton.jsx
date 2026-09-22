import { useState } from 'react'
import { toast } from 'sonner'
import { shareResult } from '@/lib/shareCard'
import { cn } from '@/lib/utils'

// F-46: the standardized SHARE trigger for bespoke end screens. Standard
// (GameStatus-driven) games already render one; custom pages wire this in so
// every match end offers the same share card (PLAY AGAIN · SHARE · TRY NEXT ·
// SWITCH GAME checklist). Same styling as GameStatus's inline ShareButton;
// busy handled internally (synchronous guard, "BUILDING…" label, error toast
// on card failure) per the async-action busy convention.
export default function ShareResultButton({ gameLabel, headline, sub, accentVar, url, className = '' }) {
  const [busy, setBusy] = useState(false)

  const onClick = async () => {
    if (busy) return
    setBusy(true)
    try {
      const ok = await shareResult({ gameLabel, headline, sub, accentVar, url })
      if (!ok) toast.error("COULDN'T BUILD SHARE CARD — TRY AGAIN")
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        'min-h-11 px-6 py-2.5 min-w-[6.5rem] border-2 border-retro-border text-retro-text font-pixel text-xs',
        'rounded transition-all active:scale-95 disabled:opacity-50',
        'hover:border-retro-p1/50 hover:text-retro-p1',
        className,
      )}
    >
      {busy ? 'BUILDING…' : 'SHARE'}
    </button>
  )
}
