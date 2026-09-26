import { useState } from 'react'
import { toast } from 'sonner'
import AvatarPicker from './AvatarPicker'
import useBusy from '../hooks/useBusy'
import { canonicalAvatar } from '../lib/avatars'
import { NAME_MAX, validateName } from '../lib/onboardingLogic'
import { setProfile } from '../lib/social'
import { cn } from '@/lib/utils'

// Name + avatar editor for the Settings sheet (lazy-loaded from SettingsButton).
// Edits are a draft until SAVE; saving writes the profile and the localStorage
// mirror the synchronous Home/Game reads use.
export default function IdentityEditor({ name: savedName, avatar: savedAvatar, onDone }) {
  const [name, setName] = useState(savedName)
  const [avatar, setAvatar] = useState(canonicalAvatar(savedAvatar))
  const [saving, runSave] = useBusy()
  const check = validateName(name)
  const dirty = check.ok && (check.name !== savedName || avatar !== canonicalAvatar(savedAvatar))

  const save = () => runSave(async () => {
    if (!check.ok) return
    try {
      localStorage.setItem('playerName', check.name)
      localStorage.setItem('playerAvatar', avatar)
    } catch { /* quota */ }
    await setProfile({ displayName: check.name, avatar })
    toast.success('PROFILE SAVED!')
    onDone?.()
  }, () => toast.error("COULDN'T SAVE — TRY AGAIN."))

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="settings-name" className="font-pixel text-[9px] text-retro-dim tracking-widest">NAME</label>
        <input
          id="settings-name"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={NAME_MAX + 8}
          autoComplete="nickname"
          aria-invalid={!check.ok}
          aria-describedby="settings-name-note"
          className={cn(
            'w-full bg-retro-surface border-2 rounded px-3 py-2.5 font-pixel text-xs text-retro-text focus:outline-none',
            check.ok ? 'border-retro-border focus:border-retro-p1' : 'border-retro-p2',
          )}
        />
        <p id="settings-name-note" role={check.ok ? undefined : 'alert'} className={cn('font-pixel text-[8px] leading-relaxed', check.ok ? 'text-retro-dim' : 'text-retro-p2')}>
          {check.ok ? 'CHANGES SHOW IN YOUR NEXT GAME' : check.error}
        </p>
      </div>
      <AvatarPicker value={avatar} onChange={setAvatar} name={check.name} previewSize={72} />
      <div className="flex gap-2">
        <button type="button" onClick={onDone} disabled={saving} className="min-h-11 px-4 border border-retro-border rounded font-pixel text-[10px] text-retro-dim hover:text-retro-text">
          CANCEL
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="flex-1 min-h-11 bg-retro-cta text-retro-bg font-pixel text-[10px] tracking-widest rounded hover:shadow-neon-cta active:scale-95 transition-all disabled:opacity-40"
        >
          {saving ? 'SAVING…' : 'SAVE'}
        </button>
      </div>
    </div>
  )
}
