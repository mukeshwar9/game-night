import { cn } from '@/lib/utils'

// The small POPULAR / NEW mark on a game card. Words, not colour alone.
const TAGS = {
  popular: { text: 'POPULAR', cls: 'bg-retro-cta text-retro-bg' },
  new: { text: 'NEW', cls: 'bg-retro-win text-retro-bg' },
}

export default function CardTag({ tag, className }) {
  const t = TAGS[tag]
  if (!t) return null
  return (
    <span className={cn('pointer-events-none font-pixel text-[7px] leading-none tracking-wider px-1.5 py-1 rounded-sm', t.cls, className)}>
      {t.text}
    </span>
  )
}
