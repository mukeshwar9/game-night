import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { ARENA_H, ARENA_W, GRAVITY, PIECE_R, piecesInFlight, positionAt } from '../lib/pulpLogic'

// One PULP RUSH field: renders the seeded course at course time `t` and turns
// pointer drags into swipe segments. Rendering and input only — slicing,
// scoring and hearts live in pulpLogic.js (the parent applies each swipe).
//
// Props:
//   course, field, t     — the course, the field state, course ms to draw
//   clock()              — course ms now (stamps swipe points)
//   onSwipe(player, seg) — seg = { ax, ay, bx, by, t0, t1 } in arena units
//   playerAt({x, y})     — which player a new touch belongs to (null = ignore);
//                          a finger stays bound to it until it lifts
//   fx                   — recent events [{ type, id, x, y, by, gain, combo, at, sprite }]
//   rotated              — draw upside down (the far player in split screen)
//   disabled, stunned, twoTone, trailFor(player) → 'p1'|'p2'
//
// Multi-touch: every pointer is captured by the field it went down on and
// tracked by pointerId, so two thumbs on one phone are two players.

const TRAIL_MS = 140
const FX_MS = 650

const pct = (v, of) => `${(v / of) * 100}%`

/** Pixel-art produce, themed through --c-* (never hex). */
export function PulpSprite({ sprite, owner = null }) {
  const ring = owner === 'X' ? 'rgb(var(--c-p1))' : owner === 'O' ? 'rgb(var(--c-p2))' : null
  return (
    <svg viewBox="0 0 20 20" width="100%" height="100%" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      {sprite === 'lime' && <>
        <circle cx="10" cy="11" r="8" style={{ fill: 'rgb(var(--c-win))' }} />
        <circle cx="7" cy="8" r="2" style={{ fill: 'rgb(var(--c-card) / 0.6)' }} />
        <rect x="9" y="1" width="2" height="3" style={{ fill: 'rgb(var(--c-dim))' }} />
      </>}
      {sprite === 'plum' && <>
        <ellipse cx="10" cy="11" rx="7" ry="8" style={{ fill: 'rgb(var(--c-p2))' }} />
        <circle cx="7.5" cy="8" r="1.8" style={{ fill: 'rgb(var(--c-card) / 0.55)' }} />
        <path d="M10 3 q3 -3 6 -1 q-3 2 -6 1z" style={{ fill: 'rgb(var(--c-p1))' }} />
      </>}
      {sprite === 'peach' && <>
        <circle cx="10" cy="11" r="8" style={{ fill: 'rgb(var(--c-cta))' }} />
        <path d="M10 4 v14" style={{ stroke: 'rgb(var(--c-text) / 0.3)', strokeWidth: 1 }} />
        <circle cx="7" cy="8" r="1.8" style={{ fill: 'rgb(var(--c-card) / 0.55)' }} />
      </>}
      {sprite === 'berry' && <>
        <path d="M10 18 L3 8 Q10 2 17 8 Z" style={{ fill: 'rgb(var(--c-p3))' }} />
        <path d="M5 6 l5 -3 l5 3 z" style={{ fill: 'rgb(var(--c-p1))' }} />
        <circle cx="8" cy="10" r=".9" style={{ fill: 'rgb(var(--c-card))' }} />
        <circle cx="12" cy="11" r=".9" style={{ fill: 'rgb(var(--c-card))' }} />
        <circle cx="10" cy="14" r=".9" style={{ fill: 'rgb(var(--c-card))' }} />
      </>}
      {sprite === 'rot' && <>
        <circle cx="10" cy="11" r="8" style={{ fill: 'rgb(var(--c-text) / 0.55)', stroke: 'rgb(var(--c-danger))', strokeWidth: 1.5 }} />
        <path d="M6 8 l3 3 M9 8 l-3 3 M11 8 l3 3 M14 8 l-3 3" style={{ stroke: 'rgb(var(--c-card))', strokeWidth: 1.3 }} />
        <path d="M7 15 q3 -2 6 0" style={{ stroke: 'rgb(var(--c-card))', strokeWidth: 1.2, fill: 'none' }} />
      </>}
      {owner === 'both' && <>
        <circle cx="10" cy="11" r="9.2" style={{ fill: 'none', stroke: 'rgb(var(--c-cta))', strokeWidth: 1.4, strokeDasharray: '2 2' }} />
        <text x="10" y="14" textAnchor="middle" style={{ font: 'bold 7px monospace', fill: 'rgb(var(--c-card))' }}>2×</text>
      </>}
      {ring && <>
        <circle cx="10" cy="11" r="9.2" style={{ fill: 'none', stroke: ring, strokeWidth: 1.6 }} />
        <circle cx="16.5" cy="4" r="3.4" style={{ fill: ring }} />
        <text x="16.5" y="6" textAnchor="middle" style={{ font: 'bold 5px monospace', fill: 'rgb(var(--c-card))' }}>{owner === 'X' ? '1' : '2'}</text>
      </>}
    </svg>
  )
}

function Fx({ e, t }) {
  const age = (t - e.at) / 1000
  if (age < 0 || age * 1000 > FX_MS) return null
  const fade = 1 - (age * 1000) / FX_MS
  const size = pct(2 * PIECE_R, ARENA_W)
  const fall = 0.5 * GRAVITY * age * age
  const label = e.type === 'slice' ? (e.combo >= 3 ? `${e.combo}× COMBO` : `+${e.gain}`)
    : e.type === 'double' ? `DOUBLE +${e.gain}`
      : e.type === 'rot' ? 'ROTTEN −5'
        : e.type === 'wrong' ? 'WRONG ♥−1'
          : e.type === 'half' ? 'PARTNER!' : null
  const bad = e.type === 'rot' || e.type === 'wrong'
  const split = e.type === 'slice' || e.type === 'double' || e.type === 'wrong'
  return (
    <>
      {split && [-1, 1].map(side => (
        <div
          key={side}
          className="absolute pointer-events-none"
          style={{
            left: pct(e.x + side * 0.25 * age, ARENA_W),
            top: pct(e.y + fall, ARENA_H),
            width: size,
            aspectRatio: '1',
            opacity: fade,
            transform: `translate(-50%, -50%) rotate(${side * 200 * age}deg)`,
            clipPath: side < 0 ? 'inset(0 50% 0 0)' : 'inset(0 0 0 50%)',
          }}
        >
          <PulpSprite sprite={e.sprite} />
        </div>
      ))}
      {e.type === 'rot' && (
        <div
          className="absolute pointer-events-none rounded-full bg-retro-danger/40"
          style={{ left: pct(e.x, ARENA_W), top: pct(e.y, ARENA_H), width: size, aspectRatio: '1', opacity: fade, transform: `translate(-50%, -50%) scale(${1 + age * 2})` }}
        />
      )}
      {label && (
        <div
          className={cn(
            'absolute pointer-events-none font-pixel text-[10px] whitespace-nowrap',
            bad ? 'text-retro-danger' : e.type === 'half' ? 'text-retro-cta' : 'text-retro-win text-glow-win',
          )}
          style={{ left: pct(e.x, ARENA_W), top: pct(e.y - 0.12 - age * 0.15, ARENA_H), opacity: fade, transform: 'translate(-50%, -50%)' }}
        >
          {label}
        </div>
      )}
    </>
  )
}

export default function PulpField({
  course, field, t, clock, onSwipe, playerAt = () => 'me', fx = [], rotated = false,
  disabled = false, stunned = false, twoTone = false, trailFor = () => 'p1', className, style, label,
}) {
  const elRef = useRef(null)
  const strokesRef = useRef(new Map())
  const [trails, setTrails] = useState([])
  const live = useRef({ onSwipe, playerAt, clock, disabled })
  useEffect(() => { live.current = { onSwipe, playerAt, clock, disabled } })

  useEffect(() => {
    const el = elRef.current
    if (!el) return
    const snapshot = () => setTrails([...strokesRef.current.values()].map(s => ({ player: s.player, pts: [...s.pts] })))
    const toArena = (ev) => {
      const r = el.getBoundingClientRect()
      let x = ((ev.clientX - r.left) / (r.width || 1)) * ARENA_W
      let y = ((ev.clientY - r.top) / (r.height || 1)) * ARENA_H
      if (rotated) { x = ARENA_W - x; y = ARENA_H - y }
      return { x, y }
    }
    const down = (e) => {
      if (live.current.disabled) return
      e.preventDefault()
      const p = toArena(e)
      const player = live.current.playerAt(p)
      if (!player) return
      el.setPointerCapture?.(e.pointerId)
      const now = live.current.clock()
      strokesRef.current.set(e.pointerId, { player, last: { ...p, t: now }, pts: [{ ...p, t: now }] })
    }
    const move = (e) => {
      const s = strokesRef.current.get(e.pointerId)
      if (!s) return
      e.preventDefault()
      const now = live.current.clock()
      const batch = e.getCoalescedEvents?.() || []
      for (const ev of batch.length ? batch : [e]) {
        const p = toArena(ev)
        const at = now - Math.max(0, e.timeStamp - ev.timeStamp)
        if (at <= s.last.t && p.x === s.last.x && p.y === s.last.y) continue
        const seg = { ax: s.last.x, ay: s.last.y, bx: p.x, by: p.y, t0: s.last.t, t1: Math.max(at, s.last.t) }
        s.last = { ...p, t: seg.t1 }
        s.pts.push(s.last)
        if (!live.current.disabled) live.current.onSwipe(s.player, seg)
      }
      if (s.pts.length > 24) s.pts.splice(0, s.pts.length - 24)
      snapshot()
    }
    const up = (e) => { strokesRef.current.delete(e.pointerId); snapshot() }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
  }, [rotated])

  const size = pct(2 * PIECE_R, ARENA_W)
  const pieces = piecesInFlight(course, t).filter(p => !field.gone[p.id])
  const shownTrails = trails
    .map(s => ({ player: s.player, pts: s.pts.filter(p => t - p.t <= TRAIL_MS) }))
    .filter(s => s.pts.length > 1)

  return (
    <div
      ref={elRef}
      role="application"
      aria-label={label || 'Pulp Rush field: swipe across the produce to slice it; avoid the rotten apples'}
      className={cn(
        'relative overflow-hidden rounded-xl border-2 select-none bg-retro-surface',
        disabled ? 'border-retro-border/50' : 'border-retro-border cursor-crosshair',
        rotated && 'rotate-180',
        className,
      )}
      style={{ aspectRatio: `${ARENA_W} / ${ARENA_H}`, touchAction: 'none', ...style }}
    >
      {pieces.map(piece => {
        const pos = positionAt(piece, t)
        if (!pos) return null
        const spin = (piece.spin * (t - piece.launchAt)) / 1000
        return (
          <div
            key={piece.id}
            className="absolute pointer-events-none"
            style={{
              left: pct(pos.x, ARENA_W),
              top: pct(pos.y, ARENA_H),
              width: piece.kind === 'rot' ? `calc(${size} * 1.1)` : size,
              aspectRatio: '1',
              transform: `translate(-50%, -50%) rotate(${twoTone && piece.owner ? 0 : spin}deg)`,
              opacity: field.pending?.[piece.id] ? 0.7 : 1,
            }}
          >
            <PulpSprite sprite={piece.sprite} owner={twoTone ? piece.owner : null} />
          </div>
        )
      })}
      {fx.map(e => <Fx key={`${e.type}-${e.id}-${e.at}`} e={e} t={t} />)}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox={`0 0 ${ARENA_W} ${ARENA_H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {shownTrails.map((s, i) => (
          <polyline
            key={i}
            points={s.pts.map(p => `${p.x},${p.y}`).join(' ')}
            vectorEffect="non-scaling-stroke"
            className={trailFor(s.player) === 'p2' ? 'stroke-retro-p2' : 'stroke-retro-p1'}
            style={{ fill: 'none', strokeWidth: 6, strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.8 }}
          />
        ))}
      </svg>
      {stunned && (
        <div className="absolute inset-0 flex items-center justify-center bg-retro-tint-danger/60 pointer-events-none">
          <p className="font-pixel text-xs text-retro-danger arcade-blink">STUNNED!</p>
        </div>
      )}
    </div>
  )
}
