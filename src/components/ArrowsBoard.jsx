import { useEffect, useRef, useState } from 'react'
import {
  ARROWS_DIRS,
  ARROWS_DIR_NAMES,
  cellCenter,
  exitVector,
  isBent,
  isCurved,
  isDiagonal,
  leavePose,
  occupancy,
  roundedPathD,
  routeDistance,
  turnedDir,
} from '../lib/arrowsLogic'
import { cn } from '@/lib/utils'
import { isReducedMotion } from '../hooks/useMotionPref'

// Board units: one grid cell = CELL units. Stroke and head sizes are fractions
// of a cell so every tier reads the same at any pixel size.
const CELL = 10
const PAD = 2
const STROKE = 2.1
const CORNER = 3.2
// A bent diagonal's body is rounded as wide as its segments allow, so the
// polyline between cell centres reads as one smooth curve.
const BEND_CORNER = 7
const HEAD_LEN = 4.4
const HEAD_HALF = 2.9
const TIP_AHEAD = 1.6
const BODY_INSET = 2
// Leave animation: the snake slithers along its own body then straight off
// the board at a constant speed, after a very short ease-in.
const MS_PER_CELL = 34
const ACCEL_MS = 70
// Blocked tap: slide toward the blocker (capped) and spring back.
const BUMP_OVERSHOOT = 0.3
const BUMP_MAX_CELLS = 4
const BUMP_OUT_MS_PER_CELL = 38
const BUMP_BACK_MS = 220
const ERROR_MS = 620
const HINT_MS = 2400
// Taps landing just outside an arrow's cell still count if they are this close
// (in cells) to one of its cell centres — thumbs are wider than lines.
const TAP_SLOP = 0.8

function headD(points) {
  const { dx, dy, tip } = exitVector(points)
  const tx = tip[0] + dx * TIP_AHEAD
  const ty = tip[1] + dy * TIP_AHEAD
  const bx = tx - dx * HEAD_LEN
  const by = ty - dy * HEAD_LEN
  const f = (n) => Math.round(n * 100) / 100
  return `M${f(tx)} ${f(ty)} L${f(bx - dy * HEAD_HALF)} ${f(by + dx * HEAD_HALF)} L${f(bx + dy * HEAD_HALF)} ${f(by - dx * HEAD_HALF)} Z`
}

// The body stops short of the tip so its round cap hides under the head.
function bodyD(points, arrow) {
  return roundedPathD(points, isBent(arrow) ? BEND_CORNER : CORNER, BODY_INSET)
}

// A curved arrow's hook: a short curl off the tip of its head that bends the
// way the arrow will turn at the board edge, ending in a small chevron. It
// stays inside the head cell so it never draws over a neighbour.
const HOOK_REACH = 3.6
const HOOK_SIDE = 2.4
const HOOK_CHEVRON = 1.6
const HOOK_HALF = 1.2
function hookD(arrow) {
  const c = cellCenter(arrow.cells[arrow.cells.length - 1], CELL)
  const [dx, dy] = ARROWS_DIRS[arrow.dir]
  const [sx, sy] = ARROWS_DIRS[turnedDir(arrow.dir, arrow.turn)]
  const f = (n) => Math.round(n * 100) / 100
  const p = (u, v) => `${f(c[0] + dx * u + sx * v)} ${f(c[1] + dy * u + sy * v)}`
  return `M${p(TIP_AHEAD, 0)} Q${p(HOOK_REACH, 0)} ${p(HOOK_REACH, HOOK_SIDE)}`
}
function hookTipD(arrow) {
  const c = cellCenter(arrow.cells[arrow.cells.length - 1], CELL)
  const [dx, dy] = ARROWS_DIRS[arrow.dir]
  const [sx, sy] = ARROWS_DIRS[turnedDir(arrow.dir, arrow.turn)]
  const f = (n) => Math.round(n * 100) / 100
  const p = (u, v) => `${f(c[0] + dx * u + sx * v)} ${f(c[1] + dy * u + sy * v)}`
  const v = HOOK_SIDE
  return `M${p(HOOK_REACH, v + HOOK_CHEVRON)} L${p(HOOK_REACH - HOOK_HALF, v)} L${p(HOOK_REACH + HOOK_HALF, v)} Z`
}

function arrowLabel(arrow, i) {
  const len = `${arrow.cells.length} long`
  if (isBent(arrow)) return `Arrow ${i + 1}, curved diagonal, ${len}, pointing ${ARROWS_DIR_NAMES[arrow.dir]}`
  if (isDiagonal(arrow)) return `Arrow ${i + 1}, diagonal, ${len}, pointing ${ARROWS_DIR_NAMES[arrow.dir]}`
  if (isCurved(arrow)) {
    return `Arrow ${i + 1}, curved, ${len}, pointing ${ARROWS_DIR_NAMES[arrow.dir]} then turning ${ARROWS_DIR_NAMES[turnedDir(arrow.dir, arrow.turn)]} at the edge`
  }
  return `Arrow ${i + 1}, ${len}, pointing ${ARROWS_DIR_NAMES[arrow.dir]}`
}

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)
const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

function leaveTravel(elapsed) {
  const v = CELL / MS_PER_CELL
  if (elapsed < ACCEL_MS) return (v * elapsed * elapsed) / (2 * ACCEL_MS)
  return v * (elapsed - ACCEL_MS / 2)
}

function bumpTravel(elapsed, gap, arrow) {
  const cells = Math.min(gap + BUMP_OVERSHOOT, BUMP_MAX_CELLS)
  const dist = routeDistance(arrow, cells, CELL)
  const outMs = Math.max(90, cells * BUMP_OUT_MS_PER_CELL)
  if (elapsed < outMs) return { travel: dist * easeOutCubic(elapsed / outMs), done: false }
  const back = elapsed - outMs
  if (back < BUMP_BACK_MS) return { travel: dist * (1 - easeInOutQuad(back / BUMP_BACK_MS)), done: false }
  return { travel: 0, done: true }
}

// `gone`: bool per arrow. An arrow flipping to gone slides off the board;
// arrows already gone on mount are simply absent (reloads never replay).
// `feedback`: { index, blocker, gap, key } for a blocked tap — bump + red.
// `hint`: { index, key } pulses one free arrow (solo hint button).
export default function ArrowsBoard({
  level,
  gone,
  onTap,
  interactive = false,
  feedback = null,
  hint = null,
  compact = false,
  label,
}) {
  const svgRef = useRef(null)
  const stageRef = useRef(null)
  const bodyRefs = useRef([])
  const headRefs = useRef([])
  const hookRefs = useRef([])
  const groupRefs = useRef([])
  const anims = useRef(new Map())
  const rafRef = useRef(0)
  const prevGone = useRef(gone)
  const [hidden, setHidden] = useState(() => new Set(gone.flatMap((g, i) => (g ? [i] : []))))

  const width = level.cols * CELL
  const height = level.rows * CELL
  const bounds = { minX: -CELL, minY: -CELL, maxX: width + CELL, maxY: height + CELL }

  const drawPose = (index, travel) => {
    const pose = leavePose(level.arrows[index], CELL, travel, level)
    bodyRefs.current[index]?.setAttribute('d', bodyD(pose, level.arrows[index]))
    headRefs.current[index]?.setAttribute('d', headD(pose))
    // The hook marks the turn still to come; once moving, the arrow itself
    // shows the route, so the hook hides until it is back at rest.
    hookRefs.current[index]?.setAttribute('visibility', travel > 0.01 ? 'hidden' : 'visible')
    return pose
  }

  const tick = (now) => {
    const finished = []
    for (const [index, anim] of anims.current) {
      const elapsed = now - anim.start
      if (anim.type === 'leave') {
        const pose = drawPose(index, leaveTravel(elapsed))
        const [tx, ty] = pose[0] ?? [0, 0]
        if (tx < bounds.minX - CELL || tx > bounds.maxX + CELL || ty < bounds.minY - CELL || ty > bounds.maxY + CELL) {
          finished.push(index)
        }
      } else {
        const { travel, done } = bumpTravel(elapsed, anim.gap, level.arrows[index])
        drawPose(index, travel)
        if (done) finished.push(index)
      }
    }
    const left = finished.filter((i) => anims.current.get(i)?.type === 'leave')
    for (const i of finished) anims.current.delete(i)
    if (left.length) setHidden((prev) => new Set([...prev, ...left]))
    rafRef.current = anims.current.size ? requestAnimationFrame(tick) : 0
  }

  const startAnim = (index, anim) => {
    anims.current.set(index, { ...anim, start: performance.now() })
    if (!rafRef.current) rafRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  // Newly-gone arrows slide out along their heading.
  useEffect(() => {
    const prev = prevGone.current
    prevGone.current = gone
    const fresh = []
    gone.forEach((g, i) => { if (g && !prev[i]) fresh.push(i) })
    if (fresh.length === 0) return
    // In-app motion setting (falls back to the OS query), read per change so a
    // mid-round toggle applies to the next cleared arrow.
    if (isReducedMotion()) {
      // Reduced motion: the gone prop flip removes the arrow outright.
      setHidden((p) => new Set([...p, ...fresh]))
      return
    }
    // A leave supersedes any bump still playing on the same arrow.
    for (const i of fresh) startAnim(i, { type: 'leave' })
    // startAnim/tick close over level, which is fixed for a mounted board.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gone])

  // Blocked tap: red arrow, flashing blocker, ringed board, and a bump that
  // shows exactly where the path is cut.
  useEffect(() => {
    if (!feedback) return
    const { index, blocker, gap } = feedback
    const group = groupRefs.current[index]
    const blockerGroup = groupRefs.current[blocker]
    const stage = stageRef.current
    const restart = (el, cls) => {
      if (!el) return
      el.classList.remove(cls)
      void el.getBoundingClientRect()
      el.classList.add(cls)
    }
    restart(group, 'is-error')
    restart(blockerGroup, 'is-blocker')
    restart(stage, 'is-error')
    if (!isReducedMotion() && !anims.current.has(index)) startAnim(index, { type: 'bump', gap })
    const t = setTimeout(() => {
      group?.classList.remove('is-error')
      blockerGroup?.classList.remove('is-blocker')
      stage?.classList.remove('is-error')
    }, ERROR_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback])

  // Hint: pulse one free arrow until the next hint or tap.
  useEffect(() => {
    if (!hint) return
    const group = groupRefs.current[hint.index]
    if (!group) return
    group.classList.remove('is-hint')
    void group.getBoundingClientRect()
    group.classList.add('is-hint')
    const t = setTimeout(() => group.classList.remove('is-hint'), HINT_MS)
    return () => { clearTimeout(t); group.classList.remove('is-hint') }
  }, [hint])

  const handlePointerDown = (e) => {
    if (!interactive || !onTap) return
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!ctm) return
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const { x, y } = pt.matrixTransform(ctm.inverse())
    const occ = occupancy(level, gone)
    const cx = Math.floor(x / CELL)
    const cy = Math.floor(y / CELL)
    let best = -1
    let bestDist = TAP_SLOP * CELL
    for (let yy = cy - 1; yy <= cy + 1; yy += 1) {
      for (let xx = cx - 1; xx <= cx + 1; xx += 1) {
        if (xx < 0 || xx >= level.cols || yy < 0 || yy >= level.rows) continue
        const owner = occ[yy * level.cols + xx]
        if (owner === -1) continue
        const [mx, my] = cellCenter([xx, yy], CELL)
        const dist = Math.hypot(mx - x, my - y)
        const inside = xx === cx && yy === cy
        if (inside || dist < bestDist) {
          best = owner
          bestDist = inside ? -1 : dist
        }
      }
    }
    if (best >= 0) {
      e.preventDefault()
      onTap(best)
    }
  }

  const dots = []
  for (let y = 0; y < level.rows; y += 1) {
    for (let x = 0; x < level.cols; x += 1) {
      const [px, py] = cellCenter([x, y], CELL)
      dots.push(<circle key={`${x}-${y}`} cx={px} cy={py} r={compact ? 0.9 : 0.75} />)
    }
  }

  return (
    <div
      ref={stageRef}
      className={cn(
        'arrows-stage w-full bg-retro-surface border-2 border-retro-border rounded-lg overflow-hidden',
        compact && 'border',
      )}
    >
      <svg
        ref={svgRef}
        viewBox={`${-PAD} ${-PAD} ${width + PAD * 2} ${height + PAD * 2}`}
        className="arrows-svg block w-full h-auto select-none"
        style={{ touchAction: 'manipulation' }}
        role="group"
        aria-label={label ?? `Arrows board, ${level.arrows.length - hidden.size} arrows left`}
        onPointerDown={handlePointerDown}
      >
        <g aria-hidden="true" style={{ fill: 'rgb(var(--c-structure))', opacity: 0.45 }}>{dots}</g>
        <g strokeLinecap="round" strokeLinejoin="round">
          {level.arrows.map((arrow, i) => {
            if (hidden.has(i)) return null
            const pose = leavePose(arrow, CELL, 0, level)
            const cells = arrow.cells.map((c) => cellCenter(c, CELL))
            const hitD = `M${cells.map((p) => p.join(' ')).join(' L')}`
            const leaving = !!gone[i]
            return (
              <g
                key={i}
                ref={(el) => { groupRefs.current[i] = el }}
                className={cn('arrows-arrow', isDiagonal(arrow) && 'is-diag', isBent(arrow) && 'is-bend', isCurved(arrow) && 'is-curve')}
              >
                <path
                  ref={(el) => { bodyRefs.current[i] = el }}
                  className="ar-body"
                  d={bodyD(pose, arrow)}
                  fill="none"
                  strokeWidth={STROKE}
                  style={{ pointerEvents: 'none' }}
                />
                <path
                  ref={(el) => { headRefs.current[i] = el }}
                  className="ar-head"
                  d={headD(pose)}
                  style={{ pointerEvents: 'none' }}
                />
                {isCurved(arrow) && (
                  <g ref={(el) => { hookRefs.current[i] = el }} style={{ pointerEvents: 'none' }}>
                    <path className="ar-hook" d={hookD(arrow)} fill="none" strokeWidth={STROKE * 0.62} />
                    <path className="ar-hook-tip" d={hookTipD(arrow)} />
                  </g>
                )}
                {interactive && !leaving && (
                  <path
                    className="ar-hit"
                    d={hitD}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={CELL * 0.9}
                    strokeLinecap="square"
                    strokeLinejoin="miter"
                    style={{ pointerEvents: 'none' }}
                    tabIndex={0}
                    role="button"
                    aria-label={arrowLabel(arrow, i)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onTap?.(i)
                      }
                    }}
                  />
                )}
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}

