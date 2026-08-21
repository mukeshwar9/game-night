
// Artillery arena — SVG terrain + tanks + animated shell trail.
// Terrain heights arrive normalized (0–1, height UP); rendered flipped.

export default function ArtilleryArena({
  terrain = [],
  tanks = { X: { x: 0.2 }, O: { x: 0.8 } },
  path = null,        // [{x,y}] of the shot being animated
  impact = null,
  width = 340,
}) {
  const W = width
  const H = Math.round(width * 0.55)
  const toPxX = v => v * W
  const toPxY = v => v * H // y already screen-like (down-positive) in sim

  const terrainPath = terrain.length
    ? `M 0 ${H} ` +
      terrain.map((h, i) => `L ${(i / (terrain.length - 1)) * W} ${H - h * H}`).join(' ') +
      ` L ${W} ${H} Z`
    : ''

  const pathD = path && path.length
    ? path.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toPxX(p.x)} ${toPxY(p.y)}`).join(' ')
    : ''
  const head = path && path[path.length - 1]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full rounded-lg border-2 border-retro-border bg-retro-deep"
      role="img"
      aria-label="artillery arena"
    >
      {/* terrain */}
      <path d={terrainPath} fill="rgb(var(--c-structure) / 0.9)" stroke="rgb(var(--c-text) / 0.35)" strokeWidth="1" />

      {/* goal-free sky accents: center marker */}
      <line x1={W / 2} y1={0} x2={W / 2} y2={6} stroke="rgb(var(--c-dim))" strokeWidth="1" />

      {/* shell trail */}
      {pathD && (
        <path d={pathD} fill="none" stroke="rgb(var(--c-dim))" strokeWidth="1" strokeDasharray="2 4" opacity="0.6" />
      )}
      {head && (
        <circle cx={toPxX(head.x)} cy={toPxY(head.y)} r="3" fill="rgb(var(--c-win))" className="drop-shadow-[0_0_4px_rgb(var(--c-win))]" />
      )}

      {/* impact burst */}
      {impact && impact.kind !== 'out' && (
        <>
          <circle cx={toPxX(impact.x)} cy={toPxY(impact.y)} r="10" fill="rgb(var(--c-danger))" opacity="0.25" />
          <circle cx={toPxX(impact.x)} cy={toPxY(impact.y)} r="5" fill="rgb(var(--c-danger))" />
        </>
      )}

      {/* tanks */}
      {['X', 'O'].map(sym => {
        const t = tanks[sym]
        if (!t || t.hp <= 0) return null
        const px = toPxX(t.x)
        const py = H - (terrain.length ? surfaceHeightAt(terrain, t.x) : 0) * H
        return (
          <g key={sym}>
            <rect x={px - 7} y={py - 8} width="14" height="7" rx="1"
              fill={sym === 'X' ? 'rgb(var(--c-p1))' : 'rgb(var(--c-p2))'} />
            <rect x={px - 2} y={py - 12} width="4" height="4"
              fill={sym === 'X' ? 'rgb(var(--c-p1))' : 'rgb(var(--c-p2))'} />
            <rect x={px + (sym === 'X' ? 2 : -12)} y={py - 11} width="10" height="2"
              fill="rgb(var(--c-text) / 0.7)" />
          </g>
        )
      })}
    </svg>
  )
}

function surfaceHeightAt(terrain, x) {
  const fx = Math.max(0, Math.min(1, x)) * (terrain.length - 1)
  const i = Math.floor(fx)
  const j = Math.min(i + 1, terrain.length - 1)
  return terrain[i] * (1 - (fx - i)) + terrain[j] * (fx - i)
}
