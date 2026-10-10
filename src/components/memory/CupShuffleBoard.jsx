import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import usePhaseClock from '../../hooks/usePhaseClock'
import useMotionPref from '../../hooks/useMotionPref'
import { cupPose, cupSlotsAfter, swapMsForLevel } from '../../lib/cupShuffleLogic'
import { sounds } from '../../lib/sounds'
import { CountdownCover, BoardHint } from './MemoryParts'

const SHOW_MS = 1400
const COVER_MS = 450

// The table is a flat plate tipped back by TILT degrees under a perspective, and
// each cup is an upright card standing on it. Cups that swap swing apart in depth
// (one out toward you, one behind) on an arc, so they never pass through each
// other and each one stays easy to follow. Plain CSS 3D transforms: five cards
// and a few shadows, no canvas and no 3D library.
const TILT = 54            // degrees the table leans back
const DEPTH = 1.1          // table depth, in cup slots
const BASE_Y = 0.55        // resting row, as a fraction of the table depth
const SWING = 0.3          // how far (fraction of depth) a swapping cup swings front/back
const CUP_W = 0.8          // cup width, in slot widths
const CUP_H = 0.9          // cup height, in slot widths
const HOP = 0.16           // peak hop height during a swap, in slot widths
const LIFT = 0.62          // how far a lifted cup rises, as a fraction of its height

// A cup drawn with a lit left face, a shaded right face and a lid, in theme colours.
function CupArt() {
  return (
    <svg viewBox="0 0 100 112" className="block h-full w-full" aria-hidden="true">
      <path d="M22 14 L78 14 L93 98 Q50 114 7 98 Z" className="fill-retro-cta" />
      <path d="M58 14 L78 14 L93 98 Q76 104 60 106 Z" className="fill-retro-bg" opacity="0.3" />
      <path d="M29 19 L38 19 L28 96 L18 94 Z" className="fill-retro-tint-cta" opacity="0.85" />
      <ellipse cx="50" cy="14" rx="28" ry="7" className="fill-retro-tint-cta" />
      <ellipse cx="50" cy="14" rx="28" ry="7" className="fill-none stroke-retro-bg" strokeWidth="1.5" opacity="0.4" />
      <path d="M7 98 Q50 114 93 98" className="fill-none stroke-retro-bg" strokeWidth="2" opacity="0.45" />
    </svg>
  )
}

function Ball() {
  return (
    <svg viewBox="0 0 40 40" className="block h-full w-full" aria-hidden="true">
      <circle cx="20" cy="20" r="18" className="fill-retro-p2" />
      <circle cx="14" cy="13" r="6" className="fill-retro-card" opacity="0.55" />
      <path d="M4 24 Q20 40 36 24 Q30 38 20 38 Q10 38 4 24 Z" className="fill-retro-bg" opacity="0.25" />
    </svg>
  )
}

// Cup Shuffle board for one level: show the ball, cover it, shuffle, pick a cup.
// With reduced motion the cups jump slot to slot instead of swinging.
export default function CupShuffleBoard({ deal, level, startAt, clock, disabled, answer = false, onDone, onFail }) {
  const swapMs = swapMsForLevel(level)
  const { reduced } = useMotionPref()
  const { phase, left } = usePhaseClock(startAt, [['show', SHOW_MS], ['cover', COVER_MS], ['shuffle', deal.swaps.length * swapMs]], clock)
  const [picked, setPicked] = useState(null) // cup id

  // Stage width drives every pixel size, so the table scales with the card.
  const stageRef = useRef(null)
  const [width, setWidth] = useState(320)
  useEffect(() => {
    const el = stageRef.current
    if (!el) return undefined
    const measure = () => setWidth(Math.max(200, Math.round(el.clientWidth)))
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Smooth shuffle: a frame loop while the cups are moving, none otherwise.
  const total = deal.swaps.length * swapMs
  const [elapsed, setElapsed] = useState(0)
  const shuffling = phase === 'shuffle' && !reduced
  useEffect(() => {
    if (!shuffling) return undefined
    const begin = startAt + SHOW_MS + COVER_MS
    let raf = 0
    const frame = () => {
      setElapsed(Math.min(total, clock() - begin))
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [shuffling, startAt, total, clock])

  // Reduced motion steps whole swaps on the phase clock's own tick.
  const stepped = phase === 'shuffle' ? deal.swaps.length - Math.ceil(left / swapMs) : phase === 'recall' ? deal.swaps.length : 0
  const at = reduced ? Math.max(0, stepped) * swapMs : phase === 'recall' ? total : phase === 'shuffle' ? elapsed : 0
  const slotsNow = cupSlotsAfter(deal, Math.max(0, Math.min(deal.swaps.length, reduced ? stepped : Math.floor(at / swapMs))))
  const canPick = phase === 'recall' && !disabled && picked == null && !answer

  const pick = (cup) => {
    if (!canPick) return
    setPicked(cup)
    if (cup === deal.ball) { sounds.go(); onDone?.() } else { sounds.miss(); onFail?.({ cell: slotsNow[cup] }) }
  }

  const showBall = phase === 'show' || answer || picked != null
  const hint = answer ? 'THE BALL WAS UNDER THE LIFTED CUP'
    : phase === 'show' ? 'WATCH THE BALL'
      : phase === 'cover' || phase === 'shuffle' ? 'FOLLOW IT…'
        : picked == null ? (disabled ? '' : 'TAP THE CUP WITH THE BALL') : picked === deal.ball ? 'FOUND IT!' : 'NOT THAT ONE'

  const u = width / deal.cups                 // one slot, in px
  const tableH = u * DEPTH
  const cupW = u * CUP_W
  const cupH = u * CUP_H
  const stageH = Math.round(tableH * Math.cos((TILT * Math.PI) / 180) + cupH * 1.25 + u * 0.2)

  return (
    <div className="w-full max-w-sm mx-auto space-y-3">
      <div className="relative bg-retro-surface border-2 border-retro-border rounded px-2 pt-3 pb-4">
        {phase === 'countdown' && <CountdownCover msLeft={left} label={`LEVEL ${level} · ${deal.cups} CUPS`} />}
        <div ref={stageRef} className="relative w-full" style={{ height: stageH, perspective: width * 1.7, perspectiveOrigin: '50% 12%' }}>
          <div
            className="absolute left-0 bottom-0 w-full rounded border border-retro-border bg-retro-structure/40"
            style={{ height: tableH, transformStyle: 'preserve-3d', transformOrigin: '50% 100%', transform: `rotateX(${TILT}deg)` }}
          >
            {Array.from({ length: deal.cups }, (_, cup) => {
              const pose = cupPose(deal, cup, at, swapMs)
              const x = (pose.slot + 0.5) * u
              const y = tableH * (BASE_Y + pose.depth * SWING)
              const lifted = phase === 'show' || (answer && cup === deal.ball) || picked === cup
              const hasBall = cup === deal.ball
              const hop = pose.hop * u * HOP
              return (
                <div
                  key={cup}
                  className="absolute"
                  style={{ left: x - cupW / 2, top: y, width: cupW, height: 0, transformStyle: 'preserve-3d' }}
                >
                  <span
                    className="absolute rounded-full bg-retro-bg transition-[opacity,transform] duration-base ease-standard motion-reduce:transition-none"
                    style={{
                      left: -cupW * 0.05, width: cupW * 1.1, top: -cupW * 0.17, height: cupW * 0.34,
                      opacity: (lifted ? 0.28 : 0.5) - pose.hop * 0.22,
                      transform: `scale(${1 + pose.hop * 0.22 + (lifted ? 0.1 : 0)})`,
                      filter: 'blur(2px)',
                    }}
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    disabled={!canPick}
                    onClick={() => pick(cup)}
                    aria-label={`cup ${slotsNow[cup] + 1} of ${deal.cups}${lifted ? (hasBall ? ', ball here' : ', empty') : ''}`}
                    className={cn(
                      'absolute left-0 bottom-0 block p-0 border-0 bg-transparent',
                      canPick && 'cursor-pointer press',
                      picked === cup && cup !== deal.ball && 'opacity-80',
                    )}
                    style={{ width: cupW, height: cupH, transformOrigin: '50% 100%', transform: `rotateX(${-TILT}deg)` }}
                  >
                    {showBall && hasBall && lifted && (
                      <span className="absolute left-1/2 bottom-[2%] block -translate-x-1/2" style={{ width: cupW * 0.42, height: cupW * 0.42 }}>
                        <Ball />
                      </span>
                    )}
                    <span className="absolute inset-0 block" style={{ transform: `translateY(${-hop}px)` }}>
                      <span
                        className="block h-full w-full transition-transform duration-base ease-standard motion-reduce:transition-none"
                        style={{ transform: lifted ? `translateY(${-cupH * LIFT}px)` : 'none' }}
                      >
                        <CupArt />
                      </span>
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <BoardHint tone={picked != null && picked !== deal.ball ? 'danger' : picked === deal.ball ? 'win' : phase === 'recall' ? 'text' : 'cta'}>
        {hint}
      </BoardHint>
    </div>
  )
}
