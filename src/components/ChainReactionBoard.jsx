import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { CR_COLS, CR_ROWS, criticalMass, decodeCell, applyPlacement } from '../lib/chainReactionLogic'
import { sounds } from '../lib/sounds'
import { crSymbolColor } from './crColors'
import { cellLabel, countLabel } from '../lib/a11yLabels'
import { isReducedMotion } from '../hooks/useMotionPref'

// Small orb dots rendered inside each cell
function OrbDots({ count, symbol, nearCritical }) {
  const color = crSymbolColor(symbol).orb
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
      {/* 4+ orbs render identically to 3 above (visual cap) — a numeric badge keeps the
          real count legible instead of silently looking the same as a 3-stack. */}
      {count >= 4 && (
        <span
          className={cn(
            'absolute bottom-0 right-0 font-pixel text-[8px] leading-none px-[2px] rounded-sm',
            crSymbolColor(symbol).text,
          )}
          style={{ background: 'rgb(var(--c-surface) / 0.85)' }}
        >
          {count}
        </span>
      )}
    </div>
  )
}

// Cap how many explosion waves we actually animate. A full-board domination cascade can
// run to MAX_WAVES (cellCount * 10 in chainReactionLogic) — animating every one of those
// at 140ms/wave would lock the board for well over a minute. Play the first
// MAX_REPLAY_WAVES for drama, then jump straight to the settled board.
const MAX_REPLAY_WAVES = 12

// Seat name for the score line: X/O in 2P, P1–P4 in the 4-player roster.
const P_LABEL = { X: 'P1', O: 'P2', A: 'P3', B: 'P4' }
function seatName(sym, symbols) {
  return symbols.length > 2 ? (P_LABEL[sym] ?? sym) : sym
}

export default function ChainReactionBoard({
  board, onMove, disabled, currentTurn, crLastMove,
  cols = CR_COLS, rows = CR_ROWS,
  symbols = ['X', 'O'],
}) {
  const dims = { cols, rows }
  const cellCount = cols * rows
  const prevBoardRef = useRef(null)
  const [displayBoard, setDisplayBoard] = useState(board)
  // Set of indices currently exploding this wave (for flash overlay)
  const [explodingSet, setExplodingSet] = useState(new Set())
  const [isReplaying, setIsReplaying] = useState(false)
  const timersRef = useRef([])
  // crLastMove is { index, by } — `by` names the mover explicitly, so replay never has to
  // infer it from currentTurn (which is unreliable once the game has finished: the last
  // mover's cascade should still animate even though currentTurn has already flipped past
  // them and the room is no longer "playing").
  const lastMoveIndex = crLastMove?.index ?? null

  useEffect(() => {
    const prevBoard = prevBoardRef.current

    // Always cancel pending timers when board prop changes
    timersRef.current.forEach(t => clearTimeout(t))
    timersRef.current = []

    const isNewMove =
      lastMoveIndex != null &&
      crLastMove?.by &&
      prevBoard != null &&
      prevBoard.join(',') !== board.join(',')
    // Reduced motion (Settings or OS): skip the staged wave replay and land
    // straight on the settled board. Read at call time so a mid-game toggle
    // applies from the next move on.
    const shouldReplay = isNewMove && !isReducedMotion()

    if (shouldReplay) {
      const moverSymbol = crLastMove.by

      // Validate: prevBoard must allow placing at lastMoveIndex for moverSymbol
      const prevCell = prevBoard[lastMoveIndex]
      const prevOwner = prevCell ? prevCell[0] : null
      if (prevOwner && prevOwner !== moverSymbol) {
        // Unexpected state, just sync
        setDisplayBoard(board)
        setExplodingSet(new Set())
        setIsReplaying(false)
        prevBoardRef.current = board
        return
      }

      const { steps } = applyPlacement(prevBoard, lastMoveIndex, moverSymbol, dims)
      const animSteps = steps.slice(0, MAX_REPLAY_WAVES)

      setIsReplaying(true)
      setExplodingSet(new Set())

      // Show placement immediately (the placed cell pops via key change in displayBoard)
      const postPlacement = [...prevBoard]
      const { count: c0 } = decodeCell(prevBoard[lastMoveIndex])
      postPlacement[lastMoveIndex] = `${moverSymbol}${c0 + 1}`
      setDisplayBoard(postPlacement)

      sounds.drop()

      // Simulate board through each wave (capped — see MAX_REPLAY_WAVES)
      let currentSimBoard = postPlacement

      animSteps.forEach((step, waveIdx) => {
        const t = setTimeout(() => {
          // Apply this wave to currentSimBoard
          const nextBoard = [...currentSimBoard]

          // Fire exploding cells
          for (const idx of step.exploded) {
            const cm = criticalMass(idx, cols, rows)
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

      // Final: ensure we land exactly on the settled board — whether the cascade fully
      // played out or got cut short by the MAX_REPLAY_WAVES cap.
      const finalT = setTimeout(() => {
        setDisplayBoard(board)
        setExplodingSet(new Set())
        setIsReplaying(false)
      }, (animSteps.length + 1) * 140)
      timersRef.current.push(finalT)
    } else {
      if (isNewMove) sounds.drop()
      setDisplayBoard(board)
      setExplodingSet(new Set())
      setIsReplaying(false)
    }

    prevBoardRef.current = board
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board])

  // Compute which cells the current player can legally click. `symbols`
  // carries the variant's roster so unknown-turn rooms degrade to no-op.
  const legalSet = new Set()
  if (!disabled && !isReplaying && currentTurn && symbols.includes(currentTurn)) {
    for (let i = 0; i < cellCount; i++) {
      const cell = board[i]
      if (cell === '' || cell[0] === currentTurn) legalSet.add(i)
    }
  }

  // Tall variants (6×8): cap the width by viewport height so the board and
  // the status line below it both fit on a 667px phone.
  const fitStyle = rows > cols
    ? { maxWidth: `max(240px, calc((100dvh - 320px) * ${cols / rows}))` }
    : undefined

  return (
    <div className="w-full max-w-sm mx-auto" style={fitStyle}>
      <div
        className={cn(
          'border-2 border-retro-border rounded p-1 sm:p-1.5 transition-all duration-200',
          disabled && 'board-idle',
        )}
        style={{
          background: 'radial-gradient(circle at 50% 40%, rgb(var(--c-structure) / 0.18), rgb(var(--c-surface)) 70%)',
        }}
      >
        <div
          className="grid gap-[1.5px]"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {displayBoard.map((cell, i) => {
            const { owner, count } = decodeCell(cell)
            const cm = criticalMass(i, cols, rows)
            const isLegal = legalSet.has(i)
            const nearCritical = owner && count >= cm - 1
            const isExploding = explodingSet.has(i)
            const row = Math.floor(i / cols)
            const col = i % cols

            return (
              <button
                key={i}
                data-testid={`cr-cell-${row}-${col}`}
                aria-label={cellLabel({
                  row, col,
                  occupant: owner && count > 0 && `${owner}, ${countLabel(count, 'orb')}`,
                  extra: [
                    `explodes at ${cm}`,
                    !isReplaying && i === lastMoveIndex && 'last move',
                  ],
                })}
                disabled={!isLegal}
                onClick={() => isLegal && onMove(i)}
                className={cn(
                  'aspect-square relative rounded-sm overflow-hidden',
                  'border transition-all duration-100',
                  owner
                    ? crSymbolColor(owner).cell
                    : 'bg-retro-deep border-retro-border/20',
                  isLegal ? crSymbolColor(currentTurn).hover : 'cursor-default',
                  // M-47: persistent marker on the last-played cell, once the
                  // chain-reaction replay has settled (avoids fighting the
                  // explosion flash overlay mid-cascade).
                  !isReplaying && i === lastMoveIndex && 'ring-2 ring-inset ring-retro-cta/70',
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
                      crSymbolColor(currentTurn).text,
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

      {/* Score — one chip per seat: colour swatch, seat, and a labelled cell
          count (2P keeps X/O; the 4P roster uses the same P1–P4 names as its lobby). */}
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-pixel text-[10px]">
        {symbols.map(sym => {
          const n = board.filter(c => c && c[0] === sym).length
          return (
            <span
              key={sym}
              className="flex items-center gap-1.5"
              aria-label={`${seatName(sym, symbols)}: ${countLabel(n, 'cell')}`}
            >
              <span aria-hidden="true" className={cn('w-2.5 h-2.5 rounded-full', crSymbolColor(sym).orb)} />
              <span className={crSymbolColor(sym).legend}>{seatName(sym, symbols)}</span>
              <span className="text-retro-text">{n}</span>
              <span className="text-retro-dim">{n === 1 ? 'CELL' : 'CELLS'}</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
