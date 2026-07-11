import { forwardRef } from 'react'
import { SHIP_R, BULLET_R, ROUND_CAP_S, SHIP_MAX_HP, START_FIRE_DELAY } from '../lib/spaceduelLogic'
import { cn } from '@/lib/utils'

const pct = (n) => `${n * 100}%`

// ~20 fixed starfield dots (normalized positions) — the background "space".
const STARS = [
  [0.07, 0.12], [0.18, 0.78], [0.24, 0.31], [0.33, 0.63], [0.41, 0.19],
  [0.46, 0.86], [0.52, 0.42], [0.58, 0.71], [0.63, 0.24], [0.69, 0.57],
  [0.74, 0.88], [0.81, 0.35], [0.87, 0.66], [0.92, 0.14], [0.13, 0.48],
  [0.37, 0.95], [0.49, 0.08], [0.66, 0.39], [0.78, 0.52], [0.95, 0.80],
]

// Triangle clip-path: tip points +x (right). The ship is rotated by `ang`
// so the tip aligns with the heading vector (cos ang, sin ang) — y is down in
// screen space so a positive CSS rotation maps directly to our heading.
const TRAILIEN = 'polygon(100% 50%, 0% 8%, 0% 92%)'

function Ship({ ship, side, thrusting }) {
  const size = SHIP_R * 2
  const color = side === 'X' ? 'bg-retro-p1' : 'bg-retro-p2'
  const glow = side === 'X' ? 'shadow-neon-p1' : 'shadow-neon-p2'
  if (!ship?.alive) {
    // wreck: dim X mark
    return (
      <div
        className="absolute rounded-sm bg-retro-dim/50 border border-retro-border"
        style={{
          left: pct(ship.x - SHIP_R), top: pct(ship.y - SHIP_R),
          width: pct(size), height: pct(size),
        }}
      />
    )
  }
  return (
    <div
      className="absolute"
      style={{
        left: pct(ship.x), top: pct(ship.y),
        width: pct(size), height: pct(size),
        transform: 'translate(-50%, -50%) rotate(' + ship.ang + 'rad)',
      }}
    >
      {/* thrust flame: small rect behind the ship (−x in the rotated frame) */}
      {thrusting && (
        <div
          className="absolute rounded-sm bg-retro-cta/80 animate-pulse"
          style={{
            right: '78%',
            top: '38%',
            width: '60%',
            height: '24%',
          }}
        />
      )}
      <div
        className={cn('absolute inset-0', color, glow)}
        style={{ clipPath: TRAILIEN }}
      />
    </div>
  )
}

function TouchButton({ className, onDown, onUp, label, ariaLabel }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onPointerDown={(e) => { e.preventDefault(); onDown?.(true) }}
      onPointerUp={(e) => { e.preventDefault(); onUp?.(false) }}
      onPointerLeave={() => onUp?.(false)}
      onPointerCancel={() => onUp?.(false)}
      className={cn(
        'font-pixel rounded border select-none touch-none active:scale-95 min-h-11 min-w-11',
        'flex items-center justify-center',
        className,
      )}
    >{label}</button>
  )
}

// Presentational Space Duel arena. DOM/CSS only (no canvas) so it themes via
// --c-* vars like every other board. Input is captured by the parent through
// useSpaceduelControls; the arena renders the on-screen touch buttons and
// forwards their pointer events to the `touch` handlers prop.
function HealthBar({ hp, maxHp, side }) {
  const color = side === 'X' ? 'bg-retro-p1' : 'bg-retro-p2'
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: maxHp }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-2 w-6 rounded-sm border',
            i < hp ? cn(color, 'border-transparent') : 'bg-retro-deep border-retro-border',
          )}
        />
      ))}
    </div>
  )
}

const SpaceduelArena = forwardRef(function SpaceduelArena(
  { ships, bullets, t, hpX = 0, hpO = 0, mySide, namesX = 'X', namesO = 'O', dim = false, overlay, touch },
  ref,
) {
  const timeLeft = Math.max(0, Math.ceil(ROUND_CAP_S - (t ?? 0)))
  const fireLocked = (t ?? 0) < START_FIRE_DELAY
  const showTouch = !!touch && !dim

  return (
    <div className="space-y-2 select-none">
      {/* Health bars + label */}
      <div className="flex items-center justify-center gap-4">
        <HealthBar hp={hpX} maxHp={SHIP_MAX_HP} side="X" />
        <span className="text-[8px] text-retro-dim tracking-widest font-pixel">SPACE DUEL</span>
        <HealthBar hp={hpO} maxHp={SHIP_MAX_HP} side="O" />
      </div>

      {/* Arena — width is capped by both the container AND the viewport height
          (min() against a 100dvh-derived budget) so short/landscape phones
          still see the whole square court instead of it overflowing. */}
      <div
        ref={ref}
        className={cn(
          'relative mx-auto rounded-lg border-2 border-retro-border bg-retro-surface overflow-hidden touch-none',
          dim && 'opacity-60',
        )}
        style={{ aspectRatio: '1 / 1', width: 'min(100%, calc(100dvh - 260px))' }}
      >
        {/* Starfield */}
        {STARS.map(([sx, sy], i) => (
          <div
            key={i}
            className="absolute rounded-full bg-retro-dim/30"
            style={{ left: pct(sx), top: pct(sy), width: '0.5%', height: '0.5%' }}
          />
        ))}

        {/* Round-time countdown (top-left) */}
        <div className="absolute top-1.5 left-2 font-pixel text-xs tabular-nums text-retro-win text-glow-win">
          {timeLeft}
        </div>

        {/* Fire-lock indicator during the grace period (top-right) */}
        {fireLocked && (
          <div className="absolute top-1.5 right-2 font-pixel text-[8px] text-retro-p2/70 arcade-blink">
            NO FIRE
          </div>
        )}

        {/* Ships */}
        {ships?.X && <Ship ship={ships.X} side="X" thrusting={!!ships.X.thrust} />}
        {ships?.O && <Ship ship={ships.O} side="O" thrusting={!!ships.O.thrust} />}

        {/* Bullets — rendered with a fixed pixel floor + halo so they stay
            legible at phone widths (M-75); the sim's BULLET_R still drives
            the actual hit geometry, this is visual-only. */}
        {(bullets || []).map((b, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-retro-cta"
            style={{
              left: pct(b.x), top: pct(b.y),
              width: `max(10px, ${pct(BULLET_R * 2)})`,
              height: `max(10px, ${pct(BULLET_R * 2)})`,
              transform: 'translate(-50%, -50%)',
              boxShadow: '0 0 6px 2px rgb(var(--c-cta)), 0 0 12px 4px rgb(var(--c-cta) / 0.45)',
            }}
          />
        ))}

        {overlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-retro-bg/70 backdrop-blur-[1px]">
            {overlay}
          </div>
        )}
      </div>

      {/* Twin-stick touch controls — BELOW the arena (never overlaying live
          play): bottom-left thumb cluster rotates, bottom-right thrusts/fires.
          Every button is a full min-h-11/min-w-11+ tap target; hold semantics
          (pointerdown/up/cancel) are preserved per-button, so multi-touch
          across both clusters (e.g. rotate + thrust + fire at once) works. */}
      {showTouch && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-2">
            <TouchButton
              className="h-14 w-14 text-base bg-retro-tint-p1/50 border-retro-p1/60 text-retro-p1"
              ariaLabel="rotate left"
              label="◀"
              onDown={() => touch.setLeft(true)}
              onUp={() => touch.setLeft(false)}
            />
            <TouchButton
              className="h-14 w-14 text-base bg-retro-tint-p1/50 border-retro-p1/60 text-retro-p1"
              ariaLabel="rotate right"
              label="▶"
              onDown={() => touch.setRight(true)}
              onUp={() => touch.setRight(false)}
            />
          </div>
          <div className="flex gap-2">
            <TouchButton
              className="h-14 w-14 text-[10px] bg-retro-tint-cta/50 border-retro-cta/60 text-retro-cta"
              ariaLabel="thrust"
              label="THR"
              onDown={() => touch.setThrust(true)}
              onUp={() => touch.setThrust(false)}
            />
            <TouchButton
              className="h-14 w-14 text-[10px] bg-retro-tint-cta/50 border-retro-cta/60 text-retro-cta"
              ariaLabel="fire"
              label="FIRE"
              onDown={() => touch.fire()}
            />
          </div>
        </div>
      )}

      {/* Player labels */}
      <div className="flex items-center justify-between px-1 font-pixel text-[8px]">
        <span className="text-retro-p1">{namesX?.toUpperCase()}{mySide === 'X' ? ' (YOU)' : ''}</span>
        <span className="text-retro-p2">{namesO?.toUpperCase()}{mySide === 'O' ? ' (YOU)' : ''}</span>
      </div>
      <p className="text-center font-pixel text-[10px] text-retro-dim leading-relaxed">
        A/D ROTATE · W THRUST · SPACE FIRE · TOUCH: BUTTONS BELOW
      </p>
    </div>
  )
})

export default SpaceduelArena