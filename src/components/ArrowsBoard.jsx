import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ARROWS_DIRS,
  ARROWS_DIR_NAMES,
  arrowPose,
  arrowRoute,
  cellCenter,
  countGone,
  exitVector,
  isAwake,
  isBent,
  isCurved,
  isDiagonal,
  isDouble,
  isSleeper,
  neighborsOf,
  occupancy,
  roundedPathD,
  routeDistance,
  turnedDir,
  voidSet,
} from '../lib/arrowsLogic'
import {
  doubleTapCamera,
  fitCamera,
  isDoubleTap,
  isTap,
  keyPan,
  MAX_ZOOM,
  needsCamera,
  panBy,
  panByScreen,
  pinchStep,
  revealPoint,
  screenToBoard,
  stepZoom,
  wheelFactor,
  zoomAt,
  zoomOf,
} from '../lib/arrowsCameraLogic'
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
  if (isDouble(arrow)) return doubleBodyD(points)
  const radius = isBent(arrow) ? BEND_CORNER : CORNER
  // Through a portal the snake is in pieces: the strands behind the head are
  // still pouring into their ring (see leavePose).
  const tails = points.tails?.map((strand) => roundedPathD(strand, radius, 0)).join(' ')
  const head = roundedPathD(points, radius, BODY_INSET)
  return tails ? `${tails} ${head}` : head
}

// A double arrow: two straight prongs (a head at each end) joined by one
// round C-shaped bend that bulges out behind its spine. Both ends stop short
// so each head covers its end.
function doubleBodyD(points) {
  const n = points.length
  const [ax, ay] = points[0]
  const step = Math.hypot(ax - points[1][0], ay - points[1][1]) || 1
  const ux = (ax - points[1][0]) / step
  const uy = (ay - points[1][1]) / step
  // The prong is every step that runs straight back from head A.
  let arm = 1
  while (
    arm < n - 1 &&
    Math.abs(points[arm][0] - points[arm + 1][0] - ux * step) < 0.01 &&
    Math.abs(points[arm][1] - points[arm + 1][1] - uy * step) < 0.01
  ) arm += 1
  const p1 = points[arm]
  const p2 = points[n - 1 - arm]
  const bulge = 2 + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * 0.45
  const [ex, ey] = points[n - 1]
  const f = (v) => Math.round(v * 100) / 100
  return `M${f(ax - ux * BODY_INSET)} ${f(ay - uy * BODY_INSET)} L${f(p1[0])} ${f(p1[1])}` +
    ` C${f(p1[0] - ux * bulge)} ${f(p1[1] - uy * bulge)} ${f(p2[0] - ux * bulge)} ${f(p2[1] - uy * bulge)} ${f(p2[0])} ${f(p2[1])}` +
    ` L${f(ex - ux * BODY_INSET)} ${f(ey - uy * BODY_INSET)}`
}

// Head A of a double arrow sits on its first cell, pointing the same way.
const tailHeadD = (points) => headD([points[1], points[0]])

// Dotted preview of where an arrow would go (lesson boards).
function routePreviewD(level, arrow) {
  if (isDouble(arrow)) {
    // One lane per row (or column) the piece sweeps.
    const [dx, dy] = ARROWS_DIRS[arrow.dir]
    const own = new Set(arrow.cells.map(([x, y]) => `${x},${y}`))
    return arrow.cells.filter(([x, y]) => !own.has(`${x + dx},${y + dy}`)).map(([x, y]) => {
      let ex = x
      let ey = y
      while (ex + dx >= 0 && ex + dx < level.cols && ey + dy >= 0 && ey + dy < level.rows) { ex += dx; ey += dy }
      const [ax, ay] = cellCenter([x, y], CELL)
      const [bx, by] = cellCenter([ex, ey], CELL)
      return `M${ax + dx * 3} ${ay + dy * 3} L${bx + dx * 8} ${by + dy * 8}`
    }).join(' ')
  }
  const route = arrowRoute(level, arrow)
  // One dotted line per stretch between portal hops.
  const strands = [[cellCenter(arrow.cells[arrow.cells.length - 1], CELL)]]
  route.cells.forEach((c, k) => {
    if (route.jumps.includes(k)) strands.push([])
    strands[strands.length - 1].push(cellCenter([c % level.cols, Math.floor(c / level.cols)], CELL))
  })
  const [vx, vy] = ARROWS_DIRS[route.finalDir]
  const norm = Math.hypot(vx, vy)
  const pts = strands[strands.length - 1]
  const end = pts[pts.length - 1]
  pts.push([end[0] + (vx / norm) * CELL * 0.8, end[1] + (vy / norm) * CELL * 0.8])
  return strands.map((strand) => roundedPathD(strand, 2.5)).join(' ')
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

// Mirrors: a dark tile with a slanted bar; a leaving arrow turns at its
// centre. The bar runs corner to corner the way the mirror leans.
const MIRROR_INSET = 2.2
function mirrorBar({ x, y, m }) {
  const x0 = x * CELL
  const y0 = y * CELL
  const lo = MIRROR_INSET
  const hi = CELL - MIRROR_INSET
  return m === '/' ? [[x0 + lo, y0 + hi], [x0 + hi, y0 + lo]] : [[x0 + lo, y0 + lo], [x0 + hi, y0 + hi]]
}

// Portals: a ring with its pair's letter in it, in one of four accents. A
// dashed ring only lets arrows out; a turning pair wears a clockwise hook.
const PORTAL_LETTERS = 'ABCD'
const PORTAL_R = 3.4
const HOOK_R = 4.4
function portalHook(cx, cy) {
  const a0 = (-80 * Math.PI) / 180
  const a1 = (10 * Math.PI) / 180
  const f = (n) => Math.round(n * 100) / 100
  const sx = cx + HOOK_R * Math.cos(a0)
  const sy = cy + HOOK_R * Math.sin(a0)
  const ex = cx + HOOK_R * Math.cos(a1)
  const ey = cy + HOOK_R * Math.sin(a1)
  // Tangent at the end (clockwise on screen) and its normal for the head.
  const tx = -Math.sin(a1)
  const ty = Math.cos(a1)
  const tip = [ex + tx * 1.5, ey + ty * 1.5]
  const l = [ex - ty * 0.95, ey + tx * 0.95]
  const r = [ex + ty * 0.95, ey - tx * 0.95]
  return {
    arc: `M${f(sx)} ${f(sy)} A${HOOK_R} ${HOOK_R} 0 0 1 ${f(ex)} ${f(ey)}`,
    head: `M${f(tip[0])} ${f(tip[1])} L${f(l[0])} ${f(l[1])} L${f(r[0])} ${f(r[1])} Z`,
  }
}
function portalRingLabel(portal, end) {
  const letter = PORTAL_LETTERS[portal.c % PORTAL_LETTERS.length]
  const [x, y] = portal[end]
  const where = `column ${x + 1}, row ${y + 1}`
  const turn = portal.turn ? ', turns the arrow a quarter clockwise' : ''
  if (portal.oneway) {
    return end === 'a'
      ? `Portal ${letter}, entrance, ${where}, leads to its exit ring${turn}`
      : `Portal ${letter}, exit only, ${where}, arrows come out here but cannot enter`
  }
  return `Portal ${letter}, ${where}, leads to the other ${letter} ring${turn}`
}

function arrowLabel(arrow, i, asleep) {
  const len = `${arrow.cells.length} long`
  const sleep = asleep ? ', asleep until an arrow touching it leaves' : ''
  if (isDouble(arrow)) return `Arrow ${i + 1}, double, two heads pointing ${ARROWS_DIR_NAMES[arrow.dir]}${sleep}`
  if (sleep) return `Arrow ${i + 1}, ${len}, pointing ${ARROWS_DIR_NAMES[arrow.dir]}${sleep}`
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
// `target`: an arrow index to keep pulsing, `preview`: an arrow index whose
// route shows as a dotted line (both for the lesson boards).
// `zoomable`: boards past 10 × 13 (levels 61+) open fitted with drag and zoom —
// drag pans, pinch / wheel / double-tap / the buttons zoom, and a tap sends an
// arrow when the pointer comes up (not down, so a drag never sends one). A
// smaller board, zoomable or not, has no camera and works exactly as it
// always did.
export default function ArrowsBoard({
  level,
  gone,
  onTap,
  interactive = false,
  feedback = null,
  hint = null,
  target = -1,
  preview = -1,
  compact = false,
  zoomable = false,
  label,
}) {
  const svgRef = useRef(null)
  const stageRef = useRef(null)
  const bodyRefs = useRef([])
  const headRefs = useRef([])
  const hookRefs = useRef([])
  const head2Refs = useRef([])
  const coreRefs = useRef([])
  const groupRefs = useRef([])
  const anims = useRef(new Map())
  const rafRef = useRef(0)
  const prevGone = useRef(gone)
  const [hidden, setHidden] = useState(() => new Set(gone.flatMap((g, i) => (g ? [i] : []))))

  const width = level.cols * CELL
  const height = level.rows * CELL
  const bounds = { minX: -CELL, minY: -CELL, maxX: width + CELL, maxY: height + CELL }

  // Camera (big boards only): the viewBox follows `cam`; camRef mirrors it so
  // gesture handlers always read the latest one.
  const camOn = zoomable && needsCamera(level)
  const fit = useMemo(() => fitCamera(width, height, PAD), [width, height])
  const [cam, setCam] = useState(fit)
  const camRef = useRef(fit)
  const pointers = useRef(new Map())
  const gesture = useRef(null)
  const lastTap = useRef(null)
  const applyCam = (update) => {
    const next = typeof update === 'function' ? update(camRef.current) : update
    camRef.current = next
    setCam(next)
  }
  const zoom = zoomOf(cam, fit)
  const voids = useMemo(() => voidSet(level), [level])

  // Bring a spot (a blocker, a hinted arrow) into view if it is off-screen.
  const reveal = (cells) => {
    if (!camOn || !cells.length) return
    const [hx, hy] = cells[0]
    applyCam((c) => revealPoint(c, fit, cellCenter([hx, hy], CELL), CELL * 1.5))
  }

  const drawPose = (index, travel) => {
    const arrow = level.arrows[index]
    const pose = arrowPose(arrow, CELL, travel, level)
    bodyRefs.current[index]?.setAttribute('d', bodyD(pose, arrow))
    coreRefs.current[index]?.setAttribute('d', bodyD(pose, arrow))
    headRefs.current[index]?.setAttribute('d', headD(pose))
    head2Refs.current[index]?.setAttribute('d', tailHeadD(pose))
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
    const { index, blocker, gap, asleep } = feedback
    const group = groupRefs.current[index]
    // A sleeping arrow waits on every arrow touching it, so all of them flash.
    const blockerGroups = asleep
      ? neighborsOf(level)[index].filter((j) => !gone[j]).map((j) => groupRefs.current[j])
      : [groupRefs.current[blocker]]
    const stage = stageRef.current
    const restart = (el, cls) => {
      if (!el) return
      el.classList.remove(cls)
      void el.getBoundingClientRect()
      el.classList.add(cls)
    }
    restart(group, 'is-error')
    for (const g of blockerGroups) restart(g, 'is-blocker')
    restart(stage, 'is-error')
    // On a zoomed board the blocker may be off-screen: pan to it.
    if (feedback.crate != null) {
      reveal([[feedback.crate % level.cols, Math.floor(feedback.crate / level.cols)]])
    } else {
      const [hx, hy] = level.arrows[index].cells[level.arrows[index].cells.length - 1]
      const ids = asleep ? neighborsOf(level)[index].filter((j) => !gone[j]) : [blocker]
      const near = ids
        .filter((j) => j >= 0)
        .flatMap((j) => level.arrows[j].cells)
        .sort((a, b) => Math.hypot(a[0] - hx, a[1] - hy) - Math.hypot(b[0] - hx, b[1] - hy))
      reveal(near)
    }
    if (!asleep && !isReducedMotion() && !anims.current.has(index)) startAnim(index, { type: 'bump', gap })
    const t = setTimeout(() => {
      group?.classList.remove('is-error')
      for (const g of blockerGroups) g?.classList.remove('is-blocker')
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
    const hinted = level.arrows[hint.index]
    reveal([hinted.cells[hinted.cells.length - 1]])
    const t = setTimeout(() => group.classList.remove('is-hint'), HINT_MS)
    return () => { clearTimeout(t); group.classList.remove('is-hint') }
    // reveal and the level are fixed for a mounted board; only a new hint re-runs this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hint])

  // Crates count down with every clear and break at 0.
  const cleared = countGone(gone)
  const crateRefs = useRef([])

  useEffect(() => {
    if (feedback?.crate == null || !level.crates) return
    const at = level.crates.findIndex((c) => c.y * level.cols + c.x === feedback.crate)
    const el = crateRefs.current[at]
    if (!el) return
    el.classList.remove('is-blocker')
    void el.getBoundingClientRect()
    el.classList.add('is-blocker')
    const t = setTimeout(() => el.classList.remove('is-blocker'), ERROR_MS)
    return () => clearTimeout(t)
  }, [feedback, level])

  // The arrow under a screen position (its cell, or a near miss — thumbs are
  // wider than lines), or -1.
  const arrowAtClient = (clientX, clientY) => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!ctm) return -1
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
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
    return best
  }

  const viewPx = () => svgRef.current?.getBoundingClientRect().width || 1
  // Screen position relative to the board view, in px.
  const local = (clientX, clientY) => {
    const rect = svgRef.current.getBoundingClientRect()
    return [clientX - rect.left, clientY - rect.top]
  }

  const handlePointerDown = (e) => {
    if (!camOn) {
      if (!interactive || !onTap) return
      const best = arrowAtClient(e.clientX, e.clientY)
      if (best >= 0) {
        e.preventDefault()
        onTap(best)
      }
      return
    }
    svgRef.current?.setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) {
      gesture.current = { start: { x: e.clientX, y: e.clientY }, moved: false, multi: false }
    } else if (gesture.current) {
      gesture.current.multi = true
    }
  }

  const handlePointerMove = (e) => {
    const prev = pointers.current.get(e.pointerId)
    if (!camOn || !prev) return
    const next = { x: e.clientX, y: e.clientY }
    if (pointers.current.size === 2) {
      const other = [...pointers.current.entries()].find(([id]) => id !== e.pointerId)?.[1]
      if (other) {
        applyCam((c) => pinchStep(c, fit, [local(prev.x, prev.y), local(other.x, other.y)], [local(next.x, next.y), local(other.x, other.y)], viewPx()))
      }
    } else if (gesture.current && pointers.current.size === 1) {
      if (!gesture.current.moved && !isTap(gesture.current.start, next)) gesture.current.moved = true
      if (gesture.current.moved) {
        applyCam((c) => panByScreen(c, fit, next.x - prev.x, next.y - prev.y, viewPx()))
      }
    }
    pointers.current.set(e.pointerId, next)
  }

  const handlePointerUp = (e) => {
    if (!camOn || !pointers.current.has(e.pointerId)) return
    const g = gesture.current
    const alone = pointers.current.size === 1
    pointers.current.delete(e.pointerId)
    if (!pointers.current.size) gesture.current = null
    if (!alone || !g || g.moved || g.multi || !isTap(g.start, { x: e.clientX, y: e.clientY })) return
    const hit = arrowAtClient(e.clientX, e.clientY)
    if (hit >= 0) {
      lastTap.current = null
      if (interactive && onTap) onTap(hit)
      return
    }
    // Empty space: two quick taps zoom in there, or back out to the whole board.
    const tap = { x: e.clientX, y: e.clientY, t: performance.now() }
    if (isDoubleTap(lastTap.current, tap)) {
      lastTap.current = null
      const [px, py] = local(e.clientX, e.clientY)
      const [fx, fy] = screenToBoard(camRef.current, viewPx(), px, py)
      applyCam((c) => doubleTapCamera(c, fit, fx, fy))
    } else {
      lastTap.current = tap
    }
  }

  const handlePointerCancel = (e) => {
    pointers.current.delete(e.pointerId)
    if (!pointers.current.size) gesture.current = null
  }

  // Wheel zoom around the cursor. React attaches wheel listeners as passive,
  // so this one is added by hand to be able to stop the page scrolling.
  useEffect(() => {
    const stage = stageRef.current
    if (!camOn || !stage) return undefined
    const onWheel = (e) => {
      const svg = svgRef.current
      if (!svg || !svg.contains(e.target)) return
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      applyCam((c) => {
        const [fx, fy] = screenToBoard(c, rect.width, e.clientX - rect.left, e.clientY - rect.top)
        return zoomAt(c, fit, wheelFactor(e.deltaY, e.ctrlKey), fx, fy)
      })
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [camOn, fit])

  const handleKeyDown = (e) => {
    if (!camOn || e.ctrlKey || e.metaKey || e.altKey) return
    let handled = true
    if (e.key === '+' || e.key === '=') applyCam((c) => stepZoom(c, fit, 1))
    else if (e.key === '-' || e.key === '_') applyCam((c) => stepZoom(c, fit, -1))
    else if (e.key === '0') applyCam(fit)
    else {
      const pan = keyPan(camRef.current, e.key)
      if (pan) applyCam((c) => panBy(c, fit, pan[0], pan[1]))
      else handled = false
    }
    if (handled) e.preventDefault()
  }

  const pieceCells = new Set([...(level.mirrors ?? []), ...(level.crates ?? [])].map((c) => c.y * level.cols + c.x))
  for (const p of level.portals ?? []) {
    pieceCells.add(p.a[1] * level.cols + p.a[0])
    pieceCells.add(p.b[1] * level.cols + p.b[0])
  }
  const dots = []
  let shapeD = ''
  for (let y = 0; y < level.rows; y += 1) {
    for (let x = 0; x < level.cols; x += 1) {
      if (voids?.has(y * level.cols + x)) continue
      if (voids) shapeD += `M${x * CELL} ${y * CELL}h${CELL}v${CELL}h${-CELL}z`
      if (pieceCells.has(y * level.cols + x)) continue
      const [px, py] = cellCenter([x, y], CELL)
      dots.push(<circle key={`${x}-${y}`} cx={px} cy={py} r={compact ? 0.9 : 0.75} />)
    }
  }

  const view = camOn ? cam : fit
  const zoomBtn = 'min-h-9 min-w-9 px-2 font-pixel text-[9px] rounded border border-retro-border text-retro-dim hover:border-retro-cta/50 hover:text-retro-text active:scale-95 disabled:opacity-40 disabled:pointer-events-none'

  return (
    <div
      ref={stageRef}
      className={cn(
        'arrows-stage w-full bg-retro-surface border-2 border-retro-border rounded-lg overflow-hidden',
        compact && 'border',
        camOn && 'outline-none focus-visible:ring-2 focus-visible:ring-retro-cta',
      )}
      tabIndex={camOn ? 0 : undefined}
      aria-keyshortcuts={camOn ? '+ - 0 ArrowLeft ArrowRight ArrowUp ArrowDown' : undefined}
      onKeyDown={camOn ? handleKeyDown : undefined}
    >
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        className="arrows-svg block w-full h-auto select-none"
        style={{ touchAction: camOn ? 'none' : 'manipulation' }}
        role="group"
        aria-label={label ?? `Arrows board, ${level.arrows.length - hidden.size} arrows left`}
        onPointerDown={handlePointerDown}
        onPointerMove={camOn ? handlePointerMove : undefined}
        onPointerUp={camOn ? handlePointerUp : undefined}
        onPointerCancel={camOn ? handlePointerCancel : undefined}
      >
        {voids && <path className="ar-shape" d={shapeD} aria-hidden="true" />}
        <g aria-hidden="true" style={{ fill: 'rgb(var(--c-structure))', opacity: 0.45 }}>{dots}</g>
        {level.portals?.map((p) => ['a', 'b'].map((end) => {
          const [x, y] = p[end]
          const exit = p.oneway && end === 'b'
          const cx = x * CELL + CELL / 2
          const cy = y * CELL + CELL / 2
          const hook = p.turn ? portalHook(cx, cy) : null
          return (
            <g
              key={`p${p.c}${end}`}
              className={cn('ar-portal', `ar-portal-${p.c % 4}`)}
              role="img"
              aria-label={portalRingLabel(p, end)}
            >
              <rect className="ar-portal-cell" x={x * CELL + 0.8} y={y * CELL + 0.8} width={CELL - 1.6} height={CELL - 1.6} rx={1.4} />
              <circle className={cn('ar-portal-ring', exit && 'is-exit')} cx={cx} cy={cy} r={PORTAL_R} />
              {hook && (
                <>
                  <path className="ar-portal-hook" d={hook.arc} fill="none" />
                  <path className="ar-portal-hook-tip" d={hook.head} />
                </>
              )}
              <text className="ar-portal-letter font-pixel" x={cx} y={cy + 1.3} textAnchor="middle">{PORTAL_LETTERS[p.c % 4]}</text>
            </g>
          )
        }))}
        {level.mirrors?.map((m) => {
          const [a, b] = mirrorBar(m)
          const glint = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
          return (
            <g key={`m${m.x}-${m.y}`} className="ar-mirror" role="img" aria-label={`Mirror at column ${m.x + 1}, row ${m.y + 1}, leaning ${m.m === '/' ? 'right' : 'left'}`}>
              <rect className="ar-mirror-cell" x={m.x * CELL + 0.8} y={m.y * CELL + 0.8} width={CELL - 1.6} height={CELL - 1.6} rx={1.4} />
              <line className="ar-mirror-bar" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
              <line className="ar-mirror-glint" x1={glint(0.55)[0]} y1={glint(0.55)[1]} x2={glint(0.75)[0]} y2={glint(0.75)[1]} />
            </g>
          )
        })}
        {level.crates?.map((c, i) => {
          const left = Math.max(0, c.k - cleared)
          const x0 = c.x * CELL
          const y0 = c.y * CELL
          return (
            <g
              key={`c${c.x}-${c.y}`}
              ref={(el) => { crateRefs.current[i] = el }}
              className={cn('ar-crate', left === 0 && 'is-open')}
              role="img"
              aria-label={left > 0 ? `Crate at column ${c.x + 1}, row ${c.y + 1}, breaks after ${left} more clear${left === 1 ? '' : 's'}` : 'Broken crate'}
            >
              <rect className="ar-crate-box" x={x0 + 1} y={y0 + 1} width={CELL - 2} height={CELL - 2} rx={1} />
              <path className="ar-crate-slat" d={`M${x0 + 1.6} ${y0 + 1.6} L${x0 + CELL - 1.6} ${y0 + CELL - 1.6}`} />
              <text className={cn('ar-crate-num font-pixel', left > 9 && 'is-wide')} x={x0 + CELL / 2} y={y0 + CELL / 2 + 1.9} textAnchor="middle">{left}</text>
            </g>
          )
        })}
        {preview >= 0 && !gone[preview] && !hidden.has(preview) && (
          <path className="ar-route" d={routePreviewD(level, level.arrows[preview])} fill="none" aria-hidden="true" />
        )}
        <g strokeLinecap="round" strokeLinejoin="round">
          {level.arrows.map((arrow, i) => {
            if (hidden.has(i)) return null
            const pose = arrowPose(arrow, CELL, 0, level)
            const cells = arrow.cells.map((c) => cellCenter(c, CELL))
            const hitD = `M${cells.map((p) => p.join(' ')).join(' L')}`
            const leaving = !!gone[i]
            const asleep = isSleeper(arrow) && !isAwake(level, gone, i)
            return (
              <g
                key={i}
                ref={(el) => { groupRefs.current[i] = el }}
                className={cn(
                  'arrows-arrow',
                  isDiagonal(arrow) && 'is-diag',
                  isBent(arrow) && 'is-bend',
                  isCurved(arrow) && 'is-curve',
                  isDouble(arrow) && 'is-double',
                  isSleeper(arrow) && 'is-sleep',
                  isSleeper(arrow) && !asleep && 'is-awake',
                  i === target && 'is-target',
                )}
              >
                <path
                  ref={(el) => { bodyRefs.current[i] = el }}
                  className="ar-body"
                  d={bodyD(pose, arrow)}
                  fill="none"
                  strokeWidth={STROKE}
                  style={{ pointerEvents: 'none' }}
                />
                {/* A sleeping arrow is drawn hollow: a dark core runs inside its body
                    until it wakes. */}
                {isSleeper(arrow) && (
                  <path
                    ref={(el) => { coreRefs.current[i] = el }}
                    className="ar-core"
                    d={bodyD(pose, arrow)}
                    fill="none"
                    strokeWidth={STROKE * 0.42}
                    style={{ pointerEvents: 'none' }}
                  />
                )}
                <path
                  ref={(el) => { headRefs.current[i] = el }}
                  className="ar-head"
                  d={headD(pose)}
                  style={{ pointerEvents: 'none' }}
                />
                {isDouble(arrow) && (
                  <path
                    ref={(el) => { head2Refs.current[i] = el }}
                    className="ar-head"
                    d={tailHeadD(pose)}
                    style={{ pointerEvents: 'none' }}
                  />
                )}
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
                    aria-label={arrowLabel(arrow, i, asleep)}
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
      {camOn && (
        // Outside the board so the buttons never cover a ring or an arrow.
        <div className="flex items-center justify-between gap-2 px-2 py-1 border-t border-retro-border/60">
          <span className="font-pixel text-[7px] text-retro-dim leading-relaxed" aria-hidden="true">
            {zoom <= 1.02 ? 'DRAG TO MOVE · PINCH TO ZOOM' : `${zoom.toFixed(1)}× · DRAG TO MOVE`}
          </span>
          <div className="flex gap-1.5">
            <button type="button" className={zoomBtn} aria-label="Zoom out" disabled={zoom <= 1.02} onClick={() => applyCam((c) => stepZoom(c, fit, -1))}>−</button>
            <button type="button" className={zoomBtn} aria-label="Fit the whole board" disabled={zoom <= 1.02} onClick={() => applyCam(fit)}>FIT</button>
            <button type="button" className={zoomBtn} aria-label="Zoom in" disabled={zoom >= MAX_ZOOM - 0.02} onClick={() => applyCam((c) => stepZoom(c, fit, 1))}>+</button>
          </div>
        </div>
      )}
    </div>
  )
}

