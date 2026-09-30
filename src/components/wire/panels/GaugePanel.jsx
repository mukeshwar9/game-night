// WIRE CROSSED Tech panel: PRESSURE GAUGE. A semicircle dial with GREEN, AMBER
// and RED bands (zone colours come from CSS variables; the zone name and the
// percentage are also printed, so colour is never the only cue), a needle, and
// three valves. Pressure is computed from the synced `wire.gauge` and the
// server clock `now` the page ticks; every verdict (vent, strike, burst) comes
// from applyWireAction / applyGaugeBurst.
import { cn } from '@/lib/utils'
import { GAUGE_VALVES, GAUGE_ZONE_NAMES, gaugePressure, gaugeZone } from '../../../lib/wireLogic'

const CX = 100
const CY = 100
const R = 80

/** Point on the dial for a pressure (0 = far left, 100 = far right). */
function point(pct, radius = R) {
  const angle = Math.PI * (1 - pct / 100)
  return [CX + radius * Math.cos(angle), CY - radius * Math.sin(angle)]
}

function arc(from, to) {
  const [x1, y1] = point(from)
  const [x2, y2] = point(to)
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

const BANDS = [
  { zone: 'green', from: 0, to: 50, color: 'rgb(var(--c-win))' },
  { zone: 'amber', from: 50, to: 80, color: 'rgb(var(--wire-yellow))' },
  { zone: 'red', from: 80, to: 100, color: 'rgb(var(--wire-red))' },
]

const HINTS = {
  green: 'SAFE. DO NOT VENT YET.',
  amber: 'VENT WITH THE AMBER VALVE.',
  red: 'VENT NOW WITH THE RED VALVE!',
}

export default function GaugePanel({ wire, bomb, index, onAction, disabled, busy, now }) {
  const pressure = gaugePressure(wire, bomb, now)
  const zone = gaugeZone(pressure)
  const [nx, ny] = point(pressure, 66)
  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 200 118" className="w-full max-w-xs" role="img" aria-label={`Pressure ${Math.floor(pressure)} percent, ${GAUGE_ZONE_NAMES[zone]} zone`}>
        {BANDS.map(b => (
          <path key={b.zone} d={arc(b.from, b.to)} fill="none" strokeWidth="14" style={{ stroke: b.color }} />
        ))}
        {[50, 80].map(t => {
          const [ax, ay] = point(t, R - 11)
          const [bx, by] = point(t, R + 11)
          const [lx, ly] = point(t, R + 20)
          return (
            <g key={t} aria-hidden="true">
              <line x1={ax} y1={ay} x2={bx} y2={by} strokeWidth="2" style={{ stroke: 'rgb(var(--c-bg))' }} />
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize="7" className="font-pixel" style={{ fill: 'rgb(var(--c-dim))' }}>{t}</text>
            </g>
          )
        })}
        <line x1={CX} y1={CY} x2={nx} y2={ny} strokeWidth="3" strokeLinecap="round" style={{ stroke: 'rgb(var(--c-text))' }} />
        <circle cx={CX} cy={CY} r="5" style={{ fill: 'rgb(var(--c-text))' }} />
      </svg>
      <div className="text-center space-y-1 -mt-2">
        <p className="font-pixel text-2xl tabular-nums text-retro-text" aria-hidden="true">{Math.floor(pressure)}%</p>
        <p
          className={cn('font-pixel text-[11px] tracking-widest', zone === 'green' ? 'text-retro-win' : 'text-retro-text', zone === 'red' && 'arcade-blink')}
          aria-live="polite"
        >
          <span className="sr-only">Zone: </span>{GAUGE_ZONE_NAMES[zone]}
        </p>
        <p className="font-pixel text-[7px] text-retro-dim tracking-wider">{HINTS[zone]}</p>
      </div>
      <div className="flex gap-2 w-full" role="group" aria-label="Valves">
        {GAUGE_VALVES.map(valve => (
          <button
            key={valve}
            type="button"
            disabled={disabled || busy}
            onClick={() => onAction({ mod: index, kind: 'vent', valve })}
            className="flex-1 min-h-11 rounded border-2 border-retro-border bg-retro-deep font-pixel text-[10px] tracking-wider text-retro-text hover:border-retro-cta disabled:opacity-40"
          >{busy ? 'VENTING…' : `VALVE ${valve}`}</button>
        ))}
      </div>
      <p className="font-pixel text-[7px] text-retro-dim text-center">
        VENTING IN GREEN OR WITH THE WRONG VALVE IS A STRIKE · AT 100% IT BURSTS
      </p>
    </div>
  )
}
