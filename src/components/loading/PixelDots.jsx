const SIZE_CLASSES = {
  sm: 'w-1 h-1',
  md: 'w-1.5 h-1.5',
  lg: 'w-2.5 h-2.5',
}

const TONE_CLASSES = {
  cta: 'bg-retro-cta',
  dim: 'bg-retro-dim',
  p1: 'bg-retro-p1',
  p2: 'bg-retro-p2',
  win: 'bg-retro-win',
}

const GLOW_CLASSES = {
  cta: 'shadow-neon-cta',
  dim: '',
  p1: 'shadow-neon-p1',
  p2: 'shadow-neon-p2',
  win: 'shadow-neon-win',
}

// Universal waiting indicator — 3 pixels hop in a discrete steps() cycle, never a smooth bounce.
export default function PixelDots({ tone = 'cta', size = 'md', glow = false, className = '' }) {
  return (
    <div className={`flex items-end gap-1 ${className}`} aria-hidden="true">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className={`${SIZE_CLASSES[size]} ${TONE_CLASSES[tone]} rounded-[1px] pixel-dot-hop ${glow ? GLOW_CLASSES[tone] : ''}`}
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </div>
  )
}
