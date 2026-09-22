import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { onValue, ref, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import AnagramTiles from '../components/AnagramTiles'
import GameSwitcher from '../components/GameSwitcher'
import ShareResultButton from '../components/ShareResultButton'
import OfflineNotice from '../components/loading/OfflineNotice'
import PixelDots from '../components/loading/PixelDots'
import useBusy from '../hooks/useBusy'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  applyFoundWord, canBuildWord, compareRound, getMatchWinner, getSolutions,
  MATCH_TARGET, normalizeWord, ROUND_MS, scoreFound, scoreWord, seededRack,
  shouldReveal,
} from '../lib/anagramsLogic'
import { ANAGRAM_RACK_WORDS, ANAGRAM_VALID_WORDS } from '../lib/decks/anagrams'

const VALID_WORDS = new Set(ANAGRAM_VALID_WORDS)

function normalizeFound(raw) {
  if (!raw || typeof raw !== 'object') return {}
  return Object.fromEntries(Object.entries(raw).filter(([, value]) => value && typeof value === 'object'))
}

function wordsFrom(found) {
  return Object.entries(normalizeFound(found))
    .sort(([, a], [, b]) => (a.at || 0) - (b.at || 0))
    .map(([word]) => word)
}

function formatSeconds(ms) {
  return Math.max(0, Math.ceil(ms / 1000))
}

function rackKey(rack) {
  return [...(rack || [])].sort().join('')
}

function feedbackText(kind) {
  if (kind === 'valid') return 'WORD FOUND'
  if (kind === 'duplicate') return 'ALREADY FOUND'
  if (kind === 'letters') return 'USE ONLY RACK LETTERS'
  return 'NOT A WORD'
}

function ScoreRail({ game, myKey, round }) {
  const opKey = myKey === 'X' ? 'O' : 'X'
  const myRoundScore = scoreFound(round?.[`found${myKey}`])
  const opRoundScore = scoreFound(round?.[`found${opKey}`])
  const myMatch = game.scores?.[myKey] || 0
  const opMatch = game.scores?.[opKey] || 0
  const myName = game.players?.[myKey]?.name?.toUpperCase() || 'YOU'
  const opName = game.players?.[opKey]?.name?.toUpperCase() || 'OPPONENT'
  return (
    <div className="rounded border border-retro-border bg-retro-card p-3 shadow-[3px_3px_0_rgb(var(--c-deep)/0.7)]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-pixel text-[8px] tracking-widest text-retro-p1">YOU · {myName}</p>
          <p className="mt-1 font-pixel text-2xl leading-none text-retro-cta">{myMatch}<span className="px-1 text-sm text-retro-dim">/</span>{MATCH_TARGET}</p>
          <p className="mt-1 font-mono text-[10px] text-retro-win">{myRoundScore} POINTS · {wordsFrom(round?.[`found${myKey}`]).length} WORDS</p>
        </div>
        <div className="text-right">
          <p className="font-pixel text-[8px] tracking-widest text-retro-p2">THEM · {opName}</p>
          <p className="mt-1 font-pixel text-2xl leading-none text-retro-p2">{opMatch}<span className="px-1 text-sm text-retro-dim">/</span>{MATCH_TARGET}</p>
          <p className="mt-1 font-mono text-[10px] text-retro-dim">{opRoundScore} POINTS · {wordsFrom(round?.[`found${opKey}`]).length} WORDS</p>
        </div>
      </div>
      <div className="mt-3 flex h-1.5 gap-1 rounded bg-retro-deep" aria-label={`Match score ${myMatch} to ${opMatch}`}>
        {Array.from({ length: MATCH_TARGET }, (_, index) => (
          <span key={index} className={cn('h-full flex-1 rounded-sm', index < myMatch ? 'bg-retro-p1' : 'bg-retro-structure/50')} />
        ))}
        <span className="w-px bg-retro-bg" />
        {Array.from({ length: MATCH_TARGET }, (_, index) => (
          <span key={index} className={cn('h-full flex-1 rounded-sm', index < opMatch ? 'bg-retro-p2' : 'bg-retro-structure/50')} />
        ))}
      </div>
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

function RevealWords({ game, round, myKey }) {
  const opKey = myKey === 'X' ? 'O' : 'X'
  const myWords = wordsFrom(round?.[`found${myKey}`])
  const opWords = wordsFrom(round?.[`found${opKey}`])
  const found = new Set(myWords)
  const missed = getSolutions(round?.rack, ANAGRAM_VALID_WORDS)
    .filter(word => !found.has(word))
    .sort((a, b) => scoreWord(b) - scoreWord(a) || b.length - a.length || a.localeCompare(b))
    .slice(0, 5)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <FoundWords words={myWords} title={`${game.players?.[myKey]?.name?.toUpperCase() || 'YOU'} · ${scoreFound(round?.[`found${myKey}`])}`} />
        <FoundWords words={opWords} title={`${game.players?.[opKey]?.name?.toUpperCase() || 'OPPONENT'} · ${scoreFound(round?.[`found${opKey}`])}`} />
      </div>
      <section className="rounded border border-retro-cta/50 bg-retro-tint-cta/30 p-3">
        <h3 className="font-pixel text-[9px] tracking-widest text-retro-cta">WORDS YOU MISSED</h3>
        <p className="mt-1 font-mono text-[10px] text-retro-dim">Top solutions from this rack, shown after reveal.</p>
        <p className="mt-2 font-pixel text-xs uppercase tracking-wider text-retro-text">
          {missed.length ? missed.map((word, index) => (
            <span key={word} className="mr-2 inline-block">{index + 1}. {word} <span className="text-retro-win">+{scoreWord(word)}</span></span>
          )) : 'YOU FOUND EVERY CURATED WORD'}
        </p>
      </section>
    </div>
  )
}

export default function AnagramsGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const myKey = mySymbol === 'O' ? 'O' : 'X'
  const opKey = myKey === 'X' ? 'O' : 'X'
  const round = game.round || null
  const [clockOffset, setClockOffset] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [rack, setRack] = useState(() => round?.rack || [])
  const [selectedIndexes, setSelectedIndexes] = useState([])
  const [feedback, setFeedback] = useState(null)
  const [submitting, runSubmit] = useBusy()
  const [doneBusy, runDone] = useBusy()
  const [actionBusy, runAction] = useBusy()
  const selectedRef = useRef(selectedIndexes)

  useEffect(() => {
    const offsetRef = ref(db, '.info/serverTimeOffset')
    return onValue(offsetRef, snap => setClockOffset(snap.val() || 0))
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [])

  const serverNow = now + clockOffset
  const foundKey = `found${myKey}`
  const myDone = !!round?.[`done${myKey}`]
  const isPlaying = round?.phase === 'playing' && serverNow < (round.endsAt || 0) && game.status === 'playing'
  const timeLeft = round ? Math.max(0, round.endsAt - serverNow) : ROUND_MS
  const currentWord = selectedIndexes.map(index => rack[index]).join('').toLowerCase()
  const ownWords = useMemo(() => wordsFrom(round?.[foundKey]), [round, foundKey])

  // First seated client creates round. Ready rounds come from parent rematch
  // flow and preserve used rack keys across best-of-3 play-again rounds.
  useEffect(() => {
    if (!mySymbol || game.status !== 'playing' || (round && round.phase !== 'ready')) return
    let cancelled = false
    runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current || current.status !== 'playing') return
      if (current.round?.phase === 'playing' || current.round?.phase === 'reveal') return
      const roundNum = current.round?.roundNum || 1
      const usedRacks = current.round?.usedRacks || []
      const seed = `${gameId}:${current.createdAt || ''}:${current.scores?.X || 0}:${current.scores?.O || 0}:${roundNum}:${current.lastActivityAt || Date.now()}`
      const nextRack = seededRack({
        rackWords: ANAGRAM_RACK_WORDS,
        validWords: ANAGRAM_VALID_WORDS,
        seed,
        used: usedRacks,
      })
      const startedAt = Date.now() + clockOffset
      return {
        ...current,
        round: {
          phase: 'playing', roundNum, seed, rack: nextRack,
          startedAt, endsAt: startedAt + ROUND_MS,
          foundX: {}, foundO: {}, doneX: false, doneO: false,
          result: null, revealEndsAt: null,
          usedRacks: [...usedRacks, rackKey(nextRack)],
        },
      }
    }).catch(() => {
      if (!cancelled) toast.error('ROUND START FAILED — CHECK CONNECTION')
    })
    return () => { cancelled = true }
  }, [gameId, game.status, mySymbol, round?.phase, clockOffset])

  useEffect(() => {
    if (!round || round.phase !== 'playing' || !shouldReveal(round, serverNow)) return
    runTransaction(ref(db, `games/${gameId}`), current => resolveRound(current, clockOffset))
      .catch(() => {})
  }, [gameId, round?.phase, round?.endsAt, round?.doneX, round?.doneO, serverNow, clockOffset])

  useEffect(() => {
    selectedRef.current = selectedIndexes
  }, [selectedIndexes])

  useEffect(() => {
    if (!round?.seed) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs local rack when Firebase round advances
    setRack(round.rack || [])
    setSelectedIndexes([])
    setFeedback(null)
  // round.rack identity changes on every round write (opponent word);
  // seed is the round id. Resetting on rack would wipe selection mid-round.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.seed])

  const setMessage = useCallback((kind) => {
    setFeedback({ kind, id: Date.now() })
  }, [])

  const pickLetter = useCallback((index) => {
    if (!isPlaying || myDone || selectedRef.current.includes(index)) return
    setSelectedIndexes(current => [...current, index])
  }, [isPlaying, myDone])

  const removeLetter = useCallback((position) => {
    if (position === 'all') return setSelectedIndexes([])
    setSelectedIndexes(current => current.filter((_, index) => index !== position))
  }, [])

  const submitWord = useCallback((rawWord = currentWord) => {
    const word = normalizeWord(rawWord)
    if (!isPlaying || myDone || submitting || !word) return
    const localFound = normalizeFound(round?.[foundKey])
    if (localFound[word]) {
      setMessage('duplicate')
      setSelectedIndexes([])
      return
    }
    if (!canBuildWord(word, round?.rack)) {
      sounds.miss()
      setMessage('letters')
      setSelectedIndexes([])
      return
    }
    if (word.length < 3 || word.length > 7 || !VALID_WORDS.has(word)) {
      sounds.miss()
      setMessage('invalid')
      setSelectedIndexes([])
      return
    }

    runSubmit(async () => {
      let outcome = 'closed'
      const result = await runTransaction(ref(db, `games/${gameId}/round`), current => {
        if (!current || current.phase !== 'playing' || current[`done${myKey}`] || Date.now() + clockOffset >= current.endsAt) return
        const nextFound = applyFoundWord(current[foundKey], word, current.rack, ANAGRAM_VALID_WORDS, Date.now() + clockOffset)
        if (!nextFound) return
        outcome = 'valid'
        return { ...current, [foundKey]: nextFound }
      })
      if (!result.committed || outcome !== 'valid') {
        setMessage('invalid')
        return
      }
      const nextCount = ownWords.length + 1
      setMessage('valid')
      sounds.hit(nextCount)
      setSelectedIndexes([])
    }, () => toast.error('WORD SUBMIT FAILED — CHECK CONNECTION'))
  }, [clockOffset, currentWord, foundKey, gameId, isPlaying, myDone, myKey, ownWords.length, round, setMessage, submitting])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || !isPlaying || myDone) return
      const target = event.target
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      if (event.key === 'Enter') {
        event.preventDefault()
        submitWord()
        return
      }
      if (event.key === 'Backspace') {
        event.preventDefault()
        setSelectedIndexes(current => current.slice(0, -1))
        return
      }
      if (!/^[a-zA-Z]$/.test(event.key)) return
      const letter = event.key.toUpperCase()
      const used = new Set(selectedRef.current)
      const index = rack.findIndex((value, candidate) => value === letter && !used.has(candidate))
      if (index < 0) {
        event.preventDefault()
        setMessage('letters')
        return
      }
      event.preventDefault()
      pickLetter(index)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPlaying, myDone, pickLetter, rack, setMessage, submitWord])

  const finishEarly = () => {
    if (!isPlaying || myDone) return
    runDone(async () => {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current?.round || current.round.phase !== 'playing') return
        const nextRound = { ...current.round, [`done${myKey}`]: true }
        if (shouldReveal(nextRound, Date.now() + clockOffset)) return resolveRound({ ...current, round: nextRound }, clockOffset)
        return { ...current, round: nextRound }
      })
    }, () => toast.error('DONE FAILED — CHECK CONNECTION'))
  }

  const runMatchAction = (action) => {
    if (!action || proposal) return
    runAction(async () => action(), () => toast.error('ACTION FAILED — CHECK CONNECTION'))
  }

  if (!round || (round.phase === 'ready' && !round.rack)) {
    return (
      <div className="rounded border border-retro-border bg-retro-card p-6 text-center">
        <PixelDots tone="cta" size="lg" glow />
        <p className="mt-3 font-pixel text-[9px] tracking-widest text-retro-dim">BUILDING FAIR RACK…</p>
      </div>
    )
  }

  if (round.phase === 'playing' && !isPlaying) {
    return (
      <div className="space-y-3 text-center">
        <ScoreRail game={game} myKey={myKey} round={round} />
        <div className="rounded border border-retro-border bg-retro-card p-6">
          <PixelDots tone="cta" size="lg" glow />
          <p className="mt-3 font-pixel text-[9px] tracking-widest text-retro-dim">TALLYING SCORES…</p>
        </div>
      </div>
    )
  }

  if (round.phase === 'reveal') {
    const result = round.result || compareRound(round.foundX, round.foundO)
    const matchWinner = getMatchWinner(game.scores)
    const winnerName = result.winner === 'draw' ? 'DRAW' : result.winner === myKey ? 'YOU WIN' : `${game.players?.[result.winner]?.name?.toUpperCase() || 'OPPONENT'} WINS`
    return (
      <div className="space-y-3">
        <ScoreRail game={game} myKey={myKey} round={round} />
        <section className="modal-pop rounded border-2 border-retro-cta bg-retro-card p-5 text-center shadow-neon-cta">
          <p className="font-pixel text-[9px] tracking-[0.25em] text-retro-dim">ROUND {round.roundNum} REVEAL</p>
          <h2 className={cn('mt-2 font-pixel text-xl tracking-widest', result.winner === 'draw' ? 'text-retro-text' : result.winner === myKey ? 'text-retro-win text-glow-win' : 'text-retro-p2 text-glow-p2')}>
            {winnerName}
          </h2>
          <p className="mt-2 font-mono text-lg text-retro-text">{result.scoreX} – {result.scoreO}</p>
          <p className="mt-1 font-mono text-[10px] text-retro-dim">{result.wordsX} WORDS · {result.wordsO} WORDS</p>
          {matchWinner && <p className="mt-3 font-pixel text-[10px] text-retro-cta">MATCH WON BY {game.players?.[matchWinner]?.name?.toUpperCase() || matchWinner}</p>}
        </section>
        <RevealWords game={game} round={round} myKey={myKey} />
        {!opponentOnline && <OfflineNotice label="OPPONENT" />}
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          {!matchWinner && onPlayAgain && (
            <button type="button" onClick={() => runMatchAction(onPlayAgain)} disabled={actionBusy || !!proposal} className="min-h-11 rounded bg-retro-cta px-5 py-3 font-pixel text-[10px] text-retro-bg shadow-neon-cta transition-all active:scale-95 disabled:opacity-50">
              {actionBusy ? 'STARTING…' : 'NEXT RACK'}
            </button>
          )}
          {matchWinner && onNewMatch && (
            <button type="button" onClick={() => runMatchAction(onNewMatch)} disabled={actionBusy || !!proposal} className="min-h-11 rounded bg-retro-cta px-5 py-3 font-pixel text-[10px] text-retro-bg shadow-neon-cta transition-all active:scale-95 disabled:opacity-50">
              {actionBusy ? 'STARTING…' : 'NEW MATCH'}
            </button>
          )}
          <ShareResultButton
            gameLabel="ANAGRAMS"
            headline={winnerName}
            sub={`${result.scoreX} – ${result.scoreO}`}
            accentVar={result.winner === 'draw' ? '--c-cta' : result.winner === myKey ? '--c-win' : '--c-p2'}
            url={window.location.href}
          />
          {!proposal && onSwitchGame && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
        </div>
      </div>
    )
  }

  if (!mySymbol) {
    return (
      <div className="space-y-3">
        <ScoreRail game={game} myKey="X" round={round} />
        <div className="rounded border border-retro-border bg-retro-card p-4 text-center">
          <p className="font-pixel text-[10px] tracking-widest text-retro-dim">SPECTATING · WORDS HIDDEN UNTIL REVEAL</p>
        </div>
        {!proposal && onSwitchGame && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
      </div>
    )
  }

  const seconds = formatSeconds(timeLeft)
  const timerPct = Math.max(0, Math.min(100, (timeLeft / ROUND_MS) * 100))
  const feedbackClass = feedback?.kind === 'valid' ? 'text-retro-win' : feedback?.kind === 'duplicate' ? 'text-retro-cta' : 'text-retro-p2'

  return (
    <div className="space-y-3">
      <ScoreRail game={game} myKey={myKey} round={round} />
      <div className="rounded border border-retro-border bg-retro-card p-2" aria-label={`${seconds} seconds remaining`}>
        <div className="flex items-center justify-between font-pixel text-[10px]">
          <span className={cn('tabular-nums', seconds <= 10 && 'text-retro-p2 text-glow-p2 arcade-blink')}>{seconds}s</span>
          <span className="text-retro-dim">RACK {round.roundNum} · 90s</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded bg-retro-deep">
          <div className={cn('h-full rounded bg-retro-cta transition-[width] duration-300', seconds <= 10 && 'bg-retro-p2')} style={{ width: `${timerPct}%` }} />
        </div>
      </div>

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
            // Shuffle reorders by index — stale indexes would point at
            // different letters, so clear the in-progress word first.
            setSelectedIndexes([])
            setRack(current => [...current].sort(() => Math.random() - 0.5))
          }}
          disabled={!isPlaying || myDone || submitting}
        />
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={() => submitWord()} disabled={!isPlaying || myDone || submitting || !currentWord} className="min-h-11 flex-1 rounded bg-retro-cta px-4 py-3 font-pixel text-[10px] text-retro-bg shadow-neon-cta transition-all active:scale-95 disabled:opacity-50">
            {submitting ? 'CHECKING…' : 'ENTER WORD'}
          </button>
          <button type="button" onClick={finishEarly} disabled={!isPlaying || myDone || doneBusy} className="min-h-11 rounded border-2 border-retro-border px-4 py-3 font-pixel text-[10px] text-retro-dim transition-colors hover:border-retro-p2 hover:text-retro-p2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-retro-cta disabled:opacity-50">
            {doneBusy ? 'SENDING…' : 'DONE'}
          </button>
        </div>
        <p aria-live="polite" className={cn('mt-3 min-h-4 text-center font-pixel text-[10px] tracking-widest', feedbackClass)} key={feedback?.id}>
          {feedback ? feedbackText(feedback.kind) : 'TYPE · TAP · ENTER'}
        </p>
      </div>

      <FoundWords words={ownWords} />
      <div className="flex items-center justify-between rounded border border-retro-border bg-retro-deep/50 px-3 py-2 font-pixel text-[9px] text-retro-dim">
        <span>OPPONENT · {wordsFrom(round?.[`found${opKey}`]).length} WORDS · {scoreFound(round?.[`found${opKey}`])} POINTS</span>
        {round?.[`done${opKey}`] && <span className="text-retro-p2">DONE</span>}
      </div>
      {!opponentOnline && <OfflineNotice label="OPPONENT" />}
      {!proposal && onSwitchGame && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
    </div>
  )
}

function resolveRound(current, clockOffset) {
  if (!current?.round || !shouldReveal(current.round, Date.now() + clockOffset)) return
  const result = compareRound(current.round.foundX, current.round.foundO)
  const scores = { X: current.scores?.X || 0, O: current.scores?.O || 0 }
  if (result.winner !== 'draw') scores[result.winner] += 1
  const matchWinner = getMatchWinner(scores)
  return {
    ...current,
    round: { ...current.round, phase: 'reveal', result, revealEndsAt: Date.now() + clockOffset + 4_000 },
    scores,
    winner: matchWinner,
    status: matchWinner ? 'finished' : 'playing',
    proposal: null,
    lastActivityAt: Date.now(),
  }
}
