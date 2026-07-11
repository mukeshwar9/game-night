import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { CR_COLS, CR_CELL_COUNT, criticalMass, decodeCell, applyPlacement } from '../lib/chainReactionLogic'
import { sounds } from '../lib/sounds'

// Small orb dots rendered inside each cell
function OrbDots({ count, symbol, nearCritical }) {
  const color = symbol === 'X' ? 'bg-retro-p1 shadow-neon-p1' : 'bg-retro-p2 shadow-neon-p2'
  // Cap visual orbs at 3 (display only)
  const dots = Math.min(count, 3)
  const layouts = {
    1: ['50% 50%'],
    2: ['30% 50%', '70% 50%'],
    3: ['50% 25%', '25% 70%', '75% 70%'],
  }
  const positions = layouts[dots] ?? layouts[1]
  return (
    <div className="relative w-full h-full">
      {positions.map((pos, i) => {
        const [left, top] = pos.split(' ')
        return (
          <span
            key={i}
            className={cn('absolute w-[28%] h-[28%] rounded-full -translate-x-1/2 -translate-y-1/2', color)}
            style={{
              left,
              top,
              ...(nearCritical ? {} : {}),
              animation: nearCritical ? 'pong-ball-pulse 0.6s ease-in-out infinite' : undefined,
            }}
          />
        )
      })}
    </div>
  )
}

export default function ChainReactionBoard({ board, onMove, disabled, currentTurn, crLastMove }) {
  const prevBoardRef = useRef(null)
  const [displayBoard, setDisplayBoard] = useState(board)
  // Set of indices currently exploding this wave (for flash overlay)
  const [explodingSet, setExplodingSet] = useState(new Set())
  const [isReplaying, setIsReplaying] = useState(false)
  const timersRef = useRef([])

  useEffect(() => {
    const prevBoard = prevBoardRef.current

    // Always cancel pending timers when board prop changes
    timersRef.current.forEach(t => clearTimeout(t))
    timersRef.current = []

    const shouldReplay =
      crLastMove != null &&
      prevBoard != null &&
      prevBoard.join(',') !== board.join(',')

    if (shouldReplay) {
      // Determine who placed (the mover): look at the crLastMove cell in the new board
      // After settling it might be empty due to explosion, so look at prevBoard owner
      // or just try X first then O.
      const prevCell = prevBoard[crLastMove]
      // The mover is the one who isn't in prevBoard at that cell
      // If prevBoard[crLastMove] is empty or opponent, mover is the current player who just went
      // We can determine by seeing who's orb count increased: check currentTurn which has already flipped
      // So the mover is the opposite of currentTurn
      const moverSymbol = currentTurn === 'X' ? 'O' : 'X'

      // Validate: prevBoard must allow placing at crLastMove for moverSymbol
      const prevOwner = prevCell ? prevCell[0] : null
      if (prevOwner && prevOwner !== moverSymbol) {
        // Unexpected state, just sync
        setDisplayBoard(board)
        setExplodingSet(new Set())
        setIsReplaying(false)
        prevBoardRef.current = board
        return
      }

      const { steps } = applyPlacement(prevBoard, crLastMove, moverSymbol)

      setIsReplaying(true)
      setExplodingSet(new Set())

      // Show placement immediately (the placed cell pops via key change in displayBoard)
      const postPlacement = [...prevBoard]
      const { count: c0 } = decodeCell(prevBoard[crLastMove])
      postPlacement[crLastMove] = `${moverSymbol}${c0 + 1}`
      setDisplayBoard(postPlacement)

      sounds.drop()

      // Simulate board through each wave
      let currentSimBoard = postPlacement

      steps.forEach((step, waveIdx) => {
        const t = setTimeout(() => {
          // Apply this wave to currentSimBoard
          const nextBoard = [...currentSimBoard]

          // Fire exploding cells
          for (const idx of step.exploded) {
            const cm = criticalMass(idx)
            const { owner, count } = decodeCell(nextBoard[idx])
            if (count >= cm) {
              nextBoard[idx] = count - cm > 0 ? `${owner}${count - cm}` : ''
            }
          }
          // Apply conversions
          for (const idx of step.converted) {
            const { count: nc } = decodeCell(nextBoard[idx])
            nextBoard[idx] = `${moverSymbol}${nc + 1}`
          }

          currentSimBoard = nextBoard
          setDisplayBoard([...nextBoard])
          setExplodingSet(new Set(step.exploded))
          sounds.hit(waveIdx)

          // Clear flash after 140ms
          const clearT = setTimeout(() => {
            setExplodingSet(new Set())
          }, 140)
          timersRef.current.push(clearT)
        }, (waveIdx + 1) * 140)
        timersRef.current.push(t)
      })

      // Final: ensure we land exactly on the settled board
      const finalT = setTimeout(() => {
        setDisplayBoard(board)
        setExplodingSet(new Set())
        setIsReplaying(false)
      }, (steps.length + 1) * 140)
      timersRef.current.push(finalT)
    } else {
      setDisplayBoard(board)
      setExplodingSet(new Set())
      setIsReplaying(false)
    }

    prevBoardRef.current = board
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board])

  // Compute which cells the current player can legally click.
  const legalSet = new Set()
  if (!disabled && !isReplaying && currentTurn) {
    for (let i = 0; i < CR_CELL_COUNT; i++) {
      const cell = board[i]
      if (cell === '' || cell[0] === currentTurn) legalSet.add(i)
    }
  }

  return (
    <div className="w-full max-w-[280px] mx-auto">
      <div
        className={cn(
          'border-2 border-retro-border rounded p-1 sm:p-1.5 transition-all duration-200',
          disabled && 'opacity-60 saturate-50',
        )}
        style={{
          background: 'radial-gradient(circle at 50% 40%, rgb(var(--c-structure) / 0.18), rgb(var(--c-surface)) 70%)',
        }}
      >
        <div
          className="grid gap-[1.5px]"
          style={{ gridTemplateColumns: `repeat(${CR_COLS}, minmax(0, 1fr))` }}
        >
          {displayBoard.map((cell, i) => {
            const { owner, count } = decodeCell(cell)
            const cm = criticalMass(i)
            const isLegal = legalSet.has(i)
            const nearCritical = owner && count >= cm - 1
            const isExploding = explodingSet.has(i)
            const row = Math.floor(i / CR_COLS)
            const col = i % CR_COLS

            return (
              <button
                key={i}
                aria-label={`cr-cell-${row}-${col}`}
                disabled={!isLegal}
                onClick={() => isLegal && onMove(i)}
                className={cn(
                  'aspect-square relative rounded-sm overflow-hidden',
                  'border transition-all duration-100',
                  owner === 'X'
                    ? 'bg-retro-tint-p1 border-retro-p1/30'
                    : owner === 'O'
                      ? 'bg-retro-tint-p2 border-retro-p2/30'
                      : 'bg-retro-deep border-retro-border/20',
                  isLegal
                    ? currentTurn === 'X'
                      ? 'hover:border-retro-p1/60 hover:bg-retro-p1/10 cursor-pointer'
                      : 'hover:border-retro-p2/60 hover:bg-retro-p2/10 cursor-pointer'
                    : 'cursor-default',
                  // M-47: persistent marker on the last-played cell, once the
                  // chain-reaction replay has settled (avoids fighting the
                  // explosion flash overlay mid-cascade).
                  !isReplaying && i === crLastMove && 'ring-2 ring-inset ring-retro-cta/70',
                )}
              >
                {/* Explosion flash overlay */}
                {isExploding && (
                  <span
                    className="absolute inset-0 z-10 pointer-events-none"
                    style={{ animation: 'win-flash 0.14s ease-out forwards' }}
                  />
                )}

                {owner && count > 0 ? (
                  // Key by cell string so any count/owner change re-mounts → re-pops
                  <span
                    key={cell}
                    className="absolute inset-0"
                    style={{ animation: 'place-pop 0.2s ease-out', display: 'block' }}
                  >
                    <OrbDots count={count} symbol={owner} nearCritical={!!nearCritical} />
                    {/* Burst overlay on converted cells during explosion */}
                    {isExploding && (
                      <span
                        className="absolute inset-0 z-20 pointer-events-none"
                        style={{ animation: 'pixel-burst 0.25s ease-out forwards' }}
                      />
                    )}
                  </span>
                ) : isLegal ? (
                  <span
                    className={cn(
                      'absolute inset-0 flex items-center justify-center',
                      'text-[8px] opacity-20',
                      currentTurn === 'X' ? 'text-retro-p1' : 'text-retro-p2',
                    )}
                  >
                    +
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-1.5 flex items-center justify-center gap-3 font-pixel text-[10px]">
        <span className="text-retro-p1 text-glow-p1">
          X {board.filter(c => c && c[0] === 'X').length}
        </span>
        <span className="text-retro-dim">cells</span>
        <span className="text-retro-p2 text-glow-p2">
          {board.filter(c => c && c[0] === 'O').length} O
        </span>
      </div>
    </div>
  )
}
