import { useEffect, useRef, useState } from 'react'
import { THEMES, applyTheme, getStoredTheme } from '../lib/theme'
import { cn } from '@/lib/utils'

export default function ThemeSwitcher() {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(getStoredTheme)
  const containerRef = useRef(null)

  const handleSelect = (id) => {
    applyTheme(id)
    setSelected(id)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const handleKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handleKey)
    document.addEventListener('mousedown', handleClick)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Switch theme"
        title="Switch theme"
        className="p-2 rounded border border-retro-border bg-retro-card text-retro-dim hover:text-retro-text transition-colors flex items-center gap-1"
      >
        <div style={{ width: 5, height: 5, background: 'rgb(var(--c-p1))', borderRadius: 1 }} />
        <div style={{ width: 5, height: 5, background: 'rgb(var(--c-p2))', borderRadius: 1 }} />
        <div style={{ width: 5, height: 5, background: 'rgb(var(--c-cta))', borderRadius: 1 }} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-retro-card border-2 border-retro-border rounded min-w-[140px]">
          {THEMES.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => handleSelect(id)}
              className={cn(
                'w-full text-left px-3 py-2 font-pixel text-[9px] transition-colors',
                selected === id
                  ? 'text-retro-cta'
                  : 'text-retro-dim hover:text-retro-text',
              )}
            >
              {selected === id ? '> ' : '  '}{label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
