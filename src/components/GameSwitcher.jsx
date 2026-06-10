import { useState } from 'react'
import GamePicker from './GamePicker'

export default function GameSwitcher({ currentType, onSwitch }) {
  const [open, setOpen] = useState(false)

  const pick = (type) => {
    setOpen(false)
    onSwitch(type)
  }

  return (
    <div className="flex flex-col items-center mt-2">
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-2 font-pixel text-[10px] border border-retro-cyan text-retro-cyan rounded hover:shadow-neon-cyan transition-all active:scale-95"
      >
        SWITCH GAME
      </button>

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
    </div>
  )
}
