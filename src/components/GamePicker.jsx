import { GAME_TYPES } from '../lib/games'
import { cn } from '@/lib/utils'

export default function GamePicker({ onSelect, excludeType, loadingType }) {
  const games = GAME_TYPES.filter(t => t.type !== excludeType)
  return (
    <div className="grid grid-cols-2 gap-3">
      {games.map(({ type, label, desc, Icon }) => (
        <button
          key={type}
          onClick={() => onSelect(type)}
          disabled={!!loadingType}
          className={cn(
            'flex flex-col items-center gap-2.5 py-4 px-2 border-2 rounded',
            'transition-all active:scale-95',
            loadingType === type
              ? 'border-retro-cta bg-retro-tint-cta shadow-neon-cta'
              : 'border-retro-border bg-retro-card hover:border-retro-cta/50',
            loadingType && loadingType !== type && 'opacity-40',
          )}
        >
          <div className={cn(
            'w-10 h-10 rounded flex items-center justify-center',
            loadingType === type ? 'text-retro-cta' : 'text-retro-dim',
          )}>
            {Icon && <Icon />}
          </div>
          <div className="text-center">
            <p className="font-pixel text-[10px] text-retro-text leading-relaxed">{label}</p>
            <p className="font-mono text-[10px] text-retro-dim mt-0.5">{desc}</p>
          </div>
          {loadingType === type && (
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1 h-1 bg-retro-cta rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          )}
        </button>
      ))}
    </div>
  )
}
