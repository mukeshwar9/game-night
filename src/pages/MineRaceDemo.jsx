import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CELL_COUNT, MINES, SAFE_CELLS,
  generateBoard, floodReveal, chordTargets, isComplete, countRevealed,
} from '../lib/minesweeperLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// Solo minesweeper — the MINE RACE board with no opponent. Best time per
// difficulty lives in localStorage. Same theme-token number palette as the
// multiplayer page.

const NUM_COLORS = {
  1: 'text-retro-p1',
  2: 'text-retro-win',
  3: 'text-retro-p2',
  4: 'text-retro-cta',
  5: 'text-retro-danger',
  6: 'text-retro-cta',
  7: 'text-retro-text',
  8: 'text-retro-dim',
}

const BEST_KEY = 'minerace-demo-best'

function readBest() {
  try { return Number(localStorage.getItem(BEST_KEY)) || null } catch { return null }
}

export default function MineRaceDemo() {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2147483647))
  const board = useMemo(() => generateBoard(seed), [seed])

  const [revealed, setRevealed] = useState(() => new Set(board.opening))
  const [flags, setFlags] = useState(() => new Set())
  const [mode, setMode] = useState('reveal')
  const [fatalCell, setFatalCell] = useState(null)
  const [startedAt, setStartedAt] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [best, setBest] = useState(readBest)
  const pressTimerRef = useRef(null)
  const longPressFiredRef = useRef(false)

  // New board → fresh run (render-phase derive-from-prop-change pattern).
  const [prevSeedState, setPrevSeedState] = useState(seed)
  if (prevSeedState !== seed) {
    setPrevSeedState(seed)
    setRevealed(new Set(board.opening))
    setFlags(new Set())
    setFatalCell(null)
    setStartedAt(null)
    setElapsed(0)
  }

  const dead = fatalCell != null
  const done = !dead && isComplete(revealed)
  const racing = startedAt != null && !dead && !done

  useEffect(() => {
    if (!racing) return
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 100)
    return () => clearInterval(id)
  }, [racing, startedAt])

  // First reveal starts the clock; completion records the best time (both in
  // the event path, not effects).
  const applyReveal = (cells) => {
    if (dead || done) return
    if (startedAt == null) {
      // eslint-disable-next-line react-hooks/purity
      setStartedAt(Date.now())
    }
    const fatal = cells.find(c => board.mines[c])
    if (fatal != null) {
      setFatalCell(fatal)
      sounds.bust()
      return
    }
    let next = revealed
    for (const c of cells) next = floodReveal(board.counts, board.mines, next, c)
    if (next.size === revealed.size) return
    setRevealed(next)
    sounds.hit(Math.min(next.size - revealed.size + 1, 10))
    if (isComplete(next)) {
      const t = startedAt != null ? Date.now() - startedAt : 0 // eslint-disable-line react-hooks/purity
      setElapsed(t)
      sounds.win()
      setBest(prev => {
        if (prev == null || t < prev) {
          try { localStorage.setItem(BEST_KEY, String(t)) } catch { /* private mode */ }
          return t
        }
        return prev
      })
    }
  }

  const toggleFlag = (cell) => {
    if (dead || done || revealed.has(cell)) return
    const next = new Set(flags)
    if (next.has(cell)) next.delete(cell)
    else next.add(cell)
    setFlags(next)
  }

  const handleTap = (cell) => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false
      return
    }
    if (mode === 'flag') { toggleFlag(cell); return }
    if (flags.has(cell)) return
    if (revealed.has(cell)) {
      const targets = chordTargets(board.counts, revealed, flags, cell)
      if (targets.length) applyReveal(targets)
      return
    }
    applyReveal([cell])
  }

  const handlePointerDown = (e, cell) => {
    if (e.pointerType === 'mouse' || dead || done) return
    longPressFiredRef.current = false
    clearTimeout(pressTimerRef.current)
    pressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true
      toggleFlag(cell)
      navigator.vibrate?.(20)
    }, 450)
  }

  const cancelPress = () => clearTimeout(pressTimerRef.current)

  const reset = () => setSeed(Math.floor(Math.random() * 2147483647))

  const secs = (ms) => ((ms ?? 0) / 1000).toFixed(1)
  const flaggedMines = [...flags].filter(c => board.mines[c]).length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between font-pixel text-[9px] text-retro-dim">
        <span>⏱ {secs(elapsed)}s</span>
        <span>{countRevealed(revealed)}/{SAFE_CELLS} SAFE</span>
        <span>💣 {MINES - flags.size}</span>
      </div>
      {best != null && (
        <p className="font-pixel text-[8px] text-retro-dim text-center">BEST {secs(best)}s</p>
      )}

      <div className="relative mx-auto" style={{ width: 'min(100%, 26rem)' }}>
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))' }}>
          {Array.from({ length: CELL_COUNT }, (_, cell) => {
            const isRevealed = revealed.has(cell)
            const isFlag = flags.has(cell)
            const isMine = board.mines[cell]
            const showMine = dead && isMine
            const count = board.counts[cell]
            return (
              <button
                key={cell}
                onClick={() => handleTap(cell)}
                onContextMenu={e => { e.preventDefault(); toggleFlag(cell) }}
                onPointerDown={e => handlePointerDown(e, cell)}
                onPointerUp={cancelPress}
                onPointerLeave={cancelPress}
                aria-label={`cell ${cell}`}
                className={cn(
                  'aspect-square flex items-center justify-center rounded-[2px] font-pixel text-[9px] select-none transition-colors',
                  isRevealed
                    ? 'bg-retro-deep'
                    : 'bg-retro-surface hover:bg-retro-border/40 active:bg-retro-border/60',
                  showMine && 'bg-retro-danger/70',
                  fatalCell === cell && 'ring-2 ring-retro-danger',
                )}
              >
                {isFlag && !isRevealed && <span className="text-retro-p2">⚑</span>}
                {showMine && !isFlag && <span>💥</span>}
                {isRevealed && count > 0 && (
                  <span className={NUM_COLORS[count]}>{count}</span>
                )}
              </button>
            )
          })}
        </div>

        {(dead || done) && (
          <div className="absolute inset-0 flex items-center justify-center bg-retro-bg/85 rounded">
            <div className="text-center space-y-2 bg-retro-card border border-retro-border rounded p-4">
              <p className={cn('font-pixel text-xs', done ? 'text-retro-win text-glow-win' : 'text-retro-danger')}>
                {done ? `CLEARED IN ${secs(elapsed)}s` : 'BOOM'}
              </p>
              {done && best != null && elapsed <= best && (
                <p className="font-pixel text-[9px] text-retro-cta">NEW BEST!</p>
              )}
              <button
                onClick={reset}
                className="px-5 py-2 font-pixel text-[10px] border border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 active:scale-95"
              >
                NEW BOARD
              </button>
            </div>
          </div>
        )}
      </div>

      {!dead && !done && (
        <>
          <div className="flex justify-center gap-2">
            <button
              onClick={() => setMode(m => (m === 'reveal' ? 'flag' : 'reveal'))}
              className={cn(
                'px-4 py-1.5 font-pixel text-[9px] rounded border-2 transition-all active:scale-95',
                mode === 'flag'
                  ? 'border-retro-p2 text-retro-p2 shadow-neon-p2'
                  : 'border-retro-border text-retro-dim hover:border-retro-p2/50',
              )}
            >
              {mode === 'flag' ? '⚑ FLAG MODE' : '⛏ DIG MODE'}
            </button>
            <button
              onClick={reset}
              className="px-4 py-1.5 font-pixel text-[9px] border border-retro-border text-retro-dim rounded hover:border-retro-p1/50 active:scale-95"
            >
              RESTART
            </button>
          </div>
          <p className="font-mono text-[10px] text-retro-dim text-center leading-relaxed">
            TAP REVEAL · LONG-PRESS / RIGHT-CLICK FLAG<br />
            TAP A SATISFIED NUMBER TO CHORD · {flaggedMines}/{flags.size} FLAGS CORRECT
          </p>
        </>
      )}
    </div>
  )
}
