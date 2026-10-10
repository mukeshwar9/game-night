import { useRef } from 'react'
import { cn } from '@/lib/utils'
import { PAD_FOLLOW, followPad, padVector } from '../lib/bamboozleSim'
import { seatCss as seatColor } from '../lib/bamboozlePalette'
import { HEARTS, MAX_HEARTS } from '../lib/bamboozleLogic'

// The touch surfaces of BAMBOOZLE.
//
//   <BamboozlePad>   a region you put a thumb down on, anywhere, and drag: the
//                    pad appears under the thumb and trails it if it drifts.
//                    Movement is screen-relative for every seat, so the player
//                    across the phone drags toward where they want to go.
//   <GrabButton>     hold to grab a rival beside you, let go to throw.
//   <Hearts>, <Coins> the HUD pips.
//
// Inputs go straight into the controls store (useBamboozleControls), never
// through React state, so a drag costs no renders.

const RING = PAD_FOLLOW * 2

export default function BamboozlePad({
  seat, controls, disabled = false, secondFingerGrab = false, className, children, label,
}) {
  const el = useRef(null)
  const ring = useRef(null)
  const knob = useRef(null)
  const st = useRef({ id: null, ox: 0, oy: 0, grabId: null })
  const color = seatColor(seat)

  const local = (e) => {
    const r = el.current.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const paint = (ox, oy, x, y, on) => {
    if (!ring.current || !knob.current) return
    ring.current.style.opacity = on ? '1' : '0'
    knob.current.style.opacity = on ? '1' : '0'
    ring.current.style.transform = `translate(${ox - PAD_FOLLOW}px, ${oy - PAD_FOLLOW}px)`
    const d = Math.hypot(x - ox, y - oy) || 1
    const k = Math.min(1, PAD_FOLLOW / d)
    knob.current.style.transform = `translate(${ox + (x - ox) * k - 17}px, ${oy + (y - oy) * k - 17}px)`
  }

  const down = (e) => {
    if (disabled || e.target.closest?.('[data-nopad]')) return
    if (st.current.id != null) {
      // A second finger is the grab: the first stays on the pad.
      if (secondFingerGrab && st.current.grabId == null) {
        st.current.grabId = e.pointerId
        controls.setPad(seat, { grab: true })
        try { el.current.setPointerCapture(e.pointerId) } catch { /* released already */ }
      }
      return
    }
    const [x, y] = local(e)
    st.current = { id: e.pointerId, ox: x, oy: y, grabId: st.current.grabId }
    try { el.current.setPointerCapture(e.pointerId) } catch { /* released already */ }
    paint(x, y, x, y, true)
  }
  const move = (e) => {
    const s = st.current
    if (e.pointerId !== s.id) return
    const [x, y] = local(e)
    const [ox, oy] = followPad(s.ox, s.oy, x, y)
    s.ox = ox
    s.oy = oy
    const [vx, vy] = padVector(x - ox, y - oy)
    controls.setPad(seat, { x: vx, y: vy })
    paint(ox, oy, x, y, true)
  }
  const up = (e) => {
    const s = st.current
    if (e.pointerId === s.grabId) {
      s.grabId = null
      controls.setPad(seat, { grab: false })
    }
    if (e.pointerId === s.id) {
      s.id = null
      controls.setPad(seat, { x: 0, y: 0 })
      paint(0, 0, 0, 0, false)
    }
  }

  return (
    <div
      ref={el}
      role="group"
      aria-label={label || `Player ${seat + 1} pad`}
      className={cn('relative select-none touch-none overflow-hidden', disabled && 'opacity-60', className)}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span
        ref={ring}
        aria-hidden="true"
        className="absolute left-0 top-0 rounded-full border-2 opacity-0 pointer-events-none"
        style={{ width: RING, height: RING, borderColor: color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}
      />
      <span
        ref={knob}
        aria-hidden="true"
        className="absolute left-0 top-0 w-[34px] h-[34px] rounded-full opacity-0 pointer-events-none shadow-md"
        style={{ backgroundColor: color, border: '2px solid rgb(var(--c-card))' }}
      />
      {children}
    </div>
  )
}

/** Hold to grab the rival beside you; let go to throw. `charge` is 0–1 while recharging. */
export function GrabButton({ seat, controls, holding = false, charge = 1, disabled = false, className }) {
  const color = seatColor(seat)
  const ready = charge >= 1
  const set = (v) => controls.setPad(seat, { grab: v })
  return (
    <button
      type="button"
      data-nopad
      disabled={disabled}
      aria-label={holding ? 'Throw' : 'Grab a rival beside you'}
      onPointerDown={(e) => {
        e.stopPropagation()
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* released already */ }
        set(true)
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        'relative shrink-0 w-12 h-12 rounded-full border-2 font-pixel text-[7px] leading-none touch-none select-none transition press',
        'disabled:opacity-40',
        className,
      )}
      style={{
        borderColor: color,
        color: holding ? 'rgb(var(--c-card))' : 'rgb(var(--c-text))',
        backgroundColor: holding ? color : `color-mix(in srgb, ${color} ${ready ? 28 : 8}%, rgb(var(--c-card)))`,
        opacity: ready || holding ? 1 : 0.7,
      }}
    >
      {!ready && !holding && (
        <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden="true">
          <circle cx="24" cy="24" r="21" fill="none" stroke={color} strokeWidth="3" strokeDasharray={`${Math.max(0.01, charge) * 132} 132`} />
        </svg>
      )}
      <span className="relative">{holding ? 'THROW' : 'GRAB'}</span>
    </button>
  )
}

function Heart({ filled, bonus, size }) {
  return (
    <svg viewBox="0 0 10 9" width={size} height={size * 0.9} aria-hidden="true" className="shrink-0">
      <path
        d="M5 8.4 1.1 4.6C-.3 3.1.6.7 2.6.7c1 0 1.7.5 2.4 1.4C5.7 1.2 6.4.7 7.4.7c2 0 2.9 2.4 1.5 3.9z"
        fill={filled ? (bonus ? 'rgb(var(--c-cta))' : 'rgb(var(--c-danger))') : 'none'}
        stroke={filled ? 'none' : 'rgb(var(--c-border))'}
        strokeWidth="1"
      />
    </svg>
  )
}

/** Hearts left out of the starting three, with a gold one past the start. */
export function Hearts({ hp, size = 14, max = HEARTS }) {
  const total = Math.min(MAX_HEARTS, Math.max(max, hp))
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${hp} ${hp === 1 ? 'heart' : 'hearts'}`}>
      {Array.from({ length: total }, (_, i) => <Heart key={i} filled={i < hp} bonus={i >= max} size={size} />)}
    </span>
  )
}

/** Coins towards the next heart. Like avatars, coins keep their gold in every theme. */
export function Coins({ coins, of }) {
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`${coins} of ${of} coins`}>
      {Array.from({ length: of }, (_, i) => (
        <i
          key={i}
          className="w-2 h-2 rounded-full border"
          style={{ backgroundColor: i < coins ? 'rgb(230 190 50)' : 'transparent', borderColor: i < coins ? 'rgb(176 128 20)' : 'rgb(var(--c-border))' }}
        />
      ))}
    </span>
  )
}
