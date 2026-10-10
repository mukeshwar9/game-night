import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import useModalHistory from '../hooks/useModalHistory'
import useKeyboardInset from '../hooks/useKeyboardInset'
import { isReducedMotion } from '../hooks/useMotionPref'
import { DUR, EASE, springPreset } from '../lib/motion'
import { animateSpring, releaseVelocity, rubberBand, shouldDismiss, springLinear } from '../lib/spring'

// Elements the Tab trap may cycle through; disabled/hidden ones are filtered
// at trap time, not here.
const FOCUSABLE_SELECTOR =
  'summary, a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Sheets never nest by design (a sheet that opens another closes itself
// first), but a module count keeps the body scroll lock honest even if one
// ever does stack during a transition.
let openSheets = 0

// Pixels of movement before a touch on the sheet's body counts as a drag.
const DRAG_SLOP = 8

function supportsLinearEasing() {
  try { return CSS.supports('transition-timing-function', 'linear(0, 1)') } catch { return false }
}

// Shared overlay primitive (M-73), rendered through BottomSheet.jsx, which
// loads this file lazily. On phones this is a true bottom sheet —
// pinned to the bottom edge, rounded top corners, a drag handle, safe-area-
// aware bottom padding, and its own internal max-h scroll region so tall
// content never pushes the handle off screen. From `sm:` up, or with
// `centered`, it is a centred dialog. Backdrop-tap close, Escape close, and
// stopPropagation on the panel are the same vocabulary every overlay used.
// `useModalHistory` wires the Android back-gesture in for free (M-06): a
// back-swipe closes the sheet instead of leaving the room.
//
// Motion (MO-06, .claude/rules/motion-rules.md): the sheet springs in on the
// platform's sheet spring and the backdrop follows the panel's position. The
// whole panel drags down once its content is scrolled to the top (the handle
// always does); release dismisses on distance or a downward flick, dragging
// up rubber-bands, and every transform is written to a ref, not React state.
// Every close path animates out — including a caller's own CLOSE button,
// which simply unmounts the sheet: on unmount the panel is cloned into an
// inert "ghost" that finishes the exit from wherever the panel was, with the
// drag's velocity. A dialog scales and fades instead. Reduced motion
// crossfades in 150 ms.
//
// R-02 (ux-research-2026-09): this is a MODAL (`aria-modal="true"`), so it
// also behaves like one for keyboards and screen readers — focus moves to the
// panel on open, Tab/Shift+Tab are trapped inside, body scroll locks, and
// focus returns to the opener on close.
//
// Usage: render only while open (parent owns visibility). `children` is the
// overlay's own header + body — this primitive supplies no title/close button
// of its own. `className` merges (via tailwind-merge) onto the panel,
// `layerClassName` onto the fixed layer (e.g. a higher z-index), and
// `backdropClassName` onto the dimming backdrop.
//
// `keyboardSafe` lifts the panel above the on-screen keyboard (visualViewport),
// for sheets with a text input pinned at the bottom.
//
// `glass` opts the panel into the GLASS themes' sheet material (index.css
// .glass-sheet: see-through tint, heavy frost, rim, and the lens on Blink). It
// does nothing on any other theme. Only short, action-like overlays opt in; rules
// text, settings lists and long forms stay solid.
//
// `onBack` (optional) overrides `onClose` for the hardware/gesture back path
// only — falls back to `onClose` when omitted. A completed back gesture is
// not cancellable the way a backdrop-tap/Escape/drag-close is, so a caller
// whose `onClose` is guarded against an in-flight async action must pass an
// unconditional `onBack` or the guard can eat a back-press and let the *next*
// one fall through to the underlying route (M-06). `history={false}` leaves
// the back stack alone, for a confirm that a back gesture itself opened.
export default function BottomSheetPanel({
  onClose, onBack, children, className = '', ariaLabel, labelledBy,
  backdropClassName = 'bg-black/70', layerClassName = '', keyboardSafe = false,
  centered = false, history = true, glass = false,
}) {
  const layerRef = useRef(null)
  const backdropRef = useRef(null)
  const panelRef = useRef(null)
  const openerRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const modeRef = useRef(centered ? 'dialog' : 'sheet')
  // Live motion state: panel offset (px), the spring driving it, and the
  // velocity a drag released with (handed to the exit).
  const motion = useRef({ y: 0, h: 0, spring: null, exitVelocity: 0, mounted: false })
  const keyboardInset = useKeyboardInset(keyboardSafe)

  useModalHistory(onBack || onClose, history)

  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  // Modal boundary: focus, scroll lock, opener restore. Runs once per mount
  // (StrictMode's dev double-mount restores to the opener then re-captures
  // it — harmless).
  useEffect(() => {
    openerRef.current = document.activeElement
    panelRef.current?.focus({ preventScroll: true })
    const prevOverflow = document.body.style.overflow
    openSheets += 1
    if (openSheets === 1) document.body.style.overflow = 'hidden'
    return () => {
      openSheets -= 1
      if (openSheets === 0) document.body.style.overflow = prevOverflow
      const opener = openerRef.current
      if (opener && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])

  // Escape close + Tab trap (window-level so focus that somehow lands
  // outside the panel is pulled back in on the next Tab).
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusables = Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR))
        .filter(el => !el.disabled && el.offsetParent !== null)
      if (focusables.length === 0) { e.preventDefault(); return }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (!panel.contains(active)) {
        e.preventDefault()
        first.focus({ preventScroll: true })
      } else if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault()
        last.focus({ preventScroll: true })
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus({ preventScroll: true })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Entrance before the first paint, and the exit ghost on unmount.
  useLayoutEffect(() => {
    const layer = layerRef.current
    const panel = panelRef.current
    const backdrop = backdropRef.current
    const m = motion.current
    m.mounted = true
    if (!centered) {
      try { modeRef.current = window.matchMedia('(min-width: 640px)').matches ? 'dialog' : 'sheet' } catch { /* no matchMedia */ }
    }
    const mode = modeRef.current
    const reduced = isReducedMotion()
    const path = window.location.pathname

    if (reduced) {
      fade(panel, 0, 1)
      fade(backdrop, 0, 1)
    } else if (mode === 'dialog') {
      enterDialog(panel, backdrop)
    } else {
      m.h = panel.offsetHeight
      poseSheet(panel, backdrop, m, m.h)
      springSheet(panel, backdrop, m, 0, 0)
    }

    return () => {
      m.mounted = false
      m.spring?.stop()
      // Leaving the page entirely (a route change unmounts everything): the
      // new screen's own transition covers it, no ghost.
      if (window.location.pathname !== path || !layer?.isConnected) return
      const ghost = makeGhost(layer)
      if (!ghost) return
      // StrictMode's dev re-run keeps the DOM: drop the ghost before paint.
      queueMicrotask(() => { if (layer.isConnected && m.mounted) ghost.remove() })
      const gPanel = ghost.querySelector('[data-sheet-panel]')
      const gBackdrop = ghost.querySelector('[data-sheet-backdrop]')
      const done = () => ghost.remove()
      if (isReducedMotion()) {
        fade(gPanel, 1, 0)
        fade(gBackdrop, Number(getComputedStyle(backdrop).opacity) || 1, 0).finished.then(done, done)
      } else if (mode === 'dialog') {
        exitDialog(gPanel, gBackdrop).finished.then(done, done)
      } else {
        const gm = { y: m.y, h: m.h || gPanel.offsetHeight, spring: null }
        const spring = springPreset('sheet')
        gm.spring = animateSpring({
          from: gm.y, to: gm.h + 8, velocity: Math.max(0, m.exitVelocity), spring: { k: spring.k, z: Math.max(1, spring.z) }, eps: 1,
          onUpdate: (y) => poseSheet(gPanel, gBackdrop, gm, y),
          onDone: done,
        })
      }
    }
    // Runs once per mount; `centered` is fixed for a mounted overlay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Body drag: touch events, so a pull at the top of the content can claim
  // the gesture from native scrolling (non-passive touchmove).
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return undefined
    let start = null
    const onStart = (e) => {
      if (modeRef.current !== 'sheet' || e.touches.length !== 1) return
      const t = e.touches[0]
      start = { x: t.clientX, y: t.clientY, scrolled: scrolledAncestor(e.target, panel), dragging: false, from: 0 }
    }
    const onMove = (e) => {
      if (!start) return
      const t = e.touches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      if (!start.dragging) {
        // Claim a downward pull from the first move: once iOS starts a native
        // pan, preventDefault on later moves is ignored.
        if (Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) {
          if (dy > 0 && Math.abs(dy) >= Math.abs(dx) && !start.scrolled) e.preventDefault()
          return
        }
        // Only a downward pull, with every scroller under the finger at its
        // top, becomes a drag; anything else stays a scroll or a tap.
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || start.scrolled) { start = null; return }
        start.dragging = true
        start.from = beginDrag()
        start.y = t.clientY
      }
      e.preventDefault()
      moveDrag(start.from + (t.clientY - start.y))
    }
    const onEnd = () => {
      if (start?.dragging) endDrag()
      start = null
    }
    panel.addEventListener('touchstart', onStart, { passive: true })
    panel.addEventListener('touchmove', onMove, { passive: false })
    panel.addEventListener('touchend', onEnd)
    panel.addEventListener('touchcancel', onEnd)
    return () => {
      panel.removeEventListener('touchstart', onStart)
      panel.removeEventListener('touchmove', onMove)
      panel.removeEventListener('touchend', onEnd)
      panel.removeEventListener('touchcancel', onEnd)
    }
    // The handlers read refs only.
  }, [])

  // --- drag (shared by the handle's pointer events and the body's touches) ---
  const samples = useRef([])
  function beginDrag() {
    const m = motion.current
    m.spring?.stop()
    m.spring = null
    if (!m.h) m.h = panelRef.current.offsetHeight
    samples.current = []
    return m.y
  }
  function moveDrag(raw) {
    const m = motion.current
    const y = raw >= 0 ? raw : -rubberBand(-raw, m.h)
    samples.current.push([y, performance.now()])
    if (samples.current.length > 12) samples.current.shift()
    poseSheet(panelRef.current, backdropRef.current, m, y)
  }
  function endDrag() {
    const m = motion.current
    const v = releaseVelocity(samples.current)
    if (shouldDismiss(m.y, v, m.h)) {
      m.exitVelocity = v
      onCloseRef.current()
      // A guarded onClose (busy) keeps the sheet: settle it back.
      requestAnimationFrame(() => { if (m.mounted && !m.spring) springSheet(panelRef.current, backdropRef.current, m, 0, v) })
    } else {
      springSheet(panelRef.current, backdropRef.current, m, 0, v)
    }
  }

  const handleDrag = useRef(null)
  const onHandlePointerDown = (e) => {
    if (modeRef.current !== 'sheet') return
    handleDrag.current = { y: e.clientY, from: beginDrag() }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onHandlePointerMove = (e) => {
    const d = handleDrag.current
    if (d) moveDrag(d.from + e.clientY - d.y)
  }
  const onHandlePointerUp = () => {
    if (!handleDrag.current) return
    handleDrag.current = null
    endDrag()
  }

  const dialog = centered
  return createPortal(
    <div
      ref={layerRef}
      className={cn('fixed inset-0 z-50 flex justify-center', dialog ? 'items-center p-4' : 'items-end sm:items-center', layerClassName)}
      style={keyboardInset ? { paddingBottom: keyboardInset } : undefined}
    >
      <div
        ref={backdropRef}
        data-sheet-backdrop=""
        className={cn('absolute inset-0', backdropClassName)}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        data-sheet-panel=""
        data-lens={glass ? '' : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={cn(
          'relative max-h-[85vh] sm:max-h-[80vh] overflow-y-auto overscroll-contain outline-none',
          dialog
            ? 'w-full max-w-xs bg-retro-card border-2 border-retro-border rounded p-5'
            : cn(
                'w-full sm:max-w-sm bg-retro-bg border-2 border-retro-border rounded-t-2xl sm:rounded',
                'p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4',
              ),
          glass && 'glass-sheet',
          className,
        )}
      >
        {/* Drag handle — phone sheets only; always drags, even mid-scroll. */}
        {!dialog && (
          <div
            className="flex justify-center -mt-2 mb-2 pt-1 pb-2 sm:hidden touch-none cursor-grab active:cursor-grabbing"
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            onPointerCancel={onHandlePointerUp}
            aria-hidden="true"
          >
            <span className="w-10 h-1.5 rounded-full bg-retro-border" />
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}

// --- motion helpers (module-level: they only touch the nodes they are given) ---

function poseSheet(panel, backdrop, m, y) {
  m.y = y
  if (panel) panel.style.transform = `translate3d(0, ${y}px, 0)`
  if (backdrop) backdrop.style.opacity = String(Math.max(0, Math.min(1, 1 - y / (m.h || 1))))
}

function springSheet(panel, backdrop, m, to, velocity) {
  m.spring?.stop()
  m.spring = animateSpring({
    from: m.y, to, velocity, spring: springPreset('sheet'), eps: 0.5,
    onUpdate: (y) => poseSheet(panel, backdrop, m, y),
    onDone: () => {
      m.spring = null
      if (panel && to === 0) panel.style.transform = ''
    },
  })
}

function fade(el, from, to) {
  return el.animate([{ opacity: from }, { opacity: to }], { duration: DUR.fast, easing: 'linear', fill: 'both' })
}

function enterDialog(panel, backdrop) {
  const { easing, durationMs } = supportsLinearEasing()
    ? springLinear(springPreset('sheet'))
    : { easing: EASE.enter, durationMs: DUR.page }
  panel.animate(
    [{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }],
    { duration: durationMs, easing },
  )
  backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.base, easing: EASE.standard })
}

function exitDialog(panel, backdrop) {
  panel.animate(
    [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.96)' }],
    { duration: DUR.fast, easing: EASE.exit, fill: 'forwards' },
  )
  return backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.base, easing: EASE.exit, fill: 'forwards' })
}

// True when the touch starts inside something already scrolled down, so the
// pull belongs to that scroller.
function scrolledAncestor(target, panel) {
  for (let el = target; el && el !== panel.parentElement; el = el.parentElement) {
    if (el.scrollTop > 0) return true
    if (el.matches?.('input[type="range"], textarea, [data-no-sheet-drag]')) return true
  }
  return false
}

// An inert copy of the overlay, left in place to animate out after React
// removes the real one. Form values, canvases and scroll offsets are copied
// over so the exiting panel looks exactly like the one that was there.
function makeGhost(layer) {
  try {
    const ghost = layer.cloneNode(true)
    ghost.setAttribute('aria-hidden', 'true')
    ghost.setAttribute('inert', '')
    ghost.style.pointerEvents = 'none'
    ghost.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'))
    ghost.querySelector('[data-sheet-panel]')?.removeAttribute('role')
    const from = layer.querySelectorAll('input, textarea, select, canvas, [data-sheet-panel], [data-sheet-panel] *')
    const to = ghost.querySelectorAll('input, textarea, select, canvas, [data-sheet-panel], [data-sheet-panel] *')
    document.body.appendChild(ghost)
    from.forEach((src, i) => {
      const dst = to[i]
      if (!dst) return
      if (src.tagName === 'CANVAS') {
        try { dst.getContext('2d')?.drawImage(src, 0, 0) } catch { /* tainted or webgl */ }
      } else if (src.tagName === 'INPUT' || src.tagName === 'TEXTAREA' || src.tagName === 'SELECT') {
        dst.value = src.value
      }
      if (src.scrollTop) dst.scrollTop = src.scrollTop
    })
    return ghost
  } catch {
    return null
  }
}
