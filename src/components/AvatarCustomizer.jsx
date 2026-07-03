import Avatar from './Avatar'
import { SHAPES, TONES, makeAvatar, parseAvatar, canonicalAvatar } from '../lib/avatars'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// Static class map — literal strings so Tailwind's content scan sees every class.
const TONE_BG = {
  p1:   'bg-retro-p1',
  p2:   'bg-retro-p2',
  cta:  'bg-retro-cta',
  win:  'bg-retro-win',
  text: 'bg-retro-text',
  dim:  'bg-retro-dim',
}

export default function AvatarCustomizer({ value, onChange, previewSize = 0 }) {
  const { shape, tone } = parseAvatar(value)
  const canonical = canonicalAvatar(value)

  const pickShape = (key) => {
    sounds.move('X')
    onChange(makeAvatar(key, tone))
  }

  const pickTone = (t) => {
    sounds.move('O')
    onChange(makeAvatar(shape, t))
  }

  return (
    <div className="space-y-3">
      {previewSize > 0 && (
        <div className="flex justify-center">
          <div key={canonical} style={{ animation: 'place-pop 0.25s ease-out' }}>
            <Avatar id={canonical} size={previewSize} />
          </div>
        </div>
      )}

      {/* Shape grid — each cell rendered in currently selected tone */}
      <div className="grid grid-cols-5 gap-2">
        {SHAPES.map(key => (
          <button
            key={key}
            onClick={() => pickShape(key)}
            aria-label={`Pick ${key}`}
            className={cn(
              'rounded border-2 p-0.5 transition-all active:scale-90',
              key === shape
                ? 'border-retro-cta shadow-neon-cta'
                : 'border-retro-border hover:border-retro-p1',
            )}
          >
            <Avatar id={makeAvatar(key, tone)} size={36} />
          </button>
        ))}
      </div>

      {/* Tone swatches */}
      <div className="flex justify-center gap-2">
        {TONES.map(t => (
          <button
            key={t}
            onClick={() => pickTone(t)}
            aria-label={`Pick color ${t}`}
            className={cn(
              'w-8 h-8 rounded border-2 transition-all active:scale-90',
              TONE_BG[t],
              t === tone
                ? 'border-retro-text shadow-neon-cta'
                : 'border-retro-border hover:border-retro-text',
            )}
          />
        ))}
      </div>
    </div>
  )
}
