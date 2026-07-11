import { useState } from 'react'
import { toast } from 'sonner'
import GamePicker from './GamePicker'
import BottomSheet from './BottomSheet'

// Grid-of-squares glyph for the header trigger — reads as "browse / pick another
// game" and pairs with the grid layout of the picker it opens. Styled via
// currentColor to match the other header icon buttons (rules / mute).
function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

// `variant="button"` (default): the prominent labelled button used on end-of-game
// screens. `variant="icon"`: a compact header icon so players can switch the game
// at any point during play. Both open the same picker modal.
export default function GameSwitcher({ currentType, onSwitch, variant = 'button' }) {
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(null) // gameType being switched to, or null

  const pick = async (type) => {
    setSwitching(type)
    try {
      await onSwitch(type)
      setOpen(false)
    } catch {
      toast.error('SWITCH FAILED — CHECK CONNECTION')
    } finally {
      setSwitching(null)
    }
  }

  const close = () => { if (!switching) setOpen(false) }
  // Hardware/gesture back is not cancellable like a backdrop-tap — always
  // close on it, even mid-switch, so a second back press never falls through
  // to the underlying route while the async switch is still in flight (M-06).
  const closeOnBack = () => setOpen(false)

  return (
    <>
      {variant === 'icon' ? (
        <button
          onClick={() => setOpen(true)}
          title="Switch game"
          aria-label="Switch game"
          className="text-retro-dim hover:text-retro-text transition-colors p-3 -m-2 rounded"
        >
          <GridIcon />
        </button>
      ) : (
        <div className="flex flex-col items-center mt-2">
          <button
            onClick={() => setOpen(true)}
            className="px-3 py-2 font-pixel text-[10px] border border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 transition-all active:scale-95"
          >
            SWITCH GAME
          </button>
        </div>
      )}

      {open && (
        <BottomSheet onClose={close} onBack={closeOnBack} ariaLabel="Play another game" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-pixel text-[10px] text-retro-dim tracking-widest">PLAY ANOTHER GAME</p>
            <button
              onClick={close}
              disabled={!!switching}
              aria-label="Close"
              className="font-pixel text-[10px] text-retro-dim hover:text-retro-text transition-colors p-3 -m-2 disabled:opacity-40"
            >
              ✕
            </button>
          </div>
          <GamePicker onSelect={pick} excludeType={currentType} loadingType={switching} />
        </BottomSheet>
      )}
    </>
  )
}
