import { useEffect, useRef, useState } from 'react'

// Faux arcade "RAM check" addresses — pure atmosphere, no data.
const RAM_ROWS = [
  '0x0000-1FFF  OK',
  '0x2000-3FFF  OK',
  '0x4000-5FFF  OK',
  '0x6000-7FFF  OK',
]

const HI_SCORES = [
  ['AAA', '999900'],
  ['POO', '887700'],
  ['JAM', '765400'],
  ['K00', '654300'],
  ['LOL', '543200'],
  ['WIN', '432100'],
  ['XYZ', '321000'],
  ['BOT', '210000'],
]

const SEGMENTS = 12

function PixelCoin({ size = 18, className = '' }) {
  // Pixel-art coin — themed via style props (SVG can't read CSS vars).
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
      className={className}
      style={{ imageRendering: 'pixelated' }}
      aria-hidden
    >
      {/* outer ring */}
      <g style={{ fill: 'rgb(var(--c-cta))' }}>
        <rect x="2" y="1" width="4" height="1" />
        <rect x="1" y="2" width="1" height="4" />
        <rect x="6" y="2" width="1" height="4" />
        <rect x="2" y="6" width="4" height="1" />
      </g>
      {/* face */}
      <g style={{ fill: 'rgb(var(--c-tint-cta))' }}>
        <rect x="2" y="2" width="4" height="4" />
      </g>
      {/* shine */}
      <rect x="3" y="2" width="1" height="1" style={{ fill: 'rgb(var(--c-win))' }} />
      <rect x="2" y="3" width="1" height="1" style={{ fill: 'rgb(var(--c-win))' }} />
    </svg>
  )
}

function SegBar() {
  return (
    <div className="flex gap-[2px]">
      {Array.from({ length: SEGMENTS }).map((_, i) => (
        <div
          key={i}
          className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-[1px] arcade-load-seg"
          style={{
            backgroundColor: 'rgb(var(--c-cta))',
            boxShadow: '0 0 6px rgb(var(--c-cta))',
            animationDelay: `${i * 90}ms`,
          }}
        />
      ))}
    </div>
  )
}

function Marquee() {
  const items = [...HI_SCORES, ...HI_SCORES] // duplicate for seamless loop
  return (
    <div className="w-full max-w-[18rem] overflow-hidden">
      <div className="flex gap-6 whitespace-nowrap arcade-marquee text-[7px] sm:text-[8px] font-pixel text-retro-dim">
        {items.map(([name, score], i) => (
          <span key={i} className="flex gap-2">
            <span className="text-retro-p1">{name}</span>
            <span className="tracking-wider">{score}</span>
            <span className="text-retro-text/30">·</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export default function ArcadeLoader({ variant = 'boot', ready = false, onDone }) {
  const [ramRows, setRamRows] = useState([])
  const [naturalDone, setNaturalDone] = useState(false)
  const timers = useRef([])
  const beatTimer = useRef(null)
  const onDoneRef = useRef(onDone)
  const onDoneFired = useRef(false)

  useEffect(() => { onDoneRef.current = onDone })

  // RAM-check row reveal — always scheduled on mount; if `ready` is already
  // true these timers are cancelled before any of them fire (see the effect
  // below, which runs right after this one on the same commit), so this
  // never visibly plays for a warm boot. `done`/displayed rows below are
  // derived from `ready` directly rather than mirrored into state, so the
  // fast-forward never needs a setState of its own.
  useEffect(() => {
    if (variant !== 'boot') return
    const ms = 100
    RAM_ROWS.forEach((row, i) => {
      timers.current.push(setTimeout(() => setRamRows(r => [...r, row]), i * ms))
    })
    timers.current.push(setTimeout(() => setNaturalDone(true), RAM_ROWS.length * ms + 200))
    return () => { timers.current.forEach(clearTimeout); timers.current = [] }
  }, [variant])

  // Fast-forward + handoff — fires once `ready` is true, whether that's on
  // mount (warm auth) or mid-sequence/after the attract loop starts (cold
  // auth). Cancels any still-pending row timers, holds one READY beat, then
  // calls onDone exactly once.
  useEffect(() => {
    if (variant !== 'boot' || !ready) return
    timers.current.forEach(clearTimeout)
    timers.current = []
    beatTimer.current = setTimeout(() => {
      if (onDoneFired.current) return
      onDoneFired.current = true
      onDoneRef.current?.()
    }, 150)
    return () => clearTimeout(beatTimer.current)
  }, [variant, ready])

  const done = naturalDone || ready
  const displayRows = ready ? RAM_ROWS : ramRows

  // Realtime variant — just coin + blink, sized to replace one <p> line
  if (variant === 'realtime') {
    return (
      <div className="flex items-center gap-2">
        <PixelCoin size={14} className="arcade-coin-spin" />
        <p className="font-pixel text-[9px] text-retro-dim arcade-blink">
          INSERT COIN — PRESS START
        </p>
      </div>
    )
  }

  // Inline variant — compact, fits today's loader footprint
  if (variant === 'inline') {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          <PixelCoin size={16} className="arcade-coin-spin" />
          <SegBar />
        </div>
        <p className="font-pixel text-[9px] text-retro-dim arcade-blink">INSERT COIN</p>
      </div>
    )
  }

  // Boot variant — full attract sequence
  return (
    <div className="min-h-screen bg-retro-bg flex flex-col items-center justify-center gap-4 px-4">
      {/* RAM check window */}
      <div
        className="w-full max-w-[18rem] font-mono text-[8px] sm:text-[9px] leading-[1.4] p-3 rounded border bg-retro-card/60 overflow-hidden"
        style={{ borderColor: 'rgb(var(--c-border))' }}
      >
        {!done ? (
          <div className="space-y-0.5 min-h-[8.4rem]">
            {displayRows.map((row, i) => (
              <div key={i} className="text-retro-win" style={{ animation: 'ram-typewriter 80ms steps(1)' }}>
                <span className="text-retro-p1">{row.split('  ')[0]}</span>
                <span className="text-retro-dim">  </span>
                <span className="text-retro-win">{row.split('  ')[1]}</span>
              </div>
            ))}
            <span className="inline-block w-1.5 h-[9px] bg-retro-p1 align-middle arcade-blink" />
          </div>
        ) : (
          <div className="min-h-[8.4rem] flex flex-col gap-1 justify-center">
            <p className="font-pixel text-[8px] text-retro-win tracking-widest">READY</p>
            <p className="font-pixel text-[7px] text-retro-dim">SYSTEM OK</p>
          </div>
        )}
      </div>

      {/* Attract-mode cluster (fades in after RAM check) */}
      <div
        className="flex flex-col items-center gap-3 transition-opacity duration-300"
        style={{ opacity: done ? 1 : 0 }}
      >
        <p className="font-pixel text-base sm:text-lg tracking-[0.15em] text-retro-cta text-glow-cta arcade-blink">
          INSERT COIN
        </p>
        <div className="flex items-center gap-2">
          <PixelCoin size={18} className="arcade-coin-spin" />
          <SegBar />
        </div>
        <p className="font-pixel text-[7px] text-retro-dim tracking-widest">
          NOW LOADING<span className="arcade-dots"><span>.</span><span>.</span><span>.</span></span>
        </p>
      </div>

      <Marquee />
    </div>
  )
}