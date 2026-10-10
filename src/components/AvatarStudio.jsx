import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import AvatarPicker from './AvatarPicker'
import useArrowsStars from '../hooks/useArrowsStars'
import { decodeAvatar, isKitAvatar } from '../lib/avatarKit'
import { newUnearnedArrows } from '../lib/arrowsRewardsLogic'
import useBusy from '../hooks/useBusy'
import useModalHistory from '../hooks/useModalHistory'
import { setProfile } from '../lib/social'
import { getPremiumUi } from '../lib/premiumUi'
import { cn } from '@/lib/utils'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

// The full-screen look editor, opened from the profile card and the settings sheet
// (through avatarStudioUi + AvatarStudioHost). A header holds CANCEL and SAVE so
// they never scroll away; the picker below pins its own preview. Edits are a
// draft until SAVE. CANCEL with unsaved changes asks once ("DISCARD?") before
// throwing them away. The paywall can open on top (a locked item's UNLOCK): while
// it is up, Escape and Tab belong to it.
//
// A save from elsewhere (another device) while the studio is open: an untouched
// draft follows it; edits in progress are kept, with a notice offering the
// newer saved look instead.
export default function AvatarStudio({ saved, name, onClose }) {
  const [draft, setDraft] = useState(saved)
  const [base, setBase] = useState(saved)
  const [outsideSave, setOutsideSave] = useState(false)
  const [saving, runSave] = useBusy()
  const navigate = useNavigate()
  const arrowsStars = useArrowsStars()
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const panelRef = useRef(null)
  const dirty = draft !== saved
  if (saved !== base) {
    setBase(saved)
    if (draft === base) setDraft(saved)
    setOutsideSave(draft !== base && draft !== saved)
  }

  useModalHistory(onClose)

  const requestClose = () => {
    if (saving) return
    if (!dirty || confirmDiscard) { onClose(); return }
    setConfirmDiscard(true)
  }
  useEffect(() => {
    if (!confirmDiscard) return undefined
    const t = setTimeout(() => setConfirmDiscard(false), 3000)
    return () => clearTimeout(t)
  }, [confirmDiscard])

  // Modal boundary: focus, scroll lock, opener restore.
  useEffect(() => {
    const opener = document.activeElement
    panelRef.current?.focus({ preventScroll: true })
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
      if (opener && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])

  const closeRef = useRef(requestClose)
  useEffect(() => { closeRef.current = requestClose })
  useEffect(() => {
    const onKeyDown = (e) => {
      const premium = getPremiumUi()
      if (premium.paywallItem || premium.purchase) return
      if (e.key === 'Escape') { closeRef.current(); return }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null)
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (!panel.contains(document.activeElement)) { e.preventDefault(); first.focus() }
      else if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const save = () => runSave(async () => {
    if (!dirty) { onClose(); return }
    // Never save an Arrows reward the campaign stars have not earned (a try-on never reaches the draft; this is the backstop).
    if (isKitAvatar(draft) && newUnearnedArrows(isKitAvatar(saved) ? decodeAvatar(saved) : {}, decodeAvatar(draft), arrowsStars).length) {
      toast.error('SOME ITEMS ARE STILL LOCKED — EARN THEM IN ARROWS.')
      return
    }
    await setProfile({ avatar: draft })
    toast.success('AVATAR SAVED!')
    onClose()
  }, () => toast.error("COULDN'T SAVE YOUR AVATAR — TRY AGAIN."))

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-studio-title"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-retro-bg outline-none"
      style={{ animation: 'place-pop 0.18s ease-out' }}
    >
      <header className="shrink-0 border-b border-retro-border bg-retro-card pt-[env(safe-area-inset-top)]">
        <div className="max-w-3xl mx-auto h-14 px-3 flex items-center gap-2">
          <button
            type="button"
            onClick={requestClose}
            disabled={saving}
            className={cn(
              'min-h-11 min-w-20 px-3 rounded border font-pixel text-[9px] tracking-wider transition press',
              confirmDiscard ? 'border-retro-p2 text-retro-p2' : 'border-retro-border text-retro-dim hover:text-retro-text',
            )}
          >
            {confirmDiscard ? 'DISCARD?' : 'CANCEL'}
          </button>
          <div className="min-w-0 flex-1 text-center">
            <h2 id="avatar-studio-title" className="font-pixel text-[10px] tracking-widest text-retro-text">EDIT AVATAR</h2>
            <p className="font-pixel text-[7px] tracking-wider text-retro-dim mt-1" aria-live="polite">{dirty ? 'UNSAVED CHANGES' : 'NO CHANGES YET'}</p>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="min-h-11 min-w-20 px-3 rounded bg-retro-cta text-retro-bg font-pixel text-[9px] tracking-widest hover:shadow-neon-cta press transition disabled:opacity-40"
          >
            {saving ? 'SAVING…' : 'SAVE'}
          </button>
        </div>
      </header>
      {outsideSave && (
        <div className="shrink-0 border-b border-retro-border bg-retro-surface">
          <div role="status" className="max-w-3xl mx-auto px-4 py-1.5 flex items-center gap-2">
            <p className="min-w-0 flex-1 font-pixel text-[8px] leading-relaxed text-retro-text">
              SAVED ON ANOTHER DEVICE. <span className="text-retro-dim">YOUR EDITS ARE KEPT.</span>
            </p>
            <button
              type="button"
              onClick={() => { setDraft(saved); setOutsideSave(false) }}
              className="shrink-0 min-h-9 px-2 rounded border border-retro-border font-pixel text-[8px] tracking-wider text-retro-cta hover:border-retro-cta press"
            >
              USE SAVED
            </button>
            <button
              type="button"
              onClick={() => setOutsideSave(false)}
              aria-label="Dismiss notice"
              className="shrink-0 min-h-9 min-w-9 px-2 rounded font-pixel text-[8px] text-retro-dim hover:text-retro-text press"
            >
              OK
            </button>
          </div>
        </div>
      )}
      <div className={cn('flex-1 overflow-y-auto overscroll-contain', saving && 'pointer-events-none opacity-60')}>
        <div className="max-w-3xl mx-auto px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <AvatarPicker value={draft} onChange={setDraft} name={name} previewSize={144} wide onPlayArrows={() => { onClose(); navigate('/solo/arrows') }} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
