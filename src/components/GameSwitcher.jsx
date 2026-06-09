import { GAME_TYPES } from '../lib/games'

export default function GameSwitcher({ currentType, onSwitch }) {
  const others = GAME_TYPES.filter(t => t.type !== currentType)
  return (
    <div className="flex flex-col items-center gap-2 mt-2">
      <p className="font-pixel text-[8px] text-retro-dim tracking-widest">PLAY ANOTHER GAME</p>
      <div className="flex gap-2 justify-center flex-wrap">
        {others.map(t => (
          <button
            key={t.type}
            onClick={() => onSwitch(t.type)}
            className="px-3 py-2 font-pixel text-[9px] border border-retro-cyan text-retro-cyan rounded hover:shadow-neon-cyan transition-all active:scale-95"
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
