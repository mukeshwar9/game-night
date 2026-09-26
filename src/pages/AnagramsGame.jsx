import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { onValue, ref, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import AnagramTiles from '../components/AnagramTiles'
import GameSwitcher from '../components/GameSwitcher'
import MatchScoreRail from '../components/MatchScoreRail'
import RoundTimer from '../components/RoundTimer'
import WordFeedback from '../components/WordFeedback'
import OfflineNotice from '../components/loading/OfflineNotice'
import PixelDots from '../components/loading/PixelDots'
import useBusy from '../hooks/useBusy'
import useGameKeys from '../hooks/useGameKeys'
import useServerClock from '../hooks/useServerClock'
import { getGameConfig } from '../lib/games'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  applyFoundWord, canBuildWord, compareRound, MATCH_TARGET, MIN_WORD_LENGTH, missedWords,
  normalizeWord, RACK_SIZE, resolveRound, ROUND_MS, roundStartDue, scoreFound, scoreWord,
  shouldReveal, startRound, validFound,
} from '../lib/anagramsLogic'
import { ANAGRAM_RACK_WORDS, ANAGRAM_VALID_WORDS } from '../lib/decks/anagrams'

const VALID_WORDS = new Set(ANAGRAM_VALID_WORDS)
// While a round-start/resolve transaction is due, retry it this often (a
// transaction another client already ran simply aborts).
const RETRY_MS = 2_000

function normalizeFound(raw) {
  if (!raw || typeof raw !== 'object') return {}
  return Object.fromEntries(Object.entries(raw).filter(([, value]) => value && typeof value === 'object'))
}

// Only words that are legal on this round's rack — found keys are written by
// clients, so a forged key is never shown or counted (resolveRound agrees).
function checkedFound(round, key) {
  return validFound(normalizeFound(round?.[`found${key}`]), round?.rack, VALID_WORDS)
}

function wordsFrom(found) {
  return Object.entries(normalizeFound(found))
    .sort(([, a], [, b]) => (a.at || 0) - (b.at || 0))
    .map(([word]) => word)
}

// Submission outcome → the reason line (WordFeedback).
function feedbackFor(feedback) {
  if (!feedback) return { message: '', tone: 'info' }
  const word = String(feedback.word ?? '').toUpperCase()
  const withWord = (reason) => (word ? `${word} — ${reason}` : reason)
  switch (feedback.kind) {
    case 'valid':
      return { message: `${word} · +${feedback.points} POINT${feedback.points === 1 ? '' : 'S'}`, tone: 'ok' }
    case 'duplicate': return { message: withWord('ALREADY FOUND'), tone: 'info' }
    case 'letters': return { message: withWord('USE ONLY RACK LETTERS'), tone: 'bad' }
    case 'short': return { message: withWord(`TOO SHORT — ${MIN_WORD_LENGTH}+ LETTERS`), tone: 'bad' }
    case 'early': return { message: 'WAIT FOR GO', tone: 'bad' }
    case 'closed': return { message: withWord("TIME'S UP — NOT SCORED"), tone: 'bad' }
    default: return { message: withWord('NOT A WORD'), tone: 'bad' }
  }
}

function sameIndexes(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function shuffled(values) {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

const nameOf = (game, sym) => game.players?.[sym]?.name?.toUpperCase() || sym

// This rack's points and word counts for both seats, labelled so they are
// never confused with the match score on the rail above.
function RoundPoints({ game, round, myKey, isSpectator }) {
  const order = isSpectator ? ['X', 'O'] : [myKey, myKey === 'X' ? 'O' : 'X']
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded border border-retro-border bg-retro-deep/50 px-3 py-2 font-pixel text-[9px]">
      <span className="text-retro-dim">RACK POINTS</span>
      {order.map(sym => {
        const found = checkedFound(round, sym)
        const words = Object.keys(found).length
        const label = isSpectator ? nameOf(game, sym) : sym === myKey ? 'YOU' : 'THEM'
        return (
          <span key={sym} className={sym === 'X' ? 'text-retro-p1' : 'text-retro-p2'}>
            {label} {scoreFound(found)} · {words} WORD{words === 1 ? '' : 'S'}
            {round?.[`done${sym}`] && <span className="text-retro-dim"> · DONE</span>}
          </span>
        )
      })}
    </div>
  )
}

function FoundWords({ words, title = 'YOUR WORDS' }) {
  return (
    <section className="rounded border border-retro-border bg-retro-card p-3" aria-label={title}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-pixel text-[9px] tracking-widest text-retro-text">{title}</h3>
        <span className="font-mono text-[10px] text-retro-dim">{words.length}</span>
      </div>
      {words.length === 0 ? (
        <p className="py-3 text-center font-pixel text-[9px] text-retro-dim">NO WORDS YET</p>
      ) : (
        <ul className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3">
          {words.map(word => (
            <li key={word} className="flex items-center justify-between rounded border border-retro-structure/70 bg-retro-deep/60 px-2 py-1.5 font-mono text-xs uppercase text-retro-text">
              <span>{word}</span>
              <span className="ml-1 font-pixel text-[9px] text-retro-win">+{scoreWord(word)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// The reveal headline: who won the rack, both players' points and word
// counts, the match score, and the tie-break reason when word count decided.
function RoundSummary({ game, round, myKey, isSpectator, matchTarget, nextInSec, paused }) {
  const stored = round.result
  const result = stored || compareRound(checkedFound(round, 'X'), checkedFound(round, 'O'))
  const decidedBy = result.decidedBy
    ?? (result.winner === 'draw' ? 'draw' : result.scoreX !== result.scoreO ? 'points' : 'words')
  const headline = result.winner === 'draw'
    ? 'RACK DRAWN'
    : !isSpectator && result.winner === myKey ? 'YOU WIN THE RACK' : `${nameOf(game, result.winner)} WINS THE RACK`
  const tone = result.winner === 'draw'
    ? 'text-retro-text'
    : !isSpectator && result.winner === myKey ? 'text-retro-win text-glow-win' : 'text-retro-p2 text-glow-p2'
  const line = (sym) => {
    const points = sym === 'X' ? result.scoreX : result.scoreO
    const words = sym === 'X' ? result.wordsX : result.wordsO
    return `${nameOf(game, sym)}: ${points} POINT${points === 1 ? '' : 'S'} · ${words} WORD${words === 1 ? '' : 'S'}`
  }
  return (
    <section className="modal-pop rounded border-2 border-retro-cta bg-retro-card p-5 text-center shadow-neon-cta" role="status" aria-live="polite">
      <p className="font-pixel text-[9px] tracking-[0.25em] text-retro-dim">RACK {round.roundNum || 1} RESULT</p>
      <h2 className={cn('mt-2 font-pixel text-lg tracking-widest', tone)}>{headline}</h2>
      <p className="mt-3 font-mono text-sm text-retro-p1">{line('X')}</p>
      <p className="font-mono text-sm text-retro-p2">{line('O')}</p>
      {decidedBy === 'words' && (
        <p className="mt-2 font-pixel text-[9px] text-retro-cta">TIED ON POINTS — MORE WORDS WINS</p>
      )}
      {decidedBy === 'draw' && (
        <p className="mt-2 font-pixel text-[9px] text-retro-dim">SAME POINTS AND SAME WORD COUNT</p>
      )}
      <p className="mt-3 font-pixel text-[9px] text-retro-dim">
        MATCH {nameOf(game, 'X')} {game.scores?.X || 0} – {game.scores?.O || 0} {nameOf(game, 'O')} · FIRST TO {matchTarget}
      </p>
      {nextInSec != null && (
        <p className="mt-2 font-pixel text-[9px] text-retro-cta">
          {paused ? 'NEXT RACK WAITS FOR THE OPEN REQUEST' : `NEXT RACK IN ${nextInSec}…`}
        </p>
      )}
    </section>
  )
}

function RevealWords({ game, round, myKey, isSpectator }) {
  const opKey = myKey === 'X' ? 'O' : 'X'
  const myFound = checkedFound(round, myKey)
  const opFound = checkedFound(round, opKey)
  const myWords = wordsFrom(myFound)
  const opWords = wordsFrom(opFound)
  // Family-safe, everyday words first (missedWords) — the game picks these.
  const missed = missedWords(round?.rack, ANAGRAM_VALID_WORDS, isSpectator ? [...myWords, ...opWords] : myWords)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <FoundWords words={myWords} title={`${nameOf(game, myKey)} · ${scoreFound(myFound)}`} />
        <FoundWords words={opWords} title={`${nameOf(game, opKey)} · ${scoreFound(opFound)}`} />
      </div>
      <section className="rounded border border-retro-cta/50 bg-retro-tint-cta/30 p-3">
        <h3 className="font-pixel text-[9px] tracking-widest text-retro-cta">{isSpectator ? 'WORDS NOBODY FOUND' : 'WORDS YOU MISSED'}</h3>
        <p className="mt-1 font-mono text-[10px] text-retro-dim">Everyday words from this rack{isSpectator ? '' : ' you didn’t find'}.</p>
        <p className="mt-2 font-pixel text-xs uppercase tracking-wider text-retro-text">
          {missed.length ? missed.map((word, index) => (
            <span key={word} className="mr-2 inline-block">{index + 1}. {word} <span className="text-retro-win">+{scoreWord(word)}</span></span>
          )) : 'NONE — EVERY WORD WAS FOUND'}
        </p>
      </section>
    </div>
  )
}

export default function AnagramsGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onNewMatch, proposal,
}) {
  const myKey = mySymbol === 'O' ? 'O' : 'X'
  const opKey = myKey === 'X' ? 'O' : 'X'
  const isSpectator = !mySymbol
  const round = game.round || null
  const phase = round?.phase
  const matchOver = game.status === 'finished'
  const matchTarget = getGameConfig('anagrams').matchTarget || MATCH_TARGET

  const { now: serverNow, serverNow: getServerNow } = useServerClock({ tickMs: 250 })
  const [connected, setConnected] = useState(true)
  const [rack, setRack] = useState(() => round?.rack || [])
  const [selectedIndexes, setSelectedIndexes] = useState([])
  const [feedback, setFeedback] = useState(null)
  const [submitting, runSubmit] = useBusy()
  const [doneBusy, runDone] = useBusy()
  const [actionBusy, runAction] = useBusy()
  const selectedRef = useRef(selectedIndexes)

  useEffect(() => onValue(ref(db, '.info/connected'), snap => setConnected(snap.val() === true)), [])

  const foundKey = `found${myKey}`
  const myDone = !!round?.[`done${myKey}`]
  const startsAt = round?.startedAt || 0
  const inCountdown = !matchOver && phase === 'playing' && serverNow < startsAt
  const isPlaying = connected && !matchOver && game.status === 'playing' && phase === 'playing'
    && serverNow >= startsAt && serverNow < (round.endsAt || 0)
  const currentWord = selectedIndexes.map(index => rack[index]).join('').toLowerCase()
  const ownWords = useMemo(() => wordsFrom(round?.[foundKey]), [round, foundKey])
  const retryTick = Math.floor(serverNow / RETRY_MS)

  // Deal the next rack: the first one (or after NEW MATCH's 'ready' round),
  // and automatically REVEAL_MS after each reveal while the match is open.
  // Either seated client runs it; the loser of the race aborts.
  const startDue = connected && !isSpectator && roundStartDue(game, serverNow)
  useEffect(() => {
    if (!startDue) return undefined
    let cancelled = false
    runTransaction(ref(db, `games/${gameId}`), current => startRound(current, {
      now: getServerNow(), gameId, rackWords: ANAGRAM_RACK_WORDS, validWords: ANAGRAM_VALID_WORDS,
    })).catch(() => {
      if (!cancelled) toast.error('NEXT RACK FAILED — CHECK CONNECTION')
    })
    return () => { cancelled = true }
  }, [startDue, retryTick, gameId, getServerNow])

  // Close the rack at the deadline or when both are done (re-validating every
  // word — resolveRound). Retried while due; aborts once someone resolved it.
  const revealDue = connected && !isSpectator && !matchOver && phase === 'playing' && shouldReveal(round, serverNow)
  useEffect(() => {
    if (!revealDue) return
    runTransaction(ref(db, `games/${gameId}`), current => resolveRound(current, getServerNow(), VALID_WORDS))
      .catch(() => { /* retried on the next RETRY_MS tick while still due */ })
  }, [revealDue, retryTick, gameId, getServerNow])

  useEffect(() => {
    selectedRef.current = selectedIndexes
  }, [selectedIndexes])

  useEffect(() => {
    if (!round?.seed) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs local rack when Firebase round advances
    setRack(round.rack || [])
    selectedRef.current = []
    setSelectedIndexes([])
    setFeedback(null)
  // round.rack identity changes on every round write (opponent word);
  // seed is the round id. Resetting on rack would wipe selection mid-round.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.seed])

  const setMessage = useCallback((kind, word = '', points = null) => {
    setFeedback({ kind, word, points, id: Date.now() })
  }, [])

  const pickLetter = useCallback((index) => {
    if (!isPlaying || myDone || selectedRef.current.includes(index)) return
    const next = [...selectedRef.current, index]
    selectedRef.current = next
    setSelectedIndexes(next)
  }, [isPlaying, myDone])

  const removeLetter = useCallback((position) => {
    const next = position === 'all'
      ? []
      : selectedRef.current.filter((_, index) => index !== position)
    selectedRef.current = next
    setSelectedIndexes(next)
  }, [])

  const submitWord = (rawWord = currentWord) => {
    const word = normalizeWord(rawWord)
    if (!isPlaying || myDone || submitting || !word) return
    const submittedIndexes = [...selectedRef.current]
    if (normalizeFound(round?.[foundKey])[word]) {
      setMessage('duplicate', word)
      return
    }
    if (!canBuildWord(word, round?.rack)) {
      sounds.miss()
      setMessage('letters', word)
      return
    }
    if (word.length < MIN_WORD_LENGTH) {
      sounds.miss()
      setMessage('short', word)
      return
    }
    if (word.length > RACK_SIZE || !VALID_WORDS.has(word)) {
      sounds.miss()
      setMessage('notword', word)
      return
    }

    runSubmit(async () => {
      // Each abort names its real reason (the old code reported every abort
      // as "ROUND CLOSED", even a duplicate while the round was still open).
      let outcome = 'closed'
      const result = await runTransaction(ref(db, `games/${gameId}/round`), current => {
        const at = getServerNow()
        if (!current || current.phase !== 'playing' || current[`done${myKey}`] || at >= current.endsAt) {
          outcome = 'closed'
          return undefined
        }
        if (at < (current.startedAt || 0)) {
          outcome = 'early'
          return undefined
        }
        if (normalizeFound(current[foundKey])[word]) {
          outcome = 'duplicate'
          return undefined
        }
        const nextFound = applyFoundWord(current[foundKey], word, current.rack, ANAGRAM_VALID_WORDS, at)
        if (!nextFound) {
          outcome = 'notword'
          return undefined
        }
        outcome = 'valid'
        return { ...current, [foundKey]: nextFound }
      })
      if (!result.committed || outcome !== 'valid') {
        if (outcome !== 'duplicate') sounds.miss()
        setMessage(outcome === 'valid' ? 'closed' : outcome, word)
        return
      }
      setMessage('valid', word, scoreWord(word))
      sounds.hit(ownWords.length + 1)
      if (sameIndexes(selectedRef.current, submittedIndexes)) {
        selectedRef.current = []
        setSelectedIndexes([])
      }
    }, () => toast.error('WORD SUBMIT FAILED — CHECK CONNECTION'))
  }

  // Physical keyboard; useGameKeys skips the room chat and Cmd/Ctrl/Alt.
  useGameKeys((event) => {
    if (event.key === 'Enter') {
      if (!selectedRef.current.length) return false
      submitWord()
      return true
    }
    if (event.key === 'Backspace') {
      if (!selectedRef.current.length) return false
      const next = selectedRef.current.slice(0, -1)
      selectedRef.current = next
      setSelectedIndexes(next)
      return true
    }
    if (!/^[a-zA-Z]$/.test(event.key)) return false
    const letter = event.key.toUpperCase()
    const used = new Set(selectedRef.current)
    const index = rack.findIndex((value, candidate) => value === letter && !used.has(candidate))
    if (index < 0) {
      setMessage('letters', currentWord + letter.toLowerCase())
      return true
    }
    pickLetter(index)
    return true
  }, { enabled: isPlaying && !myDone })

  const finishEarly = () => {
    if (!isPlaying || myDone) return
    setFeedback(null)
    runDone(async () => {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current?.round || current.status !== 'playing' || current.round.phase !== 'playing') return undefined
        const nextRound = { ...current.round, [`done${myKey}`]: true }
        const now = getServerNow()
        if (shouldReveal(nextRound, now)) return resolveRound({ ...current, round: nextRound }, now, VALID_WORDS)
        return { ...current, round: nextRound }
      })
    }, () => toast.error('DONE FAILED — CHECK CONNECTION'))
  }

  const runMatchAction = (action) => {
    if (!action || proposal) return
    runAction(async () => action(), () => toast.error('ACTION FAILED — CHECK CONNECTION'))
  }

  const presence = isSpectator
    ? { X: game.presence?.X?.online, O: game.presence?.O?.online }
    : { [myKey]: true, [opKey]: opponentOnline !== false }
  const rail = (
    <MatchScoreRail
      game={game}
      mySymbol={mySymbol}
      isSpectator={isSpectator}
      matchTarget={matchTarget}
      title="ANAGRAMS"
      roundLabel={round?.roundNum ? `RACK ${round.roundNum}` : undefined}
      presence={presence}
    />
  )
  const switcher = !proposal && onSwitchGame && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />

  // ── match over: the last rack's reveal, or CLAIM WIN ending it mid-rack ──
  if (matchOver) {
    const winner = game.winner
    const headline = !winner || winner === 'draw'
      ? 'MATCH DRAWN'
      : !isSpectator && winner === myKey ? 'YOU WIN THE MATCH' : `${nameOf(game, winner)} WINS THE MATCH`
    return (
      <div className="space-y-3">
        {rail}
        <section className="rounded border-2 border-retro-cta bg-retro-card p-5 text-center shadow-neon-cta" role="status">
          <p className="font-pixel text-[9px] tracking-[0.25em] text-retro-dim">MATCH OVER</p>
          <h2 className={cn('mt-2 font-pixel text-lg tracking-widest', !isSpectator && winner === myKey ? 'text-retro-win text-glow-win' : 'text-retro-text')}>
            {headline}
          </h2>
          {phase !== 'reveal' && (
            <p className="mt-2 font-pixel text-[9px] text-retro-dim">THE MATCH ENDED BEFORE THIS RACK WAS SCORED</p>
          )}
        </section>
        {phase === 'reveal' && (
          <>
            <RoundSummary game={game} round={round} myKey={myKey} isSpectator={isSpectator} matchTarget={matchTarget} />
            <RevealWords game={game} round={round} myKey={isSpectator ? 'X' : myKey} isSpectator={isSpectator} />
          </>
        )}
        {!isSpectator && !opponentOnline && <OfflineNotice label="OPPONENT" />}
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          {!isSpectator && onNewMatch && (
            <button type="button" onClick={() => runMatchAction(onNewMatch)} disabled={actionBusy || !!proposal} className="min-h-11 rounded bg-retro-cta px-5 py-3 font-pixel text-[10px] text-retro-bg shadow-neon-cta transition-all active:scale-95 disabled:opacity-50">
              {actionBusy ? 'ASKING…' : 'NEW MATCH'}
            </button>
          )}
          {switcher}
        </div>
      </div>
    )
  }

  if (!round || (phase === 'ready' && !round.rack)) {
    return (
      <div className="space-y-3">
        {rail}
        <div className="rounded border border-retro-border bg-retro-card p-6 text-center">
          <PixelDots tone="cta" size="lg" glow />
          <p className="mt-3 font-pixel text-[9px] tracking-widest text-retro-dim">DEALING A FAIR RACK…</p>
        </div>
      </div>
    )
  }

  if (!connected && phase === 'playing') {
    return (
      <div className="space-y-3 text-center">
        {rail}
        <div className="rounded border border-retro-p2/60 bg-retro-card p-6">
          <p className="font-pixel text-[10px] tracking-widest text-retro-p2">RECONNECTING…</p>
          <p className="mt-2 font-mono text-[10px] text-retro-dim">ROUND STATE SAVED · TIMER CONTINUES</p>
        </div>
      </div>
    )
  }

  if (phase === 'reveal') {
    const nextInSec = round.revealEndsAt ? Math.max(0, Math.ceil((round.revealEndsAt - serverNow) / 1000)) : null
    const paused = !!game.proposal && !game.proposal.declined
    return (
      <div className="space-y-3">
        {rail}
        <RoundSummary
          game={game} round={round} myKey={myKey} isSpectator={isSpectator}
          matchTarget={matchTarget} nextInSec={nextInSec} paused={paused}
        />
        <RevealWords game={game} round={round} myKey={isSpectator ? 'X' : myKey} isSpectator={isSpectator} />
        {!isSpectator && !opponentOnline && <OfflineNotice label="OPPONENT" />}
        <div className="flex flex-wrap justify-center gap-2 pt-2">{switcher}</div>
      </div>
    )
  }

  if (inCountdown) {
    const secs = Math.max(1, Math.ceil((startsAt - serverNow) / 1000))
    return (
      <div className="space-y-3">
        {rail}
        <div className="rounded border border-retro-border bg-retro-card p-8 text-center space-y-3" role="status" aria-live="polite">
          <p className="font-pixel text-[9px] text-retro-dim arcade-blink">RACK {round.roundNum || 1} · GET READY</p>
          <p className="font-pixel text-7xl text-retro-win text-glow-win" aria-label={`${secs}`}>{secs}</p>
          <p className="font-pixel text-[8px] text-retro-dim">{ROUND_MS / 1000} SECONDS · 7 LETTERS</p>
        </div>
      </div>
    )
  }

  if (phase === 'playing' && !isPlaying) {
    return (
      <div className="space-y-3 text-center">
        {rail}
        <div className="rounded border border-retro-border bg-retro-card p-6">
          <PixelDots tone="cta" size="lg" glow />
          <p className="mt-3 font-pixel text-[9px] tracking-widest text-retro-dim">CHECKING WORDS…</p>
        </div>
      </div>
    )
  }

  if (isSpectator) {
    return (
      <div className="space-y-3">
        {rail}
        <RoundTimer endsAt={round.endsAt} now={serverNow} totalMs={ROUND_MS} label={`RACK ${round.roundNum || 1}`} />
        <RoundPoints game={game} round={round} myKey="X" isSpectator />
        <div className="rounded border border-retro-border bg-retro-card p-4 text-center">
          <p className="font-pixel text-[10px] tracking-widest text-retro-dim">SPECTATING · WORDS HIDDEN UNTIL REVEAL</p>
        </div>
        {switcher}
      </div>
    )
  }

  const shownFeedback = myDone
    ? { message: 'DONE — WAITING FOR OPPONENT OR TIMER', tone: 'info' }
    : feedbackFor(feedback)

  return (
    <div className="space-y-3">
      {rail}
      <RoundTimer endsAt={round.endsAt} now={serverNow} totalMs={ROUND_MS} label={`RACK ${round.roundNum || 1}`} />

      <div className="rounded border-2 border-retro-cta/60 bg-retro-card p-3 shadow-[3px_3px_0_rgb(var(--c-deep)/0.75)]">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-pixel text-[9px] tracking-widest text-retro-cta">FIND AS MANY AS YOU CAN</p>
          <p className="font-mono text-[10px] text-retro-dim">{ownWords.length} FOUND</p>
        </div>
        <AnagramTiles
          rack={rack}
          selectedIndexes={selectedIndexes}
          onPick={pickLetter}
          onRemove={removeLetter}
          onShuffle={() => {
            // Shuffle reorders by index; clear the in-progress word first.
            selectedRef.current = []
            setSelectedIndexes([])
            setRack(current => shuffled(current))
          }}
          disabled={!isPlaying || myDone || submitting}
        />
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={() => submitWord()} disabled={!isPlaying || myDone || submitting || !currentWord} className="min-h-11 flex-1 rounded bg-retro-cta px-4 py-3 font-pixel text-[10px] text-retro-bg shadow-neon-cta transition-all active:scale-95 disabled:opacity-50">
            {submitting ? 'CHECKING…' : 'ENTER WORD'}
          </button>
          <button type="button" onClick={finishEarly} disabled={!isPlaying || myDone || doneBusy} className="min-h-11 rounded border-2 border-retro-border px-4 py-3 font-pixel text-[10px] text-retro-dim transition-colors hover:border-retro-p2 hover:text-retro-p2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-retro-cta disabled:opacity-50">
            {doneBusy ? 'SENDING…' : 'FINISH EARLY'}
          </button>
        </div>
        <WordFeedback
          className="mt-3"
          message={shownFeedback.message}
          tone={shownFeedback.tone}
          id={myDone ? 'done' : feedback?.id}
        />
      </div>

      <RoundPoints game={game} round={round} myKey={myKey} isSpectator={false} />
      <FoundWords words={ownWords} />
      {!opponentOnline && <OfflineNotice label="OPPONENT" />}
      {switcher}
    </div>
  )
}
