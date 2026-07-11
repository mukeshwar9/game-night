import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import useModalHistory from '../hooks/useModalHistory'

const DRAG_CLOSE_PX = 90

// Shared overlay primitive (M-73). On phones this is a true bottom sheet —
// pinned to the bottom edge, rounded top corners, a drag handle you can
// swipe down to dismiss, safe-area-aware bottom padding, and its own
// internal max-h scroll region so tall content never pushes the handle off
// screen. From `sm:` up it settles into a centered dialog. Backdrop-tap
// close, Escape close, and stopPropagation on the panel are the same
// vocabulary every overlay already used — only the chrome is new.
// `useModalHistory` wires the Android back-gesture in for free (M-06): a
// back-swipe closes the sheet instead of leaving the room.
//
// Usage: render only while open (parent owns visibility, same as before).
// `children` is the overlay's own header + body — this primitive supplies
// no title/close button of its own, so every caller keeps its existing
// markup/props untouched. `className` merges (via tailwind-merge) onto the
// panel for per-caller background/spacing (e.g. `bg-retro-card space-y-3`).
//
// `onBack` (optional) overrides `onClose` for the hardware/gesture back path
// only — falls back to `onClose` when omitted. A completed back gesture is
// not cancellable the way a backdrop-tap/Escape/drag-close is, so a caller
// whose `onClose` is guarded against an in-flight async action (e.g.
// GameSwitcher while a switch request is pending) must pass an unconditional
// `onBack` or the guard can eat a back-press and let the *next* one fall
// through to the underlying route (M-06).
export default function BottomSheet({ onClose, onBack, children, className = '', ariaLabel, labelledBy }) {
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [entered, setEntered] = useState(false)
  const dragStartRef = useRef(0)

  useModalHistory(onBack || onClose)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Trigger the slide-up entrance on the frame after mount.
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const onHandlePointerDown = (e) => {
    dragStartRef.current = e.clientY
    setDragging(true)
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onHandlePointerMove = (e) => {
    if (!dragging) return
    setDragY(Math.max(0, e.clientY - dragStartRef.current))
  }
  const endDrag = () => {
    if (!dragging) return
    setDragging(false)
    if (dragY > DRAG_CLOSE_PX) onClose()
    else setDragY(0)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        onClick={e => e.stopPropagation()}
        style={{
          transform: dragging ? `translateY(${dragY}px)` : `translateY(${entered ? '0' : '100%'})`,
          transition: dragging ? 'none' : 'transform 0.18s ease-out',
        }}
        className={cn(
          'w-full sm:max-w-sm max-h-[85vh] sm:max-h-[80vh] overflow-y-auto',
          'bg-retro-bg border-2 border-retro-border rounded-t-2xl sm:rounded',
          'p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4',
          className,
        )}
      >
        {/* Drag handle — mobile only; the swipe-down-to-dismiss gesture zone. */}
        <div
          className="flex justify-center -mt-2 mb-2 pt-1 pb-2 sm:hidden touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          aria-hidden="true"
        >
          <span className="w-10 h-1.5 rounded-full bg-retro-border" />
        </div>
        {children}
      </div>
    </div>
  )
}
