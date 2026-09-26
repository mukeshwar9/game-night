import { HOLES, getCourse } from '../lib/minigolfCourses'
import { PICKUP_SCORE, totalOf } from '../lib/minigolfLogic'
import { SEAT_GLYPHS, seatColor } from '../lib/minigolfUi'
import { cn } from '@/lib/utils'

// Scorecard: holes across, players down. Under par is circled, over par is
// boxed, P = picked up — golf's own colour-free marks.
export default function MinigolfScorecard({ course, order, meta, scores, currentPos = -1 }) {
  const holes = getCourse(course).holes
  const par = holes.reduce((s, i) => s + HOLES[i].par, 0)
  return (
    <table className="w-full border-collapse font-pixel text-[7px] leading-none">
      <thead>
        <tr className="text-retro-dim">
          <th className="text-left py-1.5 pr-1 font-normal">HOLE</th>
          {holes.map((_, i) => (
            <th key={i} className={cn('py-1.5 font-normal text-center', i === currentPos && 'text-retro-cta')}>{i + 1}</th>
          ))}
          <th className="py-1.5 font-normal text-center">TOT</th>
        </tr>
      </thead>
      <tbody>
        <tr className="text-retro-dim border-t border-retro-border">
          <td className="py-1.5 pr-1">PAR</td>
          {holes.map((h, i) => <td key={i} className="py-1.5 text-center">{HOLES[h].par}</td>)}
          <td className="py-1.5 text-center">{par}</td>
        </tr>
        {order.map((uid) => {
          const seat = meta[uid]?.seat ?? 0
          const row = scores[uid] || []
          return (
            <tr key={uid} className="border-t border-retro-border">
              <td className="py-1.5 pr-1 max-w-[4.5rem] truncate" style={{ color: seatColor(seat) }}>
                {SEAT_GLYPHS[seat]} {meta[uid]?.name ?? '?'}
              </td>
              {holes.map((h, i) => {
                const v = row[i]
                if (v == null) return <td key={i} className="py-1.5 text-center text-retro-dim">·</td>
                const p = HOLES[h].par
                if (v >= PICKUP_SCORE) {
                  return <td key={i} className="py-1.5 text-center text-retro-p2"><span className="inline-block px-0.5 border border-retro-p2" title="Picked up">P</span></td>
                }
                if (v < p) return <td key={i} className="py-1.5 text-center text-retro-win"><span className="inline-block min-w-[1.3em] py-0.5 rounded-full border border-retro-win" title="Under par">{v}</span></td>
                if (v > p) return <td key={i} className="py-1.5 text-center text-retro-text"><span className="inline-block px-0.5 border border-retro-dim" title="Over par">{v}</span></td>
                return <td key={i} className="py-1.5 text-center text-retro-text">{v}</td>
              })}
              <td className="py-1.5 text-center text-retro-text">{totalOf(row)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
