import { cn } from '@/lib/utils'

// Warnings never animate — static, so it never reads as progress.
export default function OfflineNotice({ label = 'OPPONENT', className = '' }) {
  return (
    <p className={cn('font-pixel text-[10px] text-retro-p2 text-center', className)}>
      {label} IS OFFLINE
    </p>
  )
}
