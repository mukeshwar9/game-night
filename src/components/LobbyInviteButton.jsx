import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import useBusy from '../hooks/useBusy'

// Party lobbies stall on "NEED 3+ PLAYERS" — put the fix right under the
// message instead of behind the header's unlabeled invite icon.
export default function LobbyInviteButton() {
  const { gameId } = useParams()
  const [busy, run] = useBusy()
  const url = `${window.location.origin}/game/${gameId}`
  const invite = () => run(async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'Game Night', text: 'Join my Game Night room!', url }); return } catch { /* cancelled */ }
    }
    await navigator.clipboard.writeText(url)
    toast.success('LINK COPIED!')
  }, () => toast.error("COULDN'T SHARE — COPY THE LINK FROM THE ADDRESS BAR"))
  return (
    <button
      onClick={invite}
      disabled={busy}
      className="w-full min-h-12 bg-retro-cta text-retro-bg font-pixel text-[11px] tracking-widest rounded hover:shadow-neon-cta transition-all active:scale-[0.98] disabled:opacity-50"
    >
      {busy ? 'SHARING…' : 'SHARE INVITE LINK'}
    </button>
  )
}
