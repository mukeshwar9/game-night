import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import useModalHistory from '../hooks/useModalHistory'

const DRAG_CLOSE_PX = 90

// Elements Tab can reach. `getClientRects()` filters out elements hidden via
// display:none/visibility:hidden (querySelectorAll matches those regardless)
// while keeping position:fixed elements, which an offsetParent check drops.
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

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
//
// UX-02: the sheet is a real focus boundary. The overlay portals to
// document.body, every other body child goes inert + aria-hidden while it's
// open (no background focus or pointer interaction), body scroll locks,
// initial focus moves into the dialog, Tab/Shift+Tab cycle inside it, and
// focus returns to the opener on close if it still exists. All previous
// dismissal paths (Escape, backdrop, drag, back gesture) are unchanged.
export default function BottomSheet({ onClose, onBack, children, className = '', ariaLabel, labelledBy }) {
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [entered, setEntered] = useState(false)
  const dragStartRef = useRef(0)
  const panelRef = useRef(null)
  const openerRef = useRef(null)

  useModalHistory(onBack || onClose)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Remember the opener and move focus into the dialog on the frame after
  // mount (the panel itself is the safe target when no focusable child
  // exists — or before children mount).
  useEffect(() => {
    openerRef.current = document.activeElement
    const id = requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(id)
  }, [])

  // UX-02: Tab trap. Window capture phase so it wins over caller key
  // handlers and can never leak a Tab into the inerted background.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusables = [...panel.querySelectorAll(FOCUSABLE_SELECTOR)]
        .filter(el => el.getClientRects().length > 0 || el === document.activeElement)
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      const inside = panel.contains(active)
      if (e.shiftKey) {
        if (!inside || active === first || (first && active.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING)) {
          e.preventDefault()
          if (last) last.focus()
          else panel.focus()
        }
      } else if (!inside || active === last) {
        e.preventDefault()
        if (first) first.focus()
        else panel.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // UX-02: make the rest of the page inert + hidden from assistive tech and
  // lock background scroll while the sheet is open. The panel must live as a
  // direct child of body (portal) or the app root — an ancestor of the
  // dialog — would have to be skipped, leaving the background reachable.
  // Per-element snapshots of the previous state keep nested sheets correct
  // (the second sheet restores the inert state the first one left behind).
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return undefined
    const touched = []
    for (const node of document.body.children) {
      if (node === panel || node.contains(panel)) continue
      touched.push({
        el: node,
        inert: node.inert,
        hidden: node.getAttribute('aria-hidden'),
      })
      node.inert = true
      node.setAttribute('aria-hidden', 'true')
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      for (const t of touched) {
        t.el.inert = t.inert
        if (t.hidden === null) t.el.removeAttribute('aria-hidden')
        else t.el.setAttribute('aria-hidden', t.hidden)
      }
      document.body.style.overflow = prevOverflow
      // Restore focus to the opener. Runs while the panel is still in the
      // DOM (effect cleanup precedes removal), so focus currently inside the
      // dying panel counts as homeless too. Never steal focus otherwise.
      const opener = openerRef.current
      const active = document.activeElement
      if (opener && opener.isConnected && (active === document.body || (active && panel.contains(active)))) {
        opener.focus({ preventScroll: true })
      }
    }
  }, [])

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

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        style={{
          transform: dragging ? `translateY(${dragY}px)` : `translateY(${entered ? '0' : '100%'})`,
          transition: dragging ? 'none' : 'transform 0.18s ease-out',
        }}
        className={cn(
          'w-full sm:max-w-sm max-h-[85vh] sm:max-h-[80vh] overflow-y-auto',
          'bg-retro-bg border-2 border-retro-border rounded-t-2xl sm:rounded',
          'p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4',
          'focus:outline-none',
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
    </div>,
    document.body,
  )
}
