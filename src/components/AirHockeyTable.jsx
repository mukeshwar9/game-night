import { cn } from '@/lib/utils'

// Portrait air-hockey table — DOM/CSS only, themed via retro tokens.
// Positions arrive normalized in court coords (w=1 × h=1.5); rendered as
// percentages of the container so any aspect works.

export default function AirHockeyTable({
  puck = { x: 0.5, y: 0.75 },
  mallets = { X: { x: 0.5, y: 1.25 }, O: { x: 0.5, y: 0.25 } },
  flash = null, // 'goal' | null
  tableRef,
}) {
  const pctX = v => `${(v / 1) * 100}%`
  const pctY = v => `${(v / 1.5) * 100}%`

  return (
    <div
      ref={tableRef}
      className="relative w-full max-w-[340px] mx-auto rounded-xl border-2 border-retro-border bg-retro-deep overflow-hidden select-none touch-none"
      style={{ aspectRatio: '1 / 1.5' }}
    >
      {/* Center line + circle */}
      <div className="absolute inset-x-0 top-1/2 h-px bg-retro-border/70" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full border border-retro-border/70" />

      {/* Goal mouths — glowing in each defender's accent */}
      <div
        className="absolute top-0 h-1 bg-retro-p2/80 shadow-neon-p2 rounded-b"
        style={{ left: `${(0.5 - 0.175) * 100}%`, width: '35%' }}
      />
      <div
        className="absolute bottom-0 h-1 bg-retro-p1/80 shadow-neon-p1 rounded-t"
        style={{ left: `${(0.5 - 0.175) * 100}%`, width: '35%' }}
      />

      {/* Puck */}
      <div
        className={cn(
          'absolute rounded-full bg-retro-text transition-none',
          flash === 'goal' && 'bg-retro-win',
        )}
        style={{
          left: pctX(puck.x),
          top: pctY(puck.y),
          width: '7%',
          aspectRatio: '1',
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 0 6px rgb(var(--c-text) / 0.5)',
        }}
      />

      {/* Mallets */}
      {['O', 'X'].map(sym => {
        const m = mallets[sym]
        return (
          <div
            key={sym}
            className={cn(
              'absolute rounded-full',
              sym === 'X'
                ? 'bg-retro-p1 shadow-neon-p1'
                : 'bg-retro-p2 shadow-neon-p2',
            )}
            style={{
              left: pctX(m.x),
              top: pctY(m.y),
              width: '12%',
              aspectRatio: '1',
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="absolute inset-[30%] rounded-full bg-retro-bg/40" />
          </div>
        )
      })}
    </div>
  )
}
