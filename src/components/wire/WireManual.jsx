// WIRE CROSSED: the Handbook's manual — one page per module on this bomb,
// every table generated for this bomb (src/lib/wireLogic.js).
import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  KEYPAD_COLUMNS, MAZE_CELLS, MAZE_SIZE, MODULE_NAMES, STRIP_COLORS,
  describeLeverRule, describeWireAction, describeWireCond, isOpen,
} from '../../lib/wireLogic'
import WireGlyph from './WireGlyph'
import { ColorTag } from './WireDevice'

const ROMAN = ['I', 'II', 'III', 'IV', 'V']

function Section({ title, intro, children }) {
  return (
    <section className="space-y-3">
      <h3 className="font-pixel text-[11px] text-retro-cta tracking-widest">{title}</h3>
      {intro && <p className="font-mono text-[11px] leading-relaxed text-retro-text">{intro}</p>}
      {children}
    </section>
  )
}

function WiresManual({ manual }) {
  const [count, setCount] = useState(3)
  const table = manual.tables[count]
  return (
    <Section
      title="WIRES"
      intro="Count the wires, then use that table. Read the lines top to bottom; the first one that is true tells you which wire to cut. Wires are numbered from the top."
    >
      <div className="flex gap-2" role="tablist" aria-label="Wire count">
        {[3, 4, 5, 6].map(n => (
          <button
            key={n}
            type="button"
            role="tab"
            aria-selected={count === n}
            onClick={() => setCount(n)}
            className={cn(
              'flex-1 min-h-11 rounded border-2 font-pixel text-[9px]',
              count === n ? 'border-retro-cta text-retro-cta bg-retro-tint-cta' : 'border-retro-border text-retro-dim',
            )}
          >{n} WIRES</button>
        ))}
      </div>
      <ol className="space-y-2">
        {table.rules.map((rule, i) => (
          <li key={i} className="flex gap-2 font-mono text-[11px] leading-snug text-retro-text">
            <span className="font-pixel text-[9px] text-retro-dim pt-0.5">{i + 1}.</span>
            <span>If {describeWireCond(rule.cond)}, <b className="text-retro-cta">{describeWireAction(rule.action)}</b>.</span>
          </li>
        ))}
        <li className="flex gap-2 font-mono text-[11px] leading-snug text-retro-text">
          <span className="font-pixel text-[9px] text-retro-dim pt-0.5">⋯</span>
          <span>Otherwise, <b className="text-retro-cta">{describeWireAction(table.otherwise)}</b>.</span>
        </li>
      </ol>
    </Section>
  )
}

function KeypadManual({ manual }) {
  return (
    <Section
      title="GLYPHS"
      intro="Exactly one column below holds all four glyphs on the keypad. Press those four in the order they appear in that column, top first."
    >
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${KEYPAD_COLUMNS}, minmax(0, 1fr))` }}>
        {manual.columns.map((col, c) => (
          <div key={c} className="flex flex-col items-center gap-1 rounded border border-retro-border bg-retro-deep py-1.5">
            <span className="font-pixel text-[8px] text-retro-dim">{ROMAN[c]}</span>
            {col.map(g => <WireGlyph key={g} id={g} size={30} className="text-retro-text" />)}
          </div>
        ))}
      </div>
    </Section>
  )
}

function LeverManual({ manual }) {
  return (
    <Section title="LEVER" intro="Tap it and let go at once if either line is true:">
      <ol className="space-y-2">
        {manual.tapRules.map((rule, i) => (
          <li key={i} className="flex gap-2 font-mono text-[11px] leading-snug text-retro-text">
            <span className="font-pixel text-[9px] text-retro-dim pt-0.5">{i + 1}.</span>
            <span>{describeLeverRule(rule, i)}.</span>
          </li>
        ))}
      </ol>
      <p className="font-mono text-[11px] leading-relaxed text-retro-text">
        Otherwise <b className="text-retro-cta">hold it down</b>. A strip lights up. Let go when <b>any digit</b> on the clock shows the number for that strip:
      </p>
      <ul className="grid grid-cols-1 gap-1.5">
        {STRIP_COLORS.map(color => (
          <li key={color} className="flex items-center justify-between rounded border border-retro-border bg-retro-deep px-2 py-1.5">
            <ColorTag color={color} className="text-retro-text" />
            <span className="font-pixel text-[12px] text-retro-cta">{manual.stripDigits[color]}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function MazeManual({ manual, device }) {
  const { open } = manual
  return (
    <Section
      title="PIPES"
      intro="The Tech sees only their dot (●) and the flag (⚑). You see the walls. Steer them there one step at a time; walking into a wall is a strike."
    >
      <div className="flex justify-center">
        <div className="grid" style={{ gridTemplateColumns: `1rem repeat(${MAZE_SIZE}, 2.25rem)` }}>
          <span />
          {'ABCDEF'.split('').map(c => <span key={c} className="text-center font-pixel text-[8px] text-retro-dim">{c}</span>)}
          {Array.from({ length: MAZE_CELLS }).map((_, cell) => (
            <MazeCellManual key={cell} cell={cell} open={open} device={device} />
          ))}
        </div>
      </div>
    </Section>
  )
}

function MazeCellManual({ cell, open, device }) {
  const row = Math.floor(cell / MAZE_SIZE)
  return (
    <>
      {cell % MAZE_SIZE === 0 && <span className="self-center font-pixel text-[8px] text-retro-dim">{row + 1}</span>}
      <span
        className={cn(
          'h-9 flex items-center justify-center font-pixel text-[12px] bg-retro-deep border-2',
          isOpen(open, cell, 'N') ? 'border-t-transparent' : 'border-t-retro-text',
          isOpen(open, cell, 'S') ? 'border-b-transparent' : 'border-b-retro-text',
          isOpen(open, cell, 'W') ? 'border-l-transparent' : 'border-l-retro-text',
          isOpen(open, cell, 'E') ? 'border-r-transparent' : 'border-r-retro-text',
        )}
      >
        {cell === device?.start ? <span className="text-retro-cta">○</span>
          : cell === device?.exit ? <span className="text-retro-win">⚑</span> : null}
      </span>
    </>
  )
}

const MANUALS = { wires: WiresManual, keypad: KeypadManual, lever: LeverManual, maze: MazeManual }

/**
 * @param {{ bomb: any, tab: number, onTab: (i: number) => void, solved: (i: number) => boolean }} props
 */
export default function WireManual({ bomb, tab, onTab, solved }) {
  const module = bomb.modules[tab] || bomb.modules[0]
  const Manual = MANUALS[module.type]
  return (
    <div className="w-full space-y-3">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${bomb.modules.length}, minmax(0, 1fr))` }} role="tablist" aria-label="Manual pages">
        {bomb.modules.map((m, i) => (
          <button
            key={m.type}
            type="button"
            role="tab"
            aria-selected={module === m}
            onClick={() => onTab(i)}
            className={cn(
              'min-h-11 rounded border-2 font-pixel text-[8px] tracking-wider flex items-center justify-center gap-1',
              module === m ? 'border-retro-cta text-retro-cta bg-retro-tint-cta' : 'border-retro-border text-retro-dim',
            )}
          >
            {solved(i) && <span className="text-retro-win" aria-label="done">✓</span>}
            {MODULE_NAMES[m.type]}
          </button>
        ))}
      </div>
      <div className="rounded border-2 border-retro-border bg-retro-card p-3">
        <Manual manual={module.manual} device={module.device} />
      </div>
    </div>
  )
}
