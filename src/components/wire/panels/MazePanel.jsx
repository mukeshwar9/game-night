// WIRE CROSSED Tech panel: PIPES. Tier I shows the flag; tier II+ hides it;
// tier III shows a FUEL counter instead. Arrow keys move.
import { cn } from '@/lib/utils'
import useGameKeys from '../../../hooks/useGameKeys'
import { DIRS, cellName, mazeMoves, mazePos, mazeSize } from '../../../lib/wireLogic'

const PAD = [
  { dir: 'N', label: '▲', area: 'col-start-2' },
  { dir: 'W', label: '◀', area: 'col-start-1 row-start-2' },
  { dir: 'E', label: '▶', area: 'col-start-3 row-start-2' },
  { dir: 'S', label: '▼', area: 'col-start-2 row-start-3' },
]
const ARROW_KEYS = { ArrowUp: 'N', ArrowDown: 'S', ArrowLeft: 'W', ArrowRight: 'E' }

function MazeCellTech({ cell, pos, exit, size, showFlag }) {
  const row = Math.floor(cell / size)
  return (
    <>
      {cell % size === 0 && <span className="self-center font-pixel text-[8px] text-retro-dim">{row + 1}</span>}
      <span className={cn(
        'h-9 rounded-sm flex items-center justify-center font-pixel text-[12px] bg-retro-deep border border-retro-border/40',
        cell === pos && 'border-retro-cta',
      )}>
        {cell === pos ? <span className="text-retro-cta">●</span>
          : showFlag && cell === exit ? <span className="text-retro-win">⚑</span>
            : <span className="text-retro-dim text-[6px]">·</span>}
      </span>
    </>
  )
}

export default function MazePanel({ module, wire, index, onAction, disabled }) {
  const pos = mazePos(wire, index, module)
  const { exit, fuel } = module.device
  const size = mazeSize(module)
  const showFlag = (module.tier ?? 1) < 2
  const fuelLeft = fuel == null ? null : Math.max(0, fuel - mazeMoves(wire, index))
  const move = (dir) => onAction({ mod: index, kind: 'move', dir })
  useGameKeys((e) => {
    const dir = ARROW_KEYS[e.key]
    if (!dir || e.repeat) return false
    move(dir)
    return true
  }, { enabled: !disabled })
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `1rem repeat(${size}, ${size > 6 ? '2rem' : '2.25rem'})` }} aria-hidden="true">
        <span />
        {'ABCDEFGH'.slice(0, size).split('').map(c => <span key={c} className="text-center font-pixel text-[8px] text-retro-dim">{c}</span>)}
        {Array.from({ length: size * size }).map((_, cell) => (
          <MazeCellTech key={cell} cell={cell} pos={pos} exit={exit} size={size} showFlag={showFlag} />
        ))}
      </div>
      <p className="font-pixel text-[9px] text-retro-text text-center" aria-live="polite">
        YOU ● {cellName(pos, size)}
        {showFlag && <> · FLAG ⚑ {cellName(exit, size)}</>}
        {fuelLeft != null && <> · FUEL {fuelLeft} of {fuel}</>}
      </p>
      {!showFlag && (
        <p className="font-pixel text-[7px] text-retro-dim text-center">
          THE FLAG IS ON THE HANDBOOK MAP ONLY{fuelLeft != null ? ' · EVERY MOVE BURNS FUEL' : ''}
        </p>
      )}
      <div className="grid grid-cols-3 grid-rows-3 gap-1.5" role="group" aria-label={`Move${fuelLeft != null ? `, fuel ${fuelLeft}` : ''}`}>
        {PAD.map(p => (
          <button
            key={p.dir}
            type="button"
            disabled={disabled}
            onClick={() => move(p.dir)}
            aria-label={`Move ${DIRS[p.dir].word.toLowerCase()}`}
            className={cn('w-14 h-12 rounded border-2 border-retro-border bg-retro-deep font-pixel text-[14px] text-retro-text hover:border-retro-cta disabled:opacity-40', p.area)}
          >{p.label}</button>
        ))}
      </div>
    </div>
  )
}
