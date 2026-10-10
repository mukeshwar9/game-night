import { useState } from 'react'
import { toast } from 'sonner'
import GamePicker from './GamePicker'
import BottomSheet from './BottomSheet'

// The "play another game" popup: the compact GamePicker (search, category
// tabs, game rows) on the shared BottomSheet. GameSwitcher opens it in rooms;
// the solo hub opens it with `allowTypes` set to its playable games. Its
// height is fixed (full screen on phones, a centered 80vh dialog from `sm:`
// up) so the sheet doesn't jump as search narrows the list.
//
// `onSwitch(type)` may be async; the sheet closes once it resolves and toasts
// on failure. Extra GamePicker props (`excludeType`, `allowTypes`,
// `currentType`, `crossFamily`) pass straight through.
export default function GamePickerSheet({ onSwitch, onClose, title = 'PLAY ANOTHER GAME', ...pickerProps }) {
  const [switching, setSwitching] = useState(null) // gameType being switched to, or null

  const pick = async (type) => {
    setSwitching(type)
    try {
      await onSwitch(type)
      onClose()
    } catch {
      toast.error('SWITCH FAILED — CHECK CONNECTION')
    } finally {
      setSwitching(null)
    }
  }

  const close = () => { if (!switching) onClose() }

  return (
    <BottomSheet glass
      onClose={close}
      // Hardware/gesture back is not cancellable like a backdrop-tap — always
      // close on it, even mid-switch, so a second back press never falls
      // through to the underlying route while the async switch is still in
      // flight (M-06).
      onBack={onClose}
      ariaLabel="Play another game"
      className="space-y-3 h-[100dvh] max-h-[100dvh] rounded-none border-0 pt-[max(1rem,env(safe-area-inset-top))]
        sm:h-[80vh] sm:max-h-[80vh] sm:max-w-md sm:rounded sm:border-2 sm:pt-4"
    >
      <div className="flex items-center justify-between">
        <p className="font-pixel text-[10px] text-retro-dim tracking-widest">{title}</p>
        <button
          onClick={close}
          disabled={!!switching}
          aria-label="Close"
          className="font-pixel text-[10px] text-retro-dim hover:text-retro-text transition-colors p-3 -m-2 disabled:opacity-40"
        >
          ✕
        </button>
      </div>
      <GamePicker onSelect={pick} loadingType={switching} {...pickerProps} />
    </BottomSheet>
  )
}
