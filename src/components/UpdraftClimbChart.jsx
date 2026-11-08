import { useMemo } from 'react'
import { chartGeometry, climbCards } from '../lib/updraftStageLogic'
import { toMetres } from '../lib/updraftLogic'
import { cn } from '@/lib/utils'

// The result's climb chart: both heights over the round against the goal line,
// with the moments a hazard was sent, taken or a fall happened. Rendering
// only — the numbers come from updraftStageLogic. SVG text sits in viewBox
// units at 10, the in-play text floor.

const W = 270
const H = 160
const PAD = { l: 34, r: 12, t: 12, b: 22 }
const LABEL_GAP = 44
const MARK_LABEL = { sent: 'SENT', took: 'HIT', fall: 'FELL' }
const MARK_FILL = { sent: 'fill-retro-cta', took: 'fill-retro-danger', fall: 'fill-retro-danger' }

export default function UpdraftClimbChart({ samples, marks, goal, meSide = 'X', meLabel = 'YOU', rivalLabel = 'GHOST', run, tally, summit = false }) {
  const goalM = toMetres(goal)
  const g = useMemo(() => chartGeometry(samples, marks, { goalM, w: W, h: H }), [samples, marks, goalM])
  const meStroke = meSide === 'X' ? 'stroke-retro-p1' : 'stroke-retro-p2'
  const rivalStroke = meSide === 'X' ? 'stroke-retro-p2' : 'stroke-retro-p1'
  const meSwatch = meSide === 'X' ? 'text-retro-p1' : 'text-retro-p2'
  const rivalSwatch = meSide === 'X' ? 'text-retro-p2' : 'text-retro-p1'
  const mid = Math.round(goalM / 2)
  // A label only where there is room: marks closer than a label's width keep their dot.
  const labelled = new Set()
  let lastX = -Infinity
  g.marks.forEach((k, i) => { if (k.x - lastX >= LABEL_GAP) { labelled.add(i); lastX = k.x } })
  return (
    <div className="space-y-2">
      <div className="rounded border-2 border-retro-border bg-retro-card p-2">
        <div className="flex items-center justify-between font-pixel text-[10px] text-retro-dim">
          <span>HEIGHT</span>
          <span className="flex gap-2">
            <span className={meSwatch}>■ {meLabel}</span>
            <span className={rivalSwatch}>■ {rivalLabel}</span>
          </span>
        </div>
        <svg
          viewBox={`0 0 ${W + PAD.l + PAD.r} ${H + PAD.t + PAD.b}`}
          className="mt-1 w-full"
          role="img"
          aria-label={`Climb chart. You ${toMetres(run?.best ?? 0)} metres of ${goalM}.`}
        >
          <g transform={`translate(${PAD.l} ${PAD.t})`}>
            {[0, 0.5, 1].map(f => (
              <path key={f} d={`M0 ${H - f * H}H${W}`} className="stroke-retro-border" strokeWidth="1" fill="none" />
            ))}
            <path d={`M0 0H${W}`} className="stroke-retro-cta" strokeWidth="2" strokeDasharray="5 5" fill="none" />
            <g className="fill-retro-dim font-pixel" fontSize="10" textAnchor="end">
              <text x="-4" y="4">{goalM}</text>
              <text x="-4" y={H / 2 + 4}>{mid}</text>
              <text x="-4" y={H + 4}>0</text>
            </g>
            <g className="fill-retro-dim font-pixel" fontSize="10">
              <text x="0" y={H + 16}>0s</text>
              <text x={W} y={H + 16} textAnchor="end">{g.end}s</text>
            </g>
            {g.rival && <path d={g.rival} className={rivalStroke} strokeWidth="3" strokeDasharray="6 5" strokeLinecap="round" strokeLinejoin="round" fill="none" />}
            {g.me && <path d={g.me} className={meStroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />}
            {g.marks.map((k, i) => (
              <g key={i}>
                <circle cx={k.x} cy={k.y} r="5" className={MARK_FILL[k.kind]} />
                {labelled.has(i) && (
                  <text x={Math.min(k.x + 8, W - 30)} y={k.y - 8} fontSize="10" className={cn('font-pixel', MARK_FILL[k.kind])}>{MARK_LABEL[k.kind]}</text>
                )}
              </g>
            ))}
            {summit && g.last && <circle cx={g.last.x} cy={g.last.y} r="6" className="fill-retro-win" />}
          </g>
        </svg>
      </div>
      <div className="grid grid-cols-4 gap-2 font-pixel text-center">
        {climbCards(run ?? {}, tally).map(c => (
          <div key={c.id} className="rounded border-2 border-retro-border bg-retro-card px-1 py-1.5">
            <div className="text-[10px] text-retro-dim">{c.label}</div>
            <div className="text-sm text-retro-text tabular-nums">{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
