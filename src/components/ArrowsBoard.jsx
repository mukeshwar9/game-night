import { useEffect, useRef, useState } from 'react'
import {
  exitVector,
  roundedPathD,
  ARROWS_CORNER_RADIUS,
  ARROWS_TIP_INSET,
  ARROWS_HEAD_LEN,
  ARROWS_HEAD_SPREAD,
} from '../lib/arrowsLogic'
import { directionLabel, joinLabel } from '../lib/a11yLabels'
import { isReducedMotion } from '../hooks/useMotionPref'

const GRID_STEP = 20
const DOT_RADIUS = 1.35
const FLOW_MS = 480
const FLOW_DIST = 520
// Wide invisible pad so short stubs and crowded hard boards stay fair on phones.
const HIT_WIDTH = 18
const HEAD_HIT_R = 11

// The mockup's buildArrowHead: an outline triangle (closed path, fill none) at
// the arrow's tip, pointing along the exit vector.
function arrowHeadD(points) {
  const { dx, dy, tip } = exitVector(points)
  const [tx, ty] = tip
  const bx = tx - dx * ARROWS_HEAD_LEN
  const by = ty - dy * ARROWS_HEAD_LEN
  const px = -dy
  const py = dx
  const x1 = bx + px * ARROWS_HEAD_SPREAD
  const y1 = by + py * ARROWS_HEAD_SPREAD
  const x2 = bx - px * ARROWS_HEAD_SPREAD
  const y2 = by - py * ARROWS_HEAD_SPREAD
  return `M${x1} ${y1} L${tx} ${ty} L${x2} ${y2} Z`
}

const strokeFor = (cleared) => {
  if (cleared === 'X') return 'rgb(var(--c-p1))'
  if (cleared === 'O') return 'rgb(var(--c-p2))'
  return 'rgb(var(--c-text))'
}

export default function ArrowsBoard({
  level,
  cleared,
  onTap,
  interactive,
  shakeSignal,
  stolenSignal,
  revealTraps = false,
}) {
  const groupRefs = useRef([])
  // Arrows that have already flown out. Cleared arrows that haven't finished
  // animating stay mounted so the flow-out can play. Initialised from any
  // already-cleared arrows so a reload/spectator join never replays flows.
  const [hidden, setHidden] = useState(() => {
    const s = new Set()
    cleared.forEach((c, i) => { if (c) s.add(i) })
    return s
  })
  const prevClearedRef = useRef(cleared)

  const flowOut = (index) => {
    const group = groupRefs.current[index]
    if (!group) return
    const arrow = level.arrows[index]
    if (!arrow?.points || arrow.points.length < 2) return
    const { dx, dy } = exitVector(arrow.points)

    // In-app motion setting (falls back to the OS query), read per flow so a
    // mid-round toggle applies to the next cleared arrow.
    if (isReducedMotion()) {
      setHidden((prev) => new Set(prev).add(index))
      return
    }

    const start = performance.now()
    const frame = (now) => {
      const t = Math.min(1, (now - start) / FLOW_MS)
      const ease = 1 - Math.pow(1 - t, 3)
      group.setAttribute('transform', `translate(${dx * FLOW_DIST * ease} ${dy * FLOW_DIST * ease})`)
      group.style.opacity = String(1 - t * 0.9)
      if (t < 1) requestAnimationFrame(frame)
      else setHidden((prev) => new Set(prev).add(index))
    }
    requestAnimationFrame(frame)
  }

  // Animate newly-cleared arrows out along their exit axis.
  useEffect(() => {
    const prev = prevClearedRef.current
    cleared.forEach((c, i) => {
      if (c && prev[i] !== c) flowOut(i)
    })
    prevClearedRef.current = cleared
    // flowOut closes over level, which is stable for this round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleared])

  // Blocked tap — briefly shake + redden the tapped arrow. Fires for local
  // taps and remote opponent taps (via arrowsLastBlocked) alike.
  useEffect(() => {
    if (!shakeSignal) return
    const group = groupRefs.current[shakeSignal.index]
    if (!group) return
    group.classList.remove('blocked-shake')
    // Force a reflow so the animation restarts on a rapid second blocked tap.
    void group.getBoundingClientRect()
    group.classList.add('blocked-shake')
    const t = setTimeout(() => group.classList.remove('blocked-shake'), 400)
    return () => clearTimeout(t)
  }, [shakeSignal])

  // Raced tap — the arrow cleared under us. Brief amber steal flash.
  useEffect(() => {
    if (!stolenSignal) return
    const group = groupRefs.current[stolenSignal.index]
    if (!group) return
    group.classList.remove('stolen-flash')
    void group.getBoundingClientRect()
    group.classList.add('stolen-flash')
    const t = setTimeout(() => group.classList.remove('stolen-flash'), 450)
    return () => clearTimeout(t)
  }, [stolenSignal])

  const [vx, vy, vw, vh] = level.viewBox
  const dots = []
  for (let x = vx + GRID_STEP / 2; x < vx + vw; x += GRID_STEP) {
    for (let y = vy + GRID_STEP / 2; y < vy + vh; y += GRID_STEP) {
      dots.push(<circle key={`${x}-${y}`} cx={x} cy={y} r={DOT_RADIUS} fill="rgb(var(--c-structure))" opacity="0.34" />)
    }
  }

  return (
    <div className="w-full bg-retro-card border-2 border-retro-border rounded overflow-hidden shadow-[inset_0_1px_0_rgb(var(--c-text)/0.04)]">
      {/* role="group", not "img": an img role makes every child presentational,
          which hid the tappable arrow buttons from screen readers. */}
      <svg viewBox={level.viewBox.join(' ')} className="block w-full h-auto" role="group" aria-label={`${level.label} arrows board`}>
        <rect x={vx} y={vy} width={vw} height={vh} fill="rgb(var(--c-surface))" />
        <g aria-hidden="true">{dots}</g>

        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          {level.arrows.map((arrow, i) => {
            if (hidden.has(i)) return null
            const points = arrow.points
            if (!points || points.length < 2) return null
            const d = roundedPathD(points, ARROWS_CORNER_RADIUS, ARROWS_TIP_INSET)
            const head = arrowHeadD(points)
            const stroke = strokeFor(cleared[i])
            const isCleared = !!cleared[i]
            const isTrap = !!arrow.blocked && !isCleared
            const trapRevealed = isTrap && revealTraps
            const { tip, dx, dy } = exitVector(points)
            const tappable = interactive && !isCleared
            const direction = directionLabel(dx, dy)
            const label = joinLabel(
              `Arrow ${i + 1}`,
              direction && `points ${direction}`,
              isCleared ? `cleared by ${cleared[i]}` : trapRevealed && 'trap',
            )
            const fireTap = (e) => {
              if (e) e.preventDefault()
              onTap(i)
            }
            return (
              <g key={i} ref={(el) => { groupRefs.current[i] = el }} className="arrows-group">
                {tappable && (
                  <>
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={HIT_WIDTH}
                      style={{ cursor: 'var(--cursor-hand)', pointerEvents: 'stroke', touchAction: 'manipulation' }}
                      onPointerDown={fireTap}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fireTap(e) }}
                      tabIndex={0}
                      role="button"
                      aria-label={label}
                    />
                    <circle
                      cx={tip[0]}
                      cy={tip[1]}
                      r={HEAD_HIT_R}
                      fill="transparent"
                      style={{ cursor: 'var(--cursor-hand)', pointerEvents: 'all', touchAction: 'manipulation' }}
                      onPointerDown={fireTap}
                    />
                  </>
                )}
                <path
                  className="ar-path"
                  d={d}
                  strokeWidth={2.25}
                  strokeDasharray={trapRevealed ? '5 4' : undefined}
                  style={{ stroke: trapRevealed ? 'rgb(var(--c-danger))' : stroke, pointerEvents: 'none', opacity: trapRevealed ? 0.9 : 1 }}
                />
                <path
                  className="ar-head"
                  d={head}
                  strokeWidth={2.25}
                  style={{ stroke: trapRevealed ? 'rgb(var(--c-danger))' : stroke, pointerEvents: 'none' }}
                />
                {trapRevealed && (
                  <text
                    x={tip[0]}
                    y={tip[1] - ARROWS_HEAD_LEN - 3}
                    textAnchor="middle"
                    fontSize="8"
                    fill="rgb(var(--c-danger))"
                    stroke="none"
                    aria-hidden="true"
                  >
                    ×
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
