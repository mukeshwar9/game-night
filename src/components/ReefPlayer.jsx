import { useCallback, useEffect, useRef, useState } from 'react'
import { createReefRenderer } from './reefDraw'
import { createRun, stepRun } from '../lib/reefLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// Reef Run play surface: owns the canvas, a fixed 60 Hz simulation loop,
// keyboard + touch input and sound mapping. The run lives in a ref (never in
// React state); state is only used for pause / touch UI. The parent hears
// about it through onProgress / onEnd. Because the run object is mutable,
// a parent may call continueRun(run, level) on the run it received in onEnd
// and the loop picks the run up again as soon as run.mode is 'play'.

const STEP_MS = 1000 / 60
const MAX_CATCHUP = 5
const PROGRESS_MS = 250
const DEAD_ZONE = 0.15
const STICK_R = 40

const KEY_DIRS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
}
const DASH_KEYS = new Set(['KeyX', 'Space'])
const PAUSE_KEYS = new Set(['Escape', 'KeyP'])

const POSITIVE = new Set(['pearl', 'star', 'shell', 'heart', 'checkpoint'])

function play(name, ...args) {
  try { sounds[name]?.(...args) } catch { /* sound is optional */ }
}

function playEvent(name) {
  if (POSITIVE.has(name)) play('hit', name === 'star' ? 8 : 3)
  else if (name === 'hit') play('miss')
  else if (name === 'clear') play('win')
  else if (name === 'dead') play('lose')
  else if (name === 'dash') play('wall')
}

function isTypingTarget(t) {
  if (!t || !t.tagName) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable
}

export default function ReefPlayer({
  level, avatarId, mode = 'solo', carry, paused = false, onProgress, onEnd, className,
}) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const knobRef = useRef(null)
  const runRef = useRef(null)
  const endedRef = useRef(false)
  const rendererRef = useRef(null)
  const keysRef = useRef({ left: false, right: false, up: false, down: false })
  const stickRef = useRef({ active: false, id: null, x: 0, y: 0 })
  const dashRef = useRef(false)
  const lastProgressRef = useRef(0)
  const pausedRef = useRef(paused)
  const propsRef = useRef({})
  const [softPaused, setSoftPaused] = useState(false)
  const [touchUi, setTouchUi] = useState(() => {
    try { return !!window.matchMedia?.('(pointer: coarse)').matches } catch { return false }
  })

  const solo = mode === 'solo'
  const isPaused = paused || softPaused
  // Declared before the run-creation effect so it always sees the current props.
  useEffect(() => {
    propsRef.current = { level, avatarId, carry, onProgress, onEnd }
    pausedRef.current = isPaused
  })

  // A new level (or a remount) starts a fresh run from the carried totals.
  useEffect(() => {
    runRef.current = createRun(level, propsRef.current.carry)
    endedRef.current = false
    lastProgressRef.current = 0
    dashRef.current = false
  }, [level])

  // Renderer + resize
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return undefined
    const renderer = createReefRenderer(canvas)
    rendererRef.current = renderer
    renderer.resize(wrap.clientWidth || 320)
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width
      if (w) renderer.resize(w)
    })
    ro?.observe(wrap)
    return () => {
      ro?.disconnect()
      renderer.dispose()
      rendererRef.current = null
    }
  }, [])

  // Fixed-timestep loop
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let acc = 0
    const readInput = () => {
      const k = keysRef.current
      let ix = (k.right ? 1 : 0) - (k.left ? 1 : 0)
      let iy = (k.down ? 1 : 0) - (k.up ? 1 : 0)
      const s = stickRef.current
      if (s.active && (s.x !== 0 || s.y !== 0)) { ix = s.x; iy = s.y }
      const len = Math.hypot(ix, iy)
      if (len > 1) { ix /= len; iy /= len }
      return { ix, iy }
    }
    const frame = (nowMs) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(nowMs - last, STEP_MS * MAX_CATCHUP)
      last = nowMs
      const { level: lvl, avatarId: av, onProgress: prog, onEnd: end } = propsRef.current
      const run = runRef.current
      const renderer = rendererRef.current
      if (!run || !renderer) return
      if (!pausedRef.current && run.mode === 'play') {
        acc += dt
        const events = []
        while (acc >= STEP_MS && run.mode === 'play') {
          acc -= STEP_MS
          const { ix, iy } = readInput()
          const dash = dashRef.current
          dashRef.current = false
          const ev = stepRun(run, lvl, { ix, iy, dash })
          for (const e of ev) { events.push(e); renderer.event(e); playEvent(e) }
        }
        if (run.mode !== 'play') acc = 0
        const t = performance.now()
        if (events.length || t - lastProgressRef.current >= PROGRESS_MS) {
          lastProgressRef.current = t
          prog?.(run, events)
        }
      } else {
        acc = 0
      }
      if (run.mode === 'play') {
        endedRef.current = false
      } else if (!endedRef.current) {
        endedRef.current = true
        end?.({ outcome: run.mode, run })
      }
      renderer.draw(lvl, run, { avatarId: av, t: run.t })
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Keyboard
  useEffect(() => {
    const down = (e) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      const dir = KEY_DIRS[e.code]
      if (dir) { keysRef.current[dir] = true; e.preventDefault(); return }
      if (DASH_KEYS.has(e.code)) {
        if (!e.repeat) dashRef.current = true
        e.preventDefault()
        return
      }
      if (solo && PAUSE_KEYS.has(e.code)) {
        if (!e.repeat) setSoftPaused(p => !p)
        e.preventDefault()
      }
    }
    const up = (e) => {
      const dir = KEY_DIRS[e.code]
      if (dir) keysRef.current[dir] = false
    }
    const clear = () => {
      keysRef.current = { left: false, right: false, up: false, down: false }
    }
    const vis = () => { if (document.hidden) { clear(); if (solo) setSoftPaused(true) } }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', vis)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [solo])

  useEffect(() => {
    const onTouch = () => setTouchUi(true)
    window.addEventListener('touchstart', onTouch, { once: true, passive: true })
    return () => window.removeEventListener('touchstart', onTouch)
  }, [])

  // Joystick: the knob is moved imperatively, the stick vector lives in a ref.
  const moveKnob = (x, y) => {
    const k = knobRef.current
    if (k) k.style.transform = `translate(${x * STICK_R}px, ${y * STICK_R}px)`
  }
  const stickFrom = (e, el) => {
    const r = el.getBoundingClientRect()
    let dx = (e.clientX - (r.left + r.width / 2)) / STICK_R
    let dy = (e.clientY - (r.top + r.height / 2)) / STICK_R
    const len = Math.hypot(dx, dy)
    if (len > 1) { dx /= len; dy /= len }
    moveKnob(dx, dy)
    if (Math.hypot(dx, dy) < DEAD_ZONE) {
      stickRef.current.x = 0
      stickRef.current.y = 0
    } else {
      stickRef.current.x = dx
      stickRef.current.y = dy
    }
  }
  const onStickDown = (e) => {
    e.preventDefault()
    const s = stickRef.current
    if (s.active) return
    s.active = true
    s.id = e.pointerId
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    stickFrom(e, e.currentTarget)
  }
  const onStickMove = (e) => {
    const s = stickRef.current
    if (!s.active || s.id !== e.pointerId) return
    stickFrom(e, e.currentTarget)
  }
  const onStickEnd = (e) => {
    const s = stickRef.current
    if (s.id !== e.pointerId) return
    s.active = false
    s.id = null
    s.x = 0
    s.y = 0
    moveKnob(0, 0)
  }

  const onDashDown = useCallback((e) => {
    e.preventDefault()
    dashRef.current = true
  }, [])

  return (
    <div
      ref={wrapRef}
      className={cn('relative w-full select-none overflow-hidden rounded-xl border-2 border-retro-border bg-retro-deep', className)}
      style={{ aspectRatio: '160 / 144', touchAction: 'none' }}
    >
      <canvas
        ref={canvasRef}
        data-testid="reef-canvas"
        role="img"
        aria-label="Reef Run play area"
        className="block w-full h-full"
      />

      {solo && !isPaused && (
        <button
          type="button"
          onClick={() => setSoftPaused(true)}
          aria-label="Pause"
          className="absolute top-[12%] left-2 w-7 h-7 rounded border border-retro-border bg-retro-surface/70 font-pixel text-[9px] text-retro-text active:scale-95"
        >
          II
        </button>
      )}

      {touchUi && !isPaused && (
        <>
          <div
            onPointerDown={onStickDown}
            onPointerMove={onStickMove}
            onPointerUp={onStickEnd}
            onPointerCancel={onStickEnd}
            data-testid="reef-joystick"
            aria-label="Joystick"
            className="absolute bottom-3 left-3 w-24 h-24 rounded-full border-2 border-retro-border bg-retro-surface/40 flex items-center justify-center"
            style={{ touchAction: 'none' }}
          >
            <div
              ref={knobRef}
              className="w-10 h-10 rounded-full bg-retro-p1/80 shadow-neon-p1 pointer-events-none"
            />
          </div>
          <button
            type="button"
            onPointerDown={onDashDown}
            aria-label="Dash"
            className="absolute bottom-5 right-4 w-16 h-16 rounded-full border-2 border-retro-cta bg-retro-cta/70 font-pixel text-[9px] text-retro-bg shadow-neon-cta active:scale-95"
            style={{ touchAction: 'none' }}
          >
            DASH
          </button>
        </>
      )}

      {solo && softPaused && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-retro-bg/75">
          <p className="font-pixel text-sm text-retro-text">PAUSED</p>
          <button
            type="button"
            onClick={() => setSoftPaused(false)}
            className="px-5 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
          >
            RESUME
          </button>
        </div>
      )}
    </div>
  )
}
