import { memo, useCallback, useId, useLayoutEffect, useRef, useState } from 'react'
import Avatar from './Avatar'
import {
  canonicalAvatarId, decodeAvatar, defaultKitAvatar, encodeAvatar, resolveAvatar, shuffleAvatar, optionInfo,
} from '../lib/avatarKit'
import { categoryOptions, colourOptions, swatchBackground, tierBadge } from '../lib/avatarKit/categories'
import {
  EDITOR_GROUPS, editorCategory, groupOfTab, firstTabOf, previewViewFor, thumbLook, currentChoiceLabel,
  createHistory, pushHistory, undoHistory, redoHistory, canUndo, canRedo, pickAction, previewAvatar, shuffleTab,
} from '../lib/avatarEditorLogic'
import { CREATURES, TONES, TONE_LABEL, makeAvatar, parseAvatar } from '../lib/avatars'
import { TONE_TO_RAMP } from '../lib/avatarKit'
import { sounds } from '../lib/sounds'
import LockBadge from './premium/LockBadge'
import useAccess from '../hooks/useAccess'
import { openPaywall } from '../lib/premiumUi'
import { avatarItem } from '../lib/avatarGate'
import { monetizationEnabled } from '../lib/monetizationState'
import { cn } from '@/lib/utils'

const CLASSIC = { id: 'classic', label: 'CLASSIC' }
const HOVER = '[@media(hover:hover)]:hover:border-retro-text'

// The avatar editor. A large live preview (with UNDO / REDO, SHUFFLE and the
// bust / full-body framing) stays pinned while the options scroll under it.
// Parts sit under four short headings (FACE, HAIR, STYLE, SCENE) plus the frozen
// CLASSIC critters, so every heading fits on a phone with no sideways scrolling.
// Each option is a thumbnail of YOUR avatar wearing it. Pets are not here: they
// have their own picker (PetPicker).
//
// Controlled: `value` is an avatar id, `onChange` gets the next canonical id.
// Pass and pack items are gated through isUnlocked (premium.js). Tapping a locked
// one TRIES IT ON: the preview wears it, the draft never does, and the bar under
// the preview offers UNLOCK (calls `onLocked(item)`, the paywall by default) or
// TAKE OFF. `sticky` pins the preview to the top of the scrolling ancestor;
// `wide` (the full-screen studio) puts preview and options side by side from md up.
export default function AvatarPicker({ value, onChange, name = '', previewSize = 144, onLocked = openPaywall, sticky = true, wide = false }) {
  const access = useAccess()
  // With monetization off, paid items are plain items: no pass or pack badges either.
  const selling = monetizationEnabled()
  const lockedItem = (key, id) => {
    const item = avatarItem(key, id)
    return item && !access.isUnlocked(item) ? item : null
  }
  const isOpen = (key, id) => !lockedItem(key, id)
  const current = canonicalAvatarId(value)
  const resolved = resolveAvatar(current)
  const isKit = resolved.kind === 'kit'
  const look = isKit ? resolved.look : null
  const [tab, setTab] = useState(isKit ? 'skin' : CLASSIC.id)
  const [view, setView] = useState('bust')
  const [history, setHistory] = useState(() => createHistory(current))
  const [tryOn, setTryOn] = useState(null)
  const ids = useId()
  const groupRefs = useRef({})
  const tabRefs = useRef({})

  // A value set from outside (a reset, a save elsewhere) starts a fresh history.
  if (history.present !== current) setHistory(createHistory(current))

  const commit = (next) => {
    setTryOn(null)
    if (next === current) return
    setHistory(h => pushHistory(h.present === current ? h : createHistory(current), next))
    onChange(next)
  }
  const step = (dir) => {
    const h = dir < 0 ? undoHistory(history) : redoHistory(history)
    if (h === history) return
    sounds.move(dir < 0 ? 'O' : 'X')
    setTryOn(null)
    setHistory(h)
    onChange(h.present)
  }
  const shuffleAll = () => {
    sounds.move('X')
    if (!isKit) selectTab('skin')
    commit(shuffleAvatar(Math.random, current))
  }

  // Editing a classic critter's person-less look starts from a seed person.
  const baseLook = look || decodeAvatar(defaultKitAvatar(current))
  const withField = (key, id) => encodeAvatar({ ...baseLook, [key]: id })
  const pick = (key, id) => {
    const locked = lockedItem(key, id)
    const action = pickAction({ locked: Boolean(locked), tryOn, field: key, id })
    sounds.move('X')
    if (action === 'commit') commit(withField(key, id))
    else if (action === 'clear') setTryOn(null)
    else setTryOn({ field: key, id, item: locked })
  }
  // Tiles are memoised, so they get one stable handler that always runs the latest pick.
  const pickRef = useRef(pick)
  useLayoutEffect(() => { pickRef.current = pick })
  const onTile = useCallback((key, id) => pickRef.current(key, id), [])
  const shuffleThisTab = () => {
    sounds.move('X')
    commit(encodeAvatar(shuffleTab(Math.random, baseLook, tab, isOpen)))
  }

  const group = tab === CLASSIC.id ? CLASSIC.id : groupOfTab(tab)
  const groups = [...EDITOR_GROUPS, CLASSIC]
  const groupTabs = EDITOR_GROUPS.find(g => g.id === group)?.tabs || []

  function selectTab(id) {
    setTab(id)
    if (id !== CLASSIC.id) setView(previewViewFor(id))
  }
  const selectGroup = (id) => selectTab(id === CLASSIC.id ? CLASSIC.id : firstTabOf(id))

  // Arrow keys move along a tablist (roving tabindex), Home / End jump.
  const nextIndex = (key, i, n) => ({ ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 })[key]
  const onGroupKey = (e) => {
    const list = groups.map(x => x.id)
    const n = nextIndex(e.key, list.indexOf(group), list.length)
    if (n === undefined) return
    e.preventDefault()
    selectGroup(list[n])
    requestAnimationFrame(() => groupRefs.current[list[n]]?.focus())
  }
  const onTabKey = (e) => {
    const n = nextIndex(e.key, groupTabs.indexOf(tab), groupTabs.length)
    if (n === undefined) return
    e.preventDefault()
    selectTab(groupTabs[n])
    requestAnimationFrame(() => tabRefs.current[groupTabs[n]]?.focus())
  }

  const cat = editorCategory(tab)
  const shown = previewAvatar(current, tryOn)
  const tryOnInfo = tryOn ? optionInfo(tryOn.field, tryOn.id) : null
  const tryOnBadge = tryOnInfo ? tierBadge(tryOnInfo) : null

  return (
    <div className={cn('w-full max-w-[380px] mx-auto', wide && 'md:max-w-none md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-6 md:items-start')}>
      {/* Live preview: pinned while the options scroll */}
      <div className={cn('z-10 bg-retro-bg pb-2 space-y-2', sticky && 'sticky top-0', sticky && wide && 'md:top-4')}>
        <div className="flex items-center justify-center gap-2">
          <div className="flex flex-col gap-1">
            <IconButton label="UNDO" ariaLabel="Undo last change" onClick={() => step(-1)} disabled={!canUndo(history)}><ArrowIcon /></IconButton>
            <IconButton label="REDO" ariaLabel="Redo" onClick={() => step(1)} disabled={!canRedo(history)}><ArrowIcon flip /></IconButton>
          </div>
          <figure className="flex flex-col items-center gap-1.5">
            <div key={`${shown}${view}`} style={{ animation: 'place-pop 0.2s ease-out' }}>
              <Avatar animate id={shown} size={previewSize} view={view} />
            </div>
          </figure>
          <div className="flex flex-col gap-1">
            <IconButton label="SHUFFLE" ariaLabel="Shuffle — random avatar" onClick={shuffleAll} cta><DieIcon /></IconButton>
            {isKit && (
              <button
                type="button"
                onClick={() => setView(v => (v === 'bust' ? 'hero' : 'bust'))}
                aria-label={view === 'bust' ? 'Show full body' : 'Show head and shoulders'}
                className="min-w-14 min-h-11 px-1 flex flex-col items-center justify-center gap-1 font-pixel text-[8px] tracking-wider text-retro-dim hover:text-retro-text transition-all active:scale-90"
              >
                <FramingIcon hero={view === 'bust'} />
                {view === 'bust' ? 'BODY' : 'FACE'}
              </button>
            )}
          </div>
        </div>

        {tryOn ? (
          <div role="status" className="flex items-center gap-2 px-2 py-1.5 rounded border-2 border-dashed border-retro-cta bg-retro-tint-cta">
            <LockBadge size={11} />
            <p className="min-w-0 flex-1 font-pixel text-[8px] leading-relaxed text-retro-text">
              <span className="block truncate">TRYING <span className="text-retro-cta">{String(tryOnInfo.label).toUpperCase()}</span></span>
              <span className="block truncate text-retro-dim">{tryOnBadge ? `${tryOnBadge.text.replace(' ITEM', '')} · ` : ''}NOT SAVED</span>
            </p>
            <button
              type="button"
              onClick={() => onLocked(tryOn.item)}
              className="shrink-0 min-h-9 px-2 rounded bg-retro-cta text-retro-bg font-pixel text-[8px] tracking-wider active:scale-95"
            >
              UNLOCK
            </button>
            <button
              type="button"
              onClick={() => setTryOn(null)}
              className="shrink-0 min-h-9 px-2 rounded border border-retro-border font-pixel text-[8px] tracking-wider text-retro-dim hover:text-retro-text active:scale-95"
            >
              TAKE OFF
            </button>
          </div>
        ) : (
          <p aria-live="polite" className="mx-auto w-fit max-w-[220px] truncate font-pixel text-[10px] tracking-wider px-2 py-1 rounded border border-retro-border bg-retro-surface text-retro-text">
            {name || 'YOU'}
          </p>
        )}

        {/* Headings: all five fit, no sideways scrolling */}
        <div role="tablist" aria-label="Avatar part groups" className="grid grid-cols-5 gap-1 p-1 rounded border border-retro-border bg-retro-surface">
          {groups.map(g => (
            <button
              key={g.id}
              ref={el => { groupRefs.current[g.id] = el }}
              type="button"
              role="tab"
              aria-selected={group === g.id}
              tabIndex={group === g.id ? 0 : -1}
              onClick={() => selectGroup(g.id)}
              onKeyDown={onGroupKey}
              className={cn(
                'min-h-10 rounded font-pixel text-[8px] tracking-normal transition-all',
                group === g.id ? 'bg-retro-cta text-retro-bg' : 'text-retro-dim hover:text-retro-text',
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
        {groupTabs.length > 1 && (
          <div role="tablist" aria-label="Avatar parts" className="flex flex-wrap gap-1">
            {groupTabs.map(id => {
              const c = editorCategory(id)
              return (
                <button
                  key={id}
                  ref={el => { tabRefs.current[id] = el }}
                  id={`${ids}-${id}-tab`}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  aria-controls={`${ids}-panel`}
                  tabIndex={tab === id ? 0 : -1}
                  onClick={() => selectTab(id)}
                  onKeyDown={onTabKey}
                  className={cn(
                    'min-h-9 px-2 rounded-full border font-pixel text-[8px] tracking-normal transition-all',
                    tab === id ? 'border-retro-cta text-retro-cta bg-retro-tint-cta' : `border-retro-border text-retro-dim ${HOVER}`,
                  )}
                >
                  {c.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div
        id={`${ids}-panel`}
        role="tabpanel"
        aria-labelledby={groupTabs.length > 1 ? `${ids}-${tab}-tab` : undefined}
        aria-label={groupTabs.length > 1 ? undefined : (cat?.label || CLASSIC.label)}
        className="space-y-3 pt-1"
      >
        {cat ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate font-pixel text-[9px] tracking-widest text-retro-dim">
                {cat.label} <span className="text-retro-text">· {currentChoiceLabel(baseLook, tab)}</span>
              </p>
              <button
                type="button"
                onClick={shuffleThisTab}
                aria-label={`Random ${cat.label.toLowerCase()}`}
                className="shrink-0 min-h-9 px-2 flex items-center gap-1 rounded border border-retro-border font-pixel text-[8px] tracking-wider text-retro-cta hover:border-retro-cta active:scale-95"
              >
                <DieIcon size={12} />
                RANDOM
              </button>
            </div>
            {cat.field && (
              <div role="radiogroup" aria-label={cat.label} className="grid grid-cols-4 gap-1.5">
                {categoryOptions(cat).map(opt => {
                  const selected = isKit && baseLook[cat.field] === opt.id
                  const trying = tryOn?.field === cat.field && tryOn.id === opt.id
                  const badge = selling || opt.tier === 'earn' ? tierBadge(opt) : null
                  const locked = Boolean(lockedItem(cat.field, opt.id))
                  return (
                    <OptionTile
                      key={opt.id}
                      avatar={encodeAvatar(thumbLook(baseLook, cat.field, opt.id))}
                      view={cat.thumb}
                      label={opt.label}
                      ariaLabel={badge ? `${opt.label} (${badge.text}${locked ? ', locked' : ''})` : opt.label}
                      selected={selected}
                      trying={trying}
                      tier={badge ? opt.tier : null}
                      locked={locked}
                      field={cat.field}
                      id={opt.id}
                      onPick={onTile}
                    />
                  )
                })}
              </div>
            )}
            {cat.colours.map(row => (
              <ColourRow
                key={row.key}
                selling={selling}
                row={row}
                selected={baseLook[row.key]}
                trying={tryOn?.field === row.key ? tryOn.id : null}
                onPick={(id) => pick(row.key, id)}
                isLocked={(id) => Boolean(lockedItem(row.key, id))}
              />
            ))}
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-pixel text-[8px] leading-relaxed text-retro-dim">
              {(selling ? [['earn', 'EARNED'], ['pass', 'PASS'], ['pack', 'PACK']] : [['earn', 'EARNED']]).map(([tier, label]) => (
                <span key={tier} className="inline-flex items-center gap-1"><TierIcon tier={tier} className="text-retro-cta" />{label}</span>
              ))}
              {selling && <span>{access.bypass ? 'ALL OPEN WHILE DEVELOPING' : 'TAP A LOCKED ITEM TO TRY IT ON'}</span>}
            </p>
          </>
        ) : (
          <ClassicPanel current={current} onPick={commit} />
        )}
      </div>
    </div>
  )
}

// One option thumbnail. Memoised on its avatar string, so picking another option
// repaints only the tiles whose look actually changed.
const OptionTile = memo(function OptionTile({ avatar, view, label, ariaLabel, selected, trying, tier, locked, field, id, onPick }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={ariaLabel}
      onClick={() => onPick(field, id)}
      className={cn(
        'relative flex flex-col items-center gap-1 p-1 rounded border-2 transition-all active:scale-95',
        selected && 'border-retro-cta bg-retro-tint-cta shadow-neon-cta',
        trying && 'border-retro-cta border-dashed',
        !selected && !trying && `border-retro-border ${HOVER}`,
      )}
    >
      <Avatar id={avatar} size={48} view={view} />
      <span className={cn('w-full truncate text-center font-pixel text-[8px] leading-tight', selected ? 'text-retro-cta' : 'text-retro-dim')}>{label}</span>
      {selected && (
        <span aria-hidden="true" className="absolute top-0.5 left-0.5 w-4 h-4 rounded-sm bg-retro-cta text-retro-bg flex items-center justify-center">
          <TierIcon tier="earn" />
        </span>
      )}
      {tier && (
        <span aria-hidden="true" className="absolute top-0.5 right-0.5 min-w-4 h-4 px-0.5 rounded-sm bg-retro-bg/90 border border-retro-border flex items-center justify-center text-retro-cta">
          {locked ? <LockBadge size={10} /> : <TierIcon tier={tier} />}
        </span>
      )}
    </button>
  )
})

function ColourRow({ row, selected, trying, onPick, isLocked, selling }) {
  return (
    <div className="space-y-1">
      <p className="font-pixel text-[8px] tracking-widest text-retro-dim">{row.label}</p>
      <div role="radiogroup" aria-label={row.label} className="flex flex-wrap gap-x-1 gap-y-0.5">
        {colourOptions(row.key).map(c => {
          const on = c.id === selected
          const locked = isLocked(c.id)
          const badge = c.premium && selling ? tierBadge(optionInfo(row.key, c.id)) : null
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={badge ? `${c.label.toLowerCase()} (${badge.text.toLowerCase()}${locked ? ', locked' : ''})` : c.label.toLowerCase()}
              onClick={() => onPick(c.id)}
              className="relative min-w-11 min-h-11 flex items-center justify-center"
            >
              <span
                className={cn(
                  'w-8 h-8 rounded-full border-2 block transition-all active:scale-90',
                  on && 'border-retro-text ring-2 ring-retro-cta ring-offset-2 ring-offset-retro-bg',
                  trying === c.id && 'border-retro-cta border-dashed',
                  !on && trying !== c.id && `border-retro-border ${HOVER}`,
                )}
                style={{ background: swatchBackground(c.id) }}
              />
              {c.premium && selling && <span aria-hidden="true" className="absolute top-0.5 right-0.5 text-retro-cta">{locked ? <LockBadge size={10} /> : <TierIcon tier="pass" />}</span>}
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
      <p className="font-pixel text-[8px] leading-relaxed text-retro-dim">THE ORIGINAL CRITTERS. THEY HAVE NO PARTS OR PETS.</p>
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
                selected ? 'border-retro-cta bg-retro-tint-cta shadow-neon-cta' : `border-retro-border ${HOVER}`,
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
                  on ? 'border-retro-text ring-2 ring-retro-cta ring-offset-2 ring-offset-retro-bg' : `border-retro-border ${HOVER}`,
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

function IconButton({ label, ariaLabel, onClick, disabled = false, cta = false, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'min-w-14 min-h-11 px-1 flex flex-col items-center justify-center gap-1 font-pixel text-[8px] tracking-wider transition-all active:scale-90 disabled:opacity-30 disabled:active:scale-100',
        cta ? 'text-retro-cta hover:text-glow-cta' : 'text-retro-dim hover:text-retro-text',
      )}
    >
      {children}
      {label}
    </button>
  )
}

// Pixel marks for the premium tiers, drawn on a 7x7 grid so they stay crisp:
// check = earned by playing, star = Pass, gem = one-off pack.
const TIER_PIXELS = {
  earn: ['.......', '.....#.', '....#..', '#..#...', '.##....', '.......', '.......'],
  pass: ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'],
  pack: ['.#####.', '#######', '#######', '.#####.', '..###..', '...#...', '.......'],
}

export function TierIcon({ tier, className, size = 9 }) {
  const rows = TIER_PIXELS[tier]
  if (!rows) return null
  return (
    <svg width={size} height={size} viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden="true" className={cn('fill-current', className)}>
      {rows.flatMap((row, y) => row.split('').map((ch, x) => (ch === '#' ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" /> : null)))}
    </svg>
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

function ArrowIcon({ flip = false }) {
  return (
    <svg width="16" height="16" viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true" className="fill-current" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <rect x="0" y="3" width="1" height="1" /><rect x="1" y="2" width="1" height="3" /><rect x="2" y="1" width="1" height="5" />
      <rect x="3" y="3" width="3" height="1" /><rect x="6" y="4" width="1" height="2" /><rect x="5" y="6" width="1" height="1" />
    </svg>
  )
}

function FramingIcon({ hero }) {
  return (
    <svg width="16" height="16" viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true" className="fill-current">
      <rect x="3" y="0" width="2" height="2" />
      {hero
        ? <><rect x="2" y="2" width="4" height="3" /><rect x="2" y="5" width="1" height="3" /><rect x="5" y="5" width="1" height="3" /></>
        : <rect x="1" y="2" width="6" height="2" />}
    </svg>
  )
}
