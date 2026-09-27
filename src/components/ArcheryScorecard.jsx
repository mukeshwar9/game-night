import { cn } from '@/lib/utils'

const SEAT = {
  X: { glyph: '●', color: 'text-retro-p1' },
  O: { glyph: '▲', color: 'text-retro-p2' },
  A: { glyph: '■', color: 'text-retro-p3' },
  B: { glyph: '◆', color: 'text-retro-p4' },
}

export default function ArcheryScorecard({ seats, card, names = {}, currentTurn, format = 'STANDARD' }) {
  return (
    <section className="overflow-hidden rounded border border-retro-border bg-retro-card" aria-label="Archery scorecard">
      <header className="flex items-center justify-between border-b border-retro-border px-3 py-2">
        <h2 className="font-pixel text-[9px] tracking-widest text-retro-cta">HIGH SCORES</h2>
        <span className="font-pixel text-[8px] text-retro-dim">{format}</span>
      </header>
      <div className="divide-y divide-retro-border/60">
        {seats.map((seat) => {
          const row = card[seat] || { score: 0, xCount: 0, arrows: 0, ends: [] }
          const tone = SEAT[seat]
          return (
            <div key={seat} className={cn('grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 px-3 py-2', currentTurn === seat && 'bg-retro-deep')}>
              <div className="flex min-w-0 items-center gap-2">
                <span className={cn('w-4 text-center font-pixel text-[10px]', tone.color)}>{tone.glyph}</span>
                <span className="truncate font-mono text-[11px] text-retro-text">
                  {(names[seat] || `PLAYER ${seat}`).toUpperCase()}{currentTurn === seat ? ' · UP' : ''}
                </span>
              </div>
              <span className="font-pixel text-[9px] text-retro-dim" title="X rings">X{row.xCount}</span>
              <span className="font-mono text-[9px] text-retro-dim">{row.arrows} A</span>
              <strong className={cn('min-w-8 text-right font-pixel text-[11px]', tone.color)}>{row.score}</strong>
            </div>
          )
        })}
      </div>
      {seats.length > 0 && (
        <div className="flex items-center justify-between border-t border-retro-border px-3 py-1.5 font-mono text-[9px] text-retro-dim">
          <span>END SCORES</span>
          <span className="flex gap-2">{seats[0] && (card[seats[0]]?.ends || []).map((score, i) => <span key={i}>{i + 1}:{score ?? 0}</span>)}</span>
        </div>
      )}
    </section>
  )
}
