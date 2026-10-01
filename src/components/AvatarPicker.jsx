import { useId, useRef, useState } from 'react'
import Avatar from './Avatar'
import {
  canonicalAvatarId, decodeAvatar, defaultKitAvatar, encodeAvatar, resolveAvatar, shuffleAvatar, optionInfo,
} from '../lib/avatarKit'
import { CATEGORIES, categoryOptions, colourOptions, swatchBackground, tierBadge } from '../lib/avatarKit/categories'
import { CREATURES, TONES, TONE_LABEL, makeAvatar, parseAvatar } from '../lib/avatars'
import { TONE_TO_RAMP } from '../lib/avatarKit'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

const HISTORY_CAP = 20
const CLASSIC = { id: 'classic', label: 'CLASSIC' }

// The avatar editor: a big live preview with the player's name tag, a SHUFFLE die and
// UNDO, a scrolling tab strip, and under it a grid of thumbnails of YOUR avatar wearing
// each option (so you choose by look, not by name). Controlled: `value` is an avatar
// id, `onChange` gets the next canonical id. Premium items are badged but selectable
// for now.
export default function AvatarPicker({ value, onChange, name = '', previewSize = 96 }) {
  const current = canonicalAvatarId(value)
  const resolved = resolveAvatar(current)
  const isKit = resolved.kind === 'kit'
  const look = isKit ? resolved.look : null
  const [tab, setTab] = useState(isKit ? 'skin' : CLASSIC.id)
  const [view, setView] = useState('bust')
  const [history, setHistory] = useState([])
  const tabsId = useId()
  const tabRefs = useRef({})

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
    sounds.move('X')
    if (!isKit) setTab('skin')
    commit(shuffleAvatar(Math.random, current))
  }

  // Editing a classic critter's person-less look starts from a seed person.
  const baseLook = look || decodeAvatar(defaultKitAvatar(current))
  const withField = (key, id) => encodeAvatar({ ...baseLook, [key]: id })
  const setField = (key, id) => { sounds.move('X'); commit(withField(key, id)) }

  const tabs = [...CATEGORIES, CLASSIC]
  const onTabKey = (e) => {
    const i = tabs.findIndex(t => t.id === tab)
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    e.preventDefault()
    setTab(tabs[n].id)
    tabRefs.current[tabs[n].id]?.focus()
  }

  const cat = CATEGORIES.find(c => c.id === tab)

  return (
    <div className="w-full max-w-[380px] mx-auto space-y-3">
      {/* Live preview */}
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={undo}
          disabled={!history.length}
          aria-label="Undo last change"
          className="min-w-11 min-h-11 px-2 flex items-center justify-center font-pixel text-[9px] tracking-wider text-retro-dim hover:text-retro-text transition-all active:scale-90 disabled:invisible"
        >
          UNDO
        </button>
        <figure className="flex flex-col items-center gap-2">
          <div key={`${current}${view}`} style={{ animation: 'place-pop 0.25s ease-out' }}>
            <Avatar animate id={current} size={previewSize} view={view} />
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

      {/* One character, two framings */}
      {isKit && (
        <div role="radiogroup" aria-label="Preview framing" className="grid grid-cols-2 gap-1 p-1 rounded border border-retro-border bg-retro-surface">
          {[['bust', 'BUST'], ['hero', 'FULL BODY']].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={view === id}
              onClick={() => setView(id)}
              className={cn(
                'min-h-9 rounded font-pixel text-[9px] tracking-widest transition-all',
                view === id ? 'bg-retro-cta text-retro-bg' : 'text-retro-dim hover:text-retro-text',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Category tabs */}
      <div role="tablist" aria-label="Avatar parts" className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none]">
        {tabs.map(t => (
          <button
            key={t.id}
            ref={el => { tabRefs.current[t.id] = el }}
            id={`${tabsId}-${t.id}-tab`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`${tabsId}-panel`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={onTabKey}
            className={cn(
              'shrink-0 min-h-11 px-3 rounded border font-pixel text-[9px] tracking-widest transition-all',
              tab === t.id ? 'bg-retro-cta text-retro-bg border-retro-cta' : 'border-retro-border text-retro-dim hover:text-retro-text',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${tab}-tab`} className="space-y-3">
        {cat ? (
          <>
            {cat.field && (
              <div role="radiogroup" aria-label={cat.label} className="grid grid-cols-4 gap-1.5">
                {categoryOptions(cat).map(opt => {
                  const selected = baseLook[cat.field] === opt.id && isKit
                  const badge = tierBadge(opt)
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={badge ? `${opt.label} (${badge.text})` : opt.label}
                      onClick={() => setField(cat.field, opt.id)}
                      className={cn(
                        'relative flex flex-col items-center gap-1 p-1 rounded border-2 transition-all active:scale-95',
                        selected ? 'border-retro-cta shadow-neon-cta' : 'border-retro-border hover:border-retro-text',
                      )}
                    >
                      <Avatar id={withField(cat.field, opt.id)} size={48} view={cat.thumb} />
                      <span className="w-full truncate text-center font-pixel text-[7px] leading-tight text-retro-dim">{opt.label}</span>
                      {badge && (
                        <span
                          aria-hidden="true"
                          title={badge.text}
                          className="absolute top-0.5 right-0.5 min-w-4 h-4 px-0.5 rounded-sm bg-retro-bg/90 border border-retro-border text-[9px] leading-none flex items-center justify-center text-retro-cta"
                        >
                          {badge.glyph}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
            {cat.colours.map(row => (
              <ColourRow
                key={row.key}
                row={row}
                selected={baseLook[row.key]}
                onPick={(id) => setField(row.key, id)}
              />
            ))}
            {cat.field === 'pet' && <p className="font-pixel text-[8px] leading-relaxed text-retro-dim">PETS SHOW IN THE FULL-BODY VIEW.</p>}
            <p className="font-pixel text-[8px] leading-relaxed text-retro-dim">
              ✓ EARNED · ★ PASS · ◆ PACK — ALL OPEN TO TRY FOR NOW.
            </p>
          </>
        ) : (
          <ClassicPanel current={current} onPick={commit} />
        )}
      </div>
    </div>
  )
}

function ColourRow({ row, selected, onPick }) {
  return (
    <div className="space-y-1">
      <p className="font-pixel text-[8px] tracking-widest text-retro-dim">{row.label}</p>
      <div role="radiogroup" aria-label={row.label} className="flex flex-wrap gap-x-1 gap-y-0.5">
        {colourOptions(row.key).map(c => {
          const on = c.id === selected
          const badge = c.premium ? tierBadge(optionInfo(row.key, c.id)) : null
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={badge ? `${c.label.toLowerCase()} (${badge.text.toLowerCase()})` : c.label.toLowerCase()}
              onClick={() => onPick(c.id)}
              className="relative min-w-11 min-h-11 flex items-center justify-center"
            >
              <span
                className={cn(
                  'w-8 h-8 rounded-full border-2 block transition-all active:scale-90',
                  on ? 'border-retro-text shadow-neon-cta scale-110' : 'border-retro-border hover:border-retro-text',
                )}
                style={{ background: swatchBackground(c.id) }}
              />
              {c.premium && <span aria-hidden="true" className="absolute top-1 right-1 text-[9px] leading-none text-retro-cta">★</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// The 27 original critters, frozen as the CLASSIC tab. They draw in the fixed avatar
// palette, so the colour row is the same on every theme.
function ClassicPanel({ current, onPick }) {
  const parsed = parseAvatar(current)
  const isCritter = !parsed.parts && CREATURES.includes(parsed.shape)
  const [tone, setTone] = useState(isCritter ? parsed.tone : 'p1')
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Critter" className="grid grid-cols-6 gap-1.5">
        {CREATURES.map(shape => {
          const selected = isCritter && parsed.shape === shape
          return (
            <button
              key={shape}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={shape}
              onClick={() => { sounds.move('X'); onPick(makeAvatar(shape, tone)) }}
              className={cn(
                'aspect-square flex items-center justify-center rounded border-2 transition-all active:scale-95',
                selected ? 'border-retro-cta shadow-neon-cta' : 'border-retro-border hover:border-retro-text',
              )}
            >
              <Avatar id={makeAvatar(shape, tone)} size={48} />
            </button>
          )
        })}
      </div>
      <div role="radiogroup" aria-label="Colour" className="grid grid-cols-5 gap-y-1 justify-items-center">
        {TONES.map(t => {
          const on = t === tone
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={TONE_LABEL[t].toLowerCase()}
              onClick={() => {
                sounds.move('O')
                setTone(t)
                if (isCritter) onPick(makeAvatar(parsed.shape, t))
              }}
              className="min-w-11 min-h-11 flex items-center justify-center"
            >
              <span
                className={cn(
                  'w-8 h-8 rounded-full border-2 block transition-all active:scale-90',
                  on ? 'border-retro-text shadow-neon-cta scale-110' : 'border-retro-border hover:border-retro-text',
                )}
                style={{ background: swatchBackground(TONE_TO_RAMP[t]) }}
              />
            </button>
          )
        })}
      </div>
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
