import { useEffect, useRef, useState, useCallback } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import { commit, verifyReveal } from '../lib/commit'
import {
  seatOrder,
  hashString,
  buildOptions,
  attributeOptions,
  scoreRound,
  normalizeMap,
  allLied,
  allVoted,
  allRevealed,
} from '../lib/fibbageLogic'
import { FIBBAGE_FACTS } from '../lib/decks/fibbage'
import GameSwitcher from '../components/GameSwitcher'
import { sounds } from '../lib/sounds'
import { shareResult } from '../lib/shareCard'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'
import { toast } from 'sonner'

const MIN_PLAYERS = 3
const MATCH_WIN_SCORE = 5000

// sessionStorage key for the player's secret lie ({ text, salt, subKey }) per round.
// The plaintext + salt never touch Firebase until the reveal phase — matching the
// commit-reveal pattern in src/lib/commit.js (Bluff / TwoTruths / Wavelength).
const lieKey = (gameId, promptIndex) => `fibbage-lie-${gameId}-${promptIndex}`

function readSecret(gameId, promptIndex) {
  try { return JSON.parse(sessionStorage.getItem(lieKey(gameId, promptIndex)) || 'null') } catch { return null }
}

function normalizeRound(raw) {
  if (!raw) return null
  return {
    phase: raw.phase ?? 'lying',
    promptIndex: raw.promptIndex ?? 0,
    lies: normalizeMap(raw.lies),         // { [playerId]: { hash } } — commitment only
    subs: normalizeMap(raw.subs),         // { [randomKey]: text } — anonymised ballot pool
    options: Array.isArray(raw.options) ? raw.options : (raw.options ? Object.values(raw.options) : []),
    votes: normalizeMap(raw.votes),       // { [playerId]: optionId }
    reveals: normalizeMap(raw.reveals),   // { [playerId]: { text, salt } } — reveal phase only
    cheats: normalizeMap(raw.cheats),     // { [playerId]: true } — failed verification
    scored: !!raw.scored,
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

  const fact = round ? FIBBAGE_FACTS[round.promptIndex % FIBBAGE_FACTS.length] : null

  const [lieInput, setLieInput] = useState('')
  const [inputError, setInputError] = useState('')
  const [localLie, setLocalLie] = useState(false)   // I committed this round
  const [localVote, setLocalVote] = useState(null)  // optionId I picked locally
  const [submitting, setSubmitting] = useState(false)
  const [sharing, runShare] = useBusy()
  // My own secret — only ever known to me. Used to guard against voting for my own
  // lie and to publish my reveal; the DB never sees it until the reveal phase.
  const [mySecret, setMySecret] = useState(() => (round ? readSecret(gameId, round.promptIndex) : null))

  const prevPhase = useRef(round?.phase)
  const prevPromptIndex = useRef(round?.promptIndex)
  const subPublished = useRef(false)
  const revealPublished = useRef(false)
  const scoringStarted = useRef(false)

  // Reset per-round local state when the prompt advances.
  useEffect(() => {
    if (!round) return
    if (round.promptIndex !== prevPromptIndex.current) {
      setLieInput('')
      setInputError('')
      setLocalLie(false)
      setLocalVote(null)
      setMySecret(readSecret(gameId, round.promptIndex))
      subPublished.current = false
      revealPublished.current = false
      scoringStarted.current = false
      prevPromptIndex.current = round.promptIndex
    }
  }, [round?.promptIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  // Phase-change sounds.
  useEffect(() => {
    if (!round || !fact) return
    if (round.phase !== prevPhase.current) {
      if (round.phase === 'voting') sounds.go()
      if (round.phase === 'reveal') {
        // Did I find the truth? (truth is identified by matching the deck answer —
        // the ballot carries no truth marker.)
        const answerNorm = fact.answer.trim().toLowerCase()
        const myVote = round.votes[mySeat]
        const truthOpt = round.options.find(o => o.text.trim().toLowerCase() === answerNorm)
        const iFoundTruth = myVote && truthOpt && myVote === truthOpt.id
        if (iFoundTruth) sounds.win()
        else if (isPlayer) sounds.miss()
      }
      prevPhase.current = round.phase
    }
  }, [round?.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Have I already committed my lie (locally or in Firebase)?
  const iCommitted = localLie || (round && round.lies[mySeat] != null)
  const iVoted = localVote != null || (round && round.votes[mySeat] != null)

  // ---- PLAYER: once everyone has committed, publish my plaintext lie into the
  // anonymous ballot pool (random key → no authorship in the DB). The host builds
  // the ballot from this pool and then deletes it. ------------------------------
  useEffect(() => {
    if (!isPlayer || !round || round.phase !== 'lying') return
    if (!allLied(seats, round.lies)) return
    if (subPublished.current) return
    const secret = readSecret(gameId, round.promptIndex)
    if (!secret || !secret.text || !secret.subKey) return
    subPublished.current = true
    update(ref(db, `games/${gameId}/round/subs`), { [secret.subKey]: secret.text })
      .catch(() => { subPublished.current = false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlayer, round?.phase, round?.lies, gameId])

  // ---- HOST: lying → voting once everyone committed AND all anonymous lies are in.
  // Builds the shuffled, author-less, truth-unmarked ballot and deletes the pool. --
  useEffect(() => {
    if (!isHost || !round || round.phase !== 'lying') return
    if (!allLied(seats, round.lies)) return
    const committedIds = Object.keys(round.lies)
    const texts = Object.values(round.subs)
    if (texts.length < committedIds.length) return // wait for every anonymous submission
    const seed = hashString(`${gameId}:${round.promptIndex}`)
    const options = buildOptions(fact.answer, texts, seed)
    update(ref(db, `games/${gameId}/round`), { phase: 'voting', options, subs: null })
      .catch(() => { /* another client may have advanced — ignore */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, round?.phase, round?.lies, round?.subs, gameId])

  // ---- HOST: voting → reveal (phase flip only) once everyone has voted. Scoring
  // waits for reveals, which only exist in the reveal phase (see below). ----------
  useEffect(() => {
    if (!isHost || !round || round.phase !== 'voting') return
    if (!allVoted(seats, round.votes)) return
    update(ref(db, `games/${gameId}/round`), { phase: 'reveal' }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, round?.phase, round?.votes, gameId])

  // ---- PLAYER: publish my author→lie reveal — ONLY now, at the reveal phase. This
  // is the first (and only) time the DB learns who wrote which lie. ---------------
  useEffect(() => {
    if (!isPlayer || !round || round.phase !== 'reveal') return
    if (round.reveals[mySeat] != null || revealPublished.current) return
    const secret = readSecret(gameId, round.promptIndex)
    if (!secret || secret.text == null || secret.salt == null) return
    revealPublished.current = true
    update(ref(db, `games/${gameId}/round/reveals`), { [mySeat]: { text: secret.text, salt: secret.salt } })
      .catch(() => { revealPublished.current = false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlayer, round?.phase, round?.reveals, gameId, mySeat])

  // ---- HOST: once all reveals are in, verify each against its commitment, recover
  // the answer key, and apply scores once (idempotent via round.scored). ----------
  useEffect(() => {
    if (!isHost || !round || round.phase !== 'reveal' || round.scored) return
    if (!allRevealed(seats, round.reveals)) return
    if (scoringStarted.current) return
    scoringStarted.current = true

    const run = async () => {
      const verifiedLies = {}
      const cheats = {}
      for (const [pid, val] of Object.entries(round.reveals)) {
        const hash = round.lies[pid]?.hash
        const { text, salt } = val || {}
        if (hash == null || text == null || salt == null) continue
        const ok = await verifyReveal(hash, text, salt)
        if (ok) verifiedLies[pid] = text
        else cheats[pid] = true
      }
      const rich = attributeOptions(round.options, fact.answer, verifiedLies)
      const deltas = scoreRound(rich, round.votes)
      try {
        await runTransaction(ref(db, `games/${gameId}`), current => {
          if (!current || !current.round) return current
          if (current.round.phase !== 'reveal' || current.round.scored) return // already resolved
          const newScores = { ...(current.scores || {}) }
          for (const [id, pts] of Object.entries(deltas)) {
            newScores[id] = (newScores[id] || 0) + pts
          }
          return {
            ...current,
            scores: newScores,
            round: {
              ...current.round,
              scored: true,
              cheats: Object.keys(cheats).length ? cheats : null,
            },
          }
        })
      } catch {
        scoringStarted.current = false // allow a retry on transient failure
      }
    }
    run()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, round?.phase, round?.reveals, round?.scored, gameId])

  // ---- Submit my lie (commit hash now; plaintext stays local until reveal) ------
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
      // Stable random key so the anonymous ballot submission survives a reload
      // without leaking authorship (it is not derived from the playerId).
      const subKey = `${(crypto.randomUUID?.() || Math.random().toString(36).slice(2))}${Date.now().toString(36)}`
      const secret = { text, salt, subKey }
      sessionStorage.setItem(lieKey(gameId, round.promptIndex), JSON.stringify(secret))
      setMySecret(secret)
      setLocalLie(true)
      sounds.move('X')
      await update(ref(db, `games/${gameId}/round/lies`), { [mySeat]: { hash } })
    } catch {
      setLocalLie(false)
      setInputError('SUBMIT FAILED — RETRY')
    } finally {
      setSubmitting(false)
    }
  }, [isPlayer, iCommitted, submitting, lieInput, fact, gameId, round, mySeat])

  // ---- Cast my vote (BUG 1 fix: write an object of children, not a bare string) -
  const handleVote = useCallback(async (optionId) => {
    if (!isPlayer || iVoted) return
    // Cannot vote for your own lie. The ballot carries no authorship, so this is
    // checked locally against my own secret text (which only I know).
    const opt = round.options.find(o => o.id === optionId)
    const myLieNorm = mySecret?.text ? mySecret.text.trim().toLowerCase() : null
    if (opt && myLieNorm && opt.text.trim().toLowerCase() === myLieNorm) {
      setInputError("CAN'T VOTE FOR YOUR OWN LIE"); return
    }
    setInputError('')
    setLocalVote(optionId)
    sounds.move('O')
    try {
      await update(ref(db, `games/${gameId}/round/votes`), { [mySeat]: optionId })
    } catch {
      setLocalVote(null)
      setInputError('VOTE FAILED — RETRY')
    }
  }, [isPlayer, iVoted, round, gameId, mySeat, mySecret])

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
            <p className="font-mono text-[11px] text-retro-dim arcade-blink">WAITING…</p>
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
          <p className="font-pixel text-[10px] text-retro-p2 arcade-blink leading-relaxed">
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
          <p className="font-pixel text-[10px] text-retro-dim arcade-blink">
            WAITING FOR HOST TO START…
          </p>
        )}

        {matchOver && isPlayer && champ && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {!proposal && onNewMatch && (
              <button
                onClick={onNewMatch}
                className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
              >
                NEW MATCH
              </button>
            )}
            <button
              onClick={() => runShare(async () => {
                const ok = await shareResult({
                  gameLabel: 'FIBBAGE',
                  headline: champ?.id === mySeat
                    ? 'YOU WIN!'
                    : `${(champ?.name || '').toUpperCase()} WINS`,
                  sub: 'Fibbage · Game Night',
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

        {isPlayer && onSwitchGame && !proposal && (
          <GameSwitcher currentType="fibbage" onSwitch={onSwitchGame} />
        )}
      </div>
    )
  }

  if (!round || !fact) {
    return (
      <div className="text-center py-8 font-pixel text-[10px] text-retro-dim arcade-blink">
        STARTING ROUND…
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Shared header: prompt with blank
  // -------------------------------------------------------------------------
  const promptDisplay = fact.prompt.replace(
    '___',
    round.phase === 'reveal' ? `「${fact.answer}」` : '_____',
  )

  const committedCount = Object.keys(round.lies).length
  const votedCount = Object.keys(round.votes).length
  const myLieNorm = mySecret?.text ? mySecret.text.trim().toLowerCase() : null
  const answerNorm = fact.answer.trim().toLowerCase()

  // Reveal-time answer key: recovered client-side from the (now public) reveals,
  // excluding any that failed commitment verification.
  const verifiedLies = {}
  for (const [pid, val] of Object.entries(round.reveals)) {
    if (round.cheats[pid]) continue
    if (val && val.text != null) verifiedLies[pid] = val.text
  }
  const richOptions = round.phase === 'reveal'
    ? attributeOptions(round.options, fact.answer, verifiedLies)
    : round.options
  const cheaterNames = Object.keys(round.cheats).map(pid => players[pid]?.name || pid)

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
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
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
            <p className="font-pixel text-[10px] text-retro-win text-glow-win text-center arcade-blink">
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
          {round.options.map(opt => {
            const isMine = !!myLieNorm && opt.text.trim().toLowerCase() === myLieNorm
            const picked = (localVote ?? round.votes[mySeat]) === opt.id
            return (
              <button
                key={opt.id}
                onClick={() => handleVote(opt.id)}
                disabled={iVoted || isMine || !isPlayer}
                className={cn(
                  'w-full min-h-11 px-3 py-2.5 font-mono text-[12px] text-left rounded border-2 transition-all active:scale-[0.98]',
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
          {!round.scored ? (
            <p className="font-pixel text-[10px] text-retro-cta text-glow-cta text-center arcade-blink py-4">
              TALLYING…
            </p>
          ) : (
            <>
              {cheaterNames.length > 0 && (
                <p className="font-pixel text-[9px] text-retro-p2 text-center" style={{ animation: 'blink-text 0.6s step-end infinite' }}>
                  ⚠ LIE FAILED VERIFICATION: {cheaterNames.join(', ').toUpperCase()}
                </p>
              )}
              <div className="space-y-1.5">
                {richOptions.map(opt => {
                  const isTruth = opt.by === null || opt.text.trim().toLowerCase() === answerNorm
                  const authors = isTruth ? [] : (Array.isArray(opt.by) ? opt.by : (opt.by == null ? [] : [opt.by]))
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
            </>
          )}
        </div>
      )}

      {isPlayer && onSwitchGame && !proposal && round.phase === 'reveal' && round.scored && (
        <GameSwitcher currentType="fibbage" onSwitch={onSwitchGame} />
      )}
    </div>
  )
}
