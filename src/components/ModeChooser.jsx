import BottomSheet from './BottomSheet'

// Pre-start "how do you want to play" step for solo-capable games — offered
// when tapping a catalog card that has both multiplayer rooms and a working
// vs-AI/skill demo. Runs on the shared BottomSheet primitive (M-73), same as
// VariantChooser, so the app only has one modal vocabulary for "choose
// before you play".
export default function ModeChooser({ game, onFriend, onSolo, onClose }) {
  const Icon = game.Icon

  return (
    <BottomSheet onClose={onClose} ariaLabel={`${game.label} — choose how to play`} className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 text-retro-cta flex items-center justify-center">{Icon && <Icon />}</span>
          <p className="font-pixel text-[10px] text-retro-text tracking-widest">{game.label}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="font-pixel text-[10px] text-retro-dim hover:text-retro-text transition-colors p-3 -m-2"
        >
          ✕
        </button>
      </div>

      <div className="space-y-2">
        <button
          onClick={onFriend}
          className="w-full text-left p-3 rounded border-2 border-retro-border bg-retro-card
            hover:border-retro-cta/60 hover:shadow-neon-cta transition-all active:scale-[0.98]"
        >
          <span className="font-pixel text-[11px] text-retro-text">PLAY A FRIEND</span>
          <p className="font-mono text-[11px] text-retro-dim mt-1 leading-snug">Create a room, share the link.</p>
        </button>
        <button
          onClick={onSolo}
          className="w-full text-left p-3 rounded border-2 border-retro-cta/40 bg-retro-card
            hover:border-retro-cta hover:shadow-neon-cta transition-all active:scale-[0.98]"
        >
          <span className="font-pixel text-[11px] text-retro-cta text-glow-cta">VS AI / SOLO</span>
          <p className="font-mono text-[11px] text-retro-dim mt-1 leading-snug">Play instantly, no opponent needed.</p>
        </button>
      </div>
    </BottomSheet>
  )
}
