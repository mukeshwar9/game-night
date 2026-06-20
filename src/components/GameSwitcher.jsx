import { useEffect, useState } from 'react'
import GamePicker from './GamePicker'

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

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const pick = (type) => {
    setOpen(false)
    onSwitch(type)
  }

  return (
    <>
      {variant === 'icon' ? (
        <button
          onClick={() => setOpen(true)}
          title="Switch game"
          aria-label="Switch game"
          className="text-retro-dim hover:text-retro-text transition-colors p-1 rounded"
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
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm max-h-[80vh] overflow-y-auto bg-retro-bg border-2 border-retro-border rounded p-4 space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="font-pixel text-[10px] text-retro-dim tracking-widest">PLAY ANOTHER GAME</p>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="font-pixel text-[10px] text-retro-dim hover:text-retro-text transition-colors px-1"
              >
                ✕
              </button>
            </div>
            <GamePicker onSelect={pick} excludeType={currentType} />
          </div>
        </div>
      )}
    </>
  )
}
