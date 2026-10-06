import { cn } from '@/lib/utils'

// Warnings never animate — static, so it never reads as progress.
// `away`: the player sent the app to the background (presenceLogic seatAway)
// and is most likely back in a moment.
export default function OfflineNotice({ label = 'OPPONENT', away = false, className = '' }) {
  return (
    <p className={cn('font-pixel text-[10px] text-retro-p2 text-center', className)}>
      {away ? `${label} STEPPED AWAY — BACK SOON?` : `${label} IS OFFLINE`}
    </p>
  )
}
