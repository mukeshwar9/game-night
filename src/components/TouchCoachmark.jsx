import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

// One-time, localStorage-flagged touch-control coachmark for the 5 realtime
// arena pages (M-49). Each page drives `active` off its OWN independent
// pre-round display-window state (NOT the host-authoritative sim's
// `render.countdown`, which the guest seat's tick functions always report as
// 0 — gating on that would mean the coachmark never reaches the joining/
// guest player). It teaches the gesture scheme (swipe / drag / tap /
// buttons) in a single line + glyph, then never shows again for that game on
// this device. Renders nothing on non-touch (mouse/keyboard) input so
// desktop players never see it.
const GLYPHS = {
  swipe: '↗︎',
  drag: '✋',
  tap: '👆',
  buttons: '🕹',
}

function isCoarsePointer() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  try { return window.matchMedia('(pointer: coarse)').matches } catch { return false }
}

export default function TouchCoachmark({ gameKey, gesture = 'tap', text, active }) {
  const storageKey = `retro-touch-coachmark-${gameKey}`
  // Computed once per mount (lazy initializer) so the mark doesn't vanish
  // mid-countdown the instant the "seen" flag is written to localStorage.
  const [eligible] = useState(() => {
    let alreadySeen = false
    try { alreadySeen = localStorage.getItem(storageKey) === '1' } catch { /* ignore */ }
    return !alreadySeen && isCoarsePointer()
  })
  const visible = !!active && eligible

  useEffect(() => {
    if (!visible) return
    try { localStorage.setItem(storageKey, '1') } catch { /* ignore */ }
  }, [visible, storageKey])

  if (!visible) return null

  return (
    <div
      role="status"
      className={cn(
        'flex items-center justify-center gap-2 rounded border border-retro-cta/50',
        'bg-retro-tint-cta/40 px-3 py-2 font-pixel text-[10px] text-retro-cta',
        'animate-pulse',
      )}
    >
      <span className="text-base leading-none" aria-hidden="true">{GLYPHS[gesture] || GLYPHS.tap}</span>
      <span>{text}</span>
    </div>
  )
}
