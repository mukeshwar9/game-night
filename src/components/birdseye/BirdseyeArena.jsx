import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { BirdseyeView } from './birdseyeView'
import { BIRDS } from '../../lib/birdseyeCore'
import { sounds } from '../../lib/sounds'
import useGameKeys from '../../hooks/useGameKeys'
import useMotionPref from '../../hooks/useMotionPref'
import TouchCoachmark from '../TouchCoachmark'

// BIRDSEYE arena: the canvas, its rAF loop, pull-anywhere input and the
// in-play HUD (camera switch, PEEK, ability button, aim readout). Rendering
// and input only — pages own the fort, the shot list and scoring. They hand in
// `board` = { key, snap, bird } (a new key resets the view to that settled
// fort with `bird` in the sling, or nothing to aim when bird is null) and a
// recorded shot to animate as `playback` = { id, before, shot, cam? }. A
// finished shot stays on screen until the page sends the next board.

const CAMS = [['chase', 'CHASE'], ['beak', 'BEAK'], ['side', 'SIDE']]
const CAM_KEY = 'birdseye-cam'

function readCam(reduced) {
  try {
    const v = localStorage.getItem(CAM_KEY)
    if (v === 'chase' || v === 'beak' || v === 'side') return v
  } catch { /* storage blocked */ }
  return reduced ? 'side' : 'chase' // reduced motion defaults to the classic side view
}

export default function BirdseyeArena({
  fort, board = null, playback = null,
  onLaunch, onSettled, hudLeft = null, beakHint = false, tip = null, children = null, className,
}) {
  const canvasRef = useRef(null)
  const viewRef = useRef(null)
  const dragRef = useRef(null)
  const hintRef = useRef(null)
  const slowRef = useRef(null)
  const speedRef = useRef(null)
  const pipRef = useRef(null)
  const pipBoxRef = useRef(null)
  const { reduced } = useMotionPref()
  const [cam, setCam] = useState(() => readCam(reduced))
  const [phase, setPhase] = useState('idle')
  const [abilityName, setAbilityName] = useState(null) // the live bird's ability while a tap would fire it
  const handlers = useRef({ onLaunch, onSettled })
  useEffect(() => { handlers.current = { onLaunch, onSettled } })

  // One view per mounted arena.
  useEffect(() => {
    const view = new BirdseyeView(canvasRef.current, {
      fort,
      onEvent: (e) => {
        if (e.t === 'launch') sounds.birdLaunch(e.power)
        else if (e.t === 'ability') sounds.birdAbility()
        else if (e.t === 'thud') sounds.birdThud(e.n)
        else if (e.t === 'hit') sounds.birdThud(30)
        else if (e.t === 'break') sounds.blockBreak(e.glass)
        else if (e.t === 'pop') sounds.crowPop()
        else if (e.t === 'settled') handlers.current.onSettled?.(e)
      },
    })
    view.pip = pipRef.current
    viewRef.current = view
    let raf = 0, last = performance.now(), shown = { phase: '', ability: null, pip: false }
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now
      if (!document.hidden) {
        view.frame(dt)
        if (view.phase !== shown.phase) { shown.phase = view.phase; setPhase(view.phase) }
        const ab = view.canAbility() ? (BIRDS[view.sim.shot?.b]?.ability ?? null) : null
        if (ab !== shown.ability) { shown.ability = ab; setAbilityName(ab) }
        if (hintRef.current) {
          hintRef.current.textContent = view.phase === 'aim'
            ? (view.aim.active ? `POWER ${Math.round(view.aim.pow * 100)}% · ${Math.round(view.aim.ang * 180 / Math.PI)}°` : `${BIRDS[view.bird]?.name ?? ''}: PULL BACK ANYWHERE`)
            : ''
        }
        if (view.pipOn !== shown.pip && pipBoxRef.current) { shown.pip = view.pipOn; pipBoxRef.current.style.display = view.pipOn ? 'block' : 'none' }
        if (slowRef.current) slowRef.current.style.opacity = view.slow && view.slow.t < 1.5 && view.phase !== 'done' ? '1' : '0'
        if (speedRef.current) speedRef.current.textContent = (view.phase === 'fly' || view.phase === 'impact') && view.cam.speed ? `${Math.round(view.cam.speed)} M/S` : (view.replay ? 'REPLAY' : '')
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // the view lives as long as the arena; fort/board changes are pushed below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { const v = viewRef.current; if (v) { v.comfort.reduce = reduced } }, [reduced])
  useEffect(() => { const v = viewRef.current; if (v) { v.camMode = cam; v.cut = null; if (v.phase !== 'aim' && v.phase !== 'idle') v.snapCam = true } }, [cam])

  // Board: show the settled fort with `bird` in the sling (or nothing to aim).
  const boardKey = board?.key
  useEffect(() => {
    const v = viewRef.current
    if (!v || !board?.snap) return
    if (v.fort !== fort) v.setFort(fort)
    v.board(board.snap, board.bird || null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fort, boardKey])

  // Playback: animate a recorded shot (the rival's turn, or a REPLAY).
  const playId = playback?.id
  useEffect(() => {
    const v = viewRef.current
    if (!v || !playback) return
    if (v.fort !== fort) v.setFort(fort)
    v.fire(playback.shot, { replay: true, before: playback.before, cam: playback.cam || null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playId])

  const chooseCam = (m) => {
    setCam(m)
    try { localStorage.setItem(CAM_KEY, m) } catch { /* storage blocked */ }
  }

  const release = () => {
    const shot = viewRef.current?.release()
    if (shot) handlers.current.onLaunch?.(shot)
  }

  const onPointerDown = (e) => {
    const v = viewRef.current
    if (!v) return
    if (v.phase === 'aim') {
      dragRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } else if (v.phase === 'fly') v.ability()
  }
  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.id) return
    viewRef.current.setAim(d.x - e.clientX, e.clientY - d.y, e.currentTarget.getBoundingClientRect().height)
  }
  const onPointerUp = (e) => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.id) return
    dragRef.current = null
    release()
  }
  const onPointerCancel = () => { dragRef.current = null; viewRef.current?.cancelAim() }

  // Keyboard: ←/→ angle, ↑/↓ power, Space/Enter launches (or fires the ability mid-air).
  useGameKeys((e) => {
    const v = viewRef.current
    if (!v) return false
    if (v.phase === 'aim') {
      const a = v.aim
      const nudge = (dAng, dPow) => {
        if (!a.active) { a.active = true; a.pow = Math.max(a.pow, 0.6) }
        a.ang = Math.max(-0.17, Math.min(1.4, a.ang + dAng))
        a.pow = Math.max(0, Math.min(1, a.pow + dPow))
      }
      if (e.key === 'ArrowLeft') { nudge(-Math.PI / 180, 0); return true }
      if (e.key === 'ArrowRight') { nudge(Math.PI / 180, 0); return true }
      if (e.key === 'ArrowUp') { nudge(0, 0.02); return true }
      if (e.key === 'ArrowDown') { nudge(0, -0.02); return true }
      if (e.key === ' ' || e.key === 'Enter') { if (a.active) release(); return true }
    } else if (v.phase === 'fly' && (e.key === ' ' || e.key === 'Enter')) {
      v.ability(); return true
    }
    return false
  })

  const peekDown = (e) => { e.stopPropagation(); if (viewRef.current) viewRef.current.peek = true }
  const peekUp = () => { if (viewRef.current) viewRef.current.peek = false }

  return (
    <div className={cn('relative w-full overflow-hidden rounded border-2 border-retro-border bg-retro-deep select-none', className)}>
      <canvas
        ref={canvasRef}
        data-testid="birdseye-canvas"
        aria-label="BIRDSEYE: drag anywhere to pull back the sling, release to launch, tap during flight for the bird's ability"
        className="absolute inset-0 w-full h-full [image-rendering:pixelated] touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />
      <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">{hudLeft}</div>
        <div className="flex flex-col items-end gap-1">
          <div role="group" aria-label="Camera" className="pointer-events-auto flex rounded border-2 border-retro-border bg-retro-card/90 overflow-hidden">
            {CAMS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={cam === id}
                onClick={() => chooseCam(id)}
                className={cn('min-h-9 px-2 font-pixel text-[7px] tracking-wider', cam === id ? 'bg-retro-cta text-retro-bg' : 'text-retro-dim hover:text-retro-text')}
              >
                {label}
              </button>
            ))}
          </div>
          <span ref={speedRef} className="font-pixel text-[7px] text-retro-text bg-retro-card/85 rounded px-1.5 py-1 empty:hidden" />
        </div>
      </div>
      <div
        ref={pipBoxRef}
        aria-hidden="true"
        data-testid="birdseye-pip"
        style={{ display: 'none' }}
        className="pointer-events-none absolute right-2 top-[76px] w-[36%] min-w-[104px] max-w-[190px] aspect-[17/10] overflow-hidden rounded border-2 border-retro-border bg-retro-deep shadow-lg"
      >
        <canvas ref={pipRef} className="h-full w-full [image-rendering:pixelated]" />
        <span className="absolute left-1 top-1 font-pixel text-[6px] tracking-wider text-retro-text bg-retro-card/80 rounded px-1 py-0.5">SIDE</span>
      </div>
      <div ref={slowRef} aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[42%] -translate-x-1/2 font-pixel text-[10px] text-retro-cta text-glow-cta opacity-0 transition-opacity">
        IMPACT ×¼
      </div>
      <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-end justify-between gap-2">
        {phase === 'aim' ? (
          <button
            type="button"
            onPointerDown={peekDown}
            onPointerUp={peekUp}
            onPointerLeave={peekUp}
            onPointerCancel={peekUp}
            className="pointer-events-auto min-h-10 px-2.5 rounded border-2 border-retro-border bg-retro-card/90 font-pixel text-[8px] text-retro-text"
          >
            ◧ PEEK
          </button>
        ) : <span />}
        <span ref={hintRef} className="font-pixel text-[8px] text-retro-text bg-retro-card/85 border border-dashed border-retro-border rounded px-2 py-1.5 empty:hidden" />
        {abilityName ? (
          <button
            type="button"
            onClick={() => viewRef.current?.ability()}
            className="pointer-events-auto min-h-10 px-3 rounded bg-retro-cta text-retro-bg font-pixel text-[8px] shadow-neon-cta"
          >
            TAP · {abilityName}
          </button>
        ) : <span />}
      </div>
      {tip && phase === 'aim' && (
        <p className="pointer-events-none absolute left-6 right-[calc(min(36%,190px)+1rem)] top-[22%] text-center font-pixel text-[8px] text-retro-text bg-retro-card/80 rounded px-2 py-1.5">{tip}</p>
      )}
      {beakHint && phase === 'aim' && cam !== 'beak' && (
        <div className="pointer-events-none absolute inset-x-6 top-[34%]">
          <TouchCoachmark gameKey="birdseye-beak" gesture="tap" text="TRY BEAK: FIRST-PERSON CAM, SWITCH ANY TIME MID-FLIGHT" active />
        </div>
      )}
      {children}
    </div>
  )
}
