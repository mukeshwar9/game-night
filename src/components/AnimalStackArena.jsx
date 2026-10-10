import { useEffect, useRef, useState } from 'react'
import { PIECES, ROT_STEP, spawnY } from '../lib/animalStackLogic'
import { getStoredMotion } from '../lib/displayPrefs'
import useStackControls from '../hooks/useStackControls'
import { drawScene, drawThumb, viewFor, PLAYER_TOKENS } from './animalStackDraw'
import { cn } from '@/lib/utils'

// ANIMAL STACK arena: pixel canvas (tower, island, hover piece, drop guide),
// HUD overlays (height, NEXT, timer, turn pill, TOPPLE! stamp) and the
// thumb-zone controls. Rendering and input only — the page owns the rules.
//
// FILL (⛶) pins the rail + arena + controls over the whole viewport and hides
// the room chrome around it (chat, emotes) — game-local, like Pong's
// fullscreen solo court.
//
// `fxRef` receives { burst(x, y), shake() } for landing dust and topple
// shake; `simRef` is the live sim from useStackPlayback. The arena adds its
// own splashes (an animal hitting the water) and height callouts.
const PILL_CLASS = {
  p1: 'border-retro-p1 text-retro-p1 shadow-neon-p1',
  p2: 'border-retro-p2 text-retro-p2 shadow-neon-p2',
  p3: 'border-retro-p3 text-retro-p3 shadow-neon-p3',
  p4: 'border-retro-p4 text-retro-p4 shadow-neon-p4',
}

export default function AnimalStackArena({
  tower = [], top = 0, simRef, hover, next, best = 0,
  canAct = false, onAimDelta, onRotate, onDrop, hint,
  banner, stamp, timerFrac = null, heightLabel, rail, fxRef, ariaLabel,
}) {
  const canvasRef = useRef(null)
  const nextRef = useRef(null)
  const ppmRef = useRef(50)
  const [fill, setFill] = useState(false)
  const live = useRef({})
  useEffect(() => { live.current = { tower, top, hover, best, simRef } })
  const cam = useRef({ bottom: null })
  const particles = useRef([])
  const floats = useRef([])
  const splashed = useRef(new WeakSet())
  const shake = useRef(0)
  const grown = useRef(null)

  // Height callouts: "+0.6M" when a drop raises the tower, NEW BEST! the
  // first time a CLIMB tower passes the best line. Skipped on mount so a
  // rejoin does not replay them.
  useEffect(() => {
    const prev = grown.current
    grown.current = { n: tower.length, top }
    if (!prev || tower.length <= prev.n || getStoredMotion() === 'reduced') return
    const last = tower[tower.length - 1]
    const x = last ? last.x : 0
    if (top - prev.top >= 0.05) floats.current.push({ x, y: top + 0.35, text: `+${(top - prev.top).toFixed(1)}M`, c: 'win', life: 1 })
    if (best > 0 && top > best && prev.top <= best) floats.current.push({ x: 0, y: top + 0.9, text: 'NEW BEST!', c: 'cta', life: 1.4 })
  }, [tower, top, best])

  useEffect(() => {
    if (!fxRef) return
    const reduced = () => getStoredMotion() === 'reduced'
    fxRef.current = {
      burst: (x, y) => {
        if (reduced()) return
        for (let i = 0; i < 10; i++) {
          particles.current.push({ x: x + (Math.random() - 0.5) * 1.2, y: y - 0.3, vx: (Math.random() - 0.5) * 2, vy: Math.random() * 2, life: 1 })
        }
      },
      shake: () => { if (!reduced()) shake.current = 1 },
    }
  }, [fxRef])

  useEffect(() => {
    let raf = 0, last = performance.now()
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now
      const cv = canvasRef.current
      if (cv) {
        const { tower: tw, top: tp, hover: hv, best: bs, simRef: sr } = live.current
        const W = cv.clientWidth, H = cv.clientHeight
        const r = hv ? PIECES[hv.k]?.radius ?? 0.8 : 0.8
        const target = viewFor(W, H, tp || 0, r)
        ppmRef.current = target.ppm
        const reduced = getStoredMotion() === 'reduced'
        if (cam.current.bottom == null || reduced) cam.current.bottom = target.bottom
        else cam.current.bottom += (target.bottom - cam.current.bottom) * 0.08
        for (const p of particles.current) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 6 * dt; p.life -= dt * 1.6 }
        particles.current = particles.current.filter(p => p.life > 0)
        for (const f of floats.current) f.life -= dt * 0.8
        floats.current = floats.current.filter(f => f.life > 0)
        let sh = [0, 0]
        if (shake.current > 0) {
          sh = [(Math.random() - 0.5) * 4 * shake.current, (Math.random() - 0.5) * 4 * shake.current]
          shake.current = Math.max(0, shake.current - dt * 1.5)
        }
        const sim = sr?.current
        const items = sim
          ? sim.bodies.map(b => {
            const p = b.getPosition()
            const v = b.getLinearVelocity()
            // a splash the first time an animal hits the water
            if (p.y < -0.45 && !splashed.current.has(b)) {
              splashed.current.add(b)
              if (!reduced) {
                for (let i = 0; i < 14; i++) {
                  particles.current.push({ x: p.x + (Math.random() - 0.5) * 0.6, y: -0.45, vx: (Math.random() - 0.5) * 2.4, vy: 1.5 + Math.random() * 2.5, life: 1, c: 'kam6' })
                }
              }
            }
            return {
              k: b.getUserData().k, x: p.x, y: p.y, a: b.getAngle(),
              speed: Math.hypot(v.x, v.y), outline: b === sim.dropBody && sim.outline ? sim.outline : null,
            }
          })
          : (tw || [])
        const hoverDraw = hv && !sim?.falling && !(sim && !sim.done)
          ? { k: hv.k, x: hv.x, y: spawnY(tp, hv.k), a: hv.r * ROT_STEP, player: hv.player }
          : null
        drawScene(cv, {
          items, hover: hoverDraw, view: { ppm: target.ppm, bottom: cam.current.bottom }, t: now, still: reduced,
          shake: sh, particles: particles.current, floats: floats.current, best: bs,
        })
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => { if (nextRef.current && next != null) drawThumb(nextRef.current, next) }, [next])

  useEffect(() => {
    if (!fill) return
    const onKey = (e) => { if (e.key === 'Escape') setFill(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fill])

  const { arenaHandlers, rotateHandlers, rotateBackHandlers } = useStackControls({
    enabled: canAct, ppmRef,
    onAimDelta: (dx) => onAimDelta?.(dx),
    onRotate: (dir) => onRotate?.(dir),
    onDrop: () => onDrop?.(),
  })

  const pillTok = banner ? PLAYER_TOKENS[banner.player ?? 0] : 'p1'

  return (
    <div
      className={cn(
        'flex flex-col gap-2 w-full',
        fill
          ? 'fixed inset-0 z-50 bg-retro-bg p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))]'
          : 'h-[min(68vh,620px)] min-h-[380px]',
      )}
    >
      {rail}
      <div
        className="relative flex-1 min-h-0 border-2 border-retro-border rounded overflow-hidden select-none"
        style={{ touchAction: 'none' }}
        {...arenaHandlers}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ imageRendering: 'pixelated' }}
          role="img"
          aria-label={ariaLabel || 'Animal Stack tower'}
        />
        {timerFrac != null && (
          <div className="absolute top-0 inset-x-0 h-1 bg-retro-border/50 z-10">
            <div
              className={cn('h-full origin-left', timerFrac < 1 / 3 ? 'bg-retro-danger' : 'bg-retro-cta')}
              style={{ transform: `scaleX(${Math.max(0, Math.min(1, timerFrac))})` }}
            />
          </div>
        )}
        {heightLabel && (
          <div className="absolute top-2 left-2 z-10 font-pixel text-[8px] text-retro-dim bg-retro-card/85 border border-retro-border rounded px-1.5 py-1">
            {heightLabel}
          </div>
        )}
        {next != null && (
          <div className="absolute top-2 right-2 z-10 flex flex-col items-center gap-0.5 bg-retro-card/85 border border-retro-border rounded p-1">
            <canvas ref={nextRef} style={{ width: 44, height: 34, imageRendering: 'pixelated' }} aria-hidden="true" />
            <span className="font-pixel text-[7px] text-retro-dim">NEXT</span>
          </div>
        )}
        {banner && (
          <div
            key={banner.id}
            className={cn(
              'absolute left-1/2 top-10 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border-2 bg-retro-card px-3 py-2 font-pixel text-[9px] stack-banner',
              PILL_CLASS[pillTok],
            )}
          >
            {banner.text}
          </div>
        )}
        {stamp && (
          <div
            className="absolute left-1/2 top-[38%] z-10 border-4 border-retro-danger bg-retro-bg/70 px-3 py-2 font-pixel text-xl text-retro-danger text-glow-danger stack-stamp"
            role="status"
          >
            {stamp}
          </div>
        )}
        <button
          type="button"
          onClick={() => setFill(f => !f)}
          aria-pressed={fill}
          aria-label={fill ? 'Exit fill screen' : 'Fill screen'}
          title={fill ? 'EXIT FILL' : 'FILL'}
          className="absolute bottom-2 right-2 z-10 w-9 h-9 flex items-center justify-center rounded border border-retro-border bg-retro-card/85 text-retro-dim hover:text-retro-text font-mono text-base"
        >
          {fill ? '✕' : '⛶'}
        </button>
      </div>
      <div className="grid grid-cols-[104px_minmax(0,1fr)_104px] gap-2">
        <div className="grid grid-cols-2 gap-1" role="group" aria-label="Rotate">
          {[['⟲', 'Rotate 15 degrees counter-clockwise', rotateHandlers], ['⟳', 'Rotate 15 degrees clockwise', rotateBackHandlers]].map(([icon, label, handlers]) => (
            <button
              key={icon}
              type="button"
              disabled={!canAct}
              aria-label={label}
              className="min-h-[60px] flex flex-col items-center justify-center gap-1 border-2 border-retro-border bg-retro-card text-retro-text rounded font-pixel text-[7px] transition press disabled:opacity-35 select-none"
              style={{ touchAction: 'none' }}
              {...handlers}
            >
              <span className="font-mono text-xl leading-none">{icon}</span>TURN
            </button>
          ))}
        </div>
        <div className="min-w-0 flex items-center justify-center text-center border border-dashed border-retro-border rounded font-pixel text-[8px] text-retro-dim leading-relaxed px-1 break-words">
          {hint ?? (canAct ? '◀ DRAG TO AIM ▶' : '')}
        </div>
        <button
          type="button"
          onClick={() => onDrop?.()}
          disabled={!canAct}
          className="min-h-[60px] bg-retro-cta text-retro-bg rounded font-pixel text-sm hover:shadow-neon-cta transition press disabled:opacity-35"
        >
          DROP
        </button>
      </div>
    </div>
  )
}
