import { useEffect, useRef, useState } from 'react'
import { ref, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import {
  cleanWord, convergedNow, lockWord, nextChain, normalizeConvergeRound, startMatch, unlockWord,
  wordProblem, CONVERGE_CHAINS, CONVERGE_MAX_LEN, CONVERGE_MAX_STEPS, maxStars,
} from '../lib/convergeLogic'
import { getServerNow } from '../hooks/useServerClock'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import useBusy from '../hooks/useBusy'
import WordFeedback from '../components/WordFeedback'
import { CoopEndActions, CoopTeamBar } from '../components/CoopShell'

const newSeed = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

// One room transaction that moves `round` forward with `step(round)`. A
// converged chain adds one to the team score; the last chain finishes the
// room (winner 'draw': co-op, nobody loses to anybody).
function commitRound(gameId, step) {
  return runTransaction(ref(db, `games/${gameId}`), current => {
    if (!current || current.gameType !== 'converge' || current.status !== 'playing') return
    const next = step(current.round)
    if (!next) return
    const out = { ...current, round: next, lastActivityAt: getServerNow() }
    if (convergedNow(normalizeConvergeRound(current.round), next)) {
      out.scores = { X: (current.scores?.X || 0) + 1, O: (current.scores?.O || 0) + 1 }
    }
    if (next.phase === 'done') {
      out.status = 'finished'
      out.winner = 'draw'
    }
    return out
  })
}

const Stars = ({ n, of = 3 }) => (
  <span className="tracking-widest" aria-label={`${n} of ${of} stars`}>
    <span className="text-retro-win">{'★'.repeat(n)}</span><span className="text-retro-dim">{'☆'.repeat(Math.max(0, of - n))}</span>
  </span>
)

// The chain so far: one row per step, my word on my side.
function ChainList({ chain, mySymbol, players, converged }) {
  const left = mySymbol === 'O' ? 'O' : 'X'
  const right = left === 'X' ? 'O' : 'X'
  const endRef = useRef(null)
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'nearest' }) }, [chain.length])
  if (!chain.length) return null
  const nameOf = (seat) => (seat === mySymbol ? 'YOU' : (players?.[seat]?.name || seat).toUpperCase())
  return (
    <div className="w-full">
      <div className="grid grid-cols-[1.5rem_1fr_1fr] gap-1.5 px-1 pb-1 font-pixel text-[7px] text-retro-dim tracking-widest">
        <span>#</span><span className="truncate">{nameOf(left)}</span><span className="truncate text-right">{nameOf(right)}</span>
      </div>
      <ol className="space-y-1.5 max-h-72 overflow-y-auto" aria-label="Word chain">
        {chain.map((pair, i) => {
          const hit = converged && i === chain.length - 1
          return (
            <li
              key={i}
              className={cn(
                'grid grid-cols-[1.5rem_1fr_1fr] gap-1.5 items-center',
              )}
            >
              <span className="font-pixel text-[8px] text-retro-dim text-center">{i + 1}</span>
              {[left, right].map((seat, k) => (
                <span
                  key={seat}
                  className={cn(
                    'min-h-9 px-2 py-1.5 rounded border-2 font-pixel text-[11px] tracking-wider break-all',
                    k === 1 && 'text-right',
                    hit ? 'border-retro-win bg-retro-card text-retro-win shadow-neon-win'
                      : seat === 'X' ? 'border-retro-p1/60 bg-retro-tint-p1 text-retro-p1'
                        : 'border-retro-p2/60 bg-retro-tint-p2 text-retro-p2',
                  )}
                >{pair[seat]}</span>
              ))}
            </li>
          )
        })}
      </ol>
      <div ref={endRef} />
    </div>
  )
}

export default function ConvergeGame({
  gameId, game, mySymbol, opponentOnline, onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const [draft, setDraft] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [locking, runLock] = useBusy()
  const [unlocking, runUnlock] = useBusy()
  const [advancing, runAdvance] = useBusy()
  const inputRef = useRef(null)
  const round = normalizeConvergeRound(game?.round)
  const phase = round?.phase || null
  const isSpectator = !mySymbol
  const partner = mySymbol === 'O' ? 'X' : 'O'
  const chain = round?.chain || []
  const lastPair = chain[chain.length - 1] || null
  const myLocked = !isSpectator ? round?.pending?.[mySymbol] : null
  const partnerLocked = !!round?.pending?.[partner]
  const writing = game?.status === 'playing' && phase === 'write'
  const partnerOffline = !isSpectator && opponentOnline === false
  const lastResult = round?.results?.[round.results.length - 1] || null

  // First observer deals the match (fresh room, PLAY AGAIN, NEW MATCH or a
  // switch: a round without a phase, maybe carrying `best`).
  const needsMatch = !!game && game.gameType === 'converge' && game.status === 'playing' && !phase
  useEffect(() => {
    if (!needsMatch) return
    runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current || current.gameType !== 'converge' || current.status !== 'playing' || current.round?.phase) return
      return { ...current, round: startMatch({ seed: newSeed(), best: current.round?.best }), lastActivityAt: Date.now() }
    }).catch(() => {})
  }, [needsMatch, gameId])

  // A new step or chain clears what I typed for the last one.
  const stepKey = `${round?.chainNo}-${chain.length}`
  const [trackedStep, setTrackedStep] = useState(stepKey)
  if (trackedStep !== stepKey) {
    setTrackedStep(stepKey)
    setDraft('')
    setFeedback(null)
  }

  // Reveal sounds, the same on both phones.
  const lastKey = round?.last ? `${round.chainNo}-${round.last.kind}-${round.last.steps}` : ''
  const prevKey = useRef(lastKey)
  useEffect(() => {
    if (!lastKey || prevKey.current === lastKey) { prevKey.current = lastKey; return }
    prevKey.current = lastKey
    const kind = round?.last?.kind
    if (kind === 'converged') sounds.win()
    else if (kind === 'lost') sounds.lose()
    else if (kind === 'reveal') sounds.go()
  }, [lastKey, round])

  const canType = writing && !isSpectator && !myLocked
  useEffect(() => {
    if (canType) inputRef.current?.focus({ preventScroll: true })
  }, [canType, stepKey])

  const lock = () => {
    if (locking || !canType) return
    const problem = wordProblem(draft, round)
    if (problem) {
      sounds.miss()
      setFeedback(prev => ({ message: problem, id: (prev?.id || 0) + 1 }))
      return
    }
    const word = cleanWord(draft)
    runLock(async () => {
      const result = await commitRound(gameId, r => lockWord(r, { player: mySymbol, word, at: getServerNow() }))
      if (result.committed) sounds.move(mySymbol)
    }, () => toast.error('LOCK FAILED — CHECK CONNECTION'))
  }

  const unlock = () => runUnlock(async () => {
    const result = await commitRound(gameId, r => unlockWord(r, { player: mySymbol }))
    if (result.committed) setDraft(myLocked || '')
  }, () => toast.error('CHANGE FAILED — CHECK CONNECTION'))

  const advance = () => runAdvance(async () => {
    await commitRound(gameId, r => nextChain(r))
  }, () => toast.error('NEXT CHAIN FAILED — CHECK CONNECTION'))

  if (!round || !phase) {
    return <div className="py-10 text-center font-pixel text-[10px] text-retro-dim arcade-blink">GETTING READY…</div>
  }

  const partnerName = game.players?.[partner]?.name || partner
  const status = phase === 'done' ? 'MATCH OVER'
    : phase === 'chainEnd' ? (lastResult?.converged ? 'CONVERGED!' : 'CHAIN LOST')
      : isSpectator ? 'SPECTATING'
        : partnerOffline ? 'PARTNER OFFLINE'
          : myLocked ? (partnerLocked ? 'REVEALING…' : 'LOCKED IN')
            : 'YOUR WORD'
  const tone = phase === 'chainEnd' || phase === 'done'
    ? (lastResult?.converged ? 'win' : 'bad')
    : canType ? 'go' : undefined
  const prompt = chain.length === 0
    ? 'Step 1: type any word at all.'
    : null
  const stepNo = chain.length + 1

  return (
    <div className="flex flex-col items-center gap-3 py-2 max-w-md mx-auto w-full">
      <CoopTeamBar
        game={game}
        mySymbol={mySymbol}
        opponentOnline={opponentOnline}
        status={status}
        tone={tone}
        stats={`STARS ${round.stars}/${maxStars()}${round.best ? ` · BEST ${round.best}` : ''}`}
      />

      <div className="w-full grid grid-cols-2 items-center rounded border-2 border-retro-border bg-retro-card px-3 py-2">
        <span className="font-pixel text-[10px] text-retro-text tracking-widest">
          CHAIN {round.chainNo}<span className="text-retro-dim">/{CONVERGE_CHAINS}</span>
        </span>
        <span className="text-right font-pixel text-[9px] text-retro-dim tracking-widest">
          {phase === 'write' ? <>STEP {stepNo}<span>/{CONVERGE_MAX_STEPS}</span></> : <Stars n={lastResult?.stars || 0} />}
        </span>
      </div>

      <ChainList chain={chain} mySymbol={mySymbol} players={game.players} converged={!!lastResult?.converged && phase !== 'write'} />

      {phase === 'write' && (
        <div className="w-full flex flex-col items-center gap-2">
          {lastPair ? (
            <p className="text-center font-mono text-[11px] text-retro-text">
              Bridge <span className="font-pixel text-retro-p1">{lastPair.X}</span> + <span className="font-pixel text-retro-p2">{lastPair.O}</span>
            </p>
          ) : (
            <p className="text-center font-mono text-[11px] text-retro-text">{prompt}</p>
          )}

          <div className="w-full flex items-center justify-center gap-2 font-pixel text-[8px] tracking-widest" aria-live="polite">
            <span className={cn('px-2 py-1 rounded border', myLocked ? 'border-retro-win text-retro-win' : 'border-retro-border text-retro-dim')}>
              {isSpectator ? `${(game.players?.X?.name || 'X').toUpperCase()} ${round.pending.X ? 'LOCKED' : 'THINKING…'}` : myLocked ? 'YOU: LOCKED' : 'YOU: THINKING…'}
            </span>
            <span className={cn('px-2 py-1 rounded border', (isSpectator ? round.pending.O : partnerLocked) ? 'border-retro-win text-retro-win' : 'border-retro-border text-retro-dim')}>
              {isSpectator
                ? `${(game.players?.O?.name || 'O').toUpperCase()} ${round.pending.O ? 'LOCKED' : 'THINKING…'}`
                : `${partnerName.toUpperCase()}: ${partnerLocked ? 'LOCKED' : 'THINKING…'}`}
            </span>
          </div>

          {!isSpectator && (myLocked ? (
            <div className="w-full flex items-center justify-between gap-2 rounded border-2 border-retro-win bg-retro-card px-3 py-2">
              <span className="font-pixel text-[12px] text-retro-win tracking-wider break-all">{myLocked}</span>
              <button
                type="button"
                onClick={unlock}
                disabled={unlocking}
                className="min-h-11 px-3 rounded border-2 border-retro-border text-retro-text font-pixel text-[9px] hover:border-retro-p1/60 disabled:opacity-50"
              >{unlocking ? 'CHANGING…' : 'CHANGE'}</button>
            </div>
          ) : (
            <form
              className="w-full flex gap-2"
              onSubmit={e => { e.preventDefault(); lock() }}
            >
              <input
                ref={inputRef}
                value={draft}
                onChange={e => { setFeedback(null); setDraft(e.target.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, CONVERGE_MAX_LEN)) }}
                disabled={!canType}
                aria-label="Your word"
                placeholder="YOUR WORD"
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck="false"
                enterKeyHint="send"
                className="min-w-0 flex-1 min-h-12 px-3 rounded border-2 border-retro-border bg-retro-card font-pixel text-[13px] tracking-wider text-retro-text placeholder:text-retro-dim focus:border-retro-cta focus:outline-none"
              />
              <button
                type="submit"
                disabled={!canType || locking || cleanWord(draft).length < 2}
                className="min-h-12 px-4 rounded bg-retro-cta text-retro-bg font-pixel text-[10px] tracking-wider hover:shadow-neon-cta disabled:opacity-40"
              >{locking ? 'LOCKING…' : 'LOCK'}</button>
            </form>
          ))}
          <WordFeedback message={feedback?.message} tone="bad" id={feedback?.id} />
          {!isSpectator && !myLocked && (
            <p className="font-mono text-[9px] text-retro-dim text-center">Your word stays hidden until {partnerName} locks one too.</p>
          )}
        </div>
      )}

      {phase === 'chainEnd' && lastResult && (
        <div className={cn(
          'w-full rounded border-2 p-4 text-center space-y-2',
          lastResult.converged ? 'border-retro-win bg-retro-card shadow-neon-win' : 'border-retro-cta bg-retro-tint-cta',
        )}>
          <p className={cn('font-pixel text-lg tracking-widest', lastResult.converged ? 'text-retro-win' : 'text-retro-cta')}>
            {lastResult.converged ? lastResult.word : 'NO MEETING'}
          </p>
          <p className="font-mono text-[11px] text-retro-text">
            {lastResult.converged
              ? `Same word in ${lastResult.steps} ${lastResult.steps === 1 ? 'step' : 'steps'}.`
              : `${CONVERGE_MAX_STEPS} steps and no match. Next chain!`}
          </p>
          <p className="font-pixel text-[14px]"><Stars n={lastResult.stars} /></p>
          {!isSpectator && (
            <button
              type="button"
              onClick={advance}
              disabled={advancing}
              className="min-h-11 px-5 py-2.5 rounded bg-retro-cta text-retro-bg font-pixel text-[10px] hover:shadow-neon-cta disabled:opacity-50"
            >{advancing ? 'STARTING…' : `START CHAIN ${round.chainNo + 1}`}</button>
          )}
        </div>
      )}

      {phase === 'done' && (
        <div className="w-full rounded border-2 border-retro-win bg-retro-card p-4 text-center space-y-3 shadow-neon-win">
          <p className="font-pixel text-lg text-retro-win tracking-widest">{round.stars} / {maxStars()} ★</p>
          <ol className="space-y-1 font-mono text-[11px] text-retro-text">
            {round.results.map(r => (
              <li key={r.chainNo} className="flex items-center justify-between gap-2">
                <span className="text-retro-dim">CHAIN {r.chainNo}</span>
                <span className="font-pixel text-[10px] truncate">{r.converged ? r.word : '—'}</span>
                <Stars n={r.stars} />
              </li>
            ))}
          </ol>
          {round.best === round.stars && round.stars > 0 && (
            <p className="font-pixel text-[9px] text-retro-win tracking-widest">NEW BEST FOR THIS ROOM</p>
          )}
        </div>
      )}

      {phase === 'done' && !isSpectator && (
        <CoopEndActions
          gameType="converge"
          onPlayAgain={onPlayAgain}
          onNewMatch={onNewMatch}
          onSwitchGame={onSwitchGame}
          proposal={proposal}
        />
      )}

      {partnerOffline && writing && (
        <p className="font-pixel text-[9px] text-retro-p2 text-center" role="status">PARTNER OFFLINE — WAITING FOR THEIR WORD</p>
      )}
    </div>
  )
}
