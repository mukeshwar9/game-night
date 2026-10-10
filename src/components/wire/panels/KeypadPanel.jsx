// WIRE CROSSED Tech panel: GLYPHS. Tier II+ has five keys; tier III keys can
// be mirrored glyphs (ids 24-31), announced in the aria-label too.
import { cn } from '@/lib/utils'
import { isMirroredGlyph, pressedCount } from '../../../lib/wireLogic'
import WireGlyph from '../WireGlyph'

export default function KeypadPanel({ module, wire, index, onAction, disabled }) {
  const done = pressedCount(wire, index)
  const lit = new Set(module.solution.slice(0, done))
  const many = module.device.keys.length > 4
  return (
    <div
      className={cn('grid gap-3 mx-auto', many ? 'grid-cols-3 max-w-[22rem]' : 'grid-cols-2 max-w-[18rem]')}
      role="group"
      aria-label={`Glyph keypad, ${module.device.keys.length} keys`}
    >
      {module.device.keys.map((g, k) => (
        <button
          key={g}
          type="button"
          disabled={disabled || lit.has(g)}
          onClick={() => onAction({ mod: index, kind: 'press', glyph: g })}
          aria-label={`Glyph key ${k + 1}${lit.has(g) ? ', pressed' : ''}${isMirroredGlyph(g) ? ', mirrored' : ''}`}
          className={cn(
            'aspect-square rounded-lg border-2 flex flex-col items-center justify-center gap-1 bg-retro-deep',
            lit.has(g) ? 'border-retro-win text-retro-win shadow-neon-win' : 'border-retro-border text-retro-text hover:border-retro-cta',
          )}
        >
          <WireGlyph id={g} size={many ? 40 : 52} />
          <span className="font-pixel text-[7px] text-retro-dim">{k + 1}</span>
        </button>
      ))}
    </div>
  )
}
