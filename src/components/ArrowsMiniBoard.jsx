import { useMemo } from 'react'
import { cellCenter } from '../lib/arrowsLogic'

const CELL = 10

// A level as a small still picture (the hub's CONTINUE card): the grid dots
// and every arrow as a line from tail to a dot at its head. Rendering only,
// no taps, hidden from assistive tech (the card names the level).
export default function ArrowsMiniBoard({ level, className }) {
  const d = useMemo(
    () => level.arrows.map((a) => `M${a.cells.map((c) => cellCenter(c, CELL).join(' ')).join('L')}`).join(''),
    [level],
  )
  const heads = useMemo(() => level.arrows.map((a) => cellCenter(a.cells[a.cells.length - 1], CELL)), [level])
  const w = level.cols * CELL
  const h = level.rows * CELL
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <path d={d} fill="none" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'rgb(var(--c-text))' }} />
      {heads.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.2} style={{ fill: 'rgb(var(--c-text))' }} />)}
    </svg>
  )
}
