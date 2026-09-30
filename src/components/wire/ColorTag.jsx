// WIRE CROSSED: a colour chip with its letter/name tag, so colour is never the only cue.
import { cn } from '@/lib/utils'
import { COLOR_NAMES } from '../../lib/wireLogic'
import { wireColor } from './colors'

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
