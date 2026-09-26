import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import WordFeedback from '../components/WordFeedback'
import MatchScoreRail from '../components/MatchScoreRail'
import RoundTimer from '../components/RoundTimer'
import LoadingLine from '../components/loading/LoadingLine'
import useGameKeys from '../hooks/useGameKeys'
import useBusy from '../hooks/useBusy'
import {
  generateGrid, ensurePlayableGrid, solveGrid, findPath, canonicalize, scoreWord, scoreWords,
  compareHunt, topMissedWords, neighborsOf, COUNTDOWN_MS, ROUND_MS, MATCH_WINS, MIN_WORD_LENGTH, CELL_COUNT,
} from '../lib/wordhuntLogic'
import { loadDictionary } from '../lib/wordhuntDictionary'
import { planBotFinds, botFindsBy, tallyWins, matchWinner } from '../lib/wordBotsLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// Solo WORD HUNT vs the CPU, fully local. Each round deals a fresh grid
// lifted to the room game's word floor (ensurePlayableGrid). The CPU finds
// real words from the grid's solver list at a human pace (wordBotsLogic), so
// its score follows the grid. Ranking is compareHunt (points, then words,
// then longest word); first to 3. X = you, O = the CPU.

const TICK_MS = 200
const MAX_TYPED = CELL_COUNT + 1 // Qu counts twice

const REJECT_REASON = {
  short: `TOO SHORT — ${MIN_WORD_LENGTH}+ LETTERS`,
  notword: 'NOT A WORD',
  notconnected: 'NOT CONNECTED ON THE GRID',
  duplicate: 'ALREADY FOUND',
}

const DECIDED_BY_COPY = {
  words: 'TIED ON POINTS — MORE WORDS WINS',
  longest: 'TIED ON POINTS AND WORDS — LONGEST WORD WINS',
  draw: 'TIED ON POINTS, WORDS AND LONGEST WORD — DRAW',
}

const randSeed = () => Math.floor(Math.random() * 2_147_483_647)

function playerName() {
  try { return localStorage.getItem('playerName') || 'YOU' } catch { return 'YOU' }
}

function displayLetter(letter) {
  return letter === 'q' ? 'Qu' : String(letter ?? '').toUpperCase()
}

function feedbackFor(result) {
  if (!result) return { message: '', tone: 'info' }
  const word = String(result.word ?? '').toUpperCase()
  if (result.kind === 'valid') return { message: `${word} · +${result.amount} POINT${result.amount === 1 ? '' : 'S'}`, tone: 'ok' }
  const reason = REJECT_REASON[result.kind] || 'NOT A WORD'
  return { message: word ? `${word} — ${reason}` : reason, tone: result.kind === 'duplicate' ? 'info' : 'bad' }
}

function Tile({ letter, state }) {
  return (
    <div
      className={cn(
        'w-full h-full flex items-center justify-center rounded border font-pixel select-none',
        'text-2xl sm:text-3xl transition-colors duration-150',
        state === 'idle' && 'bg-retro-card border-retro-border text-retro-text',
        state === 'path' && 'bg-retro-tint-cta border-retro-cta text-retro-cta',
        state === 'valid' && 'bg-retro-win border-retro-win text-retro-bg',
        state === 'duplicate' && 'bg-retro-tint-cta border-retro-cta text-retro-cta',
        state === 'invalid' && 'bg-retro-tint-p2 border-retro-p2 text-retro-p2',
      )}
    >
      {displayLetter(letter)}
    </div>
  )
}

function WordColumn({ label, words, other, tone }) {
  return (
    <div className="bg-retro-card border border-retro-border rounded p-2 max-h-48 overflow-y-auto space-y-1">
      <p className={cn('font-pixel text-[9px] mb-1', tone)}>{label} · {words.length} WORDS</p>
      {words.length === 0 ? (
        <p className="font-pixel text-[9px] text-retro-dim text-center py-3">NO WORDS FOUND</p>
      ) : (
        <ul className="space-y-1">
          {[...words].reverse().map(w => (
            <li
              key={w}
              className={cn('flex justify-between font-mono text-xs px-1 rounded', !other.has(w) && 'bg-retro-win/10 border border-retro-win/40')}
            >
              <span className="uppercase tracking-wide text-retro-text">{w}</span>
              <span className="text-retro-win font-pixel text-[9px]">{scoreWord(w)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function WordHuntDemo() {
  const [names] = useState(() => ({ X: { name: playerName() }, O: { name: 'CPU' } }))
  const [dict, setDict] = useState(null)
  const [dictError, setDictError] = useState(false)
  const [retrying, runRetry] = useBusy()
  useEffect(() => {
    let cancelled = false
    loadDictionary()
      .then(d => { if (!cancelled) setDict(d) })
      .catch(() => { if (!cancelled) setDictError(true) })
    return () => { cancelled = true }
  }, [])
  const retryDictionary = () => runRetry(async () => {
    setDictError(false)
    setDict(await loadDictionary())
  }, () => {
    setDictError(true)
    toast.error("COULDN'T LOAD WORD LIST — TRY AGAIN")
  })

  const [winners, setWinners] = useState([])
  const [round, setRound] = useState(null) // { grid, solutions, plan, startedAt }
  const [myWords, setMyWords] = useState([])
  const [lastResult, setLastResult] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  // Drag trace + typed word
  const [path, setPath] = useState([])
  const [dragging, setDragging] = useState(false)
  const [flash, setFlash] = useState(null) // { path, kind } after a submit
  const [typed, setTyped] = useState('')
  const draggingRef = useRef(false)
  const pathRef = useRef([])
  const flashTimerRef = useRef(null)
  useEffect(() => () => clearTimeout(flashTimerRef.current), [])

  const huntStart = round ? round.startedAt + COUNTDOWN_MS : null
  const deadline = round ? huntStart + ROUND_MS : null
  const counting = !!round && now < huntStart
  const playing = !!round && now >= huntStart && now < deadline
  const done = !!round && now >= deadline

  useEffect(() => {
    if (!round || done) return
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [round, done])

  const botWords = round ? botFindsBy(round.plan, Math.min(now, deadline) - huntStart) : []
  const verdict = done ? compareHunt(myWords, botWords) : null
  const scores = tallyWins(verdict ? [...winners, verdict.winner] : winners)
  const champion = matchWinner(scores, MATCH_WINS)

  useEffect(() => {
    if (!verdict) return
    if (champion) { if (champion === 'X') sounds.matchWin(); else sounds.lose() }
    else if (verdict.winner === 'X') sounds.win()
    else if (verdict.winner === 'O') sounds.lose()
    else sounds.draw()
    // one sound per finished round
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done])

  const startRound = () => {
    if (!dict) return
    const grid = ensurePlayableGrid(generateGrid(randSeed()), dict)
    const solutions = solveGrid(grid, dict)
    const plan = planBotFinds(solutions, { durationMs: ROUND_MS })
    const at = Date.now()
    setRound({ grid, solutions, plan, startedAt: at })
    setNow(at)
    setMyWords([])
    setLastResult(null)
    setTyped('')
    setPath([])
    setFlash(null)
  }

  const nextRound = () => {
    setWinners(w => [...w, verdict.winner])
    startRound()
  }

  const newMatch = () => {
    setWinners([])
    startRound()
  }

  // Returns the outcome kind so the typed box can keep a rejected word.
  const submit = (raw, tracedPath = []) => {
    // eslint-disable-next-line react-hooks/purity -- runs only from drag/typing handlers, never during render
    const t = Date.now()
    if (!dict || !round || t < huntStart || t >= deadline) return null
    const word = canonicalize(raw)
    let kind = 'valid'
    if (word.length < MIN_WORD_LENGTH) kind = 'short'
    else if (myWords.includes(word)) kind = 'duplicate'
    else if (!dict.has(word)) kind = 'notword'
    const found = kind === 'valid' ? findPath(round.grid, word) : null
    if (kind === 'valid' && !found) kind = 'notconnected'
    const amount = kind === 'valid' ? scoreWord(word) : 0
    if (kind === 'valid') {
      setMyWords(w => (w.includes(word) ? w : [...w, word]))
      sounds.hit(myWords.length + 1)
    } else if (kind !== 'duplicate') sounds.miss()
    setLastResult(r => ({ kind, word, amount, id: (r?.id || 0) + 1 }))
    clearTimeout(flashTimerRef.current)
    setFlash({ path: tracedPath.length ? tracedPath : (found || []), kind })
    flashTimerRef.current = setTimeout(() => setFlash(null), kind === 'valid' ? 600 : 400)
    return kind
  }

  const rawWordFromPath = (p) => p.map(i => (round.grid[i] === 'q' ? 'qu' : round.grid[i])).join('')

  const startDrag = (index) => {
    if (!playing) return
    draggingRef.current = true
    pathRef.current = [index]
    setDragging(true)
    setPath([index])
    setFlash(null)
  }

  const handlePointerMove = (e) => {
    if (!draggingRef.current || !playing) return
    const cellEl = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-wh-cell]')
    if (!cellEl) return
    const idx = Number(cellEl.dataset.whCell)
    const current = pathRef.current
    const last = current[current.length - 1]
    if (idx === last) return
    // Dragging back onto the previous tile drops the last one.
    if (current.length >= 2 && idx === current[current.length - 2]) {
      pathRef.current = current.slice(0, -1)
      setPath(pathRef.current)
      return
    }
    if (current.includes(idx) || !neighborsOf(last).includes(idx)) return
    pathRef.current = [...current, idx]
    setPath(pathRef.current)
  }

  const endDrag = () => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    const finalPath = pathRef.current
    pathRef.current = []
    setPath([])
    if (finalPath.length > 0) submit(rawWordFromPath(finalPath), finalPath)
  }

  const cancelDrag = () => {
    if (!draggingRef.current) return
    draggingRef.current = false
    pathRef.current = []
    setDragging(false)
    setPath([])
  }

  // Releasing anywhere (even off the grid) ends the drag; a cancelled
  // pointer drops it. Latest handlers are read through refs.
  const endDragRef = useRef(endDrag)
  const cancelDragRef = useRef(cancelDrag)
  useEffect(() => { endDragRef.current = endDrag; cancelDragRef.current = cancelDrag })
  useEffect(() => {
    if (!dragging) return undefined
    const up = () => endDragRef.current()
    const cancel = () => cancelDragRef.current()
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [dragging])

  const staleTypedRef = useRef(false)
  const typedInputRef = useRef(null)
  const markTypedStale = () => {
    staleTypedRef.current = true
    if (document.activeElement === typedInputRef.current) typedInputRef.current?.select()
  }

  const submitTyped = () => {
    if (!typed) return
    const kind = submit(typed)
    // A rejected word stays visible; the next letter starts a fresh word.
    if (kind === 'valid' || kind === 'duplicate') setTyped('')
    else markTypedStale()
  }

  // Physical keyboard without focusing the box: useGameKeys ignores keys
  // typed into text fields (this box's own input included) and reads the
  // latest state — the old demo's listener kept a stale word list.
  useGameKeys((e) => {
    if (e.key === 'Enter') {
      if (!typed) return false
      submitTyped()
      return true
    }
    if (e.key === 'Backspace' || e.key === 'Escape') {
      if (!typed) return false
      staleTypedRef.current = false
      setTyped(w => (e.key === 'Escape' ? '' : w.slice(0, -1)))
      return true
    }
    if (/^[a-zA-Z]$/.test(e.key)) {
      const fresh = staleTypedRef.current
      staleTypedRef.current = false
      setTyped(w => (fresh ? e.key.toUpperCase() : w.length < MAX_TYPED ? w + e.key.toUpperCase() : w))
      return true
    }
    return false
  }, { enabled: playing })

  const rail = (
    <MatchScoreRail
      game={{ scores, players: names }}
      mySymbol="X"
      matchTarget={MATCH_WINS}
      roundLabel={`ROUND ${winners.length + 1}`}
    />
  )

  if (!dict) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <LoadingLine />
        {dictError && (
          <>
            <p className="font-pixel text-[9px] text-retro-p2 mt-3">COULDN&apos;T LOAD WORD LIST</p>
            <button
              type="button"
              onClick={retryDictionary}
              disabled={retrying}
              className="mt-2 px-4 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95 disabled:opacity-50"
            >
              {retrying ? 'RETRYING…' : 'RETRY'}
            </button>
          </>
        )}
      </div>
    )
  }

  if (!round) {
    return (
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="w-full">{rail}</div>
        <div className="font-pixel text-[8px] text-retro-dim space-y-1 text-left mx-auto w-fit">
          <p>● TRACE ADJACENT TILES (DIAGONALS COUNT)</p>
          <p>✎ {MIN_WORD_LENGTH}+ LETTERS · NO REUSING A TILE · Qu COUNTS AS 2</p>
          <p>⏱ {ROUND_MS / 1000}-SECOND HUNT · MOST POINTS WINS · FIRST TO {MATCH_WINS}</p>
        </div>
        <button
          type="button"
          onClick={startRound}
          className="px-6 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
        >
          READY
        </button>
      </div>
    )
  }

  if (counting) {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <p className="font-pixel text-[9px] text-retro-dim arcade-blink">GET READY!</p>
        <p className="font-pixel text-7xl text-retro-win text-glow-win">{Math.ceil((huntStart - now) / 1000)}</p>
      </div>
    )
  }

  const myScore = scoreWords(myWords)
  const botScore = scoreWords(botWords)

  if (done) {
    const mySet = new Set(myWords)
    const botSet = new Set(botWords)
    const missed = topMissedWords(round.grid, dict, [myWords, botWords])
    const w = verdict.winner
    return (
      <div className="space-y-3">
        {rail}
        <p className={cn('text-center font-pixel text-sm', w === 'X' ? 'text-retro-win text-glow-win' : w === 'draw' ? 'text-retro-text' : 'text-retro-p2')} aria-live="polite">
          {w === 'X' ? 'YOU WIN THE ROUND!' : w === 'draw' ? "IT'S A DRAW" : 'THE CPU WINS THE ROUND'}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[['X', myScore, 'text-retro-p1', 'border-retro-p1/60'], ['O', botScore, 'text-retro-p2', 'border-retro-p2/60']].map(([sym, pts, col, border]) => (
            <div key={sym} className={cn('bg-retro-card border rounded p-3 text-center space-y-1', border)}>
              <p className={cn('font-pixel text-[8px]', col)}>{sym === 'X' ? 'YOU' : 'CPU'}</p>
              <p className={cn('font-pixel text-3xl tabular-nums', w === sym ? 'text-retro-win text-glow-win' : 'text-retro-text')}>{pts}</p>
              <p className="font-pixel text-[8px] text-retro-dim">ROUND POINTS</p>
            </div>
          ))}
        </div>
        {DECIDED_BY_COPY[verdict.decidedBy] && (
          <p className="font-pixel text-[8px] text-retro-dim text-center">{DECIDED_BY_COPY[verdict.decidedBy]}</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <WordColumn label="YOU" words={myWords} other={botSet} tone="text-retro-p1" />
          <WordColumn label="CPU" words={botWords} other={mySet} tone="text-retro-p2" />
        </div>
        <section className="rounded border border-retro-cta/50 bg-retro-tint-cta/30 p-3" aria-label="Top missed words">
          <h3 className="font-pixel text-[9px] tracking-widest text-retro-cta">TOP MISSED</h3>
          <p className="mt-1 font-mono text-[10px] text-retro-dim">Words nobody found · {round.solutions.length} on this grid</p>
          {missed.length ? (
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {missed.map(m => (
                <li key={m} className="font-pixel text-xs uppercase tracking-wider text-retro-text">
                  {m} <span className="text-retro-win">+{scoreWord(m)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 font-pixel text-[9px] text-retro-text">NOTHING LEFT — EVERY WORD WAS FOUND</p>
          )}
        </section>
        {champion ? (
          <div className="text-center space-y-2">
            <p className={cn('font-pixel text-sm', champion === 'X' ? 'text-retro-win text-glow-win' : 'text-retro-p2')}>
              {champion === 'X' ? 'YOU WIN THE MATCH!' : 'THE CPU WINS THE MATCH'}
            </p>
            <button
              type="button"
              onClick={newMatch}
              className="px-5 py-2 font-pixel text-[10px] bg-retro-cta text-retro-bg rounded hover:shadow-neon-cta active:scale-95"
            >
              NEW MATCH
            </button>
          </div>
        ) : (
          <div className="text-center">
            <button
              type="button"
              onClick={nextRound}
              className="px-5 py-2 font-pixel text-[10px] border border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 active:scale-95"
            >
              NEXT ROUND — NEW GRID
            </button>
          </div>
        )}
      </div>
    )
  }

  const cellState = (i) => {
    if (dragging) return path.includes(i) ? 'path' : 'idle'
    if (flash?.path.includes(i)) {
      return flash.kind === 'valid' ? 'valid' : flash.kind === 'duplicate' ? 'duplicate' : 'invalid'
    }
    return 'idle'
  }
  const feedback = feedbackFor(lastResult)
  const preview = dragging ? rawWordFromPath(path).toUpperCase() : ''

  return (
    <div className="space-y-3">
      {rail}
      <RoundTimer endsAt={deadline} now={now} totalMs={ROUND_MS} />
      <div className="flex items-center justify-between font-pixel text-[9px]" aria-live="off">
        <span className="text-retro-p1">YOU {myScore} · {myWords.length} WORDS</span>
        <span className="text-retro-p2">CPU {botScore} · {botWords.length} WORDS</span>
      </div>

      <p aria-hidden="true" className="h-7 text-center font-pixel text-lg tracking-[0.2em] text-retro-cta truncate">{preview}</p>
      <div
        className="relative grid grid-cols-4 gap-2 max-w-xs mx-auto touch-none select-none"
        style={{ touchAction: 'none' }}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={cancelDrag}
      >
        {Array.from({ length: CELL_COUNT }, (_, i) => (
          <div key={i} data-wh-cell={i} className="aspect-square" onPointerDown={() => startDrag(i)}>
            <Tile letter={round.grid[i]} state={cellState(i)} />
          </div>
        ))}
      </div>

      <WordFeedback message={feedback.message} tone={feedback.tone} id={lastResult?.id} />

      <form className="mx-auto max-w-xs flex gap-2" onSubmit={(e) => { e.preventDefault(); submitTyped() }}>
        <input
          type="text"
          ref={typedInputRef}
          value={typed}
          onChange={(e) => { staleTypedRef.current = false; setTyped(e.target.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, MAX_TYPED)) }}
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          aria-label="Type a word"
          placeholder="OR TYPE A WORD…"
          className="min-w-0 flex-1 min-h-11 rounded border border-retro-border bg-retro-card px-3 font-pixel text-xs tracking-widest text-retro-text placeholder:text-retro-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-retro-cta"
        />
        <button
          type="submit"
          disabled={!typed}
          className="min-h-11 rounded bg-retro-cta px-3 font-pixel text-[9px] text-retro-bg active:scale-95 disabled:opacity-50"
        >
          ENTER
        </button>
      </form>

      <div className="bg-retro-card border border-retro-border rounded p-2 max-h-32 overflow-y-auto">
        {myWords.length === 0 ? (
          <p className="font-pixel text-[9px] text-retro-dim text-center py-3">TRACE OR TYPE WORDS TO FIND THEM HERE</p>
        ) : (
          <ul className="space-y-1">
            {[...myWords].reverse().map(w => (
              <li key={w} className="flex justify-between font-mono text-xs text-retro-text px-1">
                <span className="uppercase tracking-wide">{w}</span>
                <span className="text-retro-win font-pixel text-[9px]">{scoreWord(w)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
