import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { H, W, createDrawer, seatAtPoint } from './lazySusanDraw'
import {
  aimedPiece, derive, freshLock, planBot, planTap, press, seatAnglesFor, settle, takeBuffered, viewAt,
} from '../lib/lazySusanLogic'
import { mulberry32 } from '../lib/detMath'
import useGameKeys from '../hooks/useGameKeys'
import { isReducedMotion } from '../hooks/useMotionPref'
import { sounds } from '../lib/sounds'

// The LAZY SUSAN table: a canvas that draws the round at the clock's time and
// turns touches into taps. It owns the per-seat tap locks, the bots and the
// effects; the page owns the round and decides what a tap does (apply it to
// local state, or write the claim to the room). It never keeps score.
//
//   round       the raw round (lsSeats…); re-read every frame from a ref
//   clock       () => ms — Date.now locally, the server clock in a room
//   seats       [{ uid, name, online }] in seat order
//   localSeats  seat indexes this device plays (one phone: all humans)
//   bots        { [seatIndex]: 'easy' | 'normal' | 'hard' }
//   single      true: a tap anywhere is the one local seat (solo, online)
//   flip        draw the table turned 180° (a seat at the top of the table)
//   onAct       (seatIndex, outcome, now) — a tap resolved against the round
//
// Imperative: rejected(seatIndex) when a claim lost the race (TAKEN, no penalty).

const KEYS = {
  2: { ' ': 0, ArrowDown: 0, Enter: 1, ArrowUp: 1 },
  3: { ' ': 0, ArrowDown: 0, p: 1, q: 2 },
  4: { z: 0, m: 1, p: 2, q: 3 },
}

const LazySusanArena = forwardRef(function LazySusanArena({
  round, clock, seats, localSeats, bots = {}, single = false, flip = false, paused = false, onAct, testId = 'lazysusan-arena', label,
}, ref) {
  const canvasRef = useRef(null)
  const drawerRef = useRef(null)
  const props = { round, clock, seats, localSeats, bots, single, flip, paused, onAct }
  const live = useRef(props)
  useEffect(() => { live.current = props })
  const locks = useRef([])
  const plans = useRef([])
  const seen = useRef([])
  const rnd = useRef(mulberry32((Date.now() ^ 0x1a2b3c) | 0))
  const n = seats.length

  // The one path a tap takes, whoever made it: locks, then the round decides.
  const attempt = useCallback((i) => {
    const L = live.current
    if (L.paused || !L.round) return
    const now = L.clock()
    const lock = (locks.current[i] ??= freshLock())
    if (press(lock, now) !== 'tap') return
    const d = derive(L.round)
    if (!d) return
    const outcome = planTap(d, i, now)
    if (outcome.kind === 'none') return
    settle(lock, outcome, now)
    drawerRef.current?.jab(i, outcome.kind !== 'miss')
    if (outcome.kind === 'miss') sounds.susanMiss()
    else if (outcome.kind === 'hot') sounds.susanHot()
    else if (outcome.piece === 'bun' || outcome.gold) sounds.susanBun()
    else sounds.susanGrab(1)
    L.onAct?.(i, outcome, now)
  }, [])

  useImperativeHandle(ref, () => ({
    rejected(i) {
      const lock = locks.current[i]
      if (lock) { lock.until = 0; lock.stunUntil = 0 }
      drawerRef.current?.taken(i)
    },
  }), [])

  useEffect(() => {
    const canvas = canvasRef.current
    const drawer = createDrawer(canvas)
    drawerRef.current = drawer
    drawer.setLayout(n, { flip: live.current.flip, reduced: isReducedMotion() })
    const retheme = () => drawer.setTheme()
    const mo = new MutationObserver(retheme)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-font'] })
    document.fonts?.ready?.then(retheme).catch(() => {})
    let raf = 0
    let last = performance.now()
    let hookState = null
    const frame = (t) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.033, Math.max(0, (t - last) / 1000))
      last = t
      if (document.hidden) return
      const L = live.current
      const d = L.round ? derive(L.round) : null
      if (!d) return
      const now = L.clock()
      const view = viewAt(d, now)
      const angles = seatAnglesFor(d.round.seats.length)

      if (!L.paused) {
        Object.entries(L.bots).forEach(([k, level]) => {
          const i = Number(k)
          const lock = (locks.current[i] ??= freshLock())
          if (!plans.current[i]) plans.current[i] = planBot(view, angles[i], level, rnd.current, (seen.current[i] ??= new Map()), now)
          const plan = plans.current[i]
          if (plan && now >= plan.at) {
            plans.current[i] = null
            if (lock.until <= now) attempt(i)
          }
          if (view.phase !== 'play') plans.current[i] = null
        })
        L.localSeats.forEach((i) => {
          const lock = locks.current[i]
          if (lock && takeBuffered(lock, now)) attempt(i)
        })
      }

      const fresh = drawer.consume(d.log)
      fresh.forEach((e) => {
        if (L.localSeats.includes(e.seat) || e.seat in L.bots) return // already sounded on contact
        if (e.kind === 'miss') sounds.susanMiss()
        else if (e.kind === 'hot') sounds.susanHot()
        else if (e.piece === 'bun' || e.gold) sounds.susanBun()
        else sounds.susanGrab(1)
      })

      const winnerSeat = d.winner ? d.round.seats.indexOf(d.winner) : -1
      const model = {
        scores: d.round.seats.map((u) => d.scores[u] ?? 0),
        target: d.round.target,
        names: L.seats.map((s) => s.name),
        online: L.seats.map((s) => s.online),
        stunned: d.round.seats.map((_, i) => !!locks.current[i] && now < locks.current[i].stunUntil),
        humans: d.round.seats.map((_, i) => L.localSeats.includes(i)),
        twists: d.round.twists,
        winnerSeat,
        mirrorBanner: L.localSeats.length > 1,
        upright: L.localSeats.length <= 1,
      }
      const moments = drawer.render(dt, view, model)
      moments.forEach((m) => {
        if (m === 'turn') sounds.susanTurn()
        else if (m === 'last') sounds.susanLast()
        else if (m.startsWith('tick')) sounds.susanTick()
        else if (m === 'go') sounds.go()
        else if (m === 'win') {
          if (L.localSeats.length === 1 && L.localSeats[0] !== winnerSeat) sounds.lose(); else sounds.win()
        }
      })
      // Test and assistive-tech hooks: the phase, the scores, and what the first
      // local seat's gate holds right now ('eat' | 'hot' | '').
      const mine = L.localSeats[0]
      const aimed = mine != null ? aimedPiece(view, angles[mine]) : null
      const aim = aimed ? (aimed.kind === 'chili' ? 'hot' : 'eat') : ''
      const v = `${view.phase}|${aim}|${model.scores.join(',')}`
      if (v !== hookState) {
        hookState = v
        canvas.dataset.phase = view.phase
        canvas.dataset.aim = aim
        canvas.dataset.scores = model.scores.join(',')
      }
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      mo.disconnect()
      drawerRef.current = null
    }
    // The drawer is rebuilt only when the player count changes; everything else is read from `live`.
  }, [n, attempt])

  useEffect(() => { drawerRef.current?.setLayout(n, { flip, reduced: isReducedMotion() }) }, [n, flip])

  const seatFor = (clientX, clientY) => {
    const L = live.current
    if (L.single) return L.localSeats[0] ?? -1
    const r = canvasRef.current.getBoundingClientRect()
    let x = ((clientX - r.left) / r.width) * W
    let y = ((clientY - r.top) / r.height) * H
    if (L.flip) { x = W - x; y = H - y }
    const s = seatAtPoint(L.seats.length, x, y)
    return L.localSeats.includes(s) ? s : -1
  }

  const onPointerDown = (e) => {
    e.preventDefault()
    const s = seatFor(e.clientX, e.clientY)
    if (s >= 0) attempt(s)
  }

  useGameKeys((e) => {
    const L = live.current
    if (e.repeat || L.paused) return false
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
    let s
    if (L.single) s = key === ' ' || key === 'Enter' || key === 'ArrowDown' || key === 'ArrowUp' ? L.localSeats[0] : undefined
    else s = KEYS[L.seats.length]?.[key]
    if (s == null || !L.localSeats.includes(s)) return false
    attempt(s)
    return true
  })

  return (
    // The width is capped so the 9:16 table never outgrows the viewport height.
    <div className="mx-auto w-full" style={{ maxWidth: 'calc((100svh - 11rem) * 0.5625)' }}>
      <canvas
        ref={canvasRef}
        data-testid={testId}
        role="img"
        aria-label={label ?? 'Lazy Susan table: tap when a piece is inside your gate'}
        onPointerDown={onPointerDown}
        onContextMenu={(e) => e.preventDefault()}
        className="block w-full h-auto rounded-lg select-none touch-none border border-retro-border"
        style={{ aspectRatio: `${W} / ${H}`, WebkitTapHighlightColor: 'transparent' }}
      />
    </div>
  )
})

export default LazySusanArena
