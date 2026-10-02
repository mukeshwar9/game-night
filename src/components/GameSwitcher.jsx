import { useContext, useState } from 'react'
import GamePickerSheet from './GamePickerSheet'
import { RoomSwitchContext } from '../lib/roomSwitchContext'

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
  // Game-night mode: a party room (or a party room playing a 2P game) may
  // also switch across seat families — see RoomSwitchContext.
  const crossFamily = useContext(RoomSwitchContext)

  return (
    <>
      {variant === 'icon' ? (
        <button
          onClick={() => setOpen(true)}
          title="Switch game"
          aria-label="Switch game"
          className="text-retro-dim hover:text-retro-text transition-colors p-3.5 -m-2 rounded"
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
        <GamePickerSheet
          onSwitch={onSwitch}
          onClose={() => setOpen(false)}
          excludeType={currentType}
          crossFamily={crossFamily}
        />
      )}
    </>
  )
}
