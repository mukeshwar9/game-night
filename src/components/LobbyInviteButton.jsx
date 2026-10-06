import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import useBusy from '../hooks/useBusy'
import { recordFunnel } from '../lib/analytics'
import { shareUrl } from '../lib/platform'
import { shareLink } from '../lib/share'

// Party lobbies stall on "NEED 3+ PLAYERS" — put the fix right under the
// message instead of behind the header's unlabeled invite icon.
export default function LobbyInviteButton() {
  const { gameId } = useParams()
  const [busy, run] = useBusy()
  const url = shareUrl(`/game/${gameId}`)
  const invite = () => run(async () => {
    const outcome = await shareLink({ text: 'Join my Game Night room!', url })
    if (outcome === 'shared') { recordFunnel('shared'); return }
    if (outcome === 'cancelled') return
    await navigator.clipboard.writeText(url)
    recordFunnel('shared')
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
