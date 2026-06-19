import { useEffect, useRef, useState, useCallback } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import { commit, verifyReveal } from '../lib/commit'
import {
  TRUTH_ID,
  seatOrder,
  hashString,
  buildOptions,
  scoreRound,
  normalizeMap,
  allLied,
  allVoted,
} from '../lib/fibbageLogic'
import { FIBBAGE_FACTS } from '../lib/decks/fibbage'
import GameSwitcher from '../components/GameSwitcher'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

const MIN_PLAYERS = 3
const MATCH_WIN_SCORE = 5000

// sessionStorage key for the player's secret lie (text + salt) per round.
const lieKey = (gameId, promptIndex) => `fibbage-lie-${gameId}-${promptIndex}`

function normalizeRound(raw) {
  if (!raw) return null
  return {
    phase: raw.phase ?? 'lying',
    promptIndex: raw.promptIndex ?? 0,
    lies: normalizeMap(raw.lies),       // { [playerId]: { hash } }
    reveals: normalizeMap(raw.reveals), // { [playerId]: { text, salt } }
    options: Array.isArray(raw.options) ? raw.options : (raw.options ? Object.values(raw.options) : []),
    votes: normalizeMap(raw.votes),     // { [playerId]: optionId }
    cheats: normalizeMap(raw.cheats),   // { [playerId]: true } — failed verification
  }
}

// Seat list of players currently present (online). Falls back to all known
// players if presence data is missing so the round can never deadlock.
function activeSeats(players) {
  const all = seatOrder(players)
  const online = all.filter(id => players[id]?.online !== false)
  return online.length >= MIN_PLAYERS ? online : all
}

export default function FibbageGame({
  gameId, game, mySeat, players, isHost,
  onStart, onSwitchGame, onNewMatch, proposal,
}) {
  const round = normalizeRound(game.round)
  const seats = activeSeats(players || {})
  const playerCount = Object.keys(players || {}).length
  const enough = seats.length >= MIN_PLAYERS

  const scores = game.scores || {}
  const isPlayer = !!mySeat && !!players?.[mySeat]

  const [lieInput, setLieInput] = useState('')
  const [inputError, setInputError] = useState('')
  const [localLie, setLocalLie] = useState(false)   // I committed this round
  const [localVote, setLocalVote] = useState(null)  // optionId I picked locally
  const [submitting, setSubmitting] = useState(false)

  const prevPhase = useRef(round?.phase)
  const prevPromptIndex = useRef(round?.promptIndex)
  const verifyStarted = useRef(false)

  const fact = round ? FIBBAGE_FACTS[round.promptIndex % FIBBAGE_FACTS.length] : null

  // Reset per-round local state when the prompt advances.
  useEffect(() => {
    if (!round) return
    if (round.promptIndex !== prevPromptIndex.current) {
      setLieInput('')
      setInputError('')
      setLocalLie(false)
      setLocalVote(null)
      verifyStarted.current = false
      prevPromptIndex.current = round.promptIndex
    }
  }, [round?.promptIndex])

  // Phase-change sounds.
  useEffect(() => {
    if (!round) return
    if (round.phase !== prevPhase.current) {
      if (round.phase === 'voting') sounds.go()
      if (round.phase === 'reveal') {
        // Did the truth get my vote, or did my lie fool anyone?
        const myVote = round.votes[mySeat]
        const truthOpt = round.options.find(o => o.id === TRUTH_ID || o.by === null)
        const iFoundTruth = myVote && truthOpt && myVote === truthOpt.id
        if (iFoundTruth) sounds.win()
        else if (isPlayer) sounds.miss()
      }
      prevPhase.current = round.phase
    }
  }, [round?.phase])

  // Have I already committed my lie (locally or in Firebase)?
  const iCommitted = localLie || (round && round.lies[mySeat] != null)
  const iVoted = localVote != null || (round && round.votes[mySeat] != null)

  // ---- HOST: lying → voting when everyone has committed + revealed ----
  useEffect(() => {
    if (!isHost || !round || round.phase !== 'lying') return
    if (!allLied(seats, round.lies)) return
    // Wait for reveals from everyone who committed.
    const committedIds = Object.keys(round.lies)
    const allRevealed = committedIds.every(id => round.reveals[id] != null)
    if (!allRevealed) return

    // Verify each reveal against its commitment; build options from valid lies.
    const verifyAll = async () => {
      const lies = {}
      const cheats = {}
      for (const id of committedIds) {
        const { hash } = round.lies[id] || {}
        const { text, salt } = round.reveals[id] || {}
        if (text == null || salt == null || hash == null) continue
        const ok = await verifyReveal(hash, text, salt)
        if (ok) lies[id] = text
        else cheats[id] = true
      }
      const seed = hashString(`${gameId}:${round.promptIndex}`)
      const options = buildOptions(fact.answer, lies, seed)
      try {
        await update(ref(db, `games/${gameId}/round`), {
          phase: 'voting',
          options,
          cheats: Object.keys(cheats).length ? cheats : null,
        })
      } catch { /* another client may have advanced — ignore */ }
    }
    verifyAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, round?.phase, round?.lies, round?.reveals, gameId])

  // ---- HOST: voting → reveal + apply scores when everyone has voted ----
  useEffect(() => {
    if (!isHost || !round || round.phase !== 'voting') return
    if (!allVoted(seats, round.votes)) return

    const finish = async () => {
      try {
        await runTransaction(ref(db, `games/${gameId}`), current => {
          if (!current || !current.round) return
          if (current.round.phase !== 'voting') return // already resolved
          const opts = Array.isArray(current.round.options)
            ? current.round.options
            : Object.values(current.round.options || {})
          const votes = current.round.votes || {}
          const deltas = scoreRound(opts, votes)
          const newScores = { ...(current.scores || {}) }
          for (const [id, pts] of Object.entries(deltas)) {
            newScores[id] = (newScores[id] || 0) + pts
          }
          return {
            ...current,
            scores: newScores,
            round: { ...current.round, phase: 'reveal' },
          }
        })
      } catch { /* ignore */ }
    }
    finish()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, round?.phase, round?.votes, gameId])

  // ---- Submit my lie (commit) ----
  const handleSubmitLie = useCallback(async () => {
    if (!isPlayer || iCommitted || submitting) return
    const text = lieInput.trim()
    if (!text) { setInputError('TYPE YOUR LIE'); return }
    if (text.toLowerCase() === fact.answer.trim().toLowerCase()) {
      setInputError("THAT'S THE TRUTH — LIE HARDER")
      return
    }
    setInputError('')
    setSubmitting(true)
    try {
      const { hash, salt } = await commit(text)
      sessionStorage.setItem(lieKey(gameId, round.promptIndex), JSON.stringify({ text, salt }))
      setLocalLie(true)
      sounds.move('X')
      await update(ref(db, `games/${gameId}/round/lies/${mySeat}`), { hash })
    } catch {
      setLocalLie(false)
      setInputError('SUBMIT FAILED — RETRY')
    } finally {
      setSubmitting(false)
    }
  }, [isPlayer, iCommitted, submitting, lieInput, fact, gameId, round, mySeat])

  // ---- Reveal my plaintext once everyone has committed ----
  useEffect(() => {
    if (!isPlayer || !round || round.phase !== 'lying') return
    if (!allLied(seats, round.lies)) return
    if (round.reveals[mySeat] != null) return
    const stored = sessionStorage.getItem(lieKey(gameId, round.promptIndex))
    if (!stored) return
    const { text, salt } = JSON.parse(stored)
    update(ref(db, `games/${gameId}/round/reveals/${mySeat}`), { text, salt }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlayer, round?.phase, round?.lies, gameId])

  // ---- Cast my vote ----
  const handleVote = useCallback(async (optionId) => {
    if (!isPlayer || iVoted) return
    // Cannot vote for your own lie.
    const opt = round.options.find(o => o.id === optionId)
    if (opt && opt.by !== null) {
      const authors = Array.isArray(opt.by) ? opt.by : [opt.by]
      if (authors.includes(mySeat)) { setInputError("CAN'T VOTE FOR YOUR OWN LIE"); return }
    }
    setInputError('')
    setLocalVote(optionId)
    sounds.move('O')
    try {
      await update(ref(db, `games/${gameId}/round/votes/${mySeat}`), optionId)
    } catch {
      setLocalVote(null)
      setInputError('VOTE FAILED — RETRY')
    }
  }, [isPlayer, iVoted, round, gameId, mySeat])

  // ---- Next prompt (any player can advance after reveal) ----
  const handleNextPrompt = useCallback(async () => {
    if (!isPlayer || !round) return
    const nextIndex = (round.promptIndex + 1) % FIBBAGE_FACTS.length
    const matchOver = Object.values(game.scores || {}).some(s => s >= MATCH_WIN_SCORE)
    sessionStorage.removeItem(lieKey(gameId, round.promptIndex))
    try {
      await update(ref(db, `games/${gameId}`), {
        round: { phase: 'lying', promptIndex: nextIndex },
        status: matchOver ? 'finished' : 'playing',
        proposal: null,
      })
    } catch { /* ignore */ }
  }, [isPlayer, round, game.scores, gameId])

  // -------------------------------------------------------------------------
  // WAITING / START screen (status !== 'playing')
  // -------------------------------------------------------------------------
  if (game.status !== 'playing') {
    const matchOver = game.status === 'finished'
    const ranked = seatOrder(players || {})
      .map(id => ({ id, name: players[id]?.name || id, score: scores[id] || 0 }))
      .sort((a, b) => b.score - a.score)
    const champ = ranked[0]

    return (
      <div className="space-y-5 text-center">
        {matchOver && champ && (
          <div className="space-y-1">
            <p className="font-pixel text-[10px] text-retro-dim tracking-widest">MATCH OVER</p>
            <p className="font-pixel text-base text-retro-cta text-glow-cta">
              {champ.id === mySeat ? 'YOU WIN!' : `${champ.name.toUpperCase()} WINS`}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <p className="font-pixel text-sm text-retro-p1 text-glow-p1">FIBBAGE</p>
          <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
            Invent a fake answer. Fool the others.<br />Find the real one for big points.
          </p>
        </div>

        {/* Lobby / scoreboard */}
        <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1.5">
          <p className="font-pixel text-[9px] text-retro-dim tracking-widest">
            PLAYERS ({playerCount})
          </p>
          {ranked.length === 0 && (
            <p className="font-mono text-[11px] text-retro-dim">WAITING…</p>
          )}
          {ranked.map(p => (
            <div key={p.id} className="flex items-center justify-between font-mono text-[11px]">
              <span className={cn(
                'truncate',
                p.id === mySeat ? 'text-retro-p1' : 'text-retro-text',
                players[p.id]?.online === false && 'opacity-40',
              )}>
                {p.name}{p.id === mySeat ? ' (YOU)' : ''}
              </span>
              {matchOver && <span className="text-retro-dim ml-2">{p.score}</span>}
            </div>
          ))}
        </div>

        {!enough && (
          <p className="font-pixel text-[10px] text-retro-p2 animate-pulse leading-relaxed">
            NEED {MIN_PLAYERS}+ PLAYERS<br />
            ({Math.max(0, MIN_PLAYERS - playerCount)} MORE TO START)
          </p>
        )}

        {isHost && enough && !matchOver && (
          <button
            onClick={onStart}
            className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
          >
            START ROUND
          </button>
        )}
        {!isHost && enough && !matchOver && (
          <p className="font-pixel text-[10px] text-retro-dim animate-pulse">
            WAITING FOR HOST TO START…
          </p>
        )}

        {matchOver && isPlayer && !proposal && onNewMatch && (
          <button
            onClick={onNewMatch}
            className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
          >
            NEW MATCH
          </button>
        )}

        {isPlayer && onSwitchGame && !proposal && (
          <GameSwitcher currentType="fibbage" onSwitch={onSwitchGame} />
        )}
      </div>
    )
  }

  if (!round || !fact) return null

  // -------------------------------------------------------------------------
  // Shared header: prompt with blank
  // -------------------------------------------------------------------------
  const promptDisplay = fact.prompt.replace(
    '___',
    round.phase === 'reveal' ? `「${fact.answer}」` : '_____',
  )

  const committedCount = Object.keys(round.lies).length
  const votedCount = Object.keys(round.votes).length
  const iCheated = round.cheats[mySeat]

  return (
    <div className="space-y-4">
      {/* Prompt */}
      <div className="bg-retro-card border border-retro-border rounded p-4 space-y-2">
        <p className="font-pixel text-[8px] text-retro-dim tracking-widest text-center">
          {round.phase === 'lying' ? 'INVENT A LIE' : round.phase === 'voting' ? 'WHICH IS TRUE?' : 'THE TRUTH'}
        </p>
        <p className="font-mono text-[13px] text-retro-text leading-relaxed text-center">
          {promptDisplay}
        </p>
      </div>

      {/* ---- LYING PHASE ---- */}
      {round.phase === 'lying' && (
        <div className="space-y-3">
          {isPlayer && !iCommitted ? (
            <div className="space-y-2">
              <input
                type="text"
                value={lieInput}
                maxLength={60}
                onChange={e => { setLieInput(e.target.value); setInputError('') }}
                onKeyDown={e => e.key === 'Enter' && handleSubmitLie()}
                autoFocus
                placeholder="YOUR FAKE ANSWER"
                className="w-full bg-retro-surface border-2 border-retro-border text-retro-text font-pixel text-[11px] text-center rounded px-3 py-2.5 focus:outline-none focus:border-retro-p1 disabled:opacity-40"
              />
              {inputError && <p className="font-pixel text-[9px] text-retro-p2 text-center">{inputError}</p>}
              <button
                onClick={handleSubmitLie}
                disabled={submitting}
                className="w-full py-2.5 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95 disabled:opacity-40"
              >
                {submitting ? 'LOCKING…' : 'SUBMIT LIE'}
              </button>
            </div>
          ) : (
            <p className="font-pixel text-[10px] text-retro-win text-glow-win text-center animate-pulse">
              {isPlayer ? 'LIE LOCKED ✓' : 'SPECTATING'}
            </p>
          )}
          <p className="font-pixel text-[9px] text-retro-dim text-center">
            {committedCount}/{seats.length} LIED…
          </p>
        </div>
      )}

      {/* ---- VOTING PHASE ---- */}
      {round.phase === 'voting' && (
        <div className="space-y-2">
          {iCheated && (
            <p className="font-pixel text-[9px] text-retro-p2 text-center" style={{ animation: 'blink-text 0.6s step-end infinite' }}>
              ⚠ YOUR LIE FAILED VERIFICATION
            </p>
          )}
          {round.options.map(opt => {
            const authors = opt.by === null ? [] : (Array.isArray(opt.by) ? opt.by : [opt.by])
            const isMine = authors.includes(mySeat)
            const picked = (localVote ?? round.votes[mySeat]) === opt.id
            return (
              <button
                key={opt.id}
                onClick={() => handleVote(opt.id)}
                disabled={iVoted || isMine || !isPlayer}
                className={cn(
                  'w-full px-3 py-2.5 font-mono text-[12px] text-left rounded border-2 transition-all active:scale-[0.98]',
                  picked
                    ? 'border-retro-cta text-retro-cta shadow-neon-cta'
                    : 'border-retro-border text-retro-text hover:border-retro-p1/50',
                  (isMine || (iVoted && !picked)) && 'opacity-40',
                  isMine && 'cursor-not-allowed',
                )}
              >
                {opt.text}{isMine ? '  (YOUR LIE)' : ''}
              </button>
            )
          })}
          {inputError && <p className="font-pixel text-[9px] text-retro-p2 text-center">{inputError}</p>}
          <p className="font-pixel text-[9px] text-retro-dim text-center pt-1">
            {iVoted ? `VOTED ✓ — ${votedCount}/${seats.length} IN` : isPlayer ? 'PICK THE TRUTH' : 'SPECTATING'}
          </p>
        </div>
      )}

      {/* ---- REVEAL PHASE ---- */}
      {round.phase === 'reveal' && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            {round.options.map(opt => {
              const isTruth = opt.id === TRUTH_ID || opt.by === null
              const authors = isTruth ? [] : (Array.isArray(opt.by) ? opt.by : [opt.by])
              const voters = Object.entries(round.votes)
                .filter(([, oid]) => oid === opt.id)
                .map(([vid]) => players[vid]?.name || vid)
              const authorNames = authors.map(a => players[a]?.name || a)
              return (
                <div
                  key={opt.id}
                  className={cn(
                    'px-3 py-2 rounded border-2',
                    isTruth ? 'border-retro-win text-retro-win shadow-neon-win' : 'border-retro-border text-retro-text',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[12px]">
                      {opt.text}{isTruth ? '  ✓ TRUTH' : ''}
                    </span>
                    <span className="font-pixel text-[8px] text-retro-dim shrink-0">
                      {voters.length} VOTE{voters.length === 1 ? '' : 'S'}
                    </span>
                  </div>
                  {!isTruth && authorNames.length > 0 && (
                    <p className="font-pixel text-[8px] text-retro-p2 mt-1">
                      LIE BY {authorNames.join(', ').toUpperCase()}
                    </p>
                  )}
                  {voters.length > 0 && (
                    <p className="font-pixel text-[8px] text-retro-dim mt-0.5">
                      {voters.join(', ').toUpperCase()}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Scoreboard */}
          <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1">
            <p className="font-pixel text-[9px] text-retro-dim tracking-widest text-center">SCORES</p>
            {seatOrder(players || {})
              .map(id => ({ id, name: players[id]?.name || id, score: scores[id] || 0 }))
              .sort((a, b) => b.score - a.score)
              .map(p => (
                <div key={p.id} className="flex items-center justify-between font-mono text-[11px]">
                  <span className={p.id === mySeat ? 'text-retro-p1' : 'text-retro-text'}>
                    {p.name}{p.id === mySeat ? ' (YOU)' : ''}
                  </span>
                  <span className="text-retro-cta">{p.score}</span>
                </div>
              ))}
          </div>

          {isPlayer && (
            <button
              onClick={handleNextPrompt}
              className="w-full py-2.5 font-pixel text-[10px] border-2 border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 hover:bg-retro-tint-p1 transition-all active:scale-95"
            >
              NEXT PROMPT
            </button>
          )}
        </div>
      )}

      {isPlayer && onSwitchGame && !proposal && round.phase === 'reveal' && (
        <GameSwitcher currentType="fibbage" onSwitch={onSwitchGame} />
      )}
    </div>
  )
}
