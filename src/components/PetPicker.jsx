import { useState } from 'react'
import { toast } from 'sonner'
import BottomSheet from './BottomSheet'
import Avatar from './Avatar'
import PetSprite from './PetSprite'
import { TierIcon } from './AvatarPicker'
import LockBadge from './premium/LockBadge'
import useAccess from '../hooks/useAccess'
import useBusy from '../hooks/useBusy'
import { avatarItem } from '../lib/avatarGate'
import { isKitAvatar } from '../lib/avatarKit'
import { PET_FIELD, petOptions, petOf, withPet, petTierText, pickAction } from '../lib/avatarEditorLogic'
import { openPaywall } from '../lib/premiumUi'
import { setProfile } from '../lib/social'
import { sounds } from '../lib/sounds'
import { onRadioGroupKeyDown } from '../lib/radioGroupKeys'
import { tabStopIndex } from '../lib/rovingRadioLogic'
import { cn } from '@/lib/utils'

const PETS = petOptions()
const HOVER = '[@media(hover:hover)]:hover:border-retro-text'

// The pet picker: its own sheet and entry point, apart from the look editor. Pets
// are big cards drawn on their own (not a corner of a thumbnail), and the
// preview shows your full body with the pet beside you, the way rooms and the
// profile show it. A locked pet is tried on (the preview shows it, SAVE stays
// on your current pet) with UNLOCK one tap away. Classic critters have no pet
// slot, so they get a pointer to the look editor instead.
export default function PetPicker({ saved, onClose, onEditLook }) {
  const access = useAccess()
  const selling = access.shop
  const [pet, setPet] = useState(petOf(saved))
  // A save from elsewhere while the sheet is open: an untouched choice follows
  // the new saved pet; a choice in progress stays. SAVE only writes the pet
  // field over the latest saved look, so a look change made elsewhere survives.
  const [basePet, setBasePet] = useState(petOf(saved))
  if (petOf(saved) !== basePet) {
    setBasePet(petOf(saved))
    if (pet === basePet) setPet(petOf(saved))
  }
  const [tryOn, setTryOn] = useState(null)
  const [saving, runSave] = useBusy()
  const kit = isKitAvatar(saved)
  const lockedItem = (id) => {
    const item = avatarItem(PET_FIELD, id)
    return item && !access.isUnlocked(item) ? item : null
  }
  const shownPet = tryOn ?? pet
  const dirty = pet !== petOf(saved)
  const shown = PETS.find(p => p.id === shownPet) || PETS[0]

  const pick = (id) => {
    const locked = lockedItem(id)
    const action = pickAction({ locked: Boolean(locked), tryOn: tryOn ? { field: PET_FIELD, id: tryOn } : null, field: PET_FIELD, id })
    sounds.move('X')
    if (action === 'commit') { setPet(id); setTryOn(null) }
    else if (action === 'clear') setTryOn(null)
    else setTryOn(id)
  }
  // Sheets never nest: close this one before the paywall opens.
  const unlock = () => {
    const item = lockedItem(tryOn)
    onClose()
    if (item) openPaywall(item)
  }

  const save = () => runSave(async () => {
    if (!dirty) { onClose(); return }
    await setProfile({ avatar: withPet(saved, pet) })
    toast.success(pet === 'none' ? 'PET PUT AWAY' : `${shown.label} IS WITH YOU!`)
    onClose()
  }, () => toast.error("COULDN'T SAVE YOUR PET — TRY AGAIN."))

  return (
    <BottomSheet onClose={onClose} ariaLabel="Pick a pet" className="bg-retro-card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-pixel text-xs text-retro-cta text-glow-cta tracking-widest">YOUR PET</h2>
        <button type="button" onClick={onClose} className="font-pixel text-[10px] text-retro-dim hover:text-retro-text p-2 -m-2">CLOSE</button>
      </div>

      {!kit ? (
        <div className="space-y-3 text-center">
          <p className="font-mono text-xs text-retro-dim leading-relaxed">Classic critters travel alone. Build a character in the look editor and a pet can come along.</p>
          <button type="button" onClick={onEditLook} className="min-h-11 px-4 rounded border-2 border-retro-cta text-retro-cta font-pixel text-[9px] tracking-wider press">
            EDIT AVATAR
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 p-3 rounded border border-retro-border bg-retro-surface">
            <div key={`${shownPet}`} style={{ animation: 'place-pop 0.2s ease-out' }}>
              <Avatar animate id={withPet(saved, shownPet)} size={96} view="hero" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-pixel text-[10px] tracking-wider text-retro-text">{shownPet === 'none' ? 'NO PET' : shown.label}</p>
              <p className="font-mono text-[11px] leading-relaxed text-retro-dim">
                {tryOn ? 'Trying on. Not saved.' : 'Walks beside you on your profile and full-body views.'}
              </p>
              {tryOn && (
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={unlock} className="min-h-9 px-2 rounded bg-retro-cta text-retro-bg font-pixel text-[8px] tracking-wider press">UNLOCK</button>
                  <button type="button" onClick={() => setTryOn(null)} className="min-h-9 px-2 rounded border border-retro-border text-retro-dim font-pixel text-[8px] tracking-wider press">TAKE OFF</button>
                </div>
              )}
            </div>
          </div>

          <div role="radiogroup" aria-label="Pets" onKeyDown={onRadioGroupKeyDown} className="grid grid-cols-3 gap-2">
            {PETS.map((p, i) => {
              const selected = p.id === pet
              const trying = p.id === tryOn
              const locked = Boolean(lockedItem(p.id))
              const tierText = petTierText(p)
              const showTier = tierText && (selling || p.tier === 'earn')
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={i === tabStopIndex(PETS.map(o => o.id === pet)) ? 0 : -1}
                  aria-label={showTier ? `${p.label} (${tierText}${locked ? ', locked' : ''})` : p.label}
                  onClick={() => pick(p.id)}
                  className={cn(
                    'relative flex flex-col items-center gap-1.5 px-1 pt-3 pb-2 rounded border-2 transition press',
                    selected && 'border-retro-cta bg-retro-tint-cta shadow-neon-cta',
                    trying && 'border-retro-cta border-dashed',
                    !selected && !trying && `border-retro-border ${HOVER}`,
                  )}
                >
                  <PetSprite id={p.id} scale={6} label={p.id === 'none' ? 'no pet' : `${p.label.toLowerCase()} pet`} />
                  <span className={cn('w-full truncate text-center font-pixel text-[8px]', selected ? 'text-retro-cta' : 'text-retro-text')}>{p.id === 'none' ? 'NO PET' : p.label}</span>
                  {showTier && <span className="w-full text-center font-pixel text-[7px] leading-tight text-retro-dim" aria-hidden="true">{p.tier === 'earn' ? p.note?.toUpperCase() : tierText}</span>}
                  {selected && (
                    <span aria-hidden="true" className="absolute top-1 left-1 w-4 h-4 rounded-sm bg-retro-cta text-retro-bg flex items-center justify-center"><TierIcon tier="earn" /></span>
                  )}
                  {showTier && (
                    <span aria-hidden="true" className="absolute top-1 right-1 min-w-4 h-4 px-0.5 rounded-sm bg-retro-bg/90 border border-retro-border flex items-center justify-center text-retro-cta">
                      {locked ? <LockBadge size={10} /> : <TierIcon tier={p.tier} />}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="min-h-11 px-4 border border-retro-border rounded font-pixel text-[10px] text-retro-dim hover:text-retro-text">
              CANCEL
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="flex-1 min-h-11 bg-retro-cta text-retro-bg font-pixel text-[10px] tracking-widest rounded hover:shadow-neon-cta press transition disabled:opacity-40"
            >
              {saving ? 'SAVING…' : 'SAVE'}
            </button>
          </div>
        </>
      )}
    </BottomSheet>
  )
}
