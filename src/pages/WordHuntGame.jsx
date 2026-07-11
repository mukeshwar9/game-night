import { useEffect, useRef, useState, useCallback } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import GameSwitcher from '../components/GameSwitcher'
import GameStatus from '../components/GameStatus'
import SpectatorCard from '../components/SpectatorCard'
import ArcadeLoader from '../components/ArcadeLoader'
import PixelDots from '../components/loading/PixelDots'
import OfflineNotice from '../components/loading/OfflineNotice'
import {
  COUNTDOWN_MS, ROUND_MS, MATCH_WINS, MIN_WORD_LENGTH,
  findPath, scoreWord, scoreWords, canonicalize, neighborsOf,
} from '../lib/wordhuntLogic'
import { loadDictionary } from '../lib/wordhuntDictionary'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'
import { toast } from 'sonner'

// ── small helpers ────────────────────────────────────────────────────

function pad2(n) { return String(n).padStart(2, '0') }

function fmtTime(ms) {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`
}

// Firebase may return numeric-keyed objects instead of arrays for append-only
// lists (same normalization every custom page applies to its own list —
// mirrors WordDuelGame.jsx's local normalizeGuesses, adapted for a flat
// string[] instead of an array of {word, marks} objects).
function normalizeWordList(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(w => w != null)
  const arr = []
  for (const k of Object.keys(raw).sort((a, b) => Number(a) - Number(b))) {
    if (raw[k] != null) arr.push(raw[k])
  }
  return arr
}

function displayLetter(letter) {
  return letter === 'q' ? 'Qu' : String(letter ?? '').toUpperCase()
}

// ── sub-components ───────────────────────────────────────────────────

// One grid cell. state ∈ 'idle' | 'path' | 'valid' | 'duplicate' | 'invalid'.
function Tile({ letter, state }) {
  return (
    <div
      className={cn(
        'w-full h-full flex items-center justify-center rounded border font-pixel select-none',
        'text-sm sm:text-base transition-colors duration-150',
        state === 'idle' && 'bg-retro-card border-retro-border text-retro-text',
        state === 'path' && 'bg-retro-tint-cta border-retro-cta text-retro-cta',
        state === 'valid' && 'bg-retro-win border-retro-win text-white',
        state === 'duplicate' && 'bg-retro-tint-cta border-retro-cta text-retro-cta',
        state === 'invalid' && 'bg-retro-tint-p2 border-retro-p2 text-retro-p2',
      )}
    >
      {letter ? displayLetter(letter) : ''}
    </div>
  )
}

// Floating "+N" score pop — plain React state-driven CSS transition, no new
// global @keyframes/Tailwind config needed (see WordHuntGame spec §5.2).
// The caller mounts a fresh instance per pop (key={id}) so `shown` always
// starts false — no need to reset state from inside the effect.
function ScorePop({ amount }) {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    let raf2 = null
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setShown(true))
    })
    return () => {
      cancelAnimationFrame(raf1)
      if (raf2 != null) cancelAnimationFrame(raf2)
    }
  }, [])

  return (
    <span
      className={cn(
        'pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2',
        'font-pixel text-lg text-retro-win transition-all duration-700',
        shown ? 'opacity-100 -translate-y-4' : 'opacity-0 translate-y-0',
      )}
    >
      +{amount}
    </span>
  )
}

// Owns the pointer-drag trace + the physical-keyboard type+Enter fallback.
// Container-level elementFromPoint hit-testing (not per-tile pointer capture)
// — see spec §5.2 for why per-tile onPointerEnter alone doesn't work on
// mobile (pointerdown implicitly captures the pointer to its origin tile).
function WordGrid({ grid, disabled, onSubmit, lastResult }) {
  const [path, setPath] = useState([])
  const [dragging, setDragging] = useState(false)
  const [typedWord, setTypedWord] = useState('')
  const [inputShake, setInputShake] = useState(null) // 'duplicate' | 'invalid' | null
  const [revealCount, setRevealCount] = useState(0)
  const [scorePop, setScorePop] = useState(null)

  const draggingRef = useRef(false)
  const pathRef = useRef([])
  const dragPathAtSubmitRef = useRef([])
  const revealTimersRef = useRef([])
  const clearTimerRef = useRef(null)
  const shakeTimerRef = useRef(null)
  const popTimerRef = useRef(null)

  // Drive the tile-flash-in-sequence sweep (valid) or the amber/red shake
  // (duplicate/invalid) whenever the parent reports a new submission result.
  useEffect(() => {
    revealTimersRef.current.forEach(clearTimeout)
    revealTimersRef.current = []
    clearTimeout(clearTimerRef.current)
    clearTimeout(shakeTimerRef.current)

    if (!lastResult) return

    if (lastResult.kind === 'valid') {
      const sweepPath = dragPathAtSubmitRef.current.length ? dragPathAtSubmitRef.current : (lastResult.path || [])
      setPath(sweepPath)
      setRevealCount(0)
      sweepPath.forEach((_, i) => {
        revealTimersRef.current.push(
          setTimeout(() => setRevealCount(c => Math.max(c, i + 1)), i * 40),
        )
      })
      setScorePop({ id: lastResult.id, amount: lastResult.amount })
      popTimerRef.current = setTimeout(() => {
        setScorePop(p => (p?.id === lastResult.id ? null : p))
      }, 850)
      clearTimerRef.current = setTimeout(() => {
        if (!draggingRef.current) { setPath([]); setRevealCount(0) }
      }, sweepPath.length * 40 + 550)
    } else if (lastResult.kind === 'duplicate' || lastResult.kind === 'invalid') {
      if (dragPathAtSubmitRef.current.length) {
        setPath(dragPathAtSubmitRef.current)
      } else {
        // Typed submission: clear any stale path from a prior valid find
        // immediately — its clear-timer was cancelled above, and cellState
        // would otherwise repaint those already-scored tiles in this
        // result's duplicate/invalid color.
        if (!draggingRef.current) { setPath([]); setRevealCount(0) }
        setInputShake(lastResult.kind)
      }
      shakeTimerRef.current = setTimeout(() => {
        if (!draggingRef.current) setPath([])
        setInputShake(null)
      }, 400)
    }
  }, [lastResult])

  useEffect(() => () => {
    revealTimersRef.current.forEach(clearTimeout)
    clearTimeout(clearTimerRef.current)
    clearTimeout(shakeTimerRef.current)
    clearTimeout(popTimerRef.current)
  }, [])

  const rawWordFromPath = (p) => p.map(i => (grid[i] === 'q' ? 'qu' : grid[i])).join('')

  const startDrag = (index) => {
    if (disabled) return
    draggingRef.current = true
    pathRef.current = [index]
    setDragging(true)
    setPath([index])
  }

  const handlePointerMove = (e) => {
    if (!draggingRef.current || disabled) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const cellEl = el?.closest?.('[data-cell-index]')
    if (!cellEl) return
    const idx = Number(cellEl.dataset.cellIndex)
    const last = pathRef.current[pathRef.current.length - 1]
    if (idx === last || pathRef.current.includes(idx)) return
    if (!neighborsOf(last).includes(idx)) return
    pathRef.current = [...pathRef.current, idx]
    setPath(pathRef.current)
  }

  const endDrag = () => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    const finalPath = pathRef.current
    if (finalPath.length > 0) {
      dragPathAtSubmitRef.current = finalPath
      onSubmit(rawWordFromPath(finalPath))
    }
  }

  // Physical-keyboard type+Enter fallback — mirrors WordDuelGame.jsx's exact
  // window-level keydown pattern (ctrlKey/metaKey/altKey bail-out, Enter to
  // submit, Backspace to trim, single letters appended uppercase).
  useEffect(() => {
    if (disabled) return
    const handler = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Enter') {
        e.preventDefault()
        setTypedWord(w => {
          if (w.length > 0) {
            dragPathAtSubmitRef.current = []
            onSubmit(w)
          }
          return ''
        })
      } else if (e.key === 'Backspace') {
        setTypedWord(w => w.slice(0, -1))
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        setTypedWord(w => (w.length < 20 ? w + e.key.toUpperCase() : w))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [disabled, onSubmit])

  const cellState = (index) => {
    const pos = path.indexOf(index)
    if (pos === -1) return 'idle'
    if (dragging) return 'path'
    if (lastResult?.kind === 'valid') return pos < revealCount ? 'valid' : 'path'
    if (lastResult?.kind === 'duplicate') return 'duplicate'
    if (lastResult?.kind === 'invalid') return 'invalid'
    return 'path'
  }

  return (
    <div className="space-y-2">
      <div
        className="relative grid grid-cols-4 gap-2 max-w-xs mx-auto touch-none select-none"
        style={{ touchAction: 'none' }}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
      >
        {Array.from({ length: 16 }, (_, i) => (
          <div
            key={i}
            data-cell-index={i}
            className="aspect-square"
            onPointerDown={() => startDrag(i)}
          >
            <Tile letter={grid[i]} state={cellState(i)} />
          </div>
        ))}
        {scorePop && <ScorePop key={scorePop.id} amount={scorePop.amount} />}
      </div>

      {/* Type + Enter fallback — always rendered, tap-reachable on mobile too */}
      <div
        className={cn(
          'mx-auto max-w-xs rounded border px-3 py-2 text-center transition-colors',
          inputShake === 'duplicate' && 'border-retro-cta bg-retro-tint-cta',
          inputShake === 'invalid' && 'border-retro-p2 bg-retro-tint-p2',
          !inputShake && 'border-retro-border bg-retro-card',
        )}
      >
        <span className="font-pixel text-xs tracking-widest text-retro-text">
          {typedWord || <span className="opacity-30">TYPE A WORD…</span>}
        </span>
      </div>
    </div>
  )
}

function ScoreBar({ myScore, oppScore, myLabel, oppLabel, mySymbol }) {
  const total = Math.max(myScore + oppScore, 1)
  const pMy = (myScore / total) * 100
  const isX = mySymbol === 'X'
  const myColor = isX ? 'text-retro-p1' : 'text-retro-p2'
  const oppColor = isX ? 'text-retro-p2' : 'text-retro-p1'
  const myBar = isX ? 'bg-retro-p1' : 'bg-retro-p2'
  const oppBar = isX ? 'bg-retro-p2' : 'bg-retro-p1'
  return (
    <div className="bg-retro-card border border-retro-border rounded p-2 space-y-1">
      <div className="flex justify-between font-pixel text-[10px]">
        <span className={myColor}>{(myLabel || mySymbol || 'X').toUpperCase()} · {myScore}</span>
        <span className={oppColor}>{oppScore} · {(oppLabel || (isX ? 'O' : 'X')).toUpperCase()}</span>
      </div>
      <div className="h-2 bg-retro-deep rounded-full overflow-hidden flex">
        <div className={cn(myBar, 'h-full transition-all duration-500')} style={{ width: `${pMy}%` }} />
        <div className={cn(oppBar, 'h-full flex-1')} />
      </div>
    </div>
  )
}

function WordList({ words, emptyHint }) {
  const reversed = [...words].reverse()
  return (
    <div className="bg-retro-card border border-retro-border rounded p-2 max-h-40 overflow-y-auto">
      {reversed.length === 0 ? (
        <p className="font-pixel text-[9px] text-retro-dim text-center py-3">{emptyHint}</p>
      ) : (
        <ul className="space-y-1">
          {reversed.map((w, i) => (
            <li key={`${w}-${reversed.length - i}`} className="flex justify-between font-mono text-xs text-retro-text px-1">
              <span className="uppercase tracking-wide">{w}</span>
              <span className="text-retro-win font-pixel text-[9px]">{scoreWord(w)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ResultsPanel({ scoreX, scoreO, players, winner }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {['X', 'O'].map(sym => {
        const score = sym === 'X' ? scoreX : scoreO
        const isWin = winner === sym
        const col = sym === 'X' ? 'text-retro-p1' : 'text-retro-p2'
        const border = sym === 'X' ? 'border-retro-p1/60' : 'border-retro-p2/60'
        return (
          <div key={sym} className={cn('bg-retro-card border rounded p-3 text-center space-y-1', border)}>
            <p className={cn('font-pixel text-[8px]', col)}>{players?.[sym]?.name?.toUpperCase() ?? sym}</p>
            <p className={cn('font-pixel text-3xl tabular-nums', isWin ? 'text-retro-win text-glow-win' : 'text-retro-text')}>
              {score}
            </p>
            <p className="font-pixel text-[8px] text-retro-dim">POINTS</p>
          </div>
        )
      })}
    </div>
  )
}

// End-screen dual word-list view: unique finds highlighted, opponent-word
// verification markers, and the single best word called out above (spec §5.5).
function EndPanels({ myWords, oppWords, myKey, oppKey, players, myMismatches, oppMismatches }) {
  const oppSet = new Set(oppWords)
  const mySet = new Set(myWords)
  const myMismatchSet = new Set(myMismatches || [])
  const oppMismatchSet = new Set(oppMismatches || [])

  // Best word across both lists — tie broken by whichever appears first in
  // X's list, then O's (always resolved in X-then-O order regardless of viewer).
  const xWords = myKey === 'X' ? myWords : oppWords
  const oWords = myKey === 'X' ? oppWords : myWords
  const combined = [
    ...xWords.map(w => ({ w, owner: 'X' })),
    ...oWords.map(w => ({ w, owner: 'O' })),
  ]
  let best = null
  for (const entry of combined) {
    const pts = scoreWord(entry.w)
    if (!best || pts > best.pts) best = { ...entry, pts }
  }

  const renderList = (words, mismatchSet, otherSet, sym) => {
    const reversed = [...words].reverse()
    return (
      <div className="bg-retro-card border border-retro-border rounded p-2 max-h-48 overflow-y-auto space-y-1">
        <p className={cn('font-pixel text-[9px] mb-1', sym === 'X' ? 'text-retro-p1' : 'text-retro-p2')}>
          {players?.[sym]?.name?.toUpperCase() ?? sym} · {words.length} WORDS
        </p>
        {reversed.length === 0 ? (
          <p className="font-pixel text-[9px] text-retro-dim text-center py-3">NO WORDS FOUND</p>
        ) : (
          <ul className="space-y-1">
            {reversed.map((w, i) => {
              const unique = !otherSet.has(w)
              const mismatched = mismatchSet.has(w)
              return (
                <li
                  key={`${w}-${i}`}
                  className={cn(
                    'flex justify-between font-mono text-xs px-1 rounded',
                    unique && 'bg-retro-win/10 border border-retro-win/40',
                  )}
                >
                  <span className="uppercase tracking-wide text-retro-text">
                    {w}{' '}
                    {mismatched && <span className="text-retro-p2" title="Couldn't verify">⚠</span>}
                  </span>
                  <span className="text-retro-win font-pixel text-[9px]">{scoreWord(w)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {best && (
        <p className="font-pixel text-[9px] text-retro-cta text-center">
          BEST WORD: {best.w.toUpperCase()} · {best.pts} · FOUND BY {players?.[best.owner]?.name?.toUpperCase() ?? best.owner}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {renderList(myWords, myMismatchSet, oppSet, myKey)}
        {renderList(oppWords, oppMismatchSet, mySet, oppKey)}
      </div>
    </div>
  )
}

// ── main component ───────────────────────────────────────────────────

export default function WordHuntGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const myKey = mySymbol === 'X' ? 'X' : 'O'
  const opKey = myKey === 'X' ? 'O' : 'X'

  const grid = game.wordhuntGrid ?? ''
  const startedAt = game.wordhuntStartedAt ?? null
  const myDone = game[`wordhuntDone${myKey}`] ?? false
  const oppDone = game[`wordhuntDone${opKey}`] ?? false

  const [dict, setDict] = useState(null)
  const [dictError, setDictError] = useState(false)
  const [retrying, runRetry] = useBusy()
  const [readying, runReady] = useBusy()
  const [now, setNow] = useState(() => Date.now())
  const [myWords, setMyWords] = useState(() => normalizeWordList(game[`wordhuntWords${myKey}`]))
  const [myScore, setMyScore] = useState(() => game[`wordhuntScore${myKey}`] ?? 0)
  const [lastResult, setLastResult] = useState(null)

  const myWordsRef = useRef(null)
  if (myWordsRef.current === null) myWordsRef.current = myWords
  const foundWordsRef = useRef(null)
  if (foundWordsRef.current === null) foundWordsRef.current = new Set(myWords.map(canonicalize))

  const prevGridRef = useRef(grid)
  const doneRef = useRef(false)
  const resultIdRef = useRef(0)

  // Dictionary-load gate — checked before every other phase, for both
  // players and spectators (spec §5.1). Runs once on mount; the RETRY button
  // (see below) re-invokes loadDictionary() directly through the useBusy
  // guard rather than re-running this effect.
  useEffect(() => {
    let cancelled = false
    loadDictionary()
      .then(d => { if (!cancelled) setDict(d) })
      .catch(() => { if (!cancelled) setDictError(true) })
    return () => { cancelled = true }
  }, [])

  // RETRY button handler — loadDictionary() clears its cached promise on
  // rejection (wordhuntDictionary.js), so this re-attempts the dynamic import
  // fresh. Wrapped in useBusy so a double-tap can't fire two concurrent
  // retries, and a failure toasts instead of leaving the button silently inert.
  const retryDictionary = () => {
    runRetry(async () => {
      setDictError(false)
      const d = await loadDictionary()
      setDict(d)
    }, () => {
      setDictError(true)
      toast.error("COULDN'T LOAD WORD LIST — TRY AGAIN")
    })
  }

  // New round (grid changed) — reset local found-words state. Handles PLAY
  // AGAIN / NEW MATCH / SWITCH GAME-back, all of which regenerate the grid
  // via freshGameState('wordhunt'). Initial mount/reload is handled by the
  // useState initializers above, not this effect (grid === prevGridRef.current
  // on the very first render).
  useEffect(() => {
    if (grid !== prevGridRef.current) {
      prevGridRef.current = grid
      myWordsRef.current = []
      foundWordsRef.current = new Set()
      setMyWords([])
      setMyScore(0)
      setLastResult(null)
      doneRef.current = false
    }
  }, [grid])

  const isCountdown = !!startedAt && now < startedAt + COUNTDOWN_MS
  const isPlaying = !!startedAt && now >= startedAt + COUNTDOWN_MS
    && now < startedAt + COUNTDOWN_MS + ROUND_MS && game.status !== 'finished'
  const countdownSec = isCountdown ? Math.ceil((startedAt + COUNTDOWN_MS - now) / 1000) : 0
  const deadline = startedAt ? startedAt + COUNTDOWN_MS + ROUND_MS : null
  const timeLeftMs = deadline ? Math.max(0, deadline - now) : ROUND_MS

  const tryFinishGame = async () => {
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.status === 'finished') return
        const startedAtC = current.wordhuntStartedAt
        if (!startedAtC || Date.now() < startedAtC + COUNTDOWN_MS + ROUND_MS) return // not over yet
        const sX = current.wordhuntScoreX ?? 0
        const sO = current.wordhuntScoreO ?? 0
        const winner = sX > sO ? 'X' : sX < sO ? 'O' : 'draw'
        const scores = { ...(current.scores || {}) }
        if (winner !== 'draw') scores[winner] = (scores[winner] || 0) + 1
        return { ...current, winner, status: 'finished', scores }
      })
    } catch { /* another client already resolved it — fine */ }
  }

  // Ticker: drives countdown/timer display and per-client deadline crossing.
  useEffect(() => {
    if (!startedAt || game.status === 'finished') return
    const id = setInterval(() => {
      const n = Date.now()
      setNow(n)
      if (mySymbol && n >= startedAt + COUNTDOWN_MS + ROUND_MS && !doneRef.current) {
        doneRef.current = true
        update(ref(db, `games/${gameId}`), { [`wordhuntDone${myKey}`]: true }).catch(() => {})
        tryFinishGame()
      }
    }, 100)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tryFinishGame is recreated every render; adding it would tear down and restart this interval on every tick
  }, [startedAt, game.status, mySymbol, gameId, myKey])

  const handleReady = () => {
    if (game.wordhuntStartedAt) return
    runReady(async () => {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.wordhuntStartedAt) return
        return { ...current, wordhuntStartedAt: Date.now() }
      })
    }, () => toast.error('START FAILED — CHECK CONNECTION'))
  }

  const handleSubmit = useCallback((rawWord) => {
    if (!dict || !isPlaying || myDone) return
    const word = canonicalize(rawWord)

    if (word.length < MIN_WORD_LENGTH) {
      sounds.miss()
      setLastResult({ kind: 'invalid', path: null, id: ++resultIdRef.current })
      return
    }
    if (foundWordsRef.current.has(word)) {
      setLastResult({ kind: 'duplicate', path: null, id: ++resultIdRef.current })
      return
    }
    if (!dict.has(word)) {
      sounds.miss()
      setLastResult({ kind: 'invalid', path: null, id: ++resultIdRef.current })
      return
    }
    const path = findPath(grid, word)
    if (!path) {
      sounds.miss()
      setLastResult({ kind: 'invalid', path: null, id: ++resultIdRef.current })
      return
    }

    // Valid new word — optimistic local update, then best-effort persist.
    foundWordsRef.current.add(word)
    const newWords = [...myWordsRef.current, word]
    myWordsRef.current = newWords
    const newScore = scoreWords(newWords)
    setMyWords(newWords)
    setMyScore(newScore)
    const pts = scoreWord(word)
    setLastResult({ kind: 'valid', path, amount: pts, id: ++resultIdRef.current })
    sounds.hit(newWords.length)

    const idx = newWords.length - 1
    update(ref(db, `games/${gameId}`), {
      [`wordhuntWords${myKey}/${idx}`]: word,
      [`wordhuntScore${myKey}`]: newScore,
    }).catch(() => {})
  }, [dict, isPlaying, myDone, grid, gameId, myKey])

  const matchWinner = (game.scores?.X || 0) >= MATCH_WINS ? 'X' : (game.scores?.O || 0) >= MATCH_WINS ? 'O' : null

  // ── render: dictionary-load gate ──────────────────────────────────

  if (!dict) {
    return (
      <div className="min-h-screen bg-retro-bg flex items-center justify-center">
        <div className="flex flex-col items-center">
          <ArcadeLoader variant="inline" />
          {dictError && (
            <>
              <p className="font-pixel text-[9px] text-retro-p2 mt-3">COULDN&apos;T LOAD WORD LIST</p>
              <button
                onClick={retryDictionary}
                disabled={retrying}
                className="mt-2 px-4 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95 disabled:opacity-50"
              >
                {retrying ? 'RETRYING…' : 'RETRY'}
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── render: finished ──────────────────────────────────────────────

  if (game.status === 'finished') {
    const xWords = normalizeWordList(game.wordhuntWordsX)
    const oWords = normalizeWordList(game.wordhuntWordsO)
    const scoreX = game.wordhuntScoreX ?? 0
    const scoreO = game.wordhuntScoreO ?? 0
    const verify = (words) => words.filter(w => !(dict.has(w) && findPath(grid, w)))
    const mismatchesX = verify(xWords)
    const mismatchesO = verify(oWords)
    const viewerKey = mySymbol === 'O' ? 'O' : 'X'
    const otherKey = viewerKey === 'X' ? 'O' : 'X'

    return (
      <div className="space-y-4">
        <ResultsPanel scoreX={scoreX} scoreO={scoreO} players={game.players} winner={game.winner} />
        <EndPanels
          myWords={viewerKey === 'X' ? xWords : oWords}
          oppWords={viewerKey === 'X' ? oWords : xWords}
          myKey={viewerKey}
          oppKey={otherKey}
          players={game.players}
          myMismatches={viewerKey === 'X' ? mismatchesX : mismatchesO}
          oppMismatches={viewerKey === 'X' ? mismatchesO : mismatchesX}
        />
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

  // ── render: spectator ─────────────────────────────────────────────

  if (!mySymbol) {
    return (
      <div className="space-y-4">
        <SpectatorCard game={game} statusOverride={!startedAt ? 'WAITING TO START' : undefined} />
        {isPlaying && (
          <ScoreBar
            myScore={game.wordhuntScoreX ?? 0} oppScore={game.wordhuntScoreO ?? 0}
            myLabel={game.players?.X?.name} oppLabel={game.players?.O?.name} mySymbol="X"
          />
        )}
        {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
      </div>
    )
  }

  // ── render: waiting to start ──────────────────────────────────────

  if (!startedAt) {
    return (
      <div className="space-y-4">
        <div className="bg-retro-card border border-retro-border rounded p-6 text-center space-y-4">
          <p className="font-pixel text-[9px] text-retro-cta">WORD HUNT</p>
          <div className="font-pixel text-[8px] text-retro-dim space-y-1 text-left mx-auto w-fit">
            <p>● SAME GRID FOR BOTH · TRACE ADJACENT TILES</p>
            <p>✎ ≥3 LETTERS · NO REUSING A TILE · Qu COUNTS AS 2</p>
            <p>⏱ 80-SECOND HUNT · HIGHEST SCORE WINS</p>
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

  // ── render: countdown ─────────────────────────────────────────────

  if (isCountdown) {
    return (
      <div className="space-y-4">
        <div className="bg-retro-card border border-retro-border rounded p-8 text-center space-y-3">
          <p className="font-pixel text-[9px] text-retro-dim arcade-blink">GET READY!</p>
          <p className="font-pixel text-7xl text-retro-win text-glow-win">{countdownSec}</p>
          <p className="font-pixel text-[8px] text-retro-dim">TRACE FAST</p>
        </div>
      </div>
    )
  }

  // ── render: playing ───────────────────────────────────────────────

  if (isPlaying) {
    const oppScore = game[`wordhuntScore${opKey}`] ?? 0
    const oppWordsCount = normalizeWordList(game[`wordhuntWords${opKey}`]).length
    const oppName = game.players?.[opKey]?.name?.toUpperCase() ?? opKey

    return (
      <div className="space-y-3">
        {/* Header: time + scores */}
        <div className="flex items-center gap-2">
          <div className="bg-retro-card border border-retro-border rounded px-3 py-1.5 text-center min-w-[4rem]">
            <p className={cn(
              'font-pixel text-[18px] tabular-nums leading-none',
              timeLeftMs < 10_000 ? 'text-retro-p2 text-glow-p2 arcade-blink' : 'text-retro-win',
            )}>
              {fmtTime(timeLeftMs)}
            </p>
            <p className="font-pixel text-[7px] text-retro-dim mt-0.5">TIME LEFT</p>
          </div>
          <div className="flex-1">
            <ScoreBar
              myScore={myScore} oppScore={oppScore}
              myLabel={game.players?.[myKey]?.name} oppLabel={game.players?.[opKey]?.name}
              mySymbol={myKey}
            />
          </div>
        </div>

        <p className="font-pixel text-[8px] text-retro-dim text-center">
          {oppName} · {oppWordsCount} WORD{oppWordsCount === 1 ? '' : 'S'} FOUND
        </p>

        <WordGrid grid={grid} disabled={!!myDone} onSubmit={handleSubmit} lastResult={lastResult} />

        <WordList words={myWords} emptyHint="TRACE OR TYPE WORDS TO FIND THEM HERE" />

        {myDone && (
          <p className="font-pixel text-[9px] text-retro-cta text-center arcade-blink">
            YOU&apos;RE DONE — WRAPPING UP…
          </p>
        )}
        {!myDone && oppDone && (
          <p className="font-pixel text-[9px] text-retro-dim text-center">
            {oppName} IS FINISHING…
          </p>
        )}

        {!opponentOnline && <OfflineNotice label="OPPONENT" />}
        {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
      </div>
    )
  }

  // ── render: past deadline, waiting for the finish transaction ─────

  return (
    <div className="space-y-4">
      <div className="bg-retro-card border border-retro-border rounded p-6 text-center space-y-3">
        <div className="flex justify-center">
          <PixelDots tone="cta" size="lg" glow />
        </div>
        <p className="font-pixel text-[9px] text-retro-dim arcade-blink">TALLYING SCORES…</p>
      </div>
    </div>
  )
}
