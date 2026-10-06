import { useEffect, useMemo, useRef, useState } from 'react'
import MinigolfCourse from './MinigolfCourse'
import MinigolfScorecard from './MinigolfScorecard'
import { HOLES, getCourse } from '../lib/minigolfCourses'
import { aimRayLength, quantizeShot, simulateShot } from '../lib/minigolfPhysics'
import { STROKE_CAP, formatVsPar, scoreName, vsPar } from '../lib/minigolfLogic'
import { SEAT_GLYPHS, seatColor } from '../lib/minigolfUi'
import useGolfAim from '../hooks/useGolfAim'
import useMotionPref from '../hooks/useMotionPref'
import useFocusArena from '../hooks/useFocusArena'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// The Minigolf play surface shared by solo, pass-and-play and online rooms:
// HUD, course, score chips, the stroke replay animation, sink banners and the
// between-holes scorecard. Rendering and input only — whose turn it is and
// every score come from the replayed `state` (minigolfLogic.replayCourse).
//
// Each new stroke in `state.log` is re-simulated with its path and played back
// at 120 steps/s (tap the course to fast-forward). Moving obstacles run on a
// local clock while aiming; a stroke records the tick it was released on (`k`),
// so the replay — here and on every other client — starts from exactly what
// the shooter saw.

const STEPS_PER_SEC = 120
const BANNER_MS = 1800
const CARD_MS = 6000
const MAX_ANIMATED = 6 // more new log entries than this = a reload/late join: skip the theatre
const tickAt = (ms) => Math.floor((ms / 1000) * STEPS_PER_SEC)

function useLandscapePhone() {
  const q = '(orientation: landscape) and (max-height: 500px)'
  const [on, setOn] = useState(() => { try { return window.matchMedia(q).matches } catch { return false } })
  useEffect(() => {
    let mq
    try { mq = window.matchMedia(q) } catch { return undefined }
    const fn = () => setOn(mq.matches)
    mq.addEventListener?.('change', fn)
    return () => mq.removeEventListener?.('change', fn)
  }, [])
  return on
}

// Playback step at time `now`.
const stepAt = (pb, now) =>
  Math.max(0, Math.min(pb.path.length / 2 - 1, Math.floor(pb.base + ((now - pb.start) / 1000) * STEPS_PER_SEC * pb.speed)))

export default function MinigolfPlay({
  course, order, meta, state,
  controllable = false,
  onShot,
  onBusyChange,
  statusText = null,
  overlay = null,
  assist = 'wall',
  renderDone = null,
}) {
  const holes = getCourse(course).holes
  const worldRef = useRef(null)
  const courseRef = useRef(null)
  useFocusArena(courseRef, true)
  const landscape = useLandscapePhone()
  const { reduced } = useMotionPref()
  const [now, setNow] = useState(() => performance.now())
  const [seen, setSeen] = useState(state.log.length)
  const [playback, setPlayback] = useState(null) // { entry, last, hole, path, events, start, base, speed }
  const [banner, setBanner] = useState(null)     // { text, sub, seat, pos, tone, holeDone }
  const [card, setCard] = useState(null)         // { pos, manual }
  const [toast, setToast] = useState(null)
  const [flashBumper, setFlashBumper] = useState(-1)
  const [burst, setBurst] = useState(null)
  const [shake, setShake] = useState(null)       // { x, y } px offset
  const [announce, setAnnounce] = useState('')

  // New strokes in the log → start playing the newest (adjust-state-on-props:
  // done during render so no frame ever shows the post-stroke state first).
  if (state.log.length !== seen) {
    setSeen(state.log.length)
    const fresh = state.log.slice(seen)
    if (state.log.length > seen && fresh.length <= MAX_ANIMATED) {
      const shotEntry = [...fresh].reverse().find(e => e.shot)
      const last = fresh[fresh.length - 1]
      if (shotEntry) {
        const hole = HOLES[holes[shotEntry.h]]
        const r = simulateShot(hole, shotEntry.from, shotEntry.shot, { path: true })
        setPlayback({ entry: shotEntry, last, hole, path: r.path, events: r.events, start: now, base: 0, speed: 1 })
      } else {
        setPlayback({ entry: null, last, hole: HOLES[holes[last.h]], path: [0, 0], events: [], start: now, base: 0, speed: 1 })
      }
    } else {
      setPlayback(null)
    }
  }

  const busy = !!playback || !!banner || (!!card && !card.manual)
  useEffect(() => { onBusyChange?.(busy) }, [busy, onBusyChange])

  // Latest values for the rAF loop and timers (read only inside callbacks).
  const live = useRef({})
  useEffect(() => { live.current = { playback, state, meta, holes, reduced } })
  const evIdx = useRef({ pb: null, i: 0 })

  useEffect(() => {
    if (playback?.entry) sounds.putt(playback.entry.shot.p / 1000)
  }, [playback])

  // A stroke (or pick-up) finished playing out: toast, banner, hole card.
  const finish = (pb) => {
    const { state: s, meta: m, holes: hs, reduced: rm } = live.current
    const shotEntry = pb.entry, last = pb.last
    if (shotEntry?.outcome === 'water') setToast('SPLASH! +1')
    else if (shotEntry?.outcome === 'oob') setToast('BALL RESET')
    if (!last || !['holed', 'pickup', 'skip'].includes(last.outcome)) return
    const hole = HOLES[hs[last.h]]
    const seat = m[last.by]?.seat ?? 0
    const holed = last.outcome === 'holed'
    const text = scoreName(last.score, hole.par, !holed)
    const name = m[last.by]?.name ?? '?'
    const sub = holed
      ? `${name} · ${last.score} STROKE${last.score > 1 ? 'S' : ''}`
      : last.outcome === 'skip' ? `${name} · NO SHOT — SCORES ${last.score}` : `${name} · ${STROKE_CAP} STROKES — SCORES ${last.score}`
    if (holed) {
      sounds.cup(last.score <= hole.par)
      if (!rm) setBurst({ key: `${last.h}-${last.by}-${last.index}`, x: hole.cup[0], y: hole.cup[1], seat })
    }
    const holeDone = !s.done && s.pos > last.h
    setBanner({ text, sub, seat, pos: last.h, tone: holed && last.score <= hole.par ? 'win' : holed ? 'text' : 'p2', holeDone })
    setAnnounce(`${text} ${sub}`)
  }

  // One rAF loop: the obstacle clock, stroke playback and its event juice.
  useEffect(() => {
    let raf
    const loop = () => {
      const t = performance.now()
      const pb = live.current.playback
      if (pb) {
        if (evIdx.current.pb !== pb) evIdx.current = { pb, i: 0 }
        const i = stepAt(pb, t)
        const ev = evIdx.current
        while (ev.i < pb.events.length && pb.events[ev.i][0] <= i) {
          const [, type, v] = pb.events[ev.i++]
          if (type === 'wall' || type === 'mover') {
            sounds.wall()
            if (v > 250 && !live.current.reduced) {
              const m = Math.min(4, v / 120)
              setShake({ x: (Math.random() - 0.5) * 2 * m, y: (Math.random() - 0.5) * 2 * m })
            }
          } else if (type === 'bump') {
            sounds.boing()
            const bx = pb.path[i * 2], by = pb.path[i * 2 + 1]
            setFlashBumper((pb.hole.bumpers || []).findIndex(([x, y, r]) => Math.hypot(x - bx, y - by) < r + 10))
          } else if (type === 'water') sounds.splash()
          else if (type === 'portal') sounds.warp()
          else if (type === 'lip') { sounds.rattle(); setToast('SO CLOSE!') }
        }
        if (i >= pb.path.length / 2 - 1) {
          live.current.playback = null
          setPlayback(null)
          finish(pb)
        }
      }
      setNow(t)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Short-lived juice clears itself.
  useEffect(() => {
    if (!shake) return undefined
    const id = setTimeout(() => setShake(null), 140)
    return () => clearTimeout(id)
  }, [shake])
  useEffect(() => {
    if (flashBumper < 0) return undefined
    const id = setTimeout(() => setFlashBumper(-1), 120)
    return () => clearTimeout(id)
  }, [flashBumper])
  useEffect(() => {
    if (!toast) return undefined
    const id = setTimeout(() => setToast(null), 1500)
    return () => clearTimeout(id)
  }, [toast])

  // Banner → (hole finished) scorecard → next hole.
  const closeBanner = () => {
    if (banner?.holeDone) setCard({ pos: banner.pos, manual: false })
    setBanner(null)
  }
  useEffect(() => {
    if (!banner) return undefined
    const b = banner
    const id = setTimeout(() => {
      if (b.holeDone) setCard({ pos: b.pos, manual: false })
      setBanner(null)
    }, BANNER_MS)
    return () => clearTimeout(id)
  }, [banner])
  useEffect(() => {
    if (!card || card.manual) return undefined
    const id = setTimeout(() => setCard(null), CARD_MS)
    return () => clearTimeout(id)
  }, [card])

  // What to draw right now.
  let hole, balls = [], t = now / 1000, hudUid = state.turn, hudStrokes = state.strokes, hudPos = state.pos
  let trail = null
  if (playback?.entry) {
    const pb = playback
    const i = stepAt(pb, now)
    const seat = meta[pb.entry.by]?.seat ?? 0
    hole = pb.hole
    balls = [{ key: 'b', x: pb.path[i * 2], y: pb.path[i * 2 + 1], seat }]
    t = (pb.entry.shot.k + i) / STEPS_PER_SEC
    hudUid = pb.entry.by
    hudStrokes = pb.entry.strokes
    hudPos = pb.entry.h
    if (!reduced) {
      trail = Array.from({ length: 10 }, (_, j) => {
        const k = Math.max(0, i - (10 - j) * 3)
        return { x: pb.path[k * 2], y: pb.path[k * 2 + 1], seat }
      })
    }
  } else if (playback || banner || (card && !card.manual)) {
    const pos = playback ? playback.last.h : banner ? banner.pos : card.pos
    hole = HOLES[holes[pos]]
    hudPos = pos
    hudUid = null
  } else if (!state.done) {
    hole = state.hole
    balls = [{ key: 'b', x: state.ball.x, y: state.ball.y, seat: meta[state.turn]?.seat ?? 0 }]
  } else {
    hole = HOLES[holes[holes.length - 1]]
    hudPos = holes.length - 1
    hudUid = null
  }

  const canAim = controllable && !busy && !state.done
  const aim = useGolfAim({
    worldRef,
    enabled: canAim,
    attachKey: landscape,
    onShoot: (angle, power) => onShot?.({ ...quantizeShot(angle, power), k: tickAt(performance.now()) }),
  })
  const aimLine = useMemo(() => {
    if (!aim || !canAim || !state.ball) return null
    const dx = Math.cos(aim.angle), dy = Math.sin(aim.angle)
    let length = 30 + aim.power * 170
    if (assist === 'wall') length = Math.min(length, aimRayLength(state.hole, state.ball.x, state.ball.y, dx, dy, length))
    return { x: state.ball.x, y: state.ball.y, angle: aim.angle, power: aim.power, length }
  }, [aim, canAim, state.ball, state.hole, assist])

  if (state.done && !busy && renderDone) return renderDone()

  const hudSeat = hudUid ? (meta[hudUid]?.seat ?? 0) : 0
  const fastForward = () => {
    if (!playback?.entry || playback.speed > 1) return
    const tNow = performance.now()
    setPlayback({ ...playback, base: stepAt(playback, tNow), start: tNow, speed: 6 })
  }

  return (
    <div className="w-full flex flex-col gap-2">
      {/* HUD */}
      <div className="flex items-center gap-2 rounded border border-retro-border bg-retro-surface px-2.5 py-1.5">
        <div className="flex-1 min-w-0">
          <p className="font-pixel text-[9px] leading-relaxed text-retro-text">
            HOLE {hudPos + 1}/{holes.length} · PAR {hole.par}
          </p>
          <p className="font-mono text-[10px] text-retro-dim truncate">{hole.name}</p>
        </div>
        {hudUid && (
          <div className="text-right min-w-0">
            <p className="font-pixel text-[9px] leading-relaxed truncate" style={{ color: seatColor(hudSeat) }}>
              {SEAT_GLYPHS[hudSeat]} {meta[hudUid]?.name ?? '?'}
            </p>
            <div className="flex gap-[3px] justify-end" role="img" aria-label={`stroke ${hudStrokes} of ${STROKE_CAP}`}>
              {Array.from({ length: STROKE_CAP }, (_, i) => (
                <span key={i} className={cn('block w-2 h-2 rounded-full border', i < hudStrokes ? 'bg-retro-cta border-retro-cta' : 'border-retro-dim')} />
              ))}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setCard(c => (c ? null : { pos: Math.min(hudPos, holes.length - 1), manual: true }))}
          aria-label="Scorecard"
          title="Scorecard"
          className="shrink-0 w-9 h-9 grid place-items-center rounded border border-retro-border bg-retro-card text-retro-dim hover:text-retro-text"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="9" y1="4" x2="9" y2="20" /></svg>
        </button>
      </div>

      {/* Course */}
      <div
        ref={courseRef}
        className="relative mx-auto scroll-mt-3 rounded overflow-hidden bg-retro-deep"
        // Width follows the height that is left on screen (the old max-height
        // clipped the course instead of shrinking it, hiding the tee end).
        style={{
          aspectRatio: landscape ? '600 / 360' : '360 / 600',
          width: landscape ? 'min(100%, calc((100dvh - 7rem) * 600 / 360))' : 'min(100%, calc((100dvh - 13rem) * 360 / 600))',
        }}
        onPointerDown={fastForward}
      >
        <div className="absolute inset-0" style={shake ? { transform: `translate(${shake.x}px, ${shake.y}px)` } : undefined}>
          <MinigolfCourse
            hole={hole}
            t={t}
            balls={balls}
            aim={aimLine}
            trail={trail}
            flashBumper={flashBumper}
            burst={burst}
            worldRef={worldRef}
            landscape={landscape}
            className="w-full h-full block"
          />
        </div>

        {(statusText || toast || aimLine) && !banner && !card && (
          <div className="pointer-events-none absolute inset-x-2 bottom-2 flex justify-between items-end gap-2">
            <span className={cn('font-pixel text-[8px] rounded px-1.5 py-1', (aimLine || toast) && 'bg-retro-bg/75 text-retro-text')}>
              {aimLine ? `POWER ${Math.round(aimLine.power * 100)}%` : toast ?? ''}
            </span>
            {statusText && (
              <span className="font-pixel text-[8px] leading-relaxed bg-retro-bg/75 text-retro-dim rounded px-1.5 py-1 text-right">{statusText}</span>
            )}
          </div>
        )}

        {banner && (
          <button
            type="button"
            onClick={closeBanner}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-retro-bg/80 text-center px-6"
          >
            <span
              className={cn('font-pixel text-xl leading-snug', !reduced && 'animate-[pong-callout_0.45s_ease-out_both]')}
              style={{ color: banner.tone === 'win' ? 'rgb(var(--c-win))' : banner.tone === 'p2' ? 'rgb(var(--c-p2))' : 'rgb(var(--c-text))' }}
            >
              {banner.text}
            </span>
            <span className="font-pixel text-[9px] leading-relaxed" style={{ color: seatColor(banner.seat) }}>
              {SEAT_GLYPHS[banner.seat]} {banner.sub}
            </span>
            <span className="font-mono text-[10px] text-retro-dim">tap to continue</span>
          </button>
        )}

        {card && (
          <div className="absolute inset-0 overflow-y-auto bg-retro-bg/90 p-3 flex flex-col gap-3">
            <p className="font-pixel text-[10px] text-retro-cta text-center pt-2">
              {card.manual ? 'SCORECARD' : `AFTER HOLE ${card.pos + 1}`}
            </p>
            <MinigolfScorecard course={course} order={order} meta={meta} scores={state.scores} currentPos={card.manual ? state.pos : -1} />
            <button
              type="button"
              onClick={() => setCard(null)}
              className="self-center min-h-11 px-6 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta press"
            >
              {card.manual ? 'CLOSE' : 'NEXT HOLE →'}
            </button>
          </div>
        )}

        {!busy && overlay}
      </div>

      {/* Score chips */}
      <div className={cn('grid gap-1.5', order.length > 2 ? 'grid-cols-4' : 'grid-cols-2')}>
        {order.map((uid) => {
          const seat = meta[uid]?.seat ?? 0
          const played = (state.scores[uid] || []).some(v => v != null)
          return (
            <div
              key={uid}
              className={cn('flex items-center gap-1.5 min-w-0 rounded border px-1.5 py-1 bg-retro-card', uid === hudUid ? 'border-retro-cta' : 'border-retro-border')}
            >
              <span className="shrink-0 w-4 h-4 rounded-full grid place-items-center text-[8px]" style={{ background: seatColor(seat), color: 'rgb(var(--c-bg))' }} aria-hidden="true">
                {SEAT_GLYPHS[seat]}
              </span>
              <span className="font-pixel text-[7px] leading-normal truncate text-retro-text">
                {meta[uid]?.name ?? '?'} {played ? formatVsPar(vsPar(state.scores[uid], course)) : '—'}
              </span>
            </div>
          )
        })}
      </div>
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
    </div>
  )
}
