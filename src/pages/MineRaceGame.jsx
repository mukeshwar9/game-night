import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import GameSwitcher from '../components/GameSwitcher'
import GameStatus from '../components/GameStatus'
import SpectatorCard from '../components/SpectatorCard'
import Avatar from '../components/Avatar'
import OfflineNotice from '../components/loading/OfflineNotice'
import {
  CELL_COUNT, MINES, SAFE_CELLS,
  generateBoard, floodReveal, chordTargets, isComplete, countRevealed,
} from '../lib/minesweeperLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'
import { toast } from 'sonner'

// Seeded-race page — architecture mirrors WordHuntGame/TypingGame:
// READY → shared minesStartedAt → 3s countdown → race on identical boards.
// ANTI-LEAK: only revealed COUNTS go to Firebase; positions stay client-side
// (derived from minesSeed) with a sessionStorage copy for reload recovery.

const COUNTDOWN_MS = 3000
const LONG_PRESS_MS = 450
const SYNC_DEBOUNCE_MS = 150
const MATCH_WINS = 3

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

function RaceBar({ label, val, max, textClass, barClass }) {
  const pct = max > 0 ? Math.min(100, Math.round((val / max) * 100)) : 0
  return (
    <div className="flex items-center gap-2">
      <span className={cn('font-pixel text-[8px] w-16 truncate', textClass)}>{label}</span>
      <div className="flex-1 h-2 bg-retro-surface rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-200', barClass)} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-pixel text-[8px] text-retro-dim w-10 text-right tabular-nums">{val}/{max}</span>
    </div>
  )
}

function GhostRow({ name, avatarId, val, dead }) {
  return (
    <div className="flex items-center gap-2 bg-retro-card border border-retro-border rounded px-2 py-1.5">
      <Avatar id={avatarId} size={20} />
      <span className="font-pixel text-[8px] text-retro-p2 truncate flex-1">{name}</span>
      {dead ? (
        <span className="font-pixel text-[9px] text-retro-danger">💀 BOOM</span>
      ) : (
        <>
          <div className="w-24 h-2 bg-retro-deep rounded-full overflow-hidden">
            <div
              className="h-full bg-retro-p2 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.round((val / SAFE_CELLS) * 100))}%` }}
            />
          </div>
          <span className="font-pixel text-[8px] text-retro-dim w-10 text-right tabular-nums">{val}/{SAFE_CELLS}</span>
        </>
      )}
    </div>
  )
}

function ResultsPanel({ game, mySymbol }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {['X', 'O'].map(sym => {
        const count = game[`minesRevealed${sym}`] ?? 0
        const dead = game[`minesDead${sym}`] ?? false
        const done = game[`minesDone${sym}`] ?? false
        const isWin = game.winner === sym
        const col = sym === 'X' ? 'text-retro-p1' : 'text-retro-p2'
        const border = mySymbol === sym
          ? (sym === 'X' ? 'border-retro-p1/60' : 'border-retro-p2/60')
          : 'border-retro-border'
        return (
          <div key={sym} className={cn('bg-retro-card border rounded p-3 text-center space-y-1', border)}>
            <p className={cn('font-pixel text-[8px]', col)}>
              {game.players?.[sym]?.name?.toUpperCase() ?? sym}
            </p>
            <p className={cn('font-pixel text-2xl tabular-nums', isWin ? 'text-retro-win text-glow-win' : 'text-retro-text')}>
              {count}
            </p>
            <p className="font-pixel text-[8px] text-retro-dim">/ {SAFE_CELLS} CLEARED</p>
            <p className={cn(
              'font-pixel text-[8px]',
              isWin ? 'text-retro-win' : dead ? 'text-retro-danger' : 'text-retro-cta',
            )}>
              {isWin ? '★ WINNER' : dead ? '✖ DETONATED' : done ? '✓ CLEARED' : '—'}
            </p>
          </div>
        )
      })}
    </div>
  )
}

export default function MineRaceGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const myKey = mySymbol === 'X' ? 'X' : 'O'
  const opKey = myKey === 'X' ? 'O' : 'X'

  const seed = game.minesSeed ?? null
  const startedAt = game.minesStartedAt ?? null

  // The identical board both players sweep — derived purely from the seed.
  const board = useMemo(() => (seed != null ? generateBoard(seed) : null), [seed])

  // Own revealed set: client-only. Restored from sessionStorage on reload,
  // validated against the CURRENT board's mines (a stale round's cells that
  // are now mines get dropped).
  const [revealed, setRevealed] = useState(() => {
    const opening = board ? new Set(board.opening) : new Set()
    if (!board || !mySymbol) return opening
    try {
      const raw = JSON.parse(sessionStorage.getItem(`minerace-revealed-${gameId}-${mySymbol}`) || 'null')
      if (Array.isArray(raw)) {
        for (const i of raw) {
          if (Number.isInteger(i) && i >= 0 && i < CELL_COUNT && !board.mines[i]) opening.add(i)
        }
      }
    } catch { /* private mode */ }
    return opening
  })
  const [flags, setFlags] = useState(() => new Set()) // local-only player aid
  const [mode, setMode] = useState('reveal') // 'reveal' | 'flag' fallback
  const [fatalCell, setFatalCell] = useState(null)
  const [dead, setDead] = useState(false)
  const [done, setDone] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [readying, runReady] = useBusy()

  const revealedRef = useRef(revealed)
  const flagsRef = useRef(flags)
  const syncTimerRef = useRef(null)
  const prevSeedRef = useRef(seed)
  const pressTimerRef = useRef(null)
  const longPressFiredRef = useRef(false)

  // New round (new seed via PLAY AGAIN / NEW MATCH / SWITCH-back): reset to the
  // fresh opening. Reload mid-round keeps state (same seed → no reset here;
  // restore happened in the useState initializer). Reset during render (the
  // documented derive-from-prop-change pattern) so state never lags a seed flip.
  if (prevSeedRef.current !== seed) {
    prevSeedRef.current = seed
    if (board) {
      const opening = new Set(board.opening)
      setRevealed(opening)
      setFlags(new Set())
      setFatalCell(null)
      setDead(false)
      setDone(false)
    }
  }

  const isCountdown = !!startedAt && now < startedAt + COUNTDOWN_MS
  const isRacing = !!startedAt && now >= startedAt + COUNTDOWN_MS && game.status !== 'finished'
  const countdownSec = isCountdown ? Math.ceil((startedAt + COUNTDOWN_MS - now) / 1000) : 0
  const canAct = isRacing && !dead && !done

  const myCount = countRevealed(revealed)
  const opCount = game[`minesRevealed${opKey}`] ?? 0
  const opDead = game[`minesDead${opKey}`] ?? false
  const opDone = game[`minesDone${opKey}`] ?? false
  const showMines = fatalCell != null || game.status === 'finished'

  // Ticker drives the countdown display (mirrors TypingGame).
  useEffect(() => {
    if (!startedAt || game.status === 'finished') return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [startedAt, game.status])

  // Persist own revealed positions locally (reload recovery). Never Firebase.
  useEffect(() => {
    if (!mySymbol || seed == null) return
    try {
      sessionStorage.setItem(`minerace-revealed-${gameId}-${mySymbol}`, JSON.stringify([...revealed]))
    } catch { /* private mode */ }
  }, [revealed, gameId, mySymbol, seed])

  // Mirror state into the refs the async callbacks (long-press timer, reveal
  // chains) read — refs are only touched here and inside handlers, never render.
  useEffect(() => { revealedRef.current = revealed }, [revealed])
  useEffect(() => { flagsRef.current = flags }, [flags])

  useEffect(() => () => clearTimeout(pressTimerRef.current), [])

  // ── Firebase ────────────────────────────────────────────────────────────

  const handleReady = () => {
    if (startedAt) return
    runReady(async () => {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.minesStartedAt) return
        return { ...current, minesStartedAt: Date.now() }
      })
    }, () => toast.error('START FAILED — CHECK CONNECTION'))
  }

  // First end-event transaction wins — photo-finish boom+clear resolves by
  // whichever lands first (PRD serialization rule).
  const resolveEnd = async (winnerSym) => {
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.status === 'finished') return
        const scores = { ...(current.scores || {}) }
        scores[winnerSym] = (scores[winnerSym] || 0) + 1
        return { ...current, winner: winnerSym, status: 'finished', scores }
      })
    } catch { /* other client resolved it */ }
  }

  const flushSync = (count) => {
    clearTimeout(syncTimerRef.current)
    update(ref(db, `games/${gameId}`), { [`minesRevealed${myKey}`]: count }).catch(() => {})
  }

  const scheduleSync = (count) => {
    clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => flushSync(count), SYNC_DEBOUNCE_MS)
  }

  const handleDeath = (cell) => {
    if (dead || done) return
    setDead(true)
    setFatalCell(cell)
    sounds.bust()
    flushSync(countRevealed(revealedRef.current))
    update(ref(db, `games/${gameId}`), { [`minesDead${myKey}`]: true }).catch(() => {})
    resolveEnd(opKey)
  }

  const handleComplete = () => {
    if (done || dead) return
    setDone(true)
    sounds.win()
    flushSync(SAFE_CELLS)
    update(ref(db, `games/${gameId}`), { [`minesDone${myKey}`]: true }).catch(() => {})
    resolveEnd(myKey)
  }

  // ── play ────────────────────────────────────────────────────────────────

  const applyReveal = (cells) => {
    if (!board) return
    const { mines, counts } = board
    const fatal = cells.find(c => mines[c])
    if (fatal != null) {
      handleDeath(fatal)
      return
    }
    let next = revealedRef.current
    for (const c of cells) next = floodReveal(counts, mines, next, c)
    const gained = next.size - revealedRef.current.size
    if (gained === 0) return
    revealedRef.current = next
    setRevealed(next)
    scheduleSync(next.size)
    if (gained > 1) sounds.hit(Math.min(gained + 1, 10))
    if (isComplete(next)) handleComplete()
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
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false
      return
    }
    if (mode === 'flag') {
      toggleFlag(cell)
      return
    }
    if (flagsRef.current.has(cell)) return
    if (revealedRef.current.has(cell)) {
      const targets = chordTargets(board.counts, revealedRef.current, flagsRef.current, cell)
      if (targets.length) applyReveal(targets)
      return
    }
    applyReveal([cell])
  }

  // Long-press flags on touch; mouse uses right-click instead.
  const handlePointerDown = (e, cell) => {
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

  const renderCell = (i) => {
    const isRevealed = revealed.has(i)
    const isFlagged = flags.has(i)
    const isFatal = fatalCell === i
    const mine = board?.mines?.[i]
    const showMine = mine && showMines
    const n = isRevealed ? (board?.counts?.[i] ?? 0) : 0
    return (
      <div
        key={i}
        role="gridcell"
        aria-label={`cell ${i}`}
        className={cn(
          'aspect-square flex items-center justify-center rounded-[2px] border font-pixel text-[10px] leading-none select-none',
          !isRevealed && !showMine && 'bg-retro-card border-retro-border cursor-pointer active:bg-retro-surface',
          !isRevealed && showMine && 'bg-retro-deep border-transparent',
          isFatal && 'bg-retro-danger border-retro-danger ring-1 ring-retro-danger',
          isRevealed && n === 0 && !showMine && 'bg-retro-deep border-transparent',
          isRevealed && n > 0 && cn('bg-retro-surface border-transparent', NUM_COLORS[n]),
        )}
        onClick={() => handleTap(i)}
        onContextMenu={(e) => {
          e.preventDefault()
          if (canAct) toggleFlag(i)
        }}
        onPointerDown={(e) => handlePointerDown(e, i)}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
      >
        {showMine ? (isFatal ? '💥' : '💣') : isFlagged ? '🚩' : isRevealed && n > 0 ? n : ''}
      </div>
    )
  }

  const matchWinner = (game.scores?.X || 0) >= MATCH_WINS ? 'X' : (game.scores?.O || 0) >= MATCH_WINS ? 'O' : null
  const oppName = game.players?.[opKey]?.name?.toUpperCase() ?? opKey
  const myName = game.players?.[myKey]?.name?.toUpperCase() ?? myKey

  // ── render: finished ────────────────────────────────────────────────────

  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
        {board && (
          <div className="space-y-1">
            <p className="font-pixel text-[8px] text-retro-dim text-center">FINAL MINEFIELD</p>
            <div className="grid grid-cols-12 gap-[2px] bg-retro-deep p-[3px] rounded border border-retro-border max-w-md mx-auto pointer-events-none">
              {Array.from({ length: CELL_COUNT }, (_, i) => renderCell(i))}
            </div>
          </div>
        )}
        <ResultsPanel game={game} mySymbol={mySymbol} />
        <GameStatus
          status={game.status} winner={game.winner} mySymbol={mySymbol}
          scores={game.scores} players={game.players} gameType={game.gameType}
          onPlayAgain={!matchWinner && !proposal ? onPlayAgain : null}
          onNewMatch={matchWinner && !proposal ? onNewMatch : null}
          onSwitchGame={!proposal ? onSwitchGame : null}
        />
      </div>
    )
  }

  // ── render: spectator (progress bars only — boards would leak via a second tab) ─

  if (!mySymbol) {
    return (
      <div className="space-y-4">
        <SpectatorCard game={game} statusOverride={!startedAt ? 'WAITING TO START' : undefined} />
        {startedAt && (
          <div className="bg-retro-card border border-retro-border rounded p-3 space-y-2">
            <RaceBar
              label={game.players?.X?.name?.toUpperCase() ?? 'X'}
              val={game.minesRevealedX ?? 0} max={SAFE_CELLS}
              textClass="text-retro-p1" barClass="bg-retro-p1"
            />
            <RaceBar
              label={game.players?.O?.name?.toUpperCase() ?? 'O'}
              val={game.minesRevealedO ?? 0} max={SAFE_CELLS}
              textClass="text-retro-p2" barClass="bg-retro-p2"
            />
          </div>
        )}
        {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
      </div>
    )
  }

  // ── render: waiting to start ────────────────────────────────────────────

  if (!startedAt) {
    return (
      <div className="space-y-4">
        <div className="bg-retro-card border border-retro-border rounded p-6 text-center space-y-4">
          <p className="font-pixel text-[9px] text-retro-cta">MINE RACE · {MINES} MINES · {SAFE_CELLS} SAFE CELLS</p>
          <div className="font-pixel text-[8px] text-retro-dim space-y-1 text-left mx-auto w-fit">
            <p>● IDENTICAL SEEDED MINEFIELD · FIRST TO CLEAR WINS</p>
            <p>● TAP REVEAL · HOLD / RIGHT-CLICK FLAG · TAP A NUMBER TO CHORD</p>
            <p>● HIT A MINE AND YOUR OPPONENT WINS INSTANTLY</p>
          </div>
          <button
            onClick={handleReady}
            disabled={readying}
            className="px-6 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95 disabled:opacity-50"
          >
            {readying ? 'STARTING…' : 'READY'}
          </button>
        </div>
        {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
      </div>
    )
  }

  // ── render: countdown ───────────────────────────────────────────────────

  if (isCountdown) {
    return (
      <div className="space-y-4">
        <div className="bg-retro-card border border-retro-border rounded p-8 text-center space-y-3">
          <p className="font-pixel text-[9px] text-retro-dim arcade-blink">GET READY!</p>
          <p className="font-pixel text-7xl text-retro-win text-glow-win">{countdownSec}</p>
          <p className="font-pixel text-[8px] text-retro-dim">SWEEP FAST</p>
        </div>
      </div>
    )
  }

  // ── render: racing ──────────────────────────────────────────────────────

  return (
    <div className="space-y-2">
      {/* Progress: me + opponent ghost */}
      <div className="max-w-md mx-auto space-y-1.5">
        <RaceBar
          label={myName} val={myCount} max={SAFE_CELLS}
          textClass="text-retro-p1" barClass="bg-retro-p1"
        />
        <GhostRow name={oppName} avatarId={game.players?.[opKey]?.avatar} val={opCount} dead={opDead} />
      </div>

      {/* Board */}
      <div className="relative max-w-md mx-auto">
        <div
          className="grid grid-cols-12 gap-[2px] bg-retro-deep p-[3px] rounded border border-retro-border select-none"
          style={{ touchAction: 'manipulation' }}
        >
          {board && Array.from({ length: CELL_COUNT }, (_, i) => renderCell(i))}
        </div>

        {/* End-state overlays (pre-transaction grace window) */}
        {fatalCell != null && (
          <div className="absolute inset-0 flex items-center justify-center bg-retro-bg/80 rounded">
            <p className="font-pixel text-[10px] text-retro-danger text-glow-danger bg-retro-card border border-retro-danger/60 rounded px-4 py-3 text-center">
              💥 YOU HIT A MINE<br />{oppName} WINS
            </p>
          </div>
        )}
        {fatalCell == null && done && game.status !== 'finished' && (
          <div className="absolute inset-0 flex items-center justify-center bg-retro-bg/80 rounded">
            <p className="font-pixel text-[10px] text-retro-win text-glow-win bg-retro-card border border-retro-win/60 rounded px-4 py-3 text-center">
              ✓ ALL {SAFE_CELLS} CLEARED<br />WRAPPING UP…
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2 max-w-md mx-auto">
        <button
          onClick={() => setMode(m => (m === 'reveal' ? 'flag' : 'reveal'))}
          disabled={!canAct}
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
          🚩 {flags.size} · HOLD TO FLAG · TAP № TO CHORD
        </span>
      </div>

      {/* Race status lines */}
      <div className="min-h-[16px] text-center">
        {opDead && game.status !== 'finished' && (
          <p className="font-pixel text-[9px] text-retro-win arcade-blink">{oppName} DETONATED — CLEAR THE REST TO WIN!</p>
        )}
        {opDone && !opDead && game.status !== 'finished' && (
          <p className="font-pixel text-[9px] text-retro-p2 arcade-blink">{oppName} CLEARED IT — TOO SLOW!</p>
        )}
      </div>

      {!opponentOnline && <OfflineNotice label="OPPONENT" />}
      {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
    </div>
  )
}
