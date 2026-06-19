import { cn } from '@/lib/utils'

export default function CategoryTabs({ categories, active, onSelect }) {
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {categories.map(({ id, label, count }) => (
        <button
          key={id}
          onClick={() => onSelect(id)}
          className={cn(
            'px-2.5 py-1.5 rounded border font-pixel text-[9px] tracking-wider transition-all active:scale-95',
            active === id
              ? 'border-retro-cta text-retro-cta shadow-neon-cta bg-retro-tint-cta'
              : 'border-retro-border text-retro-dim hover:border-retro-p1/50 hover:text-retro-text bg-retro-card',
          )}
        >
          {label}
          {count != null && <span className="opacity-60 ml-1">·{count}</span>}
        </button>
      ))}
    </div>
  )
}
