import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  roundedPathD,
  routeDistance,
  turnedDir,
  voidSet,
} from '../lib/arrowsLogic'
import {
  centerOn,
  doubleTapCamera,
  fitCamera,
  focusFitCamera,
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
  startCamera,
  stepZoom,
  wheelFactor,
  zoomAt,
  zoomOf,
} from '../lib/arrowsCameraLogic'
import ArrowsOverview from './ArrowsOverview'
import { cn } from '@/lib/utils'
import { isReducedMotion } from '../hooks/useMotionPref'
import { resolveTap } from '../lib/arrowsTapLogic'
import { bumpPlan, bumpProgress } from '../lib/arrowsMotionLogic'
import { portalColourLabel, vBendD } from '../lib/arrowsLook'

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
// Blocked tap: glide the whole way to the blocker and ease back (timing in
// arrowsMotionLogic.js).
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
// curved V-shaped bend that points out behind its spine. Both ends stop short
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
    vBendD(p1, p2, ux, uy, bulge) +
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

// Endless twist markers: a small accent glyph off the head, like the hook.
// Elbow and swerve wear dots behind the head, one per cell they fly before
// the twist. Each part is { d, fill } (stroke otherwise).
const PIP_R = 0.85
const f2 = (n) => Math.round(n * 100) / 100
const pipD = (cx, cy) => `M${f2(cx - PIP_R)} ${f2(cy)} a${PIP_R} ${PIP_R} 0 1 0 ${PIP_R * 2} 0 a${PIP_R} ${PIP_R} 0 1 0 ${-PIP_R * 2} 0`
function twistMarker(arrow) {
  const c = cellCenter(arrow.cells[arrow.cells.length - 1], CELL)
  const [hx, hy] = ARROWS_DIRS[arrow.dir]
  const norm = Math.hypot(hx, hy)
  const dx = hx / norm
  const dy = hy / norm
  const at = (u, v, sx, sy) => `${f2(c[0] + dx * u + sx * v)} ${f2(c[1] + dy * u + sy * v)}`
  if (arrow.twist === 'elbow' || arrow.twist === 'swerve') {
    const [sx, sy] = ARROWS_DIRS[turnedDir(arrow.dir, arrow.turn)]
    const parts = arrow.twist === 'elbow'
      ? [{ d: hookD(arrow) }, { d: hookTipD(arrow), fill: true }]
      : [{ d: `M${at(TIP_AHEAD, 0, sx, sy)} L${at(2.6, 0, sx, sy)} L${at(3.8, 2.2, sx, sy)} L${at(4.8, 2.2, sx, sy)}` }]
    for (let i = 0; i < (arrow.n ?? 0); i += 1) {
      parts.push({ d: pipD(c[0] - sx * 3.4 - dx * (i * 2.2 - 0.6), c[1] - sy * 3.4 - dy * (i * 2.2 - 0.6)), fill: true })
    }
    return parts
  }
  // Diagonal twists, across the heading: a bank zig-zags (it bounces), a
  // glide wears a double rail (it rides the wall).
  const px = -dy
  const py = dx
  if (arrow.twist === 'bank') {
    return [{ d: `M${at(TIP_AHEAD, 0, px, py)} L${at(3.1, 1.3, px, py)} L${at(4.2, -1.3, px, py)} L${at(5.2, 0.6, px, py)}` }]
  }
  return [{ d: `M${at(TIP_AHEAD + 0.8, -2.2, px, py)} L${at(TIP_AHEAD + 0.8, 2.2, px, py)} M${at(TIP_AHEAD + 2.3, -1.5, px, py)} L${at(TIP_AHEAD + 2.3, 1.5, px, py)}` }]
}

// Mirrors: a dark tile with a bar; a leaving arrow turns at its centre. A
// slanted bar runs corner to corner the way the mirror leans; a flat one
// (endless) lies across the middle, level or upright.
const MIRROR_INSET = 2.2
function mirrorBar({ x, y, m }) {
  const x0 = x * CELL
  const y0 = y * CELL
  const lo = MIRROR_INSET
  const hi = CELL - MIRROR_INSET
  const mid = CELL / 2
  if (m === '-') return [[x0 + lo - 0.6, y0 + mid], [x0 + hi + 0.6, y0 + mid]]
  if (m === '|') return [[x0 + mid, y0 + lo - 0.6], [x0 + mid, y0 + hi + 0.6]]
  return m === '/' ? [[x0 + lo, y0 + hi], [x0 + hi, y0 + lo]] : [[x0 + lo, y0 + lo], [x0 + hi, y0 + hi]]
}
const isFlatMirror = (m) => m.m === '-' || m.m === '|'
function mirrorLabel(m) {
  const where = `column ${m.x + 1}, row ${m.y + 1}`
  if (m.m === '-') return `Flat mirror at ${where}, lying level: diagonals bounce off it, arrows heading left or right run along it`
  if (m.m === '|') return `Flat mirror at ${where}, standing upright: diagonals bounce off it, arrows heading up or down run along it`
  return `Mirror at ${where}, leaning ${m.m === '/' ? 'right' : 'left'}`
}

// Portals are plain ovals told apart by colour (--c-portal-*); letters are an
// opt-in setting. Rings that do something special wear a small arrowhead.
const PORTAL_LETTERS = 'ABCD'
const PORTAL_RX = 2.7
const PORTAL_RY = 3.8
function portalHeadD(tx, ty, dx, dy) {
  const L = 1.5
  const W = 0.95
  const f = (n) => Math.round(n * 100) / 100
  const bx = tx - dx * L
  const by = ty - dy * L
  return `M${f(tx)} ${f(ty)} L${f(bx - dy * W)} ${f(by + dx * W)} L${f(bx + dy * W)} ${f(by - dx * W)} Z`
}

function arrowLabel(arrow, i, asleep) {
  const len = `${arrow.cells.length} long`
  const sleep = asleep ? ', asleep until an arrow touching it leaves' : ''
  if (isDouble(arrow)) return `Arrow ${i + 1}, double, two heads pointing ${ARROWS_DIR_NAMES[arrow.dir]}${sleep}`
  if (sleep) return `Arrow ${i + 1}, ${len}, pointing ${ARROWS_DIR_NAMES[arrow.dir]}${sleep}`
  if (arrow.twist === 'bank') return `Arrow ${i + 1}, bank shot diagonal, ${len}, pointing ${ARROWS_DIR_NAMES[arrow.dir]}, bounces once off the first wall it hits`
  if (arrow.twist === 'glide') return `Arrow ${i + 1}, glide diagonal, ${len}, pointing ${ARROWS_DIR_NAMES[arrow.dir]}, slides along the first wall it hits`
  if (arrow.twist === 'elbow') {
    return `Arrow ${i + 1}, elbow, ${len}, pointing ${ARROWS_DIR_NAMES[arrow.dir]} for ${arrow.n} cell${arrow.n === 1 ? '' : 's'}, then turning ${ARROWS_DIR_NAMES[turnedDir(arrow.dir, arrow.turn)]}`
  }
  if (arrow.twist === 'swerve') {
    return `Arrow ${i + 1}, swerve, ${len}, pointing ${ARROWS_DIR_NAMES[arrow.dir]} for ${arrow.n} cell${arrow.n === 1 ? '' : 's'}, then stepping one lane ${ARROWS_DIR_NAMES[turnedDir(arrow.dir, arrow.turn)]}`
  }
  if (isBent(arrow)) return `Arrow ${i + 1}, curved diagonal, ${len}, pointing ${ARROWS_DIR_NAMES[arrow.dir]}`
  if (isDiagonal(arrow)) return `Arrow ${i + 1}, diagonal, ${len}, pointing ${ARROWS_DIR_NAMES[arrow.dir]}`
  if (isCurved(arrow)) {
    return `Arrow ${i + 1}, curved, ${len}, pointing ${ARROWS_DIR_NAMES[arrow.dir]} then turning ${ARROWS_DIR_NAMES[turnedDir(arrow.dir, arrow.turn)]} at the edge`
  }
  return `Arrow ${i + 1}, ${len}, pointing ${ARROWS_DIR_NAMES[arrow.dir]}`
}

function leaveTravel(elapsed) {
  const v = CELL / MS_PER_CELL
  if (elapsed < ACCEL_MS) return (v * elapsed * elapsed) / (2 * ACCEL_MS)
  return v * (elapsed - ACCEL_MS / 2)
}

// When the blocker should flash: as the bumping head arrives (the plan's out
// phase), or at once when nothing bumps (sleeping arrow, reduced motion).
function contactDelay(fb) {
  return fb.asleep || isReducedMotion() ? 0 : bumpPlan(fb.gap).outMs
}

// Bump pose distance: the planned route length times the eased fraction.
function bumpTravel(elapsed, anim, arrow) {
  const { fraction, done } = bumpProgress(elapsed, anim.plan)
  return { travel: done ? 0 : routeDistance(arrow, anim.plan.cells, CELL) * fraction, done }
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
// `focusable`: a FULL SCREEN button opens the board over the whole viewport
// (a fixed, safe-area padded stage; the page behind stops scrolling) with
// drag and zoom on any size and the board as large as the screen allows.
// `focusHud` is the slim header shown there (title, lives, progress) and
// `focusOverlay` anything the page lays over the board (the result panel).
// Esc, the browser/phone back button or EXIT leave it; a board that replaces
// this one straight away (next level, restart) opens in full screen too. Where the browser has a
// Fullscreen API (Android, desktop) the entering tap also asks for real
// full screen; leaving that (e.g. Android back) leaves the stage too. iPhone
// gets the CSS stage alone, which is the whole layout either way.
// Full screen carries over to the board that replaces this one (see below).
let focusCarry = false
let focusLive = 0

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
  focusable = false,
  focusHud = null,
  focusOverlay = null,
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

  // Full screen: the stage's size (px) shapes the fit so the board fills it.
  const [focused, setFocused] = useState(() => focusable && focusCarry)
  const [focusBox, setFocusBox] = useState(null)
  const boxRef = useRef(null)

  // Camera (big boards, or any board in full screen): the viewBox follows
  // `cam`; camRef mirrors it so gesture handlers always read the latest one.
  const camOn = (zoomable && needsCamera(level)) || focused
  const fit = useMemo(
    () => (focused && focusBox ? focusFitCamera(width, height, PAD, focusBox.w, focusBox.h) : fitCamera(width, height, PAD)),
    [width, height, focused, focusBox],
  )
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

  // A new fit (entering or leaving full screen, a rotated phone) starts the
  // camera over from the whole board.
  const [camFit, setCamFit] = useState(fit)
  if (camFit !== fit) {
    setCamFit(fit)
    setCam(fit)
  }
  useEffect(() => { camRef.current = cam }, [cam])

  // Big boards open zoomed to a comfortable cell (~30 px), centred on the
  // densest cluster of free arrows, once the view has a real width. Lesson
  // boards (target / preview) and small boards opened in full screen keep
  // the fitted whole-board view. Set directly: no zoom-in animation exists,
  // so reduced motion needs nothing extra.
  const goneRef = useRef(gone)
  useLayoutEffect(() => { goneRef.current = gone })
  const startZoomed = camOn && needsCamera(level) && target < 0 && preview < 0
  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!startZoomed || !svg) return undefined
    const open = () => {
      const px = svg.getBoundingClientRect().width
      if (!px || pointers.current.size) return false
      applyCam(startCamera(level, goneRef.current, fit, px, CELL))
      return true
    }
    if (open()) return undefined
    const ro = new ResizeObserver(() => { if (open()) ro.disconnect() })
    ro.observe(svg)
    return () => ro.disconnect()
    // Once per board and fit; applyCam only touches refs and state.
  }, [startZoomed, level, fit])

  // Track the full-screen stage's size (the observer reports it on start).
  useEffect(() => {
    if (!focused) return undefined
    const el = boxRef.current
    if (!el) return undefined
    const measure = () => setFocusBox({ w: el.clientWidth, h: el.clientHeight })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [focused])

  // Entering pushes a history entry so the back button leaves full screen
  // instead of the page; it also asks for real full screen where the browser
  // has it (inside the tap, which the Fullscreen API requires).
  const enterFocus = () => {
    setFocused(true)
    focusCarry = true
    try { window.history.pushState({ ...(window.history.state ?? {}), arrowsFocus: true }, '') } catch { /* sandboxed */ }
    const root = document.documentElement
    if (root.requestFullscreen && !document.fullscreenElement) {
      root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {})
    }
  }
  const leaveFocus = useCallback(() => {
    focusCarry = false
    setFocused(false)
    setFocusBox(null)
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    if (window.history.state?.arrowsFocus) window.history.back()
  }, [])

  useEffect(() => {
    if (!focused) return undefined
    // The page behind stops scrolling while the stage owns the viewport.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') leaveFocus() }
    // Back (browser or phone) already popped our entry: just close.
    const onPop = () => {
      focusCarry = false
      setFocused(false)
      setFocusBox(null)
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
    // Leaving real full screen (Android back, Esc in a desktop browser)
    // leaves the stage too.
    let wasFull = !!document.fullscreenElement
    const onFull = () => {
      if (document.fullscreenElement) { wasFull = true; return }
      if (wasFull) leaveFocus()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('popstate', onPop)
    document.addEventListener('fullscreenchange', onFull)
    focusLive += 1
    return () => {
      focusLive -= 1
      // Unmounted while still in full screen: if no board takes over in a
      // moment (the page moved on to a menu), let the real full screen and
      // our history entry go.
      if (focusCarry) {
        setTimeout(() => {
          if (focusLive > 0 || !focusCarry) return
          focusCarry = false
          if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
          if (window.history.state?.arrowsFocus) window.history.back()
        }, 400)
      }
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('popstate', onPop)
      document.removeEventListener('fullscreenchange', onFull)
    }
  }, [focused, leaveFocus])

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
        const { travel, done } = bumpTravel(elapsed, anim, level.arrows[index])
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
    // The tapped arrow and the board go red at once; the blocker lights up when
    // the bumping head reaches it, so the hit reads as contact.
    const delay = contactDelay(feedback)
    restart(group, 'is-error')
    restart(stage, 'is-error')
    const flash = setTimeout(() => { for (const g of blockerGroups) restart(g, 'is-blocker') }, delay)
    // On a zoomed board the blocker may be off-screen: pan to it.
    const fixed = feedback.crate ?? feedback.wall
    if (fixed != null) {
      reveal([[fixed % level.cols, Math.floor(fixed / level.cols)]])
    } else {
      const [hx, hy] = level.arrows[index].cells[level.arrows[index].cells.length - 1]
      const ids = asleep ? neighborsOf(level)[index].filter((j) => !gone[j]) : [blocker]
      const near = ids
        .filter((j) => j >= 0)
        .flatMap((j) => level.arrows[j].cells)
        .sort((a, b) => Math.hypot(a[0] - hx, a[1] - hy) - Math.hypot(b[0] - hx, b[1] - hy))
      reveal(near)
    }
    if (!asleep && !isReducedMotion() && !anims.current.has(index)) startAnim(index, { type: 'bump', plan: bumpPlan(gap) })
    const t = setTimeout(() => {
      group?.classList.remove('is-error')
      for (const g of blockerGroups) g?.classList.remove('is-blocker')
      stage?.classList.remove('is-error')
    }, delay + ERROR_MS)
    return () => { clearTimeout(flash); clearTimeout(t) }
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
    const flash = setTimeout(() => {
      el.classList.remove('is-blocker')
      void el.getBoundingClientRect()
      el.classList.add('is-blocker')
    }, contactDelay(feedback))
    const t = setTimeout(() => el.classList.remove('is-blocker'), contactDelay(feedback) + ERROR_MS)
    return () => { clearTimeout(flash); clearTimeout(t) }
  }, [feedback, level])

  // A tunnel wall flashes where the piece stopped.
  const tunnelRefs = useRef([])

  useEffect(() => {
    if (feedback?.wall == null || !level.tunnels) return
    const at = level.tunnels.findIndex((t) => t.y * level.cols + t.x === feedback.wall)
    const el = tunnelRefs.current[at]
    if (!el) return
    const flash = setTimeout(() => {
      el.classList.remove('is-blocker')
      void el.getBoundingClientRect()
      el.classList.add('is-blocker')
    }, contactDelay(feedback))
    const t = setTimeout(() => el.classList.remove('is-blocker'), contactDelay(feedback) + ERROR_MS)
    return () => { clearTimeout(flash); clearTimeout(t) }
  }, [feedback, level])

  // Every portal ring and tunnel an arrow passes through lights up as its head
  // gets there (timed from the route).
  const pieceRefs = useRef(new Map())
  const passGone = useRef(gone)
  useEffect(() => {
    const before = passGone.current
    passGone.current = gone
    if (!level.portals?.length && !level.tunnels?.length) return
    const timers = []
    const lit = new Set()
    gone.forEach((g, i) => {
      if (!g || before[i]) return
      arrowRoute(level, level.arrows[i]).cells.forEach((c, step) => {
        const el = pieceRefs.current.get(c)
        if (!el) return
        timers.push(setTimeout(() => {
          lit.add(el)
          el.classList.remove('is-pass'); void el.getBBox(); el.classList.add('is-pass')
          timers.push(setTimeout(() => el.classList.remove('is-pass'), 700))
        }, (step + 1) * MS_PER_CELL + ACCEL_MS / 2))
      })
    })
    return () => {
      timers.forEach(clearTimeout)
      lit.forEach((el) => el.classList.remove('is-pass'))
    }
  }, [gone, level])

  // The arrow under a screen position (its cell, or a near miss — thumbs are
  // wider than lines), or -1. A blocked hit with a free arrow in near-miss
  // reach snaps to the free one (arrowsTapLogic.js), so a fat thumb beside the
  // aimed arrow does not cost a life.
  const arrowAtClient = (clientX, clientY) => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!ctm) return -1
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const { x, y } = pt.matrixTransform(ctm.inverse())
    return resolveTap(level, gone, x, y, CELL, TAP_SLOP)
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

  const pieceCells = new Set([...(level.mirrors ?? []), ...(level.crates ?? []), ...(level.tunnels ?? [])].map((c) => c.y * level.cols + c.x))
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
  const zoomBtn = 'min-h-9 min-w-9 px-2 font-pixel text-[9px] rounded border border-retro-border text-retro-dim hover:border-retro-cta/50 hover:text-retro-text transition press disabled:opacity-40 disabled:pointer-events-none'

  const board = (
    <div
      ref={stageRef}
      className={cn(
        'arrows-stage w-full bg-retro-surface border-2 border-retro-border rounded-lg overflow-hidden',
        compact && 'border',
        camOn && 'outline-none focus-visible:ring-2 focus-visible:ring-retro-cta',
        focused && 'h-full flex flex-col',
      )}
      tabIndex={camOn ? 0 : undefined}
      aria-keyshortcuts={camOn ? '+ - 0 ArrowLeft ArrowRight ArrowUp ArrowDown' : undefined}
      onKeyDown={camOn ? handleKeyDown : undefined}
    >
      <div ref={boxRef} className={cn(focused && 'flex-1 min-h-0')}>
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        className={cn('arrows-svg block w-full select-none', focused ? 'h-full' : 'h-auto')}
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
          const entrance = p.oneway && end === 'a'
          const cx = x * CELL + CELL / 2
          const cy = y * CELL + CELL / 2
          let mark = null
          if (p.turn) mark = <path className="ar-portal-head" d={portalHeadD(cx + PORTAL_RX + 0.15, cy + 1.2, 0, 1)} />
          else if (exit) mark = <path className="ar-portal-head" d={portalHeadD(cx, cy - PORTAL_RY - 1.25, 0, -1)} />
          else if (entrance) mark = <path className="ar-portal-head" d={portalHeadD(cx, cy - PORTAL_RY + 1.25, 0, 1)} />
          return (
            <g
              key={`p${p.c}${end}`}
              ref={(el) => { const k = y * level.cols + x; if (el) pieceRefs.current.set(k, el); else pieceRefs.current.delete(k) }}
              className={cn('ar-portal', `ar-portal-${p.c % 4}`, exit && 'is-exit', p.turn && 'is-turn')}
              role="img"
              aria-label={portalColourLabel(p, end)}
            >
              <rect className="ar-portal-cell" x={x * CELL + 0.6} y={y * CELL + 0.6} width={CELL - 1.2} height={CELL - 1.2} rx={1.6} />
              <ellipse className="ar-portal-oval" cx={cx} cy={cy} rx={PORTAL_RX} ry={PORTAL_RY} />
              {mark}
              <text className="ar-portal-letter font-pixel" x={cx} y={cy + 1} textAnchor="middle" aria-hidden="true">{PORTAL_LETTERS[p.c % 4]}</text>
            </g>
          )
        }))}
        {level.mirrors?.map((m) => {
          const [a, b] = mirrorBar(m)
          const glint = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
          return (
            <g key={`m${m.x}-${m.y}`} className={cn('ar-mirror', isFlatMirror(m) && 'is-flat')} role="img" aria-label={mirrorLabel(m)}>
              <rect className="ar-mirror-cell" x={m.x * CELL + 0.8} y={m.y * CELL + 0.8} width={CELL - 1.6} height={CELL - 1.6} rx={1.4} />
              <line className="ar-mirror-bar" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
              <line className="ar-mirror-glint" x1={glint(0.55)[0]} y1={glint(0.55)[1]} x2={glint(0.75)[0]} y2={glint(0.75)[1]} />
            </g>
          )
        })}
        {level.tunnels?.map((t, i) => {
          const [ux, uy] = ARROWS_DIRS[t.dir]
          const deg = (Math.atan2(uy, ux) * 180) / Math.PI
          const cx = t.x * CELL + CELL / 2
          const cy = t.y * CELL + CELL / 2
          const sc = t.dir >= 4 ? 0.62 : 1
          return (
            <g
              key={`t${t.x}-${t.y}`}
              ref={(el) => { tunnelRefs.current[i] = el; const k = t.y * level.cols + t.x; if (el) pieceRefs.current.set(k, el); else pieceRefs.current.delete(k) }}
              className="ar-tunnel"
              role="img"
              aria-label={`Tunnel floor at column ${t.x + 1}, row ${t.y + 1}, pieces cross it only heading ${ARROWS_DIR_NAMES[t.dir]}; any other way it is a wall`}
            >
              <rect className="ar-tunnel-cell" x={t.x * CELL + 0.6} y={t.y * CELL + 0.6} width={CELL - 1.2} height={CELL - 1.2} rx={1.6} />
              <g transform={`translate(${cx} ${cy}) rotate(${deg}) scale(${sc})`}>
                <rect className="ar-tunnel-floor" x={-4.4} y={-3.1} width={8.8} height={6.2} rx={0.8} />
                <path className="ar-tunnel-chevron" d="M-0.9 -1.8 L0.9 0 L-0.9 1.8" />
                <path className="ar-tunnel-wall" d="M-4.5 -3.9 L4.5 -3.9 M-4.5 3.9 L4.5 3.9" />
              </g>
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
                {arrow.twist && (
                  <g ref={(el) => { hookRefs.current[i] = el }} style={{ pointerEvents: 'none' }}>
                    {twistMarker(arrow).map((part, k) => (
                      part.fill
                        ? <path key={k} className="ar-hook-tip" d={part.d} />
                        : <path key={k} className="ar-hook" d={part.d} fill="none" strokeWidth={STROKE * 0.55} />
                    ))}
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
      </div>
      {startZoomed && (
        <div className="px-2 pt-1.5 pb-0.5 border-t border-retro-border/60">
          <ArrowsOverview
            level={level}
            gone={gone}
            cam={cam}
            fit={fit}
            cell={CELL}
            height={focused ? 64 : 92}
            onJump={(x, y) => applyCam((c) => centerOn(c, fit, x, y))}
          />
        </div>
      )}
      {(camOn || (focusable && !focused)) && (
        // Outside the board so the buttons never cover a ring or an arrow.
        <div className="flex items-center justify-between gap-2 px-2 py-1 border-t border-retro-border/60">
          {camOn ? (
            <span className="min-w-0 font-pixel text-[7px] text-retro-dim leading-relaxed" aria-hidden="true">
              {zoom <= 1.02 ? 'DRAG TO MOVE · PINCH TO ZOOM' : `${zoom.toFixed(1)}× · DRAG TO MOVE`}
            </span>
          ) : <span />}
          <div className="flex gap-1.5">
            {focusable && !focused && (
              <button type="button" className={cn(zoomBtn, 'flex items-center justify-center')} aria-label="Play full screen" title="Full screen" onClick={enterFocus}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" aria-hidden="true">
                  <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
                </svg>
              </button>
            )}
            {camOn && (
              <>
                <button type="button" className={zoomBtn} aria-label="Zoom out" disabled={zoom <= 1.02} onClick={() => applyCam((c) => stepZoom(c, fit, -1))}>−</button>
                <button type="button" className={zoomBtn} aria-label="Fit the whole board" disabled={zoom <= 1.02} onClick={() => applyCam(fit)}>FIT</button>
                <button type="button" className={zoomBtn} aria-label="Zoom in" disabled={zoom >= MAX_ZOOM - 0.02} onClick={() => applyCam((c) => stepZoom(c, fit, 1))}>+</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )

  if (!focused) return board
  // Full screen: a fixed stage over everything (portalled to <body> so no
  // transformed ancestor can trap it), safe-area padded, 100dvh tall.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Arrows, full screen"
      className="arrows-focus fixed inset-0 z-50 flex flex-col gap-2 bg-retro-bg px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]"
      style={{ height: '100dvh' }}
    >
      <div className="flex items-center gap-2 min-h-9">
        <div className="flex-1 min-w-0">{focusHud}</div>
        <button type="button" className={zoomBtn} aria-label="Leave full screen" onClick={leaveFocus}>EXIT</button>
      </div>
      <div className="relative flex-1 min-h-0">
        {board}
        {focusOverlay}
      </div>
    </div>,
    document.body,
  )
}

