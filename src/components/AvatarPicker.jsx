import { useId, useState } from 'react'
import Avatar from './Avatar'
import AvatarCustomizer from './AvatarCustomizer'
import { TONE_BG } from './avatarSwatches'
import {
  CREATURES, TONES, TONE_LABEL,
  canonicalAvatar, isHumanoid, makeAvatar, parseAvatar, randomAvatar,
} from '../lib/avatars'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

const HISTORY_CAP = 20

// The full avatar picker: a big live preview with the player's name tag, a
// SHUFFLE die and UNDO, then two tabs — CRITTERS (27 single-colour creatures
// plus a colour row) and PEOPLE (the humanoid builder). Controlled: `value` is
// an avatar id, `onChange` gets the next canonical id.
export default function AvatarPicker({ value, onChange, name = '', previewSize = 96 }) {
  const current = canonicalAvatar(value)
  const parsed = parseAvatar(current)
  const [tab, setTab] = useState(() => (isHumanoid(parsed.shape) ? 'people' : 'critters'))
  const [history, setHistory] = useState([])
  const tabsId = useId()

  // Colour for the CRITTERS grid: the current creature's own tone. While a
  // person is selected the colour row only recolours the grid (starting from
  // their shirt) — nothing is committed until a critter is tapped.
  const [gridTone, setGridTone] = useState(null)
  const critterTone = parsed.parts ? (gridTone ?? parsed.parts.shirt) : parsed.tone

  const commit = (next) => {
    if (next === current) return
    setHistory(h => [...h, current].slice(-HISTORY_CAP))
    onChange(next)
  }

  const undo = () => {
    if (!history.length) return
    sounds.move('O')
    onChange(history[history.length - 1])
    setHistory(h => h.slice(0, -1))
  }

  const shuffle = () => {
    const next = randomAvatar(Math.random, current)
    sounds.move('X')
    setTab(isHumanoid(parseAvatar(next).shape) ? 'people' : 'critters')
    commit(next)
  }

  const pickCritter = (shape) => { sounds.move('X'); commit(makeAvatar(shape, critterTone)) }
  const pickTone = (tone) => {
    sounds.move('O')
    setGridTone(tone)
    if (!parsed.parts) commit(makeAvatar(parsed.shape, tone))
  }

  const tabs = [
    { id: 'critters', label: 'CRITTERS' },
    { id: 'people', label: 'PEOPLE' },
  ]
  const onTabKey = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const next = tab === 'critters' ? 'people' : 'critters'
    setTab(next)
    document.getElementById(`${tabsId}-${next}-tab`)?.focus()
  }

  return (
    <div className="w-full max-w-[380px] mx-auto space-y-4">
      {/* Live preview */}
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={undo}
          disabled={!history.length}
          aria-label="Undo last change"
          className="min-w-11 min-h-11 px-2 flex items-center justify-center font-pixel text-[9px] tracking-wider text-retro-dim hover:text-retro-text transition-all active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          UNDO
        </button>
        <figure className="flex flex-col items-center gap-2">
          <div key={current} style={{ animation: 'place-pop 0.25s ease-out' }}>
            <Avatar animate id={current} size={previewSize} />
          </div>
          <figcaption
            className="max-w-[180px] truncate font-pixel text-[10px] tracking-wider px-2 py-1 rounded border border-retro-border bg-retro-surface text-retro-text"
            aria-live="polite"
          >
            {name || 'YOU'}
          </figcaption>
        </figure>
        <button
          type="button"
          onClick={shuffle}
          aria-label="Shuffle — random avatar"
          className="min-w-11 min-h-11 px-2 flex flex-col items-center justify-center gap-1 font-pixel text-[9px] tracking-wider text-retro-cta hover:text-glow-cta transition-all active:scale-90"
        >
          <DieIcon />
          SHUFFLE
        </button>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Avatar style" className="grid grid-cols-2 gap-1 p-1 rounded border border-retro-border bg-retro-surface">
        {tabs.map(t => (
          <button
            key={t.id}
            id={`${tabsId}-${t.id}-tab`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`${tabsId}-${t.id}-panel`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={onTabKey}
            className={cn(
              'min-h-11 rounded font-pixel text-[10px] tracking-widest transition-all',
              tab === t.id ? 'bg-retro-cta text-retro-bg' : 'text-retro-dim hover:text-retro-text',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'critters' ? (
        <div id={`${tabsId}-critters-panel`} role="tabpanel" aria-labelledby={`${tabsId}-critters-tab`} className="space-y-4">
          <div role="radiogroup" aria-label="Critter" className="grid grid-cols-6 gap-1.5">
            {CREATURES.map(shape => {
              const selected = !parsed.parts && parsed.shape === shape
              return (
                <button
                  key={shape}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={shape}
                  onClick={() => pickCritter(shape)}
                  className={cn(
                    'aspect-square flex items-center justify-center rounded border-2 transition-all active:scale-95',
                    selected ? 'border-retro-cta shadow-neon-cta' : 'border-retro-border hover:border-retro-text',
                  )}
                >
                  <Avatar id={makeAvatar(shape, critterTone)} size={40} className="w-full h-auto max-w-10" />
                </button>
              )
            })}
          </div>
          <div role="radiogroup" aria-label="Colour" className="grid grid-cols-5 gap-y-1 justify-items-center">
            {TONES.map(t => {
              const selected = t === critterTone
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={TONE_LABEL[t].toLowerCase()}
                  onClick={() => pickTone(t)}
                  className="min-w-11 min-h-11 flex items-center justify-center"
                >
                  <span className={cn(
                    'w-8 h-8 rounded-full border-2 block transition-all active:scale-90',
                    TONE_BG[t],
                    selected ? 'border-retro-text shadow-neon-cta scale-110' : 'border-retro-border hover:border-retro-text',
                  )} />
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div id={`${tabsId}-people-panel`} role="tabpanel" aria-labelledby={`${tabsId}-people-tab`}>
          <AvatarCustomizer value={current} onChange={commit} hidePreview />
        </div>
      )}
    </div>
  )
}

export function DieIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true" shapeRendering="crispEdges">
      <rect x="1.5" y="1.5" width="15" height="15" rx="2" className="fill-none stroke-current" strokeWidth="1.5" />
      <rect x="4" y="4" width="3" height="3" className="fill-current" />
      <rect x="11" y="11" width="3" height="3" className="fill-current" />
      <rect x="7.5" y="7.5" width="3" height="3" className="fill-current" />
    </svg>
  )
}
