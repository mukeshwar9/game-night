import { useEffect, useRef, useState } from 'react'
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
  factIndexFor,
  validateLie,
  sameOption,
  allReady,
  matchWinners,
  LIE_MAX_LENGTH,
  FIBBAGE_WIN_SCORE,
  FIBBAGE_LIE_MS,
  FIBBAGE_VOTE_MS,
  FIBBAGE_REVEAL_WAIT_MS,
  FIBBAGE_REVEAL_ADVANCE_MS,
} from '../lib/fibbageLogic'
import { isCoordinator } from '../lib/coordinator'
import { FIBBAGE_FACTS } from '../lib/decks/fibbage'
import GameSwitcher from '../components/GameSwitcher'
import WordFeedback from '../components/WordFeedback'
import RoundTimer from '../components/RoundTimer'
import useServerClock from '@/hooks/useServerClock'
import { sounds } from '../lib/sounds'
import { shareResult } from '../lib/shareCard'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'
import { toast } from 'sonner'

const MIN_PLAYERS = 3    // needed in the lobby to START a match
const MIN_ACTIVE = 2     // needed mid-match to keep a round moving; below this we pause
// Match end: checked after each reveal — the highest score at or past
// MATCH_WIN_SCORE wins, exact ties are co-champions (fibbageLogic.matchWinners).
const MATCH_WIN_SCORE = FIBBAGE_WIN_SCORE
const LIE_MS = FIBBAGE_LIE_MS
const VOTE_MS = FIBBAGE_VOTE_MS
const REVEAL_MS = FIBBAGE_REVEAL_WAIT_MS
// After the lie clock runs out, committed players publish their anonymous lie;
// the coordinator waits this long for them before building the ballot.
const SUB_GRACE_MS = 3_000

// sessionStorage key for the player's secret lie ({ text, salt, subKey }) per round.
// The plaintext + salt never touch Firebase until the reveal phase — matching the
// commit-reveal pattern in src/lib/commit.js (Bluff / TwoTruths / Wavelength).
// Keyed by the match's deckSeed too, so a new match's round 0 never picks up
// the previous match's round-0 lie.
const lieKey = (gameId, round) => `fibbage-lie-${gameId}-${round?.deckSeed ?? 'x'}-${round?.promptIndex ?? 0}`

function readSecret(gameId, round) {
  try { return JSON.parse(sessionStorage.getItem(lieKey(gameId, round)) || 'null') } catch { return null }
}

function normalizeRound(raw) {
  if (!raw) return null
  return {
    phase: raw.phase ?? 'lying',
    promptIndex: raw.promptIndex ?? 0,
    deckSeed: raw.deckSeed ?? null,       // per-match prompt shuffle (G-02); null on legacy rounds
    lies: normalizeMap(raw.lies),         // { [playerId]: { hash } } — commitment only
    subs: normalizeMap(raw.subs),         // { [randomKey]: text } — anonymised ballot pool
    options: Array.isArray(raw.options) ? raw.options : (raw.options ? Object.values(raw.options) : []),
    votes: normalizeMap(raw.votes),       // { [playerId]: optionId }
    reveals: normalizeMap(raw.reveals),   // { [playerId]: { text, salt } } — reveal phase only
    cheats: normalizeMap(raw.cheats),     // { [playerId]: true } — failed verification
    scored: !!raw.scored,
    // Server-time deadlines. These were missing here before, so every
    // `round.*Deadline` check read undefined and an AFK seat stalled the round.
    lieDeadline: raw.lieDeadline ?? null,
    voteDeadline: raw.voteDeadline ?? null,
    revealDeadline: raw.revealDeadline ?? null,
    advanceAt: raw.advanceAt ?? null,     // scored reveal auto-advances at this time
    ready: normalizeMap(raw.ready),       // { [playerId]: true } — pressed READY on the reveal
  }
}

// Seat list of players actually online right now. Deliberately does NOT fall
// back to the full roster when few are online — waiting on an offline seat's
// lie/vote is exactly what deadlocked a room when the host (or anyone else)
// dropped. Below MIN_ACTIVE the round pauses instead (see `paused` below).
function activeSeats(players) {
  return seatOrder(players).filter(id => players[id]?.online !== false)
}

export default function FibbageGame({
  gameId, game, mySeat, players, isHost,
  onStart, onSwitchGame, onNewMatch, proposal,
}) {
  const round = normalizeRound(game.round)
  const seats = activeSeats(players || {})
  const playerCount = Object.keys(players || {}).length
  const enough = playerCount >= MIN_PLAYERS
  // Mid-match, a round can only progress with at least MIN_ACTIVE seats actually
  // online — below that, no fixed host to blame: pause and wait rather than spin.
  const paused = game.status === 'playing' && !!round && seats.length < MIN_ACTIVE

  const scores = game.scores || {}
  const isPlayer = !!mySeat && !!players?.[mySeat]
  // Deterministic host-fallback: the coordinator is the lowest-uid ONLINE seat, not
  // the fixed `isHost`. Every phase transition below is gated on this instead, so a
  // host disconnect hands off to whichever seat is next instead of freezing the match.
  const amCoordinator = isPlayer && isCoordinator(mySeat, seats, players)

  const fact = round ? FIBBAGE_FACTS[factIndexFor(round.promptIndex, round.deckSeed, FIBBAGE_FACTS.length)] : null

  const [lieInput, setLieInput] = useState('')
  const [inputError, setInputError] = useState('')
  const [inputErrorId, setInputErrorId] = useState(0)
  const [localLie, setLocalLie] = useState(false)   // I committed this round
  const [localVote, setLocalVote] = useState(null)  // optionId I picked locally
  const [submitting, setSubmitting] = useState(false)
  const [sharing, runShare] = useBusy()
  const [readying, runReady] = useBusy()
  const [advancing, runAdvance] = useBusy()
  // My own secret — only ever known to me. Used to guard against voting for my own
  // lie and to publish my reveal; the DB never sees it until the reveal phase.
  const [mySecret, setMySecret] = useState(() => (round ? readSecret(gameId, round) : null))

  const prevPhase = useRef(round?.phase)
  // `${deckSeed}:${promptIndex}` — changes on every new round, including the
  // first round of a new match (promptIndex restarts at 0 with a new seed).
  const prevRoundKey = useRef(round ? `${round.deckSeed}:${round.promptIndex}` : null)
  const prevLieKey = useRef(round ? lieKey(gameId, round) : null)
  const advancingRound = useRef(null)
  const subPublished = useRef(false)
  const revealPublished = useRef(false)
  const scoringStarted = useRef(false)
  const advancingToVoting = useRef(false)
  const advancingToReveal = useRef(false)

  // Server-corrected clock: `serverNow` (re-rendered every tick) drives deadline
  // checks and countdowns; `readServerNow()` stamps deadlines inside writes.
  const { now: serverNow, serverNow: readServerNow } = useServerClock({
    tickMs: 500,
    ticking: !!round && game.status === 'playing',
  })

  // Reset per-round local state when the prompt advances.
  const roundKey = round ? `${round.deckSeed}:${round.promptIndex}` : null
  useEffect(() => {
    if (!round) return
    if (roundKey !== prevRoundKey.current) {
      setLieInput('')
      setInputError('')
      setLocalLie(false)
      setLocalVote(null)
      setMySecret(readSecret(gameId, round))
      // The previous round's lie has been revealed and scored — drop it.
      if (prevLieKey.current) { try { sessionStorage.removeItem(prevLieKey.current) } catch { /* ignore */ } }
      prevLieKey.current = lieKey(gameId, round)
      subPublished.current = false
      revealPublished.current = false
      scoringStarted.current = false
      advancingToVoting.current = false
      advancingToReveal.current = false
      prevRoundKey.current = roundKey
    }
  }, [roundKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Phase-change sounds.
  useEffect(() => {
    if (!round || !fact) return
    if (round.phase !== prevPhase.current) {
      if (round.phase === 'voting') sounds.go()
      if (round.phase === 'reveal') {
        // Did I find the truth? (truth is identified by matching the deck answer —
        // the ballot carries no truth marker.)
        const myVote = round.votes[mySeat]
        const truthOpt = round.options.find(o => sameOption(o.text, fact.answer))
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

  // ---- PLAYER: once everyone has committed — or the lie clock ran out — publish
  // my plaintext lie into the anonymous ballot pool (random key → no authorship in
  // the DB; everyone publishes at the same moment, so timing doesn't tell). The
  // coordinator builds the ballot from this pool and then deletes it. ------------
  const lieClockOut = !!round && round.lieDeadline != null && serverNow >= round.lieDeadline
  useEffect(() => {
    if (!isPlayer || !round || round.phase !== 'lying') return
    if (!allLied(seats, round.lies) && !lieClockOut) return
    if (subPublished.current) return
    const secret = readSecret(gameId, round)
    if (!secret || !secret.text || !secret.subKey) return
    subPublished.current = true
    update(ref(db, `games/${gameId}/round/subs`), { [secret.subKey]: secret.text })
      .catch(() => { subPublished.current = false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlayer, round?.phase, round?.lies, lieClockOut, gameId])

  // ---- COORDINATOR: seed the lying-phase deadline as soon as the round enters
  // 'lying' with none set (fresh round). Anchored server time, not client-local. --
  useEffect(() => {
    if (!amCoordinator || !round || round.phase !== 'lying' || round.lieDeadline) return
    update(ref(db, `games/${gameId}/round`), { lieDeadline: readServerNow() + LIE_MS }).catch(() => {})
  }, [amCoordinator, round?.phase, round?.lieDeadline, gameId, readServerNow]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- COORDINATOR: lying → voting once everyone committed AND all anonymous lies
  // are in — OR the lie deadline has passed, in which case we build the ballot from
  // whatever lies actually arrived rather than waiting on a seat that will never
  // respond. Builds the shuffled, author-less, truth-unmarked ballot and deletes the
  // submission pool. Idempotent guard (advancingToVoting) + a stale-phase re-check
  // inside the write keeps this single-writer even during a coordinator handover. ---
  useEffect(() => {
    if (!amCoordinator || !round || round.phase !== 'lying' || paused) return
    const deadlinePassed = round.lieDeadline != null && serverNow >= round.lieDeadline
    if (!allLied(seats, round.lies) && !deadlinePassed) return
    const committedIds = Object.keys(round.lies)
    const texts = Object.values(round.subs)
    // Wait for every anonymous submission; past the deadline, give committed
    // players a short grace to publish before building the ballot without them.
    const graceOver = deadlinePassed && serverNow >= round.lieDeadline + SUB_GRACE_MS
    if (texts.length < committedIds.length && !graceOver) return
    if (advancingToVoting.current) return
    advancingToVoting.current = true
    const seed = hashString(`${gameId}:${round.deckSeed ?? ''}:${round.promptIndex}`)
    const options = buildOptions(fact.answer, texts, seed)
    runTransaction(ref(db, `games/${gameId}/round`), current => {
      if (!current || current.phase !== 'lying') return current // already advanced
      return { ...current, phase: 'voting', options, subs: null, voteDeadline: readServerNow() + VOTE_MS }
    }).catch(() => { advancingToVoting.current = false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amCoordinator, round?.phase, round?.lies, round?.subs, round?.lieDeadline, serverNow, paused, gameId])

  // ---- COORDINATOR: voting → reveal (phase flip only) once everyone has voted, or
  // the vote deadline has passed. Scoring waits for reveals (see below). -----------
  useEffect(() => {
    if (!amCoordinator || !round || round.phase !== 'voting' || paused) return
    const deadlinePassed = round.voteDeadline != null && serverNow >= round.voteDeadline
    if (!allVoted(seats, round.votes) && !deadlinePassed) return
    if (advancingToReveal.current) return
    advancingToReveal.current = true
    runTransaction(ref(db, `games/${gameId}/round`), current => {
      if (!current || current.phase !== 'voting') return current // already advanced
      return { ...current, phase: 'reveal', revealDeadline: readServerNow() + REVEAL_MS }
    }).catch(() => { advancingToReveal.current = false })
  }, [amCoordinator, round?.phase, round?.votes, round?.voteDeadline, serverNow, paused, gameId, readServerNow]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- PLAYER: publish my author→lie reveal — ONLY now, at the reveal phase. This
  // is the first (and only) time the DB learns who wrote which lie. ---------------
  useEffect(() => {
    if (!isPlayer || !round || round.phase !== 'reveal') return
    if (round.reveals[mySeat] != null || revealPublished.current) return
    const secret = readSecret(gameId, round)
    if (!secret || secret.text == null || secret.salt == null) return
    revealPublished.current = true
    update(ref(db, `games/${gameId}/round/reveals`), { [mySeat]: { text: secret.text, salt: secret.salt } })
      .catch(() => { revealPublished.current = false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlayer, round?.phase, round?.reveals, gameId, mySeat])

  // ---- COORDINATOR: once all reveals are in — or the reveal deadline has passed —
  // verify each against its commitment, recover the answer key, and apply scores
  // once (idempotent via round.scored). A seat that never reveals (dropped offline
  // mid-transition) simply earns no authorship credit; it doesn't block scoring. ---
  useEffect(() => {
    if (!amCoordinator || !round || round.phase !== 'reveal' || round.scored) return
    const deadlinePassed = round.revealDeadline != null && serverNow >= round.revealDeadline
    if (!allRevealed(seats, round.reveals) && !deadlinePassed) return
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
              // Everyone gets a fixed look at the answers, then the round moves on.
              advanceAt: readServerNow() + FIBBAGE_REVEAL_ADVANCE_MS,
              ready: null,
            },
          }
        })
      } catch {
        scoringStarted.current = false // allow a retry on transient failure
      }
    }
    run()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amCoordinator, round?.phase, round?.reveals, round?.scored, round?.revealDeadline, serverNow, gameId])

  // ---- Submit my lie (commit hash now; plaintext stays local until reveal) ------
  const handleSubmitLie = async () => {
    if (!isPlayer || iCommitted || submitting) return
    // Rejects the truth in disguise ("SCOTLAND!", "Scotlnd", "3" for "three"),
    // symbol-only and banned lies — see fibbageLogic.validateLie.
    const check = validateLie(lieInput, fact.answer)
    if (!check.ok) { setInputError(check.error); setInputErrorId(n => n + 1); return }
    const text = check.text
    setInputError('')
    setSubmitting(true)
    try {
      const { hash, salt } = await commit(text)
      // Stable random key so the anonymous ballot submission survives a reload
      // without leaking authorship (it is not derived from the playerId).
      const subKey = `${(crypto.randomUUID?.() || Math.random().toString(36).slice(2))}${Date.now().toString(36)}`
      const secret = { text, salt, subKey }
      sessionStorage.setItem(lieKey(gameId, round), JSON.stringify(secret))
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
  }

  // ---- Cast my vote (BUG 1 fix: write an object of children, not a bare string) -
  const handleVote = async (optionId) => {
    if (!isPlayer || iVoted) return
    // Cannot vote for your own lie. The ballot carries no authorship, so this is
    // checked locally against my own secret text (which only I know) — loosely,
    // since a duplicate lie may have merged under another author's spelling.
    const opt = round.options.find(o => o.id === optionId)
    if (opt && mySecret?.text && sameOption(opt.text, mySecret.text)) {
      setInputError("CAN'T VOTE FOR YOUR OWN LIE"); setInputErrorId(n => n + 1); return
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
  }

  // ---- Advance past a scored reveal: next prompt, or match over. A transaction
  // pinned to this round (promptIndex + deckSeed) so the coordinator's timer and a
  // NEXT press can't double-advance. Match end: highest score at or past
  // MATCH_WIN_SCORE wins; an exact tie is shared (never seat order). --------------
  const advanceRound = async () => {
    if (!round || round.phase !== 'reveal' || !round.scored) return
    const fromIndex = round.promptIndex
    const fromSeed = round.deckSeed ?? null
    await runTransaction(ref(db, `games/${gameId}`), current => {
      const r = current?.round
      if (!r || r.phase !== 'reveal' || !r.scored) return // already advanced
      if ((r.promptIndex ?? 0) !== fromIndex || (r.deckSeed ?? null) !== fromSeed) return
      const winners = matchWinners(current.scores, seatOrder(current.players || {}), MATCH_WIN_SCORE)
      if (winners.length > 0) {
        return {
          ...current,
          status: 'finished',
          winner: winners.length === 1 ? winners[0] : null,
          proposal: null,
        }
      }
      // promptIndex counts rounds (no wrap): factIndexFor maps it through this
      // match's shuffled order, reshuffling after each full pass of the deck.
      return {
        ...current,
        round: { phase: 'lying', promptIndex: fromIndex + 1, deckSeed: fromSeed },
        proposal: null,
      }
    })
  }

  // ---- COORDINATOR: the scored reveal auto-advances once FIBBAGE_REVEAL_ADVANCE_MS
  // has passed (or everyone pressed READY), so no single player can cut the
  // reveal short or hold the table hostage. ---------------------------------------
  useEffect(() => {
    if (!amCoordinator || !round || round.phase !== 'reveal' || !round.scored || paused) return
    if (round.advanceAt == null) {
      // Round scored by an older client with no timer — start one now.
      update(ref(db, `games/${gameId}/round`), { advanceAt: readServerNow() + FIBBAGE_REVEAL_ADVANCE_MS }).catch(() => {})
      return
    }
    if (serverNow < round.advanceAt && !allReady(seats, round.ready)) return
    if (advancingRound.current === roundKey) return
    advancingRound.current = roundKey
    advanceRound().catch(() => { advancingRound.current = null })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amCoordinator, round?.phase, round?.scored, round?.advanceAt, round?.ready, serverNow, paused, roundKey, gameId])

  const handleReady = () => runReady(
    () => update(ref(db, `games/${gameId}/round/ready`), { [mySeat]: true }),
    () => toast.error('READY FAILED — CHECK CONNECTION'),
  )

  const handleNext = () => runAdvance(
    advanceRound,
    () => toast.error('NEXT ROUND FAILED — CHECK CONNECTION'),
  )

  // -------------------------------------------------------------------------
  // WAITING / START screen (status !== 'playing')
  // -------------------------------------------------------------------------
  if (game.status !== 'playing') {
    const matchOver = game.status === 'finished'
    const ranked = seatOrder(players || {})
      .map(id => ({ id, name: players[id]?.name || id, score: scores[id] || 0 }))
      .sort((a, b) => b.score - a.score)
    // Champions: highest score at or past the target; exact ties share the title.
    const champIds = matchWinners(scores, seatOrder(players || {}), MATCH_WIN_SCORE)
    const champs = champIds.length > 0
      ? champIds.map(id => ranked.find(p => p.id === id))
      : (ranked[0] ? [ranked[0]] : [])
    const champ = champs[0]
    const iWon = champs.some(p => p.id === mySeat)
    const champHeadline = champs.length > 1
      ? (iWon ? 'YOU SHARE THE WIN!' : `${champs.map(p => p.name.toUpperCase()).join(' & ')} TIE`)
      : (iWon ? 'YOU WIN!' : `${(champ?.name || '').toUpperCase()} WINS`)

    return (
      <div className="space-y-5 text-center">
        {matchOver && champ && (
          <div className="space-y-1">
            <p className="font-pixel text-[10px] text-retro-dim tracking-widest">MATCH OVER</p>
            <p className="font-pixel text-base text-retro-cta text-glow-cta">
              {champHeadline}
            </p>
            {champs.length > 1 && (
              <p className="font-pixel text-[9px] text-retro-dim">EXACT TIE — CO-CHAMPIONS</p>
            )}
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
                  headline: champHeadline,
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

  if (paused) {
    return (
      <div className="text-center py-8 space-y-2">
        <p className="font-pixel text-[11px] text-retro-p2 text-glow-p2 arcade-blink">⏸ ROUND PAUSED</p>
        <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
          NEED {MIN_ACTIVE}+ PLAYERS ONLINE TO CONTINUE<br />
          ({seats.length}/{playerCount} ONLINE NOW)
        </p>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Shared header: prompt with blank
  // -------------------------------------------------------------------------
  const promptDisplay = fact.prompt.replace(
    '___',
    round.phase === 'reveal' ? `「${fact.answer.toUpperCase()}」` : '_____',
  )

  const committedCount = Object.keys(round.lies).length
  const votedCount = Object.keys(round.votes).length
  // Every option renders upper-cased: the truth keeps the deck's casing in the
  // data while lies are typed with auto-capitalisation off, so mixed case
  // would point straight at the truth.
  const optionLabel = text => String(text ?? '').toUpperCase()

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
  const iReady = !!round.ready[mySeat]
  const readyCount = seats.filter(id => round.ready[id]).length
  const everyoneReady = allReady(seats, round.ready)

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
                maxLength={LIE_MAX_LENGTH}
                aria-label="Your fake answer"
                onChange={e => { setLieInput(e.target.value); setInputError('') }}
                onKeyDown={e => e.key === 'Enter' && handleSubmitLie()}
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="YOUR FAKE ANSWER"
                className="w-full bg-retro-surface border-2 border-retro-border text-retro-text font-pixel text-[11px] text-center uppercase rounded px-3 py-2.5 focus:outline-none focus:border-retro-p1 disabled:opacity-40"
              />
              <WordFeedback message={inputError} tone="bad" id={inputErrorId} />
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
          <RoundTimer endsAt={round.lieDeadline} now={serverNow} totalMs={LIE_MS} label="LIE TIME" />
          <p className="font-pixel text-[9px] text-retro-dim text-center">
            {committedCount}/{seats.length} LIED…
          </p>
        </div>
      )}

      {/* ---- VOTING PHASE ---- */}
      {round.phase === 'voting' && (
        <div className="space-y-2">
          {round.options.map(opt => {
            const isMine = !!mySecret?.text && sameOption(opt.text, mySecret.text)
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
                {optionLabel(opt.text)}{isMine ? '  (YOUR LIE)' : ''}
              </button>
            )
          })}
          <WordFeedback message={inputError} tone="bad" id={inputErrorId} />
          <RoundTimer endsAt={round.voteDeadline} now={serverNow} totalMs={VOTE_MS} label="VOTE TIME" />
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
                  const isTruth = opt.by === null || sameOption(opt.text, fact.answer)
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
                          {optionLabel(opt.text)}{isTruth ? '  ✓ TRUTH' : ''}
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

              <RoundTimer
                endsAt={round.advanceAt}
                now={serverNow}
                totalMs={FIBBAGE_REVEAL_ADVANCE_MS}
                label="NEXT ROUND IN"
                lowMs={3000}
              />
              {isPlayer && (amCoordinator || everyoneReady) && (
                <button
                  onClick={handleNext}
                  disabled={advancing}
                  className="w-full py-2.5 font-pixel text-[10px] border-2 border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 hover:bg-retro-tint-p1 transition-all active:scale-95 disabled:opacity-40"
                >
                  {advancing ? 'STARTING…' : 'NEXT PROMPT'}
                </button>
              )}
              {isPlayer && !amCoordinator && !everyoneReady && (
                <button
                  onClick={handleReady}
                  disabled={iReady || readying}
                  className="w-full py-2.5 font-pixel text-[10px] border-2 border-retro-border text-retro-dim rounded hover:border-retro-p1 hover:text-retro-p1 transition-all active:scale-95 disabled:opacity-60"
                >
                  {iReady ? `READY ✓ ${readyCount}/${seats.length}` : readying ? 'SENDING…' : 'READY'}
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
