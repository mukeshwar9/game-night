import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

const ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['SHIFT','Z','X','C','V','B','N','M','BACKSPACE'],
]
const PUNCT_LEFT  = ["'", ',', '!']
const PUNCT_RIGHT = ['.', '?']

export default function TypingKeyboard({ onKey, disabled = false }) {
  const [shifted, setShifted] = useState(false)

  useEffect(() => {
    if (disabled) return
    const handler = (e) => {
      if (e.key === 'Backspace') {
        e.preventDefault()
        onKey(e.ctrlKey || e.metaKey ? 'WORD_BACKSPACE' : 'BACKSPACE')
        return
      }
      if (e.key === ' ') { e.preventDefault(); onKey(' '); return }
      if (e.key.length === 1) onKey(e.key)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onKey, disabled])

  const tap = (raw) => {
    if (disabled) return
    if (raw === 'SHIFT') { setShifted(s => !s); return }
    if (raw === 'BACKSPACE') { onKey('BACKSPACE'); return }
    if (raw === 'SPACE') { onKey(' '); return }
    const char = /^[A-Z]$/.test(raw) ? (shifted ? raw : raw.toLowerCase()) : raw
    onKey(char)
    if (/^[A-Z]$/.test(raw)) setShifted(false)
  }

  // Compact row height on short viewports (M-52) so the keyboard stays above
  // the fold at ~667px alongside the passage above it.
  const baseBtn = cn(
    'h-10 [@media(max-height:700px)]:h-9 flex items-center justify-center font-pixel text-[10px] rounded border transition-all',
    'select-none active:scale-90',
  )
  const normalStyle = disabled
    ? 'border-retro-border text-retro-border bg-retro-card opacity-50 cursor-not-allowed'
    : 'border-retro-border text-retro-dim bg-retro-card hover:border-retro-p1/50 hover:text-retro-text cursor-pointer'

  const mkKey = (label, raw, extra = '') => (
    <button
      key={raw + label}
      onPointerDown={e => { e.preventDefault(); tap(raw) }}
      disabled={disabled}
      className={cn(
        baseBtn,
        raw === 'SHIFT' && shifted
          ? 'border-retro-cta text-retro-cta bg-retro-tint-cta'
          : normalStyle,
        extra,
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="space-y-1 [@media(max-height:700px)]:space-y-0.5 w-full select-none">
      {ROWS.map((row, ri) => (
        <div key={ri} className="flex gap-1 justify-center">
          {row.map(k => {
            if (k === 'SHIFT')     return mkKey('⇧', 'SHIFT',     'px-3 flex-shrink-0')
            if (k === 'BACKSPACE') return mkKey('⌫', 'BACKSPACE', 'px-3 flex-shrink-0')
            return mkKey(shifted ? k : k.toLowerCase(), k, 'flex-1 min-w-0 max-w-[2.5rem]')
          })}
        </div>
      ))}

      {/* Spacebar row with flanking punctuation */}
      <div className="flex gap-1 justify-center">
        {PUNCT_LEFT.map(p => mkKey(p, p, 'w-9 flex-shrink-0'))}
        <button
          onPointerDown={e => { e.preventDefault(); tap('SPACE') }}
          disabled={disabled}
          className={cn(baseBtn, normalStyle, 'flex-1')}
        >
          SPACE
        </button>
        {PUNCT_RIGHT.map(p => mkKey(p, p, 'w-9 flex-shrink-0'))}
      </div>
    </div>
  )
}
