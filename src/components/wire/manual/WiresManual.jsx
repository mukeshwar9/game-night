// WIRE CROSSED Handbook page: WIRES. One rule table per wire count. Tier II
// tables have 4 rules with AND conditions; tier III tables open with the
// striped-wire rule.
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { describeWireAction, describeWireCond } from '../../../lib/wireLogic'
import Section from './Section'

export default function WiresManual({ module }) {
  const { manual, tier = 1 } = module
  const counts = Object.keys(manual.tables).map(Number)
  const [count, setCount] = useState(counts[0])
  const table = manual.tables[count]
  const extra = tier >= 3
    ? ' A striped wire shows two letter tags and counts as BOTH colours in every line. Several wires can need cutting: the Tech cuts them in the order you read them out, first to last.'
    : tier === 2 ? ' A line with AND is true only when both parts are true.' : ''
  return (
    <Section
      title="WIRES"
      intro={`Count the wires, then use that table. Read the lines top to bottom; the first one that is true tells you what to cut. Wires are numbered from the top.${extra}`}
    >
      <div className="flex gap-2" role="tablist" aria-label="Wire count">
        {counts.map(n => (
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
