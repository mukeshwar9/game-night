import { useEffect } from 'react'
import { cn } from '@/lib/utils'

const ROWS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['BACKSPACE', '0', 'ENTER'],
]

export default function NumberPad({ onKey, disabled = false }) {
  useEffect(() => {
    if (disabled) return
    const handler = (e) => {
      if (/^\d$/.test(e.key)) { onKey(e.key); return }
      if (e.key === 'Backspace') { e.preventDefault(); onKey('BACKSPACE'); return }
      if (e.key === 'Enter') { e.preventDefault(); onKey('ENTER'); return }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onKey, disabled])

  const baseBtn = cn(
    'h-12 flex items-center justify-center font-pixel text-[12px] rounded border transition-all',
    'select-none active:scale-90',
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
