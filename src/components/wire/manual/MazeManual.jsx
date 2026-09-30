// WIRE CROSSED Handbook page: PIPES. The map shows walls, the start (○) and
// the flag (⚑). Tier III valves are drawn on their edge as ▶ ◀ ▲ ▼ (the way
// through) and listed below in words.
import { cn } from '@/lib/utils'
import { cellName, isOpen, mazeSize, stepCell } from '../../../lib/wireLogic'
import Section from './Section'

const ARROW = { N: '▲', E: '▶', S: '▼', W: '◀' }
const EDGE = {
  N: 'top-0 left-1/2 -translate-x-1/2',
  E: 'right-0 top-1/2 -translate-y-1/2',
  S: 'bottom-0 left-1/2 -translate-x-1/2',
  W: 'left-0 top-1/2 -translate-y-1/2',
}

/** Direction of the valve `v` (from -> to) on a grid of `size`. */
const valveDir = (v, size) => ['N', 'E', 'S', 'W'].find(d => stepCell(v.from, d, size) === v.to)

function MazeCellManual({ cell, open, device, size, valves }) {
  const row = Math.floor(cell / size)
  const here = valves.filter(v => v.from === cell)
  return (
    <>
      {cell % size === 0 && <span className="self-center font-pixel text-[8px] text-retro-dim">{row + 1}</span>}
      <span
        className={cn(
          'relative h-8 flex items-center justify-center font-pixel text-[12px] bg-retro-deep border-2',
          isOpen(open, cell, 'N') ? 'border-t-transparent' : 'border-t-retro-text',
          isOpen(open, cell, 'S') ? 'border-b-transparent' : 'border-b-retro-text',
          isOpen(open, cell, 'W') ? 'border-l-transparent' : 'border-l-retro-text',
          isOpen(open, cell, 'E') ? 'border-r-transparent' : 'border-r-retro-text',
        )}
      >
        {cell === device?.start ? <span className="text-retro-cta">○</span>
          : cell === device?.exit ? <span className="text-retro-win">⚑</span> : null}
        {here.map(v => {
          const d = valveDir(v, size)
          return (
            <span key={v.to} className={cn('absolute font-pixel text-[7px] leading-none text-retro-p2', EDGE[d])} aria-hidden="true">
              {ARROW[d]}
            </span>
          )
        })}
      </span>
    </>
  )
}

export default function MazeManual({ module }) {
  const { manual, device, tier = 1 } = module
  const { open } = manual
  const valves = manual.valves ?? []
  const size = mazeSize(module)
  const intro = tier >= 2
    ? `The Tech sees only their dot (●)${tier >= 3 ? ' and their FUEL' : ''}, not the flag (⚑). Tell them where to go: you see the walls and the flag. Walking into a wall is a strike.${
      tier >= 3 ? ' A one-way valve (▶ ◀ ▲ ▼ on an edge) can only be passed in the way it points; going against it is a strike. Every move burns 1 fuel: when the fuel runs out, that is a strike and the Tech goes back to the start.' : ''
    }`
    : 'The Tech sees only their dot (●) and the flag (⚑). You see the walls. Steer them there one step at a time; walking into a wall is a strike.'
  return (
    <Section title="PIPES" intro={intro}>
      <div className="flex justify-center">
        <div
          className="grid"
          style={{ gridTemplateColumns: `1rem repeat(${size}, ${size > 6 ? '2rem' : '2.25rem'})` }}
          role="img"
          aria-label={`Pipes map, ${size} by ${size}. Start ${cellName(device.start, size)}, flag ${cellName(device.exit, size)}.`}
        >
          <span />
          {'ABCDEFGH'.slice(0, size).split('').map(c => <span key={c} className="text-center font-pixel text-[8px] text-retro-dim">{c}</span>)}
          {Array.from({ length: size * size }).map((_, cell) => (
            <MazeCellManual key={cell} cell={cell} open={open} device={device} size={size} valves={valves} />
          ))}
        </div>
      </div>
      {valves.length > 0 && (
        <ul className="space-y-1" aria-label="One-way valves">
          {valves.map(v => (
            <li key={`${v.from}-${v.to}`} className="font-mono text-[11px] text-retro-text">
              <span className="font-pixel text-[9px] text-retro-p2">{ARROW[valveDir(v, size)]}</span>{' '}
              valve: {cellName(v.from, size)} to {cellName(v.to, size)} only
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
