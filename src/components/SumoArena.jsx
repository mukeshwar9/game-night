import { forwardRef, useEffect, useRef } from 'react'
import { BLOB_R, SHRINK_START, START_RADIUS, edgeDanger, outDirection } from '../lib/sumoLogic'
import { cn } from '@/lib/utils'

const pct = (n) => `${n * 100}%`

const fmtTime = (t) => {
  const s = Math.max(0, Math.floor(t))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const reducedMotion = () => document.documentElement.dataset.motion === 'reduced'

// 16×16 rikishi, front-facing: h topknot/hair, s skin, d skin shade, e eye,
// m mawashi (player colour). Eyes sit one pixel toward the opponent.
const RIKISHI = [
  '......hhhh......',
  '.......hh.......',
  '.....hhhhhh.....',
  '....ssssssss....',
  '....sesssses....',
  '....sssddsss....',
  '..ssssssssssss..',
  '.ssssssssssssss.',
  'ssssdssssssdssss',
  'ssssssssssssssss',
  '.ssssssssssssss.',
  '.mmmmmmmmmmmmmm.',
  '.mmmmmmmmmmmmmm.',
  '..mmmm.mm.mmmm..',
  '..sss......sss..',
  '.ssss......ssss.',
]
const FILL = {
  h: 'rgb(var(--c-text))',
  s: 'rgb(var(--c-skin))',
  d: 'rgb(var(--c-skin-4))',
  e: 'rgb(var(--c-text))',
}
// Runs of one colour per row become one rect: ~60 rects instead of ~190.
function spriteRects(lookLeft) {
  const rects = []
  RIKISHI.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const ch = row[x]
      let end = x + 1
      while (end < row.length && row[end] === ch && ch !== 'e') end++
      if (ch !== '.') {
        if (ch === 'e') {
          rects.push({ key: `${x}-${y}-s`, x, y, w: 1, k: 's' })
          rects.push({ key: `${x}-${y}`, x: lookLeft ? x - 1 : x, y, w: 1, k: 'e' })
        } else {
          rects.push({ key: `${x}-${y}`, x, y, w: end - x, k: ch })
        }
      }
      x = end
    }
  })
  return rects
}
const RECTS = { left: spriteRects(true), right: spriteRects(false) }

function Rikishi({ side, lookLeft }) {
  const belt = side === 'X' ? 'rgb(var(--c-p1))' : 'rgb(var(--c-p2))'
  return (
    <svg viewBox="0 0 16 16" className="block w-full h-full" shapeRendering="crispEdges" aria-hidden="true">
      {RECTS[lookLeft ? 'left' : 'right'].map(r => (
        <rect key={r.key} x={r.x} y={r.y} width={r.w} height={1} style={{ fill: r.k === 'm' ? belt : FILL[r.k] }} />
      ))}
    </svg>
  )
}

// Wrestler renders continuously (never unmounts on death) so the alive→dead
// transition animates: a ringed-out wrestler tumbles outward from the centre,
// spinning and shrinking into the void. Three nested layers keep transforms
// from fighting: position (per frame, no transition), velocity stretch (per
// frame, no transition) and pose (lunge / clash squash / tumble, transitioned).
function Wrestler({ blob, side, opp, lunge, squash }) {
  const size = BLOB_R * 2
  const alive = !!blob?.alive
  const lookLeft = (opp?.x ?? 0.5) < blob.x
  const sp = Math.hypot(blob.vx || 0, blob.vy || 0)
  const k = alive ? Math.min(0.16, sp * 0.14) : 0
  const horizontal = Math.abs(blob.vx || 0) >= Math.abs(blob.vy || 0)
  const stretch = horizontal ? `scale(${1 + k}, ${1 - k})` : `scale(${1 - k}, ${1 + k})`
  const dir = outDirection(blob)
  const pose = !alive
    ? `translate(${dir.x * 140}%, ${dir.y * 140}%) rotate(${dir.x >= 0 ? 260 : -260}deg) scale(0.35)`
    : lunge ? `translate(${lookLeft ? -10 : 10}%, 0) scale(1.16, 0.86)`
      : squash ? 'scale(0.84, 1.14)'
        : 'none'
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ transform: `translate3d(${pct(blob.x)}, ${pct(blob.y)}, 0)` }}
    >
      <div
        className="absolute left-0 top-0"
        style={{ width: pct(size), height: pct(size), transform: 'translate(-50%, -50%)' }}
      >
        {/* Floor shadow — stays put while the sprite poses; gone on a ring-out. */}
        <div
          className="absolute rounded-full bg-retro-text/25"
          style={{ left: '14%', right: '14%', bottom: '-6%', height: '18%', opacity: alive ? 1 : 0, transition: 'opacity 0.2s' }}
        />
        <div className="absolute inset-0" style={{ transform: stretch, transformOrigin: '50% 90%' }}>
          <div
            className="absolute inset-0"
            style={{
              transformOrigin: '50% 80%',
              transform: pose,
              opacity: alive ? 1 : 0,
              transition: alive
                ? 'transform 0.12s ease-out'
                : 'transform 1.1s cubic-bezier(0.3, 0.1, 0.6, 1), opacity 1.1s ease-in',
            }}
          >
            <Rikishi side={side} lookLeft={lookLeft} />
          </div>
        </div>
      </div>
    </div>
  )
}

function EdgeBar({ danger, tone, label, end = false }) {
  return (
    <span className={cn('flex flex-col gap-1 min-w-0', end && 'items-end text-right')}>
      <span className={cn('text-[9px] tracking-widest truncate max-w-full', tone)}>{label}</span>
      <span className="block h-1 w-full bg-retro-border/60 rounded-sm overflow-hidden" aria-hidden="true">
        <span
          className={cn('block h-full', danger > 0.72 ? 'bg-retro-danger' : 'bg-retro-dim/70')}
          style={{ width: pct(danger), transition: 'width 0.12s linear' }}
        />
      </span>
    </span>
  )
}

const PARTICLE_TONE = { cta: 'bg-retro-cta', text: 'bg-retro-text/70' }
const CALLOUT_TONE = {
  X: 'text-retro-p1 text-glow-p1',
  O: 'text-retro-p2 text-glow-p2',
  danger: 'text-retro-danger text-glow-danger',
  cta: 'text-retro-cta text-glow-cta',
}

const SumoArena = forwardRef(function SumoArena(
  { blobs, arenaR, t = 0, mySide, namesX = 'X', namesO = 'O', dim = false, overlay, fx },
  ref,
) {
  const X = blobs?.X
  const O = blobs?.O
  // Once the platform has started shrinking (or has already shrunk below its
  // starting size — covers the guest, which derives arenaR from the host's
  // snapshot rather than its own clock), the tawara turns red and pulses.
  const shrinking = t > SHRINK_START || arenaR < START_RADIUS - 1e-6
  // The live clay ends at the death line (sumoLogic: centre past
  // arenaR - BLOB_R/2 is out), and the straw ring is drawn on it.
  const liveR = Math.max(0, arenaR - BLOB_R * 0.5)
  const nameX = namesX?.toUpperCase()
  const nameO = namesO?.toUpperCase()

  // Screen shake — Web Animations on the arena box, skipped for reduced motion.
  const shakeRef = useRef(null)
  const shakeN = fx?.shake?.n ?? 0
  const shakeMag = fx?.shake?.mag ?? 0
  useEffect(() => {
    if (!shakeN || !shakeRef.current || reducedMotion()) return
    const m = shakeMag
    shakeRef.current.animate?.([
      { transform: 'translate(0, 0)' },
      { transform: `translate(${-m}px, ${m * 0.6}px)` },
      { transform: `translate(${m * 0.8}px, ${-m * 0.4}px)` },
      { transform: `translate(${-m * 0.4}px, ${-m * 0.6}px)` },
      { transform: 'translate(0, 0)' },
    ], { duration: 260, easing: 'ease-out' })
  }, [shakeN, shakeMag])

  return (
    <div className="space-y-2 select-none">
      <div
        className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-3 font-pixel mx-auto"
        style={{ width: 'min(100%, calc(100dvh - 320px))' }}
      >
        <EdgeBar
          danger={edgeDanger(X, arenaR)}
          tone={mySide === 'X' ? 'text-retro-p1 text-glow-p1' : 'text-retro-p1/80'}
          label={`${nameX}${mySide === 'X' && nameX !== 'YOU' ? ' (YOU)' : ''}`}
        />
        <span
          className={cn(
            'text-[10px] tracking-widest px-2 py-1 rounded border-2 bg-retro-card tabular-nums',
            shrinking ? 'text-retro-danger border-retro-danger' : 'text-retro-dim border-retro-border',
          )}
          aria-label={`Round time ${fmtTime(t)}`}
        >
          {fmtTime(t)}
        </span>
        <EdgeBar
          end
          danger={edgeDanger(O, arenaR)}
          tone={mySide === 'O' ? 'text-retro-p2 text-glow-p2' : 'text-retro-p2/80'}
          label={`${nameO}${mySide === 'O' && nameO !== 'YOU' ? ' (YOU)' : ''}`}
        />
      </div>

      {/* Arena — width is capped by both the container AND the viewport
          height (min() against a 100dvh-derived budget) so short/landscape
          phones still see the whole square arena instead of it overflowing. */}
      <div
        ref={ref}
        className={cn(
          'relative mx-auto rounded-lg border-2 border-retro-border bg-retro-deep overflow-hidden touch-none',
          dim && 'opacity-60',
        )}
        style={{ aspectRatio: '1 / 1', width: 'min(100%, calc(100dvh - 320px))' }}
      >
        <div ref={shakeRef} className="absolute inset-0">
          {/* Vignette: the void around the dohyo darkens toward the corners. */}
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(circle at 50% 50%, transparent 45%, rgb(var(--c-structure) / 0.55) 100%)' }}
          />
          {/* Raised clay mound at full size — what has crumbled outside the
              shrinking ring stays as darker, dead clay. */}
          <div
            className="absolute rounded-full"
            style={{
              left: pct(0.5 - START_RADIUS + 0.01), top: pct(0.5 - START_RADIUS + 0.01),
              width: pct((START_RADIUS - 0.01) * 2), height: pct((START_RADIUS - 0.01) * 2),
              background: 'rgb(var(--c-cta) / 0.2)',
              boxShadow: '0 5px 0 rgb(var(--c-cta) / 0.3)',
            }}
          />
          {/* Live clay with speckle, ringed by the straw tawara (the death line). */}
          <div
            className={cn(
              'absolute rounded-full border-[3px] border-dashed',
              shrinking ? 'border-retro-danger animate-pulse' : 'border-retro-cta',
            )}
            style={{
              left: pct(0.5 - liveR), top: pct(0.5 - liveR),
              width: pct(liveR * 2), height: pct(liveR * 2),
              backgroundColor: 'rgb(var(--c-tint-cta))',
              backgroundImage: 'radial-gradient(rgb(var(--c-cta) / 0.18) 1px, transparent 1.5px)',
              backgroundSize: '9px 9px',
            }}
          />
          {/* Shikiri-sen: the two start lines the wrestlers face off behind. */}
          {[0.4, 0.6].map(x => (
            <div
              key={x}
              className="absolute bg-retro-text/40 rounded-[1px]"
              style={{ left: pct(x - 0.005), top: pct(0.46), width: pct(0.01), height: pct(0.08) }}
            />
          ))}

          {X && <Wrestler blob={X} side="X" opp={O} lunge={fx?.lunge === 'X'} squash={!!fx?.squash} />}
          {O && <Wrestler blob={O} side="O" opp={X} lunge={fx?.lunge === 'O'} squash={!!fx?.squash} />}

          {/* Dust puffs */}
          {fx?.particles?.map(p => (
            <div
              key={p.id}
              className={cn('absolute pong-particle', PARTICLE_TONE[p.tone] || 'bg-retro-text/70')}
              style={{
                left: `calc(${pct(p.x)} - ${p.size / 2}px)`, top: `calc(${pct(p.y)} - ${p.size / 2}px)`,
                width: p.size, height: p.size, '--tx': `${p.dx}px`, '--ty': `${p.dy}px`,
              }}
            />
          ))}
        </div>

        {/* Ring-out flash */}
        {fx?.flash > 0 && <div key={fx.flash} className="absolute inset-0 bg-retro-card sumo-flash pointer-events-none" />}

        {/* Callouts: HAKKEYOI!, big-hit calls, RING SHRINKING!, RING OUT! */}
        {fx?.callout && (
          <div className="absolute inset-x-0 top-[18%] flex justify-center pointer-events-none">
            <p
              key={fx.callout.id}
              className={cn('pong-callout font-pixel text-center px-2 text-base', CALLOUT_TONE[fx.callout.tone] || CALLOUT_TONE.cta)}
            >
              {fx.callout.text}
            </p>
          </div>
        )}

        {overlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-retro-bg/70 backdrop-blur-[1px]">
            {overlay}
          </div>
        )}
      </div>
      <p className="text-center font-pixel text-[10px] text-retro-dim leading-relaxed">
        <span className="kbd-hint">SPACE / ENTER TO PUSH</span><span className="touch-hint">TAP PUSH BELOW</span>
      </p>
    </div>
  )
})

export default SumoArena
