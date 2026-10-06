import { cn } from '@/lib/utils'
import { PLAYER_GLYPHS, PLAYER_TOKENS } from './animalStackDraw'

// Seat cards for ANIMAL STACK: glyph + name + hearts. Seats are colour AND
// glyph (● ▲ ■ ◆) so identity never rests on colour alone.
const ON = {
  p1: 'border-retro-p1 bg-retro-tint-p1/60 shadow-neon-p1',
  p2: 'border-retro-p2 bg-retro-tint-p2/60 shadow-neon-p2',
  p3: 'border-retro-p3 bg-retro-tint-p3/60 shadow-neon-p3',
  p4: 'border-retro-p4 bg-retro-tint-p4/60 shadow-neon-p4',
}
const TEXT = { p1: 'text-retro-p1', p2: 'text-retro-p2', p3: 'text-retro-p3', p4: 'text-retro-p4' }

export default function AnimalStackRail({ seats, turn, you = null, maxHearts }) {
  const cols = seats.length >= 4 ? 'grid-cols-4' : seats.length === 3 ? 'grid-cols-3' : seats.length === 2 ? 'grid-cols-2' : 'grid-cols-1'
  return (
    <div className={cn('grid gap-1.5', cols)}>
      {seats.map((s, i) => {
        const tok = PLAYER_TOKENS[i]
        const out = s.hearts <= 0
        let hearts = ''
        for (let h = 0; h < maxHearts; h++) hearts += h < s.hearts ? '♥' : '·'
        return (
          <div
            key={s.id ?? i}
            className={cn(
              'min-w-0 border-2 rounded px-2 py-1.5 transition duration-200',
              i === turn && !out ? ON[tok] : 'border-retro-border bg-retro-card',
              out && 'opacity-40',
            )}
          >
            <div className={cn('font-pixel text-[9px] truncate', TEXT[tok])}>
              {PLAYER_GLYPHS[i]} {s.name}{i === you ? <span className="font-mono text-[10px] text-retro-dim"> YOU</span> : null}
            </div>
            <div className="font-pixel text-[8px] text-retro-danger tracking-wider" aria-label={`${s.hearts} hearts`}>
              {out ? 'OUT' : hearts}{s.offline ? <span className="text-retro-dim"> · AWAY</span> : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
