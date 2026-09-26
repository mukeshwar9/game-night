// WIRE CROSSED: the Tech's device panels, one per module type. Rendering and
// input only — every verdict comes from applyWireAction (src/lib/wireLogic.js)
// via the page's onAction.
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import useGameKeys from '../../hooks/useGameKeys'
import {
  COLOR_LETTERS, COLOR_NAMES, DIRS, MAZE_CELLS, MAZE_SIZE, TAP_MAX_MS,
  cellName, isCut, mazePos, pressedCount,
} from '../../lib/wireLogic'
import WireGlyph from './WireGlyph'

const wireColor = (color) => `rgb(var(--wire-${color}))`

/** Colour chip with its letter tag, so colour is never the only cue. */
export function ColorTag({ color, className }) {
  return (
    <span className={cn('inline-flex items-center gap-1 font-pixel text-[8px] tracking-wider', className)}>
      <span
        className="inline-block w-3 h-3 rounded-sm border border-retro-border"
        style={{ background: wireColor(color) }}
        aria-hidden="true"
      />
      {COLOR_NAMES[color]}
    </span>
  )
}

function WiresPanel({ module, wire, index, onAction, disabled, busy }) {
  const [picked, setSelected] = useState(null)
  // A wire that just got cut (a strike) drops out of the selection.
  const selected = picked != null && !isCut(wire, index, picked) ? picked : null
  const wires = module.device.wires
  const cut = (w) => onAction({ mod: index, kind: 'cut', wire: w })
  return (
    <div className="space-y-3">
      <div className="space-y-2" role="group" aria-label="Wires">
        {wires.map((color, w) => {
          const gone = isCut(wire, index, w)
          const picked = selected === w && !gone
          return (
            <button
              key={w}
              type="button"
              disabled={disabled || gone}
              onClick={() => setSelected(w)}
              aria-pressed={picked}
              aria-label={`Wire ${w + 1}, ${COLOR_NAMES[color]}${gone ? ', cut' : ''}`}
              className={cn(
                'w-full min-h-11 flex items-center gap-2 px-2 rounded border-2 bg-retro-deep',
                picked ? 'border-retro-cta shadow-neon-cta' : 'border-retro-border',
                gone && 'opacity-60',
              )}
            >
              <span className="font-pixel text-[9px] text-retro-dim w-4 text-right">{w + 1}</span>
              <span className="w-2.5 h-5 rounded-sm bg-retro-structure" aria-hidden="true" />
              <span className="relative flex-1 h-3 flex items-center" aria-hidden="true">
                {gone ? (
                  <>
                    <span className="h-3 w-[42%] rounded-l-full border border-retro-border" style={{ background: wireColor(color) }} />
                    <span className="flex-1" />
                    <span className="h-3 w-[42%] rounded-r-full border border-retro-border" style={{ background: wireColor(color) }} />
                  </>
                ) : (
                  <span className="h-3 w-full rounded-full border border-retro-border" style={{ background: wireColor(color) }} />
                )}
              </span>
              <span className="w-2.5 h-5 rounded-sm bg-retro-structure" aria-hidden="true" />
              <span className="font-pixel text-[9px] w-4 text-retro-text">{COLOR_LETTERS[color]}</span>
            </button>
          )
        })}
      </div>
      <button
        type="button"
        disabled={disabled || busy || selected == null}
        onClick={() => cut(selected)}
        className="w-full min-h-11 rounded bg-retro-cta text-retro-bg font-pixel text-[10px] tracking-wider hover:shadow-neon-cta disabled:opacity-40"
      >
        {busy ? 'CUTTING…' : selected == null ? 'PICK A WIRE' : `CUT WIRE ${selected + 1}`}
      </button>
    </div>
  )
}

function KeypadPanel({ module, wire, index, onAction, disabled }) {
  const done = pressedCount(wire, index)
  const lit = new Set(module.solution.slice(0, done))
  return (
    <div className="grid grid-cols-2 gap-3 max-w-[18rem] mx-auto" role="group" aria-label="Glyph keypad">
      {module.device.keys.map((g, k) => (
        <button
          key={g}
          type="button"
          disabled={disabled || lit.has(g)}
          onClick={() => onAction({ mod: index, kind: 'press', glyph: g })}
          aria-label={`Glyph key ${k + 1}${lit.has(g) ? ', pressed' : ''}`}
          className={cn(
            'aspect-square rounded-lg border-2 flex flex-col items-center justify-center gap-1 bg-retro-deep',
            lit.has(g) ? 'border-retro-win text-retro-win shadow-neon-win' : 'border-retro-border text-retro-text hover:border-retro-cta',
          )}
        >
          <WireGlyph id={g} size={52} />
          <span className="font-pixel text-[7px] text-retro-dim">{k + 1}</span>
        </button>
      ))}
    </div>
  )
}

function LeverPanel({ module, index, onAction, disabled, clock }) {
  const { color, label, strip } = module.device
  const [holding, setHolding] = useState(false)
  const [showStrip, setShowStrip] = useState(false)
  const startRef = useRef(0)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const press = () => {
    if (disabled || holding) return
    startRef.current = performance.now()
    setHolding(true)
    timer.current = setTimeout(() => setShowStrip(true), TAP_MAX_MS)
  }
  const release = (cancel = false) => {
    if (!holding) return
    clearTimeout(timer.current)
    const held = performance.now() - startRef.current
    setHolding(false)
    setShowStrip(false)
    if (cancel) return
    onAction(held < TAP_MAX_MS
      ? { mod: index, kind: 'tap' }
      : { mod: index, kind: 'release', clock: clock() })
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-3 font-pixel text-[9px] text-retro-dim">
        <span>LEVER</span><ColorTag color={color} className="text-retro-text" />
      </div>
      <div
        className="w-full h-6 rounded border-2 border-retro-border bg-retro-deep flex items-center justify-center"
        aria-live="polite"
      >
        {showStrip ? (
          <span className="w-full h-full flex items-center justify-center font-pixel text-[9px]" style={{ background: wireColor(strip) }}>
            <span className="px-1.5 rounded bg-retro-card text-retro-text">{COLOR_NAMES[strip]} STRIP</span>
          </span>
        ) : (
          <span className="font-pixel text-[8px] text-retro-dim">{holding ? '…' : 'STRIP OFF'}</span>
        )}
      </div>
      <button
        type="button"
        disabled={disabled}
        onPointerDown={e => { e.currentTarget.setPointerCapture?.(e.pointerId); press() }}
        onPointerUp={() => release(false)}
        onPointerCancel={() => release(true)}
        onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press() } }}
        onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release(false) } }}
        onContextMenu={e => e.preventDefault()}
        aria-label={`Lever reading ${label}. Tap, or hold and release`}
        className={cn(
          'w-40 h-40 rounded-full border-4 flex flex-col items-center justify-center gap-2 select-none touch-none disabled:opacity-40',
          holding ? 'scale-95 border-retro-cta shadow-neon-cta' : 'border-retro-border',
        )}
        style={{ background: wireColor(color), WebkitTouchCallout: 'none' }}
      >
        <span className="px-2 py-1 rounded bg-retro-card text-retro-text font-pixel text-[12px] tracking-widest">{label}</span>
        <span className="px-1.5 rounded bg-retro-card text-retro-dim font-pixel text-[7px]">{holding ? 'HOLDING' : 'TAP OR HOLD'}</span>
      </button>
    </div>
  )
}

const PAD = [
  { dir: 'N', label: '▲', area: 'col-start-2' },
  { dir: 'W', label: '◀', area: 'col-start-1 row-start-2' },
  { dir: 'E', label: '▶', area: 'col-start-3 row-start-2' },
  { dir: 'S', label: '▼', area: 'col-start-2 row-start-3' },
]
const ARROW_KEYS = { ArrowUp: 'N', ArrowDown: 'S', ArrowLeft: 'W', ArrowRight: 'E' }

function MazePanel({ module, wire, index, onAction, disabled }) {
  const pos = mazePos(wire, index, module)
  const { exit } = module.device
  const move = (dir) => onAction({ mod: index, kind: 'move', dir })
  useGameKeys((e) => {
    const dir = ARROW_KEYS[e.key]
    if (!dir || e.repeat) return false
    move(dir)
    return true
  }, { enabled: !disabled })
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `1rem repeat(${MAZE_SIZE}, 2.25rem)` }} aria-hidden="true">
        <span />
        {'ABCDEF'.split('').map(c => <span key={c} className="text-center font-pixel text-[8px] text-retro-dim">{c}</span>)}
        {Array.from({ length: MAZE_CELLS }).map((_, cell) => (
          <MazeCellTech key={cell} cell={cell} pos={pos} exit={exit} />
        ))}
      </div>
      <p className="font-pixel text-[9px] text-retro-text" aria-live="polite">
        YOU ● {cellName(pos)} · FLAG ⚑ {cellName(exit)}
      </p>
      <div className="grid grid-cols-3 grid-rows-3 gap-1.5" role="group" aria-label="Move">
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

function MazeCellTech({ cell, pos, exit }) {
  const row = Math.floor(cell / MAZE_SIZE)
  return (
    <>
      {cell % MAZE_SIZE === 0 && <span className="self-center font-pixel text-[8px] text-retro-dim">{row + 1}</span>}
      <span className={cn(
        'h-9 rounded-sm flex items-center justify-center font-pixel text-[12px] bg-retro-deep border border-retro-border/40',
        cell === pos && 'border-retro-cta',
      )}>
        {cell === pos ? <span className="text-retro-cta">●</span> : cell === exit ? <span className="text-retro-win">⚑</span> : <span className="text-retro-dim text-[6px]">·</span>}
      </span>
    </>
  )
}

const PANELS = { wires: WiresPanel, keypad: KeypadPanel, lever: LeverPanel, maze: MazePanel }

export default function WireDevice({ module, ...props }) {
  const Panel = PANELS[module.type]
  return Panel ? <Panel module={module} {...props} /> : null
}
