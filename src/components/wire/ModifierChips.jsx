// WIRE CROSSED: the modifiers on this bomb. Named text chips (never colour
// alone); the ready card also spells out what each one does.
import { cn } from '@/lib/utils'
import { MODIFIERS } from '../../lib/wire/modifiers'

/** @param {{ modifiers?: string[], detail?: boolean, className?: string }} props */
export default function ModifierChips({ modifiers, detail = false, className }) {
  const ids = (modifiers || []).filter(id => MODIFIERS[id])
  if (!ids.length) return null
  return (
    <div className={cn('w-full', className)}>
      <ul className="flex flex-wrap justify-center gap-1.5" aria-label="Bomb modifiers">
        {ids.map(id => (
          <li
            key={id}
            title={MODIFIERS[id].desc}
            className="px-2 py-0.5 rounded border border-retro-cta text-retro-cta font-pixel text-[8px] tracking-wider"
          >{MODIFIERS[id].name}</li>
        ))}
      </ul>
      {detail && (
        <ul className="mt-2 space-y-1">
          {ids.map(id => (
            <li key={id} className="font-mono text-[10px] text-retro-dim leading-snug">
              <b className="text-retro-text">{MODIFIERS[id].name}</b>: {MODIFIERS[id].desc}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
