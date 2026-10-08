import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import BottomSheet from './BottomSheet'
import RewardPreview from './ArrowsRewardPreview'
import useOwnAvatar, { lookWith } from '../hooks/useOwnAvatar'
import useBusy from '../hooks/useBusy'
import { announcedItems } from '../lib/arrowsRewardsLogic'
import { isKitAvatar, optionInfo } from '../lib/avatarKit'
import { setProfile } from '../lib/social'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

const FIELD_LABEL = { hat: 'HAT', glasses: 'GLASSES', outfit: 'OUTFIT', pet: 'PET', bg: 'BACKDROP', frame: 'FRAME' }
const BTN = 'min-h-11 px-4 py-2.5 font-pixel text-[10px] rounded transition press'

// Opens when an Arrows result (or the first visit of a player who already has
// stars) reaches reward steps. One sheet for every step reached: each new item on
// the player's own avatar, with WEAR IT per item (saved through setProfile, the
// same path the avatar studio uses). LATER closes.
export default function ArrowsRewardSheet({ steps, onClose }) {
  const saved = useOwnAvatar()
  const items = announcedItems(steps)
  const badge = steps.find((s) => s.badge)?.badge
  const [worn, setWorn] = useState(() => new Set())
  const [wearingKey, setWearingKey] = useState(null)
  const [busy, run] = useBusy()
  // Wearing two items in a row builds on the first save, before the profile listener catches up.
  const current = useRef(saved)
  useEffect(() => { current.current = saved }, [saved])
  useEffect(() => { sounds.matchWin() }, [])
  const kit = isKitAvatar(saved)

  const wear = (it) => run(async () => {
    sounds.touch()
    setWearingKey(`${it.field}:${it.id}`)
    const next = lookWith(current.current, it.field, it.id)
    await setProfile({ avatar: next })
    current.current = next
    setWorn((w) => new Set(w).add(`${it.field}:${it.id}`))
    toast.success(`${optionInfo(it.field, it.id).label} ON!`)
  }, () => toast.error("COULDN'T SAVE YOUR AVATAR — TRY AGAIN."))

  return (
    <BottomSheet centered onClose={onClose} ariaLabel="New Arrows rewards">
      <div className="space-y-3">
        <div className="text-center space-y-1">
          <p className="font-pixel text-sm text-retro-win text-glow-win">{items.length > 1 ? 'NEW REWARDS!' : 'NEW REWARD!'}</p>
          <p className="font-pixel text-[8px] text-retro-dim leading-relaxed">EARNED WITH ARROWS CAMPAIGN STARS</p>
        </div>
        <ul className="space-y-2">
          {items.map((it) => {
            const key = `${it.field}:${it.id}`
            const isWorn = worn.has(key)
            const thisBusy = busy && wearingKey === key
            return (
              <li key={key} className="flex items-center gap-3 rounded border border-retro-border bg-retro-card px-2 py-2">
                <span className="shrink-0 w-14 flex items-center justify-center">
                  <RewardPreview avatar={saved} field={it.field} id={it.id} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-pixel text-[9px] text-retro-text leading-snug break-words">{optionInfo(it.field, it.id).label}</span>
                  <span className="block font-pixel text-[7px] text-retro-dim mt-0.5">{FIELD_LABEL[it.field] ?? it.field.toUpperCase()} · {it.stars}★</span>
                </span>
                {kit ? (
                  <button
                    onClick={() => wear(it)}
                    disabled={busy || isWorn}
                    className={cn(BTN, 'shrink-0 min-w-[5.5rem] px-2', isWorn ? 'border border-retro-win text-retro-win' : 'bg-retro-cta text-retro-bg hover:shadow-neon-cta', 'disabled:opacity-60')}
                  >
                    {isWorn ? 'WORN' : thisBusy ? 'WEARING…' : 'WEAR IT'}
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
        {badge && <p className="text-center font-pixel text-[8px] text-retro-win leading-relaxed">{badge} BADGE ON YOUR PROFILE</p>}
        {!kit && <p className="text-center font-pixel text-[8px] text-retro-dim leading-relaxed">PICK THEM IN EDIT AVATAR ON YOUR PROFILE</p>}
        <button onClick={onClose} className={cn(BTN, 'w-full border border-retro-border text-retro-dim hover:border-retro-cta/50 hover:text-retro-text')}>LATER</button>
      </div>
    </BottomSheet>
  )
}
