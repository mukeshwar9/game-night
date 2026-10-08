import { toast } from 'sonner'
import useBusy from '../hooks/useBusy'
import { track } from '../lib/track'
import { shareUrl } from '../lib/platform'
import { shareLink } from '../lib/share'
import { getGameConfig } from '../lib/games'
import { challengePath, challengeText } from '../lib/soloChallengeLogic'
import { cn } from '@/lib/utils'

// End-of-run call to action for a new personal best: share a link that opens
// the same solo game with the score to beat. Render it only for a high score
// (soloChallengeLogic.canChallenge).
export default function ChallengeButton({ type, label = getGameConfig(type)?.label ?? type.toUpperCase(), score, unit = '', className }) {
  const [busy, run] = useBusy()
  const url = shareUrl(challengePath(type, score))
  const text = challengeText({ label, score, unit })

  const challenge = () => run(async () => {
    const outcome = await shareLink({ title: `Beat my ${label} score`, text, url })
    if (outcome === 'shared') { track('invite_shared', { surface: 'solo_challenge', method: 'native_share' }); return }
    if (outcome === 'cancelled') return
    await navigator.clipboard.writeText(`${text} ${url}`)
    track('invite_shared', { surface: 'solo_challenge', method: 'copy' })
    toast.success('CHALLENGE COPIED — SEND IT TO A FRIEND!')
  }, () => toast.error("COULDN'T SHARE — TRY AGAIN"))

  return (
    <button
      type="button"
      onClick={challenge}
      disabled={busy}
      className={cn(
        'min-h-11 px-5 py-2.5 rounded border-2 border-retro-win text-retro-win font-pixel text-[10px] tracking-wider',
        'hover:shadow-neon-win transition press disabled:opacity-50',
        className,
      )}
    >
      {busy ? 'SHARING…' : 'CHALLENGE A FRIEND'}
    </button>
  )
}
