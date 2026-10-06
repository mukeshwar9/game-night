import { cn } from '@/lib/utils'
import useGameKeys from '../hooks/useGameKeys'

const ROWS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['BACKSPACE', '0', 'ENTER'],
]

export default function NumberPad({ onKey, disabled = false }) {
  // Physical keys go through the shared guard so chat (or any text field)
  // keeps its digits, Backspace and Enter.
  useGameKeys((event) => {
    if (/^\d$/.test(event.key)) { onKey(event.key); return false }
    if (event.key === 'Backspace') { onKey('BACKSPACE'); return true }
    if (event.key === 'Enter') { onKey('ENTER'); return true }
    return false
  }, { enabled: !disabled })

  const baseBtn = cn(
    'h-12 flex items-center justify-center font-pixel text-[12px] rounded border transition',
    'select-none press',
  )

  const mkKey = (raw) => {
    const isEnter = raw === 'ENTER'
    const isBack  = raw === 'BACKSPACE'
    const label   = isEnter ? '✓' : isBack ? '⌫' : raw
    const style   = disabled
      ? 'border-retro-border text-retro-border bg-retro-card opacity-50 cursor-not-allowed'
      : isEnter
        ? 'border-retro-cta text-retro-cta bg-retro-tint-cta hover:shadow-neon-cta cursor-pointer'
        : 'border-retro-border text-retro-dim bg-retro-card hover:border-retro-p1/50 hover:text-retro-text cursor-pointer'

    return (
      <button
        key={raw}
        onPointerDown={e => { e.preventDefault(); if (!disabled) onKey(raw) }}
        disabled={disabled}
        className={cn(baseBtn, style, 'flex-1')}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="space-y-1 w-full select-none">
      {ROWS.map((row, ri) => (
        <div key={ri} className="flex gap-1">
          {row.map(mkKey)}
        </div>
      ))}
    </div>
  )
}
