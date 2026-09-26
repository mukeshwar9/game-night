import { cn } from '@/lib/utils'

// One feedback line for word submissions across the word games: the reason a
// word was rejected ("NOT IN WORD LIST", "TOO SHORT", "ALREADY FOUND"…) or the
// points it scored, announced politely to screen readers. The live region
// stays mounted (only its text changes) so announcements are not dropped;
// `id` restarts the shake for repeated rejections.
export default function WordFeedback({ message, tone = 'info', id, className }) {
  const toneClass = tone === 'bad' ? 'text-retro-danger' : tone === 'ok' ? 'text-retro-win' : 'text-retro-dim'
  return (
    <p role="status" aria-live="polite" className={cn('min-h-[1.25rem] text-center font-pixel text-[9px] tracking-wider', toneClass, className)}>
      {message ? (
        <span key={id} className="inline-block" style={tone === 'bad' ? { animation: 'arrows-shake 0.38s ease' } : undefined}>
          {tone === 'bad' ? '✗ ' : tone === 'ok' ? '✓ ' : ''}{message}
        </span>
      ) : null}
    </p>
  )
}
