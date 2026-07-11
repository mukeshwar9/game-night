import { useCallback, useEffect, useRef, useState } from 'react'
import { ref, update, push, runTransaction, onValue, serverTimestamp } from 'firebase/database'
import { db } from '../lib/firebase'
import { commit, verifyReveal } from '../lib/commit'
import {
  seatOrder,
  hashString,
  CHOOSE_MS,
  DRAW_MS,
  REVEAL_MS,
  SKIP_CHOOSING_GRACE_MS,
  ARTIST_OFFLINE_DRAWING_MS,
  normalize,
  wordPattern,
  pickOptions,
  cyclesFor,
  nextRoundState,
  activeGuessers,
  roundDeltas,
  deriveWord,
} from '../lib/sketchLogic'
import { SKETCH_WORDS } from '../lib/decks/sketch'
import SketchCanvas from '../components/SketchCanvas'
import Avatar from '../components/Avatar'
import GameSwitcher from '../components/GameSwitcher'
import PixelDots from '../components/loading/PixelDots'
import { sounds } from '../lib/sounds'
import { shareResult } from '../lib/shareCard'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'
import { toast } from 'sonner'

const MIN_PLAYERS = 2

// ---------------------------------------------------------------------------
// useServerNow — .info/serverTimeOffset corrected clock, ticking every 250ms
// so countdown UIs re-render. now() itself is cheap/pure between ticks.
// ---------------------------------------------------------------------------
function useServerNow() {
  const offsetRef = useRef(0)
  const [, setTick] = useState(0)
  useEffect(() => {
    const offRef = ref(db, '.info/serverTimeOffset')
    const unsub = onValue(offRef, snap => { offsetRef.current = snap.val() || 0 })
    const interval = setInterval(() => setTick(t => (t + 1) % 1e6), 250)
    return () => { unsub(); clearInterval(interval) }
  }, [])
  return useCallback(() => Date.now() + offsetRef.current, [])
}

function normalizeRound(raw) {
  if (!raw) return null
  return {
    phase: raw.phase ?? 'choosing',
    cycle: raw.cycle ?? 1,
    artist: raw.artist ?? null,
    order: Array.isArray(raw.order) ? raw.order : (raw.order ? Object.values(raw.order) : []),
    used: Array.isArray(raw.used) ? raw.used : (raw.used ? Object.values(raw.used) : []),
    options: Array.isArray(raw.options) ? raw.options : (raw.options ? Object.values(raw.options) : null),
    commitment: raw.commitment ?? null,
    wordPattern: raw.wordPattern ?? '',
    endsAt: raw.endsAt ?? 0,
    chat: raw.chat ?? {},
    correct: raw.correct ?? {},
    scored: !!raw.scored,
  }
}

// Public wordPattern string (e.g. "5" or "3 3") -> underscore blanks.
function renderBlanks(pattern) {
  return (pattern || '')
    .split(' ')
    .filter(Boolean)
    .map(n => Array(Number(n)).fill('_').join(' '))
    .join('   ')
}

// ---------------------------------------------------------------------------
// Scoreboard — every seated player, sorted by score desc.
// ---------------------------------------------------------------------------
function Scoreboard({ players, scores, mySeat, highlight }) {
  const rows = seatOrder(players || {})
    .map(id => ({ id, name: players?.[id]?.name || '???', score: scores?.[id] || 0 }))
    .sort((a, b) => b.score - a.score)

  return (
    <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1.5">
      <p className="font-pixel text-[8px] text-retro-dim tracking-widest text-center">SCORES</p>
      {rows.map(p => (
        <div key={p.id} className="flex items-center justify-between font-pixel text-[9px]">
          <span className={cn('truncate', p.id === mySeat ? 'text-retro-cta' : 'text-retro-text')}>
            {p.name.toUpperCase()}{p.id === mySeat ? ' (YOU)' : ''}
          </span>
          <span className={cn('tabular-nums', highlight?.[p.id] ? 'text-retro-win text-glow-win' : 'text-retro-dim')}>
            {p.score}{highlight?.[p.id] ? ` +${highlight[p.id]}` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CountdownBar — thin retro progress bar + seconds-remaining readout.
// ---------------------------------------------------------------------------
function CountdownBar({ endsAt, totalMs, now }) {
  const remaining = Math.max(0, (endsAt || 0) - now)
  const pct = totalMs > 0 ? Math.max(0, Math.min(100, (remaining / totalMs) * 100)) : 0
  const seconds = Math.ceil(remaining / 1000)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-retro-surface border border-retro-border rounded overflow-hidden">
        <div className="h-full bg-retro-cta transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-pixel text-[9px] text-retro-cta w-5 text-right tabular-nums">{seconds}</span>
    </div>
  )
}

export default function SketchGame({
  gameId, game, mySeat, players, isHost,
  onStart, onSwitchGame, onNewMatch, proposal,
}) {
  const now = useServerNow()
  const nowMs = now()

  const round = normalizeRound(game.round)
  const roundKey = round ? `${round.cycle}:${round.artist}` : null
  const isArtist = !!round && round.artist === mySeat
  const isPlayer = !!mySeat && !!players?.[mySeat]
  const guesserIds = round ? activeGuessers(players || {}, round.order, round.artist) : []
  const haveIGuessedCorrectly = !!round?.correct?.[mySeat]

  const [guessInput, setGuessInput] = useState('')
  const [derivedWord, setDerivedWord] = useState(null)
  // Last-seen drawing-phase endsAt, captured via effect (see below) — `round.endsAt`
  // gets overwritten to the reveal deadline the instant the phase flips, but the
  // reveal screen still needs the ORIGINAL drawing deadline to recompute the same
  // score-delta numbers the host's transaction used (display only — the
  // authoritative numbers already live in `scores`).
  const [drawEndsAt, setDrawEndsAt] = useState(null)
  // epoch-ms when THIS client first observed the artist go offline mid-drawing.
  const [artistOfflineSince, setArtistOfflineSince] = useState(null)
  const [pickingIdx, setPickingIdx] = useState(null)  // word option this client last clicked (busy-label only)

  // House convention: every button firing an async Firebase write / navigator.share
  // goes through useBusy — synchronous re-entry guard + disabled/gerund UI state.
  const [starting, runStart] = useBusy()                 // START ROUND
  const [picking, runPick] = useBusy()                   // choosing: word pick
  const [guessing, runGuess] = useBusy()                 // drawing: guess submit
  const [skippingChoosing, runSkipChoosing] = useBusy()   // choosing: SKIP ROUND
  const [skippingDrawing, runSkipDrawing] = useBusy()     // drawing: SKIP ROUND (artist offline)
  const [resettingMatch, runNewMatch] = useBusy()         // finished: NEW MATCH
  const [sharing, runShare] = useBusy()                   // finished: SHARE

  const pickedRef = useRef(false)                    // this client already picked/auto-picked this round
  const correctSentRef = useRef(false)                // this client already published its own correct guess
  const optionsPublishAttemptRef = useRef(null)       // roundKey we last attempted to publish options for
  const hostActionInFlightRef = useRef(false)         // a host advance transaction is currently pending
  const prevPhaseRef = useRef(round?.phase)
  const prevCorrectKeysRef = useRef(new Set())
  const prevStatusRef = useRef(game.status)
  const prevRoundKeyRef = useRef(roundKey)
  const drawEndsAtStoredRef = useRef(null)            // last `drawEndsAt` value already pushed into state
  const artistOfflineSinceStoredRef = useRef(null)    // last `artistOfflineSince` value already pushed into state
  const chatRef = useRef(null)

  // Always-fresh ref mirror of `round` — updated post-render (in an effect, not
  // during render, so this stays clear of the "no ref access during render"
  // rule) so the callbacks below can read the LATEST round without needing the
  // whole (freshly-recreated-every-render) `round` object in their dependency
  // arrays, which the compiler can't otherwise verify is safe to memoize on.
  const roundRef = useRef(round)
  useEffect(() => { roundRef.current = round })

  // ---- Artist: publish 3 word options on entering choosing (once) ----------
  const publishOptions = useCallback(() => {
    const r = roundRef.current
    if (!r || r.phase !== 'choosing' || r.artist !== mySeat || r.options) return
    if (optionsPublishAttemptRef.current === roundKey) return
    optionsPublishAttemptRef.current = roundKey
    const seed = hashString(`${gameId}:${roundKey}`)
    const picks = pickOptions(SKETCH_WORDS, seed, r.used)
    const publishEndsAt = now() + CHOOSE_MS
    runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current || !current.round) return current
      const cr = current.round
      if (cr.phase !== 'choosing' || cr.artist !== mySeat || cr.options) return // stale/already published
      return { ...current, round: { ...cr, options: picks, endsAt: publishEndsAt } }
    }).catch(() => { optionsPublishAttemptRef.current = null })
  }, [roundKey, mySeat, gameId, now])

  // ---- Artist: pick a word (manual click OR auto-pick at 0) ---------------
  const handlePickWord = useCallback(async (deckIndex) => {
    const r = roundRef.current
    if (!r || r.phase !== 'choosing' || r.artist !== mySeat) return
    if (pickedRef.current) return
    const entry = SKETCH_WORDS[deckIndex]
    if (!entry) return
    pickedRef.current = true
    try {
      const { hash, salt } = await commit(normalize(entry.word))
      const pattern = wordPattern(entry.word)
      const drawPhaseEndsAt = now() + DRAW_MS
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || !current.round) return current
        const cr = current.round
        if (cr.phase !== 'choosing' || cr.artist !== mySeat) return // stale — a new artist has since taken over
        return {
          ...current,
          round: { ...cr, commitment: { hash, salt }, wordPattern: pattern, phase: 'drawing', endsAt: drawPhaseEndsAt },
        }
      })
    } catch {
      pickedRef.current = false
      toast.error('PICK FAILED — CHECK CONNECTION')
    }
  }, [mySeat, gameId, now])

  // ---- Guesser: submit a guess — correct locks in via commit verification --
  const handleSubmitGuess = useCallback(async () => {
    const r = roundRef.current
    if (!r || r.phase !== 'drawing') return
    if (r.artist === mySeat || r.correct?.[mySeat] || correctSentRef.current) return
    const raw = guessInput.trim()
    if (!raw) return
    try {
      const isCorrect = r.commitment
        ? await verifyReveal(r.commitment.hash, normalize(raw), r.commitment.salt)
        : false
      if (isCorrect) {
        correctSentRef.current = true
        sounds.win()
        await update(ref(db, `games/${gameId}/round/correct`), { [mySeat]: { at: serverTimestamp() } })
      } else {
        await push(ref(db, `games/${gameId}/round/chat`), { uid: mySeat, text: raw })
      }
      setGuessInput('')
    } catch {
      toast.error('GUESS FAILED — CHECK CONNECTION')
    }
  }, [mySeat, guessInput, gameId])

  // ---- Host: void the round and rotate the artist (choosing stalled) ------
  const handleSkipChoosing = useCallback(async () => {
    const nextEndsAt = now() + CHOOSE_MS
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || !current.round) return current
        const r = current.round
        if (r.phase !== 'choosing') return // already resolved
        const result = nextRoundState(r)
        if (result.finished) return { ...current, status: 'finished', proposal: null }
        return { ...current, proposal: null, round: { ...result.round, endsAt: nextEndsAt } }
      })
    } catch {
      toast.error('SKIP FAILED — CHECK CONNECTION')
    }
  }, [gameId, now])

  // ---- Host: drawing -> reveal, scoring atomically in the same transaction -
  const advanceDrawingToReveal = useCallback(async () => {
    if (hostActionInFlightRef.current) return
    hostActionInFlightRef.current = true
    const revealEndsAt = now() + REVEAL_MS
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || !current.round) return current
        const r = current.round
        if (r.phase !== 'drawing') return // already advanced
        const liveGuesserIds = activeGuessers(current.players || {}, r.order || [], r.artist)
        const deltas = roundDeltas({
          guesserIds: liveGuesserIds,
          correct: r.correct || {},
          artistId: r.artist,
          endsAt: r.endsAt,
        })
        const newScores = { ...(current.scores || {}) }
        for (const [id, pts] of Object.entries(deltas)) newScores[id] = (newScores[id] || 0) + pts
        return {
          ...current,
          scores: newScores,
          round: { ...r, scored: true, phase: 'reveal', endsAt: revealEndsAt },
        }
      })
    } catch {
      toast.error('SKIP FAILED — CHECK CONNECTION')
    } finally {
      hostActionInFlightRef.current = false
    }
  }, [gameId, now])

  // ---- Host: reveal -> next round (or match finished) on timeout ----------
  const advanceRevealToNext = useCallback(async (expectedEndsAt) => {
    if (hostActionInFlightRef.current) return
    hostActionInFlightRef.current = true
    const nextEndsAt = now() + CHOOSE_MS
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || !current.round) return current
        const r = current.round
        if (r.phase !== 'reveal' || r.endsAt !== expectedEndsAt) return // already advanced / stale
        const result = nextRoundState(r)
        if (result.finished) return { ...current, status: 'finished', proposal: null }
        return { ...current, proposal: null, round: { ...result.round, endsAt: nextEndsAt } }
      })
    } catch {
      /* ignore */
    } finally {
      hostActionInFlightRef.current = false
    }
  }, [gameId, now])

  // ---- Reset per-round local state when a NEW round begins ----------------
  useEffect(() => {
    if (roundKey !== prevRoundKeyRef.current) {
      setGuessInput('')
      setDerivedWord(null)
      setArtistOfflineSince(null)
      setPickingIdx(null)
      correctSentRef.current = false
      pickedRef.current = false
      prevCorrectKeysRef.current = new Set()
      artistOfflineSinceStoredRef.current = null
      prevRoundKeyRef.current = roundKey
    }
  }, [roundKey])

  // ---- Derive the chosen word from public options + commitment ------------
  // (No synchronous "clear" branch here — commitment/options only ever go
  // missing on a genuinely NEW round, which the reset-per-round effect above
  // already handles; this effect only ever needs to SET a resolved word.)
  const optionsKey = round?.options ? round.options.join(',') : null
  useEffect(() => {
    if (!round?.commitment?.hash || !round?.options) return
    let cancelled = false
    deriveWord(SKETCH_WORDS, round.options, round.commitment).then(word => {
      if (!cancelled) setDerivedWord(word)
    })
    return () => { cancelled = true }
  }, [round?.commitment?.hash, optionsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Sound cues: phase transitions -----------------------------------
  useEffect(() => {
    if (!round) return
    if (round.phase !== prevPhaseRef.current) {
      if (round.phase === 'drawing') sounds.go()
      if (round.phase === 'reveal' && Object.keys(round.correct || {}).length === 0) sounds.miss()
      prevPhaseRef.current = round.phase
    }
  }, [round?.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Sound cue: someone ELSE's correct guess lands -----------------------
  useEffect(() => {
    if (!round) return
    const keys = Object.keys(round.correct || {})
    const prev = prevCorrectKeysRef.current
    const isNewRound = keys.length < prev.size // a round boundary just reset correct — don't diff across it
    if (!isNewRound && keys.some(k => !prev.has(k) && k !== mySeat)) sounds.bell()
    prevCorrectKeysRef.current = new Set(keys)
  }, [round?.correct, mySeat]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Sound cue: match finished -------------------------------------------
  useEffect(() => {
    if (game.status !== prevStatusRef.current) {
      if (game.status === 'finished' && isPlayer) {
        const scores = game.scores || {}
        const order = seatOrder(players || {})
        const maxScore = Math.max(0, ...order.map(id => scores[id] || 0))
        if ((scores[mySeat] || 0) === maxScore) sounds.matchWin()
        else sounds.lose()
      }
      prevStatusRef.current = game.status
    }
  }, [game.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Artist: publish options as soon as we enter choosing ----------------
  useEffect(() => { publishOptions() }, [publishOptions])

  // ---- Artist: auto-pick options[0] once the choosing clock hits 0 --------
  useEffect(() => {
    if (!round || round.phase !== 'choosing' || round.artist !== mySeat) return
    if (!round.options || pickedRef.current) return
    if (nowMs < (round.endsAt || 0)) return
    handlePickWord(round.options[0])
  }, [round?.phase, round?.artist, optionsKey, round?.endsAt, mySeat, nowMs, handlePickWord]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Snapshot the drawing phase's own endsAt (see `drawEndsAt` above) ----
  // Gated on a ref comparison (not just the dependency list) so this reads as
  // "sync only on genuine change", matching the reset-per-round effect's shape.
  useEffect(() => {
    if (round?.phase === 'drawing' && round.endsAt !== drawEndsAtStoredRef.current) {
      drawEndsAtStoredRef.current = round.endsAt
      setDrawEndsAt(round.endsAt)
    }
  }, [round?.phase, round?.endsAt])

  // ---- Track how long THIS client has observed the artist as offline ------
  useEffect(() => {
    const artistOnline = !round || round.phase !== 'drawing' || players?.[round.artist]?.online !== false
    if (artistOnline) {
      if (artistOfflineSinceStoredRef.current !== null) {
        artistOfflineSinceStoredRef.current = null
        setArtistOfflineSince(null)
      }
      return
    }
    if (artistOfflineSinceStoredRef.current == null) {
      artistOfflineSinceStoredRef.current = nowMs
      setArtistOfflineSince(nowMs)
    }
  }, [round?.phase, round?.artist, players, nowMs]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Host: drawing -> reveal, automatically, on timeout or all-correct --
  useEffect(() => {
    if (!isHost || !round || round.phase !== 'drawing') return
    const allCorrect = guesserIds.length > 0 && guesserIds.every(id => round.correct?.[id])
    const timedOut = nowMs >= (round.endsAt || 0)
    if (allCorrect || timedOut) advanceDrawingToReveal()
  }, [isHost, round?.phase, round?.endsAt, round?.correct, guesserIds.join(','), nowMs, advanceDrawingToReveal]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Host: reveal -> next round, automatically, on timeout --------------
  useEffect(() => {
    if (!isHost || !round || round.phase !== 'reveal') return
    if (nowMs < (round.endsAt || 0)) return
    advanceRevealToNext(round.endsAt)
  }, [isHost, round?.phase, round?.endsAt, nowMs, advanceRevealToNext]) // eslint-disable-line react-hooks/exhaustive-deps

  // Chat auto-scroll.
  const chatEntries = round ? Object.entries(round.chat || {}).sort(([a], [b]) => (a < b ? -1 : 1)) : []
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [chatEntries.length])

  // -------------------------------------------------------------------------
  // LOBBY / FINISHED (status !== 'playing')
  // -------------------------------------------------------------------------
  if (game.status !== 'playing') {
    const matchOver = game.status === 'finished'
    const order = seatOrder(players || {})
    const playerCount = order.length
    const scores = game.scores || {}
    const maxScore = matchOver ? Math.max(0, ...order.map(id => scores[id] || 0)) : 0
    const winners = matchOver ? order.filter(id => (scores[id] || 0) === maxScore) : []
    const iWon = winners.includes(mySeat)
    const enough = playerCount >= MIN_PLAYERS
    const winnerNames = winners.map(id => (players[id]?.name || '???').toUpperCase())

    return (
      <div className="space-y-5 text-center">
        {matchOver && winners.length > 0 && (
          <div className="space-y-1">
            <p className="font-pixel text-[10px] text-retro-dim tracking-widest">MATCH OVER</p>
            <p className="font-pixel text-base text-retro-cta text-glow-cta">
              {iWon ? 'YOU WIN!' : winners.length > 1 ? `${winners.length}-WAY TIE — ${winnerNames.join(' & ')}` : `${winnerNames[0]} WINS`}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <p className="font-pixel text-sm text-retro-p1 text-glow-p1">SKETCH</p>
          <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
            One player draws the secret word.<br />Everyone else races to guess it.
          </p>
        </div>

        <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1.5">
          <p className="font-pixel text-[9px] text-retro-dim tracking-widest">PLAYERS ({playerCount})</p>
          {order.length === 0 && <p className="font-mono text-[11px] text-retro-dim arcade-blink">WAITING…</p>}
          {order.map(id => (
            <div key={id} className="flex items-center justify-between gap-2 font-mono text-[11px]">
              <span className={cn('flex items-center gap-1.5 truncate', id === mySeat ? 'text-retro-p1' : 'text-retro-text')}>
                <Avatar id={players[id]?.avatar} size={20} />
                {(players[id]?.name || '???').toUpperCase()}{id === mySeat ? ' (YOU)' : ''}
                {players[id]?.online === false && <span className="text-retro-p2 text-[9px]"> ·OFFLINE</span>}
              </span>
              {matchOver && <span className="text-retro-dim ml-2">{scores[id] || 0}</span>}
            </div>
          ))}
        </div>

        {!enough && !matchOver && (
          <p className="font-pixel text-[10px] text-retro-p2 arcade-blink leading-relaxed">
            NEED {MIN_PLAYERS - playerCount} MORE PLAYER{MIN_PLAYERS - playerCount === 1 ? '' : 'S'}<br />TO START
          </p>
        )}

        {isHost && enough && !matchOver && (
          <button
            onClick={() => runStart(onStart)}
            disabled={starting}
            className="px-6 py-2.5 min-w-[8.5rem] bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50"
          >
            {starting ? 'STARTING…' : 'START ROUND'}
          </button>
        )}
        {!isHost && enough && !matchOver && (
          <p className="font-pixel text-[10px] text-retro-dim arcade-blink">WAITING FOR HOST TO START…</p>
        )}

        {matchOver && isPlayer && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {!proposal && onNewMatch && (
              <button
                onClick={() => runNewMatch(onNewMatch)}
                disabled={resettingMatch}
                className="px-6 py-2.5 min-w-[8.5rem] bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50"
              >
                {resettingMatch ? 'RESETTING…' : 'NEW MATCH'}
              </button>
            )}
            <button
              onClick={() => runShare(async () => {
                const ok = await shareResult({
                  gameLabel: 'SKETCH',
                  headline: iWon ? 'YOU WIN!' : winners.length > 1 ? `${winners.length}-WAY TIE` : `${winnerNames[0]} WINS`,
                  sub: 'Sketch · Game Night',
                  accentVar: '--c-cta',
                  url: window.location.href,
                })
                if (!ok) toast.error("COULDN'T BUILD SHARE CARD — TRY AGAIN")
              })}
              disabled={sharing}
              className="px-6 py-2.5 min-w-[6.5rem] font-pixel text-xs border-2 border-retro-border text-retro-dim rounded hover:border-retro-cta hover:text-retro-cta transition-all active:scale-95 disabled:opacity-50"
            >
              {sharing ? 'BUILDING…' : 'SHARE'}
            </button>
          </div>
        )}

        {isPlayer && onSwitchGame && !proposal && <GameSwitcher currentType="sketch" onSwitch={onSwitchGame} />}
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Starting up — round not seeded yet.
  // -------------------------------------------------------------------------
  if (!round || !round.artist) {
    return (
      <div className="text-center py-8 font-pixel text-[10px] text-retro-dim arcade-blink">
        STARTING ROUND…
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Active round.
  // -------------------------------------------------------------------------
  const artistName = (players[round.artist]?.name || '???').toUpperCase()
  const totalCycles = cyclesFor(round.order.length)
  const showChoosingSkip = isHost && round.phase === 'choosing' && nowMs >= (round.endsAt || 0) + SKIP_CHOOSING_GRACE_MS
  const artistOfflineMs = artistOfflineSince != null ? nowMs - artistOfflineSince : 0
  const showArtistOfflineSkip = isHost && round.phase === 'drawing' && artistOfflineMs >= ARTIST_OFFLINE_DRAWING_MS

  const revealGuesserIds = activeGuessers(players || {}, round.order, round.artist)
  const revealDeltas = round.phase === 'reveal'
    ? roundDeltas({
      guesserIds: revealGuesserIds,
      correct: round.correct,
      artistId: round.artist,
      endsAt: drawEndsAt ?? round.endsAt,
    })
    : null

  return (
    <div className="space-y-4">
      <p className="font-pixel text-[8px] text-retro-dim tracking-widest text-center">
        CYCLE {round.cycle}/{totalCycles} · ARTIST: {isArtist ? 'YOU' : artistName}
      </p>

      <Scoreboard
        players={players}
        scores={game.scores}
        mySeat={mySeat}
        highlight={round.phase === 'reveal' ? revealDeltas : null}
      />

      {/* ---- CHOOSING PHASE ---- */}
      {round.phase === 'choosing' && (
        <div className="bg-retro-card border border-retro-border rounded p-4 space-y-3 text-center">
          <p className="font-pixel text-[9px] text-retro-dim tracking-widest">
            {isArtist ? 'PICK A WORD' : `${artistName} IS CHOOSING A WORD…`}
          </p>
          <CountdownBar endsAt={round.endsAt} totalMs={CHOOSE_MS} now={nowMs} />
          {isArtist ? (
            round.options ? (
              <div className="space-y-2">
                {round.options.map(idx => (
                  <button
                    key={idx}
                    onClick={() => { setPickingIdx(idx); runPick(() => handlePickWord(idx)) }}
                    disabled={picking}
                    className="w-full px-3 py-2.5 font-mono text-[13px] rounded border-2 border-retro-border text-retro-text hover:border-retro-p1 hover:shadow-neon-p1 transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {picking && pickingIdx === idx ? 'LOCKING IN…' : (SKETCH_WORDS[idx]?.word || '').toUpperCase()}
                  </button>
                ))}
              </div>
            ) : (
              <p className="font-pixel text-[9px] text-retro-dim arcade-blink py-4">PICKING WORDS…</p>
            )
          ) : (
            <div className="flex justify-center py-4">
              <PixelDots tone="p2" size="lg" glow />
            </div>
          )}
          {showChoosingSkip && (
            <button
              onClick={() => runSkipChoosing(handleSkipChoosing)}
              disabled={skippingChoosing}
              className="px-5 py-2 font-pixel text-[9px] border border-retro-p2 text-retro-p2 rounded hover:shadow-neon-p2 transition-all active:scale-95 disabled:opacity-50"
            >
              {skippingChoosing ? 'SKIPPING…' : 'SKIP ROUND'}
            </button>
          )}
        </div>
      )}

      {/* ---- DRAWING PHASE ---- */}
      {round.phase === 'drawing' && (
        <div className="space-y-3">
          <SketchCanvas gameId={gameId} isArtist={isArtist} />

          <div className="text-center space-y-1">
            {haveIGuessedCorrectly ? (
              <>
                <p className="font-pixel text-base text-retro-win text-glow-win tracking-widest">
                  {derivedWord ? derivedWord.toUpperCase() : '…'}
                </p>
                <p className="font-pixel text-[9px] text-retro-win arcade-blink">✓ YOU GOT IT — WAITING…</p>
              </>
            ) : isArtist ? (
              <p className="font-pixel text-base text-retro-cta text-glow-cta tracking-widest">
                {derivedWord ? derivedWord.toUpperCase() : '…'}
              </p>
            ) : (
              <p className="font-pixel text-base text-retro-text tracking-[0.3em]">{renderBlanks(round.wordPattern)}</p>
            )}
          </div>

          <CountdownBar endsAt={round.endsAt} totalMs={DRAW_MS} now={nowMs} />

          {isPlayer && !isArtist && !haveIGuessedCorrectly && (
            <div className="flex gap-1.5">
              <input
                type="text"
                value={guessInput}
                onChange={e => setGuessInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runGuess(handleSubmitGuess)}
                autoFocus
                placeholder="TYPE YOUR GUESS…"
                className="flex-1 bg-retro-surface border-2 border-retro-border text-retro-text font-mono text-[12px] rounded px-3 py-2 focus:outline-none focus:border-retro-p1"
              />
              <button
                onClick={() => runGuess(handleSubmitGuess)}
                disabled={guessing || !guessInput.trim()}
                className="px-4 py-2 min-w-[4.5rem] bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95 disabled:opacity-40"
              >
                {guessing ? 'GUESSING…' : 'GO'}
              </button>
            </div>
          )}

          {isArtist && (
            <p className="font-pixel text-[9px] text-retro-dim text-center">
              {Object.keys(round.correct || {}).length}/{guesserIds.length} GUESSED SO FAR
            </p>
          )}

          <div ref={chatRef} className="max-h-40 overflow-y-auto bg-retro-card border border-retro-border rounded p-2 space-y-1">
            {chatEntries.length === 0 && (
              <p className="font-mono text-[10px] text-retro-dim text-center">NO GUESSES YET</p>
            )}
            {chatEntries.map(([key, c]) => (
              <p key={key} className="font-mono text-[11px] text-retro-text break-words">
                <span className="text-retro-dim">{(players[c.uid]?.name || '???').toUpperCase()}:</span> {c.text}
              </p>
            ))}
          </div>

          {showArtistOfflineSkip && (
            <div className="text-center space-y-2 border border-retro-p2/30 rounded p-3">
              <p className="font-pixel text-[9px] text-retro-p2">ARTIST IS OFFLINE</p>
              <button
                onClick={() => runSkipDrawing(() => advanceDrawingToReveal())}
                disabled={skippingDrawing}
                className="px-5 py-2 font-pixel text-[9px] border border-retro-p2 text-retro-p2 rounded hover:shadow-neon-p2 transition-all active:scale-95 disabled:opacity-50"
              >
                {skippingDrawing ? 'SKIPPING…' : 'SKIP ROUND'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---- REVEAL PHASE ---- */}
      {round.phase === 'reveal' && (
        <div className="space-y-3">
          <SketchCanvas gameId={gameId} isArtist={false} />
          <p className="font-pixel text-lg text-retro-win text-glow-win text-center tracking-widest">
            {derivedWord ? derivedWord.toUpperCase() : '…'}
          </p>
          {!round.scored ? (
            <p className="font-pixel text-[10px] text-retro-cta text-glow-cta text-center arcade-blink py-2">TALLYING…</p>
          ) : null}
          <CountdownBar endsAt={round.endsAt} totalMs={REVEAL_MS} now={nowMs} />
        </div>
      )}

      {!proposal && onSwitchGame && <GameSwitcher currentType="sketch" onSwitch={onSwitchGame} />}
    </div>
  )
}
