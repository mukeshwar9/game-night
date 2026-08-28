import { useState } from 'react'
import Avatar from './Avatar'
import {
  PICKER_SHAPES, TONES, SKIN_TONES, HAIR_STYLES, ACCESSORIES, OUTFIT_PRESETS,
  TONE_LABEL, SKIN_LABEL, HAIR_LABEL, ACCESSORY_LABEL,
  parseAvatar, canonicalAvatar, makeHumanoid,
} from '../lib/avatars'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// Static class maps — literal strings so Tailwind's content scan sees every class.
const TONE_BG = {
  p1:   'bg-retro-p1',
  p2:   'bg-retro-p2',
  cta:  'bg-retro-cta',
  win:  'bg-retro-win',
  text: 'bg-retro-text',
  dim:  'bg-retro-dim',
  av1:  'bg-retro-av1',
  av2:  'bg-retro-av2',
  av3:  'bg-retro-av3',
  av4:  'bg-retro-av4',
}

const SKIN_BG = {
  s1: 'bg-retro-skin1',
  s2: 'bg-retro-skin2',
  s3: 'bg-retro-skin3',
  s4: 'bg-retro-skin4',
  s5: 'bg-retro-skin5',
}

const CHIPS = ['skin', 'hair', 'cap', 'shirt', 'pants', 'shoes', 'acc']
const CHIP_LABEL = { skin: 'SKIN', hair: 'HAIR', cap: 'CAP', shirt: 'SHIRT', pants: 'PANT', shoes: 'SHOE', acc: 'EXTRA' }

const HISTORY_CAP = 20

export default function AvatarCustomizer({ value, onChange, previewSize = 96, compact = false }) {
  const [selectedChip, setSelectedChip] = useState('cap')
  // { history, lastEmitted } as a single state value (not a ref) — this component
  // is controlled, so tracking "did the incoming value come from us" needs state
  // that's readable during render. Resetting it when an external value change is
  // detected follows React's sanctioned "adjust state during rendering" pattern:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-state-when-a-prop-changes
  const [track, setTrack] = useState({ history: [], lastEmitted: null })

  const { shape, parts } = parseAvatar(value)
  const canonical = canonicalAvatar(value)
  const idx = PICKER_SHAPES.indexOf(shape)

  // If the incoming `value` changed to something this component didn't itself emit
  // (external reset, a different profile loaded, etc.), the undo history no longer
  // applies to it — clear it.
  if (track.lastEmitted !== null && track.lastEmitted !== canonical) {
    setTrack({ history: [], lastEmitted: canonical })
  }

  const commit = (next) => {
    setTrack(t => ({ history: [...t.history, canonical].slice(-HISTORY_CAP), lastEmitted: next }))
    onChange(next)
  }

  const undo = () => {
    if (track.history.length === 0) return
    const prev = track.history[track.history.length - 1]
    setTrack(t => ({ history: t.history.slice(0, -1), lastEmitted: prev }))
    sounds.move('O')
    onChange(prev)
  }

  const pickShape = (nextShape) => {
    sounds.move('X')
    commit(makeHumanoid(nextShape, parts))
  }

  const cycle = (dir) => {
    const nextShape = PICKER_SHAPES[(idx + dir + PICKER_SHAPES.length) % PICKER_SHAPES.length]
    pickShape(nextShape)
  }

  const pickPart = (key, val) => {
    sounds.move('O')
    commit(makeHumanoid(shape, { ...parts, [key]: val }))
  }

  const applyPreset = (preset) => {
    sounds.move('X')
    commit(makeHumanoid(shape, { ...parts, ...preset.parts, skin: parts.skin }))
  }

  const pickRandom = () => {
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
    // acc reroll is 50% none-biased — routed through `pick` (rather than an inline
    // Math.random() ternary) so it stays a plain call to a user-defined helper.
    const nonNoneAcc = ACCESSORIES.filter(a => a !== 'none')
    const pickAcc = () => pick([...Array(nonNoneAcc.length).fill('none'), ...nonNoneAcc])
    const randShape = pick(PICKER_SHAPES)
    const randParts = {
      cap: pick(TONES),
      shirt: pick(TONES),
      pants: pick(TONES),
      shoes: pick(TONES),
      skin: pick(SKIN_TONES),
      hair: pick(HAIR_STYLES),
      hairColor: pick(TONES),
      acc: pickAcc(),
    }
    let next = makeHumanoid(randShape, randParts)
    if (next === canonical) {
      next = makeHumanoid(randShape, { ...randParts, cap: TONES[(TONES.indexOf(randParts.cap) + 1) % TONES.length] })
    }
    sounds.move('X')
    commit(next)
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

  const bodyTileSize = compact ? 32 : 40
  const canUndo = track.history.length > 0

  return (
    <div className="w-full max-w-[380px] mx-auto space-y-3" onKeyDown={handleKeyDown}>
      {/* Preview row: UNDO — avatar — RANDOM */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={undo}
          disabled={!canUndo}
          aria-label="Undo last change"
          className={cn(
            'min-w-11 min-h-11 px-2 flex items-center justify-center font-pixel text-[9px] tracking-wider transition-all active:scale-90',
            canUndo ? 'text-retro-dim hover:text-retro-text' : 'text-retro-dim opacity-30 cursor-not-allowed',
          )}
        >
          UNDO
        </button>

        <div
          key={canonical}
          style={{ animation: 'place-pop 0.25s ease-out' }}
        >
          <Avatar animate id={canonical} size={previewSize} />
        </div>

        <button
          onClick={pickRandom}
          aria-label="Random avatar"
          className="min-w-11 min-h-11 px-2 flex items-center justify-center font-pixel text-[9px] tracking-wider text-retro-dim hover:text-retro-cta transition-all active:scale-90"
        >
          RANDOM
        </button>
      </div>

      {/* Body strip */}
      <div
        role="radiogroup"
        aria-label="Body"
        className="flex items-center gap-2 overflow-x-auto snap-x snap-mandatory px-1 py-1 no-scrollbar"
      >
        {PICKER_SHAPES.map((s) => {
          const selected = s === shape
          return (
            <button
              key={s}
              role="radio"
              aria-checked={selected}
              aria-label={s}
              onClick={() => pickShape(s)}
              className={cn(
                'shrink-0 snap-start rounded border-2 p-1 transition-all active:scale-95 focus-visible:ring-2 ring-retro-p1',
                selected ? 'border-retro-cta shadow-neon-cta' : 'border-retro-border hover:border-retro-text',
              )}
            >
              <Avatar id={makeHumanoid(s, parts)} size={bodyTileSize} />
            </button>
          )
        })}
      </div>

      {/* Part chip row */}
      <div className="flex items-center justify-center gap-x-1 overflow-x-auto no-scrollbar font-pixel text-[9px] tracking-wider">
        {CHIPS.map((c, i) => (
          <span key={c} className="flex items-center shrink-0">
            {i > 0 && <span className="text-retro-dim">·</span>}
            <button
              onClick={() => setSelectedChip(c)}
              aria-pressed={c === selectedChip}
              className={cn(
                'min-h-11 min-w-11 px-2.5 flex items-center justify-center transition-all',
                c === selectedChip ? 'text-retro-cta text-glow-cta' : 'text-retro-dim hover:text-retro-text',
              )}
            >
              {CHIP_LABEL[c]}
            </button>
          </span>
        ))}
      </div>

      {/* Option panel — fixed min-height so switching chips doesn't jump layout */}
      <div className="min-h-[104px] flex items-center justify-center">
        <OptionPanel
          selectedChip={selectedChip}
          parts={parts}
          onPickPart={pickPart}
        />
      </div>

      {/* Preset strip */}
      {!compact && (
        <div className="flex items-center gap-3 overflow-x-auto snap-x px-1 py-1 no-scrollbar">
          {OUTFIT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset)}
              aria-label={`Apply ${preset.label} preset`}
              className="shrink-0 snap-start flex flex-col items-center gap-1 min-w-11 transition-all active:scale-95 focus-visible:ring-2 ring-retro-p1"
            >
              <span className="rounded border-2 border-retro-border p-1 hover:border-retro-cta transition-all">
                <Avatar id={makeHumanoid(shape, { ...parts, ...preset.parts, skin: parts.skin })} size={40} />
              </span>
              <span className="font-pixel text-[7px] text-retro-dim tracking-wider">{preset.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ToneSwatchGrid({ activeTone, onPick }) {
  return (
    <div className="flex items-center justify-center flex-wrap gap-x-1 gap-y-1 max-w-[280px]">
      {TONES.map(t => (
        <button
          key={t}
          onClick={() => onPick(t)}
          aria-label={`Pick color ${TONE_LABEL[t]}`}
          aria-pressed={t === activeTone}
          className="min-w-11 min-h-11 flex items-center justify-center"
        >
          <span
            className={cn(
              'w-8 h-8 rounded-full border-2 transition-all active:scale-90 block',
              TONE_BG[t],
              t === activeTone
                ? 'border-retro-text shadow-neon-cta scale-110'
                : 'border-retro-border hover:border-retro-text',
            )}
          />
        </button>
      ))}
    </div>
  )
}

function OptionPanel({ selectedChip, parts, onPickPart }) {
  if (selectedChip === 'skin') {
    return (
      <div className="flex items-center justify-center gap-2">
        {SKIN_TONES.map(s => (
          <button
            key={s}
            onClick={() => onPickPart('skin', s)}
            aria-label={SKIN_LABEL[s]}
            aria-pressed={s === parts.skin}
            className="min-w-11 min-h-11 flex items-center justify-center"
          >
            <span
              className={cn(
                'w-8 h-8 rounded-full border-2 transition-all active:scale-90 block',
                SKIN_BG[s],
                s === parts.skin
                  ? 'border-retro-text shadow-neon-cta scale-110'
                  : 'border-retro-border hover:border-retro-text',
              )}
            />
          </button>
        ))}
      </div>
    )
  }

  if (selectedChip === 'hair') {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center justify-center flex-wrap gap-1">
          {HAIR_STYLES.map(h => (
            <button
              key={h}
              onClick={() => onPickPart('hair', h)}
              aria-pressed={h === parts.hair}
              className={cn(
                'min-h-11 px-2.5 flex items-center justify-center font-pixel text-[8px] tracking-wider border rounded transition-all active:scale-95',
                h === parts.hair
                  ? 'border-retro-cta text-retro-cta text-glow-cta'
                  : 'border-retro-border text-retro-dim hover:text-retro-text',
              )}
            >
              {HAIR_LABEL[h]}
            </button>
          ))}
        </div>
        <ToneSwatchGrid activeTone={parts.hairColor} onPick={(t) => onPickPart('hairColor', t)} />
      </div>
    )
  }

  if (selectedChip === 'cap') {
    return (
      <div className="flex items-center justify-center flex-wrap gap-x-1 gap-y-1 max-w-[280px]">
        <button
          onClick={() => onPickPart('cap', 'none')}
          aria-pressed={parts.cap === 'none'}
          className={cn(
            'min-h-11 min-w-11 px-2 flex items-center justify-center font-pixel text-[8px] tracking-wider border rounded transition-all active:scale-95',
            parts.cap === 'none'
              ? 'border-retro-cta text-retro-cta text-glow-cta'
              : 'border-retro-border text-retro-dim hover:text-retro-text',
          )}
        >
          NONE
        </button>
        <ToneSwatchGrid activeTone={parts.cap === 'none' ? null : parts.cap} onPick={(t) => onPickPart('cap', t)} />
      </div>
    )
  }

  if (selectedChip === 'acc') {
    return (
      <div className="flex items-center justify-center flex-wrap gap-1">
        {ACCESSORIES.map(a => (
          <button
            key={a}
            onClick={() => onPickPart('acc', a)}
            aria-pressed={a === parts.acc}
            className={cn(
              'min-h-11 px-2.5 flex items-center justify-center font-pixel text-[8px] tracking-wider border rounded transition-all active:scale-95',
              a === parts.acc
                ? 'border-retro-cta text-retro-cta text-glow-cta'
                : 'border-retro-border text-retro-dim hover:text-retro-text',
            )}
          >
            {ACCESSORY_LABEL[a]}
          </button>
        ))}
      </div>
    )
  }

  // shirt / pants / shoes
  return <ToneSwatchGrid activeTone={parts[selectedChip]} onPick={(t) => onPickPart(selectedChip, t)} />
}
