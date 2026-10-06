import { useEffect, useRef, useState } from 'react'
import { THEMES, applyTheme, getStoredTheme, pairedFont } from '../lib/theme'
import { applyFont } from '../lib/font'
import { setProfile } from '../lib/social'
import { cn } from '@/lib/utils'
import LockBadge from './premium/LockBadge'
import useAccess from '../hooks/useAccess'
import { openPaywall } from '../lib/premiumUi'

export default function ThemeSwitcher() {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(getStoredTheme)
  const containerRef = useRef(null)

  const access = useAccess()
  const isLocked = (t) => t.premium === true && !access.isUnlocked({ kind: 'theme', ...t })

  const handleSelect = (id) => {
    const option = THEMES.find(t => t.id === id)
    if (option && isLocked(option)) { setOpen(false); openPaywall({ kind: 'theme', ...option }); return }
    applyTheme(id)
    setSelected(id)
    setOpen(false)
    // A theme with a matching font brings it along; the font stays changeable.
    const font = pairedFont(id)
    if (font) applyFont(font)
    // Fire-and-forget: sync the choice to the account so it follows across
    // devices (see AuthContext's subscribeProfile applyTheme-on-change).
    setProfile(font ? { theme: id, fontFamily: font } : { theme: id }).catch(() => {})
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
        className="relative p-2 rounded border border-retro-border bg-retro-card text-retro-dim hover:text-retro-text
          active:scale-95 transition-colors flex items-center gap-1
          before:content-[''] before:absolute before:-inset-y-3 before:-inset-x-1"
      >
        <div style={{ width: 5, height: 5, background: 'rgb(var(--c-p1))', borderRadius: 1 }} />
        <div style={{ width: 5, height: 5, background: 'rgb(var(--c-p2))', borderRadius: 1 }} />
        <div style={{ width: 5, height: 5, background: 'rgb(var(--c-cta))', borderRadius: 1 }} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-retro-card border-2 border-retro-border rounded min-w-[140px]">
          {THEMES.map((t) => { const { id, label } = t; return (
            <button
              key={id}
              onClick={() => handleSelect(id)}
              className={cn(
                'w-full flex items-center gap-2 text-left px-3 py-2 font-pixel text-[9px] transition-colors active:bg-retro-tint-cta',
                selected === id
                  ? 'text-retro-cta'
                  : 'text-retro-dim hover:text-retro-text',
              )}
            >
              <span data-theme={id} className="inline-flex items-center gap-[3px] shrink-0">
                <span style={{ width: 5, height: 5, background: 'rgb(var(--c-p1))', borderRadius: 1 }} />
                <span style={{ width: 5, height: 5, background: 'rgb(var(--c-p2))', borderRadius: 1 }} />
                <span style={{ width: 5, height: 5, background: 'rgb(var(--c-cta))', borderRadius: 1 }} />
              </span>
              {selected === id ? '> ' : '  '}{label}
              {isLocked(t) && <><LockBadge className="ml-auto" /><span className="sr-only">locked</span></>}
            </button>
          )})}
        </div>
      )}
    </div>
  )
}
