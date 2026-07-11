import { useState } from 'react'
import Avatar from './Avatar'
import {
  PICKER_SHAPES, PARTS, TONES,
  parseAvatar, canonicalAvatar, isHumanoid, makeHumanoid, outfitFromTone,
} from '../lib/avatars'
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

const PART_LABEL = { cap: 'CAP', shirt: 'SHIRT', pants: 'PANT', shoes: 'SHOE' }

export default function AvatarCustomizer({ value, onChange, previewSize = 96 }) {
  const [selectedPart, setSelectedPart] = useState('cap')

  const { shape, tone, parts } = parseAvatar(value)
  const canonical = canonicalAvatar(value)
  const isHuman = isHumanoid(shape)
  // Outfit to use as a base for edits — for legacy (creature) values there's no
  // `parts`, so derive a sensible one from the classic tone; the first tone/shape
  // pick then carries this outfit onto a real humanoid.
  const currentParts = isHuman ? parts : outfitFromTone(tone)
  const idx = isHuman ? PICKER_SHAPES.indexOf(shape) : 0

  const cycle = (dir) => {
    sounds.move('X')
    const nextShape = PICKER_SHAPES[(idx + dir + PICKER_SHAPES.length) % PICKER_SHAPES.length]
    onChange(makeHumanoid(nextShape, currentParts))
  }

  const pickTone = (t) => {
    sounds.move('O')
    const nextShape = isHuman ? shape : PICKER_SHAPES[0]
    onChange(makeHumanoid(nextShape, { ...currentParts, [selectedPart]: t }))
  }

  const pickRandom = () => {
    const randShape = PICKER_SHAPES[Math.floor(Math.random() * PICKER_SHAPES.length)]
    const randParts = {
      cap:   TONES[Math.floor(Math.random() * TONES.length)],
      shirt: TONES[Math.floor(Math.random() * TONES.length)],
      pants: TONES[Math.floor(Math.random() * TONES.length)],
      shoes: TONES[Math.floor(Math.random() * TONES.length)],
    }
    let next = makeHumanoid(randShape, randParts)
    if (next === canonical) next = makeHumanoid(randShape, { ...randParts, cap: TONES[(TONES.indexOf(randParts.cap) + 1) % TONES.length] })
    sounds.move('X')
    onChange(next)
  }

  const handleKeyDown = (e) => {
    const tag = e.target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      cycle(-1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      cycle(1)
    }
  }

  const activeTone = currentParts[selectedPart]

  return (
    <div className="space-y-3" onKeyDown={handleKeyDown}>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => cycle(-1)}
          aria-label="Previous avatar"
          className="w-11 h-11 flex items-center justify-center font-pixel text-retro-dim hover:text-retro-cta transition-all active:scale-90"
        >
          ◀
        </button>

        <div
          key={canonical}
          style={{
            animation: 'place-pop 0.25s ease-out',
            filter: `drop-shadow(0 0 14px rgb(var(--c-${tone}) / 0.55))`,
          }}
        >
          <Avatar id={canonical} size={previewSize} />
        </div>

        <button
          onClick={() => cycle(1)}
          aria-label="Next avatar"
          className="w-11 h-11 flex items-center justify-center font-pixel text-retro-dim hover:text-retro-cta transition-all active:scale-90"
        >
          ▶
        </button>
      </div>

      <div className="flex flex-col items-center gap-1">
        <div
          key={shape}
          style={{ animation: 'place-pop 0.25s ease-out' }}
          className="font-pixel text-xs tracking-[0.3em] text-retro-text"
        >
          {shape.toUpperCase()}
        </div>
      </div>

      <div className="flex items-center justify-center font-pixel text-[9px] tracking-wider">
        {PARTS.map((p, i) => (
          <span key={p} className="flex items-center">
            {i > 0 && <span className="text-retro-dim">·</span>}
            <button
              onClick={() => setSelectedPart(p)}
              className={cn(
                'min-h-11 px-2.5 flex items-center justify-center transition-all',
                p === selectedPart ? 'text-retro-cta text-glow-cta' : 'text-retro-dim hover:text-retro-text',
              )}
            >
              {PART_LABEL[p]}
            </button>
          </span>
        ))}
      </div>

      <div className="flex items-center justify-center flex-wrap gap-x-1 gap-y-1">
        {TONES.map(t => (
          <button
            key={t}
            onClick={() => pickTone(t)}
            aria-label={`Pick color ${t}`}
            className="min-w-11 min-h-11 flex items-center justify-center"
          >
            <span
              className={cn(
                'w-9 h-9 rounded-full border-2 transition-all active:scale-90 block',
                TONE_BG[t],
                t === activeTone
                  ? 'border-retro-text shadow-neon-cta scale-110'
                  : 'border-retro-border hover:border-retro-text',
              )}
            />
          </button>
        ))}
        <button
          onClick={pickRandom}
          aria-label="Random avatar"
          className="ml-2 font-pixel text-[9px] px-2 py-1.5 rounded border-2 border-retro-border text-retro-dim hover:border-retro-cta hover:text-retro-cta transition-all active:scale-95"
        >
          RANDOM
        </button>
      </div>
    </div>
  )
}
