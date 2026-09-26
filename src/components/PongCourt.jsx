import { forwardRef, useEffect, useRef } from 'react'
import {
  PADDLE_W, PADDLE_INSET, BALL_R, PICKUP_SIZE, PICKUP_INFO, paddleHalf, obstaclesAt,
} from '../lib/pongLogic'
import { cn } from '@/lib/utils'

const PICKUP_STYLE = {
  grow: 'bg-retro-win shadow-neon-win',
  shrink: 'bg-retro-danger shadow-neon-danger',
  slow: 'bg-retro-cta shadow-neon-cta',
  fast: 'bg-retro-p3 shadow-neon-p3',
  multi: 'bg-retro-text',
  shield: 'bg-retro-p4 shadow-neon-p4',
}

const PARTICLE_COLOR = {
  X: 'bg-retro-p1', O: 'bg-retro-p2', win: 'bg-retro-win', cta: 'bg-retro-cta',
  danger: 'bg-retro-danger', text: 'bg-retro-text',
}

const reducedMotion = () => document.documentElement.dataset.motion === 'reduced'

// Moving pieces are placed with a transform instead of left/top: the court
// re-renders every frame, and a transform change skips layout (one forced
// layout per frame otherwise). Static pieces and the ones whose CSS animation
// owns `transform` (serve pulse, particles) keep left/top.
const moving = ({ left, top, width, height }) => ({
  left: 0, top: 0, width, height, transform: `translate3d(${left}px, ${top}px, 0)`,
})

// Map a sim point (x along the paddle-to-paddle axis, y across it) to court
// pixels. The side nearest the viewer sits at the bottom (portrait) or on
// the left (landscape), so each player always defends "their" edge.
function projector(orientation, nearSide, W, H) {
  if (orientation === 'portrait') {
    return nearSide === 'O'
      ? (x, y) => ({ left: (1 - y) * W, top: x * H })
      : (x, y) => ({ left: y * W, top: (1 - x) * H })
  }
  return nearSide === 'O'
    ? (x, y) => ({ left: (1 - x) * W, top: y * H })
    : (x, y) => ({ left: x * W, top: y * H })
}

// Presentational Pong court. Everything is absolutely positioned in pixels
// from the pure sim's normalized coordinates (no canvas), so it themes like
// every other board through the --c-* tokens. Input is captured by the parent
// via the forwarded ref to the court element.
const PongCourt = forwardRef(function PongCourt(
  { view, orientation = 'landscape', nearSide = 'X', width, height, fx, overlay, dim = false },
  ref,
) {
  const W = width
  const H = height
  const portrait = orientation === 'portrait'
  const L = portrait ? H : W               // along-axis pixels (goal to goal)
  const C = portrait ? W : H               // cross-axis pixels
  const at = projector(orientation, nearSide, W, H)
  const unit = Math.sqrt(L * C)            // visual scale for square things

  // A rectangle centred on sim (x, y), `a` long along the axis and `c` across it.
  const box = (x, y, a, c) => {
    const p = at(x, y)
    const w = portrait ? c * C : a * L
    const h = portrait ? a * L : c * C
    return { left: p.left - w / 2, top: p.top - h / 2, width: w, height: h }
  }
  const square = (x, y, size) => {
    const p = at(x, y)
    return { left: p.left - size / 2, top: p.top - size / 2, width: size, height: size }
  }

  // Screen shake — Web Animations on the court box, skipped for reduced motion.
  const shakeRef = useRef(null)
  const shake = fx?.shake?.n ?? 0
  const shakeMag = fx?.shake?.mag ?? 0
  useEffect(() => {
    if (!shake || !shakeRef.current || reducedMotion()) return
    const m = shakeMag
    shakeRef.current.animate?.([
      { transform: 'translate(0, 0)' },
      { transform: `translate(${-m}px, ${m * 0.6}px)` },
      { transform: `translate(${m * 0.8}px, ${-m * 0.4}px)` },
      { transform: `translate(${-m * 0.4}px, ${-m * 0.6}px)` },
      { transform: 'translate(0, 0)' },
    ], { duration: 260, easing: 'ease-out' })
  }, [shake, shakeMag])

  if (!W || !H) return <div ref={ref} className="w-full h-full" />

  const { balls = [], paddles, pickups = [], effects, ballMod, time = 0, mode, serving } = view
  const ballSize = Math.max(8, 2 * BALL_R * C * 1.25)
  const ballTone = ballMod?.fast > 0 ? 'bg-retro-p3' : ballMod?.slow > 0 ? 'bg-retro-cta' : 'bg-retro-text'
  const obstacles = obstaclesAt(time, mode)

  const paddle = (side) => {
    const x = side === 'X' ? PADDLE_INSET : 1 - PADDLE_INSET
    const eh = paddleHalf(effects, side)
    const e = effects?.[side]
    const tone = e?.grow > 0
      ? 'bg-retro-win shadow-neon-win'
      : e?.shrink > 0
        ? 'bg-retro-dim'
        : side === 'X' ? 'bg-retro-p1 shadow-neon-p1' : 'bg-retro-p2 shadow-neon-p2'
    const flashing = fx?.hit?.side === side
    return (
      <div
        key={side}
        className={cn('absolute rounded-sm transition-[width,height] duration-150', tone, flashing && 'brightness-150')}
        style={moving(box(x, paddles[side], Math.max(PADDLE_W, 10 / L), eh * 2))}
      />
    )
  }

  const shield = (side) => effects?.[side]?.shield > 0 && (
    <div
      key={`sh-${side}`}
      className="absolute bg-retro-p4 shadow-neon-p4 pong-shield"
      style={box(side === 'X' ? 0.004 : 0.996, 0.5, 6 / L, 1)}
    />
  )

  return (
    <div ref={shakeRef} className="relative" style={{ width: W, height: H }}>
      <div
        ref={ref}
        className={cn(
          'absolute inset-0 rounded-lg border-2 bg-retro-surface overflow-hidden touch-none select-none transition-colors duration-300',
          fx?.flash === 'X' ? 'border-retro-p1' : fx?.flash === 'O' ? 'border-retro-p2' : 'border-retro-border',
          dim && 'opacity-60',
        )}
        style={{ cursor: 'none' }}
      >
        {/* Goal-line glow on the side that just scored */}
        {fx?.flash && (
          <div className={cn('absolute inset-0 pointer-events-none opacity-10', fx.flash === 'X' ? 'bg-retro-p1' : 'bg-retro-p2')} />
        )}

        {/* Centre net + centre circle */}
        <div
          className={cn('absolute border-dashed border-retro-border/70', portrait ? 'inset-x-0 border-t-2' : 'inset-y-0 border-l-2')}
          style={portrait ? { top: H / 2 - 1 } : { left: W / 2 - 1 }}
        />
        <div
          className="absolute rounded-full border-2 border-retro-border/40"
          style={square(0.5, 0.5, C * 0.28)}
        />

        {shield('X')}
        {shield('O')}

        {/* CHAOS bumpers */}
        {obstacles.map((o, i) => (
          <div
            key={`ob-${i}`}
            className="absolute rounded-sm bg-retro-structure border border-retro-border shadow-neon-cta"
            style={moving(box(o.x, o.y, o.w, o.h))}
          />
        ))}

        {paddle('X')}
        {mode !== 'survival' && paddle('O')}
        {mode === 'survival' && (
          <div
            className="absolute bg-retro-p2/60"
            style={box(0.997, 0.5, 6 / L, 1)}
          />
        )}

        {/* Power-up pickups — lettered so they never rely on colour alone */}
        {pickups.map((pk) => {
          const size = PICKUP_SIZE * unit * 1.35
          return (
            <div
              key={pk.id}
              className={cn('absolute rounded-sm animate-pulse flex items-center justify-center font-pixel text-retro-bg leading-none', PICKUP_STYLE[pk.kind] || 'bg-retro-cta')}
              style={{ ...moving(square(pk.x, pk.y, size)), fontSize: Math.max(9, size * 0.5) }}
              aria-label={PICKUP_INFO[pk.kind]?.name}
            >
              {PICKUP_INFO[pk.kind]?.glyph}
            </div>
          )
        })}

        {/* Balls with a short motion trail along their velocity */}
        {balls.map((b) => {
          const sp = Math.hypot(b.vx || 0, b.vy || 0)
          const trail = sp > 0.5 ? [0.012, 0.024, 0.036] : []
          return (
            <div key={b.id}>
              {trail.map((k, i) => (
                <div
                  key={i}
                  className={cn('absolute', ballTone)}
                  style={{
                    ...moving(square(b.x - b.vx * k, b.y - b.vy * k, ballSize * (0.8 - i * 0.15))),
                    opacity: 0.35 - i * 0.1,
                  }}
                />
              ))}
              <div
                className={cn('absolute shadow-glow-dot', ballTone, Math.abs(b.spin || 0) > 0.35 && 'rounded-sm')}
                style={moving(square(b.x, b.y, ballSize))}
              />
            </div>
          )
        })}
        {serving && balls.length === 0 && (
          <div className="absolute bg-retro-text pong-ball-pulse" style={square(0.5, 0.5, ballSize)} />
        )}

        {/* Hit particles */}
        {fx?.particles?.map((p) => {
          const pos = at(p.x, p.y)
          return (
            <div
              key={p.id}
              className={cn('absolute pong-particle', PARTICLE_COLOR[p.color] || 'bg-retro-text')}
              style={{
                left: pos.left - p.size / 2, top: pos.top - p.size / 2, width: p.size, height: p.size,
                '--tx': `${p.dx}px`, '--ty': `${p.dy}px`,
              }}
            />
          )
        })}

        {/* Callout (power-up names, rally milestones, points) */}
        {fx?.callout && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p
              key={fx.callout.id}
              className={cn(
                'pong-callout font-pixel text-center px-2',
                portrait ? 'text-base' : 'text-lg',
                fx.callout.tone === 'X' ? 'text-retro-p1 text-glow-p1'
                  : fx.callout.tone === 'O' ? 'text-retro-p2 text-glow-p2'
                    : fx.callout.tone === 'danger' ? 'text-retro-danger text-glow-danger'
                      : 'text-retro-cta text-glow-cta',
              )}
            >
              {fx.callout.text}
            </p>
          </div>
        )}

        {overlay && (
          // `empty:hidden` — RealtimeOverlay stays mounted (it remembers
          // whether the link ever connected) but renders nothing mid-rally.
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-retro-bg/75 backdrop-blur-[1px] p-4 text-center empty:hidden">
            {overlay}
          </div>
        )}
      </div>
    </div>
  )
})

export default PongCourt
