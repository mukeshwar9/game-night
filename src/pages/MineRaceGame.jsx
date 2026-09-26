import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, update } from 'firebase/database'
import { db } from '../lib/firebase'
import { getServerNow } from '../hooks/useServerClock'
import RaceShell from '../components/RaceShell'
import {
  COLS, CELL_COUNT, MINES, SAFE_CELLS, MINES_RACE_MS,
  generateBoard, floodReveal, chordTargets, isComplete, countRevealed,
  isMinesDone, minesRaceEntry, minesRaceDecided, minesRow,
} from '../lib/minesweeperLogic'
import { mineCellLabel } from '../lib/a11yLabels'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// Mine Race — N-player race (2–8) on one identical seeded minefield.
// Cleared racers rank by clear time, then racers still sweeping by cells
// cleared, then detonated racers — a mine drops you below everyone who
// didn't hit one. Room flow in RaceShell.
// ANTI-LEAK: only revealed COUNTS go to Firebase; positions stay client-side
// (derived from the round seed) with a sessionStorage copy for reload recovery.

const LONG_PRESS_MS = 450
const SYNC_DEBOUNCE_MS = 150

// Classic 1–8 palette mapped to theme tokens (never hardcoded blue/green/red).
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

const RACE = {
  type: 'minesweeper',
  title: 'MINE RACE',
  sameWhat: 'MINEFIELD',
  rules: [
    `IDENTICAL SEEDED MINEFIELD · ${MINES} MINES · ${SAFE_CELLS} SAFE CELLS`,
    'TAP REVEAL · HOLD / RIGHT-CLICK / F KEY FLAG · TAP A NUMBER TO CHORD',
    'FASTEST CLEAR WINS · HIT A MINE AND YOU’RE OUT',
  ],
  baseMs: MINES_RACE_MS,
  scaled: true,
  entry: minesRaceEntry,
  isDone: isMinesDone,
  decided: minesRaceDecided,
  row: (stats) => minesRow(stats),
}

const storageKey = (gameId, roundId) => `minerace-revealed-${gameId}-${roundId}`

// Own revealed set: client-only. Restored from sessionStorage on reload,
// validated against this round's mines.
function loadRevealed(gameId, roundId, board) {
  const opening = board ? new Set(board.opening) : new Set()
  if (!board) return opening
  try {
    const raw = JSON.parse(sessionStorage.getItem(storageKey(gameId, roundId)) || 'null')
    if (Array.isArray(raw)) {
      for (const i of raw) {
        if (Number.isInteger(i) && i >= 0 && i < CELL_COUNT && !board.mines[i]) opening.add(i)
      }
    }
  } catch { /* private mode */ }
  return opening
}

function MineCell({ i, board, revealed, flags, fatalCell, showMines, canAct, onTap, onFlag, onPressStart, onPressEnd, longPressFiredRef }) {
  const isRevealed = revealed.has(i)
  const isFlagged = flags.has(i)
  const isFatal = fatalCell === i
  const mine = board?.mines?.[i]
  const showMine = mine && showMines
  const n = isRevealed ? (board?.counts?.[i] ?? 0) : 0
  return (
    <button
      disabled={!canAct}
      data-testid={`cell ${i}`}
      aria-label={mineCellLabel({
        row: Math.floor(i / COLS), col: i % COLS,
        revealed: isRevealed, flagged: isFlagged, count: n,
        mine: !!showMine, fatal: isFatal,
      })}
      onKeyDown={(e) => {
        // Keyboard flag: F toggles the flag on the focused cell (Enter /
        // Space already reveal via the native button click).
        if (e.key !== 'f' && e.key !== 'F') return
        if (e.metaKey || e.ctrlKey || e.altKey) return
        e.preventDefault()
        if (canAct) onFlag(i)
      }}
      className={cn(
        'aspect-square flex items-center justify-center rounded-[2px] border font-pixel text-[10px] leading-none select-none',
        !isRevealed && !showMine && 'bg-retro-card border-retro-border cursor-pointer active:bg-retro-surface',
        !isRevealed && showMine && 'bg-retro-deep border-transparent',
        isFatal && 'bg-retro-danger border-retro-danger ring-1 ring-retro-danger',
        isRevealed && n === 0 && !showMine && 'bg-retro-deep border-transparent',
        isRevealed && n > 0 && cn('bg-retro-surface border-transparent', NUM_COLORS[n]),
      )}
      onClick={() => onTap?.(i)}
      onContextMenu={(e) => {
        e.preventDefault()
        // Android fires both the long-press timer path AND a native
        // contextmenu event for the same press — skip the redundant toggle.
        if (longPressFiredRef?.current) return
        if (canAct) onFlag(i)
      }}
      onPointerDown={(e) => onPressStart?.(e, i)}
      onPointerUp={onPressEnd}
      onPointerLeave={onPressEnd}
      onPointerCancel={onPressEnd}
    >
      {showMine ? (isFatal ? '💥' : '💣') : isFlagged ? '🚩' : isRevealed && n > 0 ? n : ''}
    </button>
  )
}

function Grid({ children, interactive }) {
  // Break out of the page's p-4 gutter on phones and keep a ~38px tap-target
  // floor; too-narrow screens scroll the grid instead of cramming cells.
  return (
    <div className="relative -mx-4 sm:mx-0">
      <div className="overflow-x-auto">
        <div
          className={cn('grid gap-[2px] bg-retro-deep p-[3px] rounded border border-retro-border select-none mx-auto', !interactive && 'pointer-events-none')}
          style={{ touchAction: 'manipulation', gridTemplateColumns: 'repeat(12, minmax(38px, 1fr))', maxWidth: '32rem' }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function MinesRacer({ gameId, round, myStats, statsPath }) {
  const seed = round.seed
  const board = useMemo(() => (seed != null ? generateBoard(seed) : null), [seed])
  const [revealed, setRevealed] = useState(() => loadRevealed(gameId, round.id, board))
  const [flags, setFlags] = useState(() => new Set()) // local-only player aid
  const [mode, setMode] = useState('reveal') // 'reveal' | 'flag' fallback
  const [fatalCell, setFatalCell] = useState(null)
  const dead = !!myStats?.dead || fatalCell != null
  const done = !!myStats?.done || (!dead && isComplete(revealed))
  const canAct = !dead && !done

  const revealedRef = useRef(revealed)
  const flagsRef = useRef(flags)
  const endedRef = useRef(!!myStats?.dead || !!myStats?.done)
  const syncTimerRef = useRef(null)
  const pressTimerRef = useRef(null)
  const longPressFiredRef = useRef(false)

  useEffect(() => { revealedRef.current = revealed }, [revealed])
  useEffect(() => { flagsRef.current = flags }, [flags])
  useEffect(() => () => { clearTimeout(pressTimerRef.current); clearTimeout(syncTimerRef.current) }, [])

  // Persist own revealed positions locally (reload recovery + final board). Never Firebase.
  useEffect(() => {
    try { sessionStorage.setItem(storageKey(gameId, round.id), JSON.stringify([...revealed])) } catch { /* private mode */ }
  }, [revealed, gameId, round.id])

  // Register as present with the opening's count.
  useEffect(() => {
    if (!myStats) update(ref(db, statsPath), { revealed: countRevealed(revealedRef.current) }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per round (the Racer is keyed by round id)
  }, [])

  const flushSync = (count) => {
    clearTimeout(syncTimerRef.current)
    update(ref(db, statsPath), { revealed: count }).catch(() => {})
  }

  const scheduleSync = (count) => {
    clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => flushSync(count), SYNC_DEBOUNCE_MS)
  }

  const handleDeath = (cell) => {
    if (endedRef.current) return
    endedRef.current = true
    setFatalCell(cell)
    sounds.bust()
    clearTimeout(syncTimerRef.current)
    update(ref(db, statsPath), { revealed: countRevealed(revealedRef.current), dead: true }).catch(() => {})
  }

  const handleComplete = () => {
    if (endedRef.current) return
    endedRef.current = true
    sounds.win()
    clearTimeout(syncTimerRef.current)
    update(ref(db, statsPath), { revealed: SAFE_CELLS, done: true, doneAt: getServerNow() }).catch(() => {})
  }

  const applyReveal = (cells) => {
    if (!board || endedRef.current) return
    const { mines, counts } = board
    const fatal = cells.find(c => mines[c])
    if (fatal != null) { handleDeath(fatal); return }
    let next = revealedRef.current
    for (const c of cells) next = floodReveal(counts, mines, next, c)
    const gained = next.size - revealedRef.current.size
    if (gained === 0) return
    revealedRef.current = next
    setRevealed(next)
    if (gained > 1) sounds.hit(Math.min(gained + 1, 10))
    if (isComplete(next)) handleComplete()
    else scheduleSync(next.size)
  }

  const toggleFlag = (cell) => {
    if (!board || revealedRef.current.has(cell)) return
    const next = new Set(flagsRef.current)
    if (next.has(cell)) next.delete(cell)
    else next.add(cell)
    flagsRef.current = next
    setFlags(next)
  }

  const handleTap = (cell) => {
    if (!canAct || !board) return
    if (longPressFiredRef.current) { longPressFiredRef.current = false; return }
    if (mode === 'flag') { toggleFlag(cell); return }
    if (flagsRef.current.has(cell)) return
    if (revealedRef.current.has(cell)) {
      const targets = chordTargets(board.counts, revealedRef.current, flagsRef.current, cell)
      if (targets.length) applyReveal(targets)
      return
    }
    applyReveal([cell])
  }

  // Long-press flags on touch; mouse uses right-click instead.
  const handlePressStart = (e, cell) => {
    if (e.pointerType === 'mouse' || !canAct) return
    longPressFiredRef.current = false
    clearTimeout(pressTimerRef.current)
    pressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true
      toggleFlag(cell)
      navigator.vibrate?.(20)
    }, LONG_PRESS_MS)
  }

  const cancelPress = () => clearTimeout(pressTimerRef.current)

  return (
    <div className="space-y-2">
      <div className="relative">
        <Grid interactive>
          {board && Array.from({ length: CELL_COUNT }, (_, i) => (
            <MineCell
              key={i} i={i} board={board} revealed={revealed} flags={flags}
              fatalCell={fatalCell} showMines={fatalCell != null} canAct={canAct}
              onTap={handleTap} onFlag={toggleFlag}
              onPressStart={handlePressStart} onPressEnd={cancelPress}
              longPressFiredRef={longPressFiredRef}
            />
          ))}
        </Grid>
        {dead && (
          <div className="absolute inset-0 flex items-center justify-center bg-retro-bg/80 rounded">
            <p className="font-pixel text-[10px] text-retro-danger text-glow-danger bg-retro-card border border-retro-danger/60 rounded px-4 py-3 text-center">
              💥 YOU HIT A MINE<br />YOU&apos;RE OUT — {countRevealed(revealed)}/{SAFE_CELLS}
            </p>
          </div>
        )}
        {!dead && done && (
          <div className="absolute inset-0 flex items-center justify-center bg-retro-bg/80 rounded">
            <p className="font-pixel text-[10px] text-retro-win text-glow-win bg-retro-card border border-retro-win/60 rounded px-4 py-3 text-center">
              ✓ ALL {SAFE_CELLS} CLEARED
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 max-w-md mx-auto">
        <button
          onClick={() => setMode(m => (m === 'reveal' ? 'flag' : 'reveal'))}
          disabled={!canAct}
          aria-pressed={mode === 'flag'}
          className={cn(
            'px-3 py-2 min-h-11 font-pixel text-[9px] rounded border active:scale-95 disabled:opacity-50',
            mode === 'flag'
              ? 'bg-retro-tint-p2 border-retro-p2 text-retro-p2'
              : 'bg-retro-card border-retro-border text-retro-text hover:border-retro-cta',
          )}
        >
          {mode === 'flag' ? '🚩 FLAG MODE' : '⛏ REVEAL MODE'}
        </button>
        <span className="font-pixel text-[8px] text-retro-dim tabular-nums">
          🚩 {flags.size} · HOLD OR F TO FLAG · TAP № TO CHORD
        </span>
      </div>
    </div>
  )
}

// The finished round's minefield: my own sweep plus every mine.
function MinesFinal({ gameId, round }) {
  const seed = round?.seed ?? null
  const board = useMemo(() => (seed != null ? generateBoard(seed) : null), [seed])
  const [revealed] = useState(() => loadRevealed(gameId, round?.id, board))
  if (!board) return null
  return (
    <div className="space-y-1">
      <p className="font-pixel text-[8px] text-retro-dim text-center">FINAL MINEFIELD</p>
      <Grid interactive={false}>
        {Array.from({ length: CELL_COUNT }, (_, i) => (
          <MineCell key={i} i={i} board={board} revealed={revealed} flags={new Set()} fatalCell={null} showMines canAct={false} />
        ))}
      </Grid>
    </div>
  )
}

export default function MineRaceGame(props) {
  return <RaceShell {...props} race={RACE} Racer={MinesRacer} Final={MinesFinal} />
}
