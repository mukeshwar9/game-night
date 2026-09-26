import { useEffect, useRef, useState } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import {
  seatOrder,
  hashString,
  buildOptions,
  attributeOptions,
  scoreRound,
  normalizeMap,
  allLied,
  allVoted,
  MATCH_PROMPTS,
  SUB_GRACE_MS,
  drawPromptOrder,
  promptOrderOf,
  promptMultiplier,
  applyMultiplier,
  nextPromptRound,
  phaseDeadline,
  pendingLiars,
  matchChampions,
  validateLie,
  sameOption,
  allReady,
  LIE_MAX_LENGTH,
  FIBBAGE_LIE_MS,
  FIBBAGE_VOTE_MS,
  FIBBAGE_REVEAL_WAIT_MS,
  FIBBAGE_REVEAL_ADVANCE_MS,
} from '../lib/fibbageLogic'
import { roomCoordinator } from '../lib/coordinator'
import { markSeen } from '../lib/seenHistory'
import { normalizeList } from '../lib/normalize'
import { normalizeTimerScale, scaledMs, timersOff } from '../lib/timerScale'
import { FIBBAGE_FACTS } from '../lib/decks/fibbage'
import useServerClock, { getServerNow } from '../hooks/useServerClock'
import useCommitReveal, { clearSecret, secretKey } from '../hooks/useCommitReveal'
import RoundEndPanel from '../components/RoundEndPanel'
import RoundTimer from '../components/RoundTimer'
import WordFeedback from '../components/WordFeedback'
import GameSwitcher from '../components/GameSwitcher'
import LobbyInviteButton from '../components/LobbyInviteButton'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'
import { toast } from 'sonner'

const MIN_PLAYERS = 3    // needed in the lobby to START a match
const MIN_ACTIVE = 2     // needed mid-match to keep a round moving; below this we pause
const LIE_MS = FIBBAGE_LIE_MS
const VOTE_MS = FIBBAGE_VOTE_MS
// Grace for publishing author reveals — liveness, not a player-facing timer, so
// the room timer scale does not stretch it.
const REVEAL_MS = FIBBAGE_REVEAL_WAIT_MS
// A scored reveal stays up this long (× the room timer scale), then the next
// prompt starts on its own — nobody can cut it short or hold the table.
const ADVANCE_MS = FIBBAGE_REVEAL_ADVANCE_MS

// sessionStorage secret for the player's lie ({ text, subKey, salt, hash }) per
// prompt: `fibbage-lie-${gameId}-${promptIndex}` (useCommitReveal). The plaintext
// + salt never touch Firebase until the reveal phase — matching the commit-reveal
// pattern in src/lib/commit.js (Bluff / TwoTruths / Wavelength).
const SECRET_KEY = 'fibbage-lie'

function normalizeRound(raw) {
  if (!raw) return null
  return {
    phase: raw.phase ?? 'lying',
    promptIndex: raw.promptIndex ?? 0,
    num: raw.num ?? null,                 // 0-based position in `order` (null on legacy rounds)
    order: raw.order ?? null,             // this match's deck indices
    deckSeed: raw.deckSeed ?? null,
    lies: normalizeMap(raw.lies),         // { [playerId]: { hash } } — commitment only
    subs: normalizeMap(raw.subs),         // { [randomKey]: text } — anonymised ballot pool
    options: normalizeList(raw.options),  // [{ id, text }] — read by key, never Object.values
    votes: normalizeMap(raw.votes),       // { [playerId]: optionId }
    reveals: normalizeMap(raw.reveals),   // { [playerId]: { text, salt } } — reveal phase only
    cheats: normalizeMap(raw.cheats),     // { [playerId]: true } — failed verification
    deltas: normalizeMap(raw.deltas),     // { [playerId]: points } — this prompt's scores
    lieStartedAt: raw.lieStartedAt ?? null,
    voteStartedAt: raw.voteStartedAt ?? null,
    lieDeadline: raw.lieDeadline ?? null,     // legacy absolute 1× deadlines
    voteDeadline: raw.voteDeadline ?? null,
    closedAt: raw.closedAt ?? null,
    revealDeadline: raw.revealDeadline ?? null,
    advanceAt: raw.advanceAt ?? null,     // scored reveal auto-advances at this time
    ready: normalizeMap(raw.ready),       // { [playerId]: true } — pressed READY on the reveal
    scored: !!raw.scored,
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
  gameId, game, mySeat, players,
  onStart, onSwitchGame, onNewMatch, proposal,
}) {
  const round = normalizeRound(game.round)
  const allSeats = seatOrder(players || {})
  const seats = activeSeats(players || {})
  const playerCount = allSeats.length
  const enough = playerCount >= MIN_PLAYERS
  // Mid-match, a round can only progress with at least MIN_ACTIVE seats actually
  // online — below that, no fixed host to blame: pause and wait rather than spin.
  const paused = game.status === 'playing' && !!round && seats.length < MIN_ACTIVE

  const scores = game.scores || {}
  const isPlayer = !!mySeat && !!players?.[mySeat]
  const nameOf = (id) => players?.[id]?.name || id || ''
  // Online-aware coordinator (src/lib/coordinator.js roomCoordinator): the
  // room host (or a TRANSFER HOST pick, game.hostUid) while connected, else
  // the next online seat by join time. Every phase
  // transition (and START) is gated on this instead of the fixed `isHost`, so a
  // host disconnect hands off instead of freezing the match.
  const coordinatorId = roomCoordinator(players, game.hostUid ?? null)
  const amCoordinator = isPlayer && coordinatorId === mySeat

  const timerScale = normalizeTimerScale(game.timerScale)
  const noTimer = timersOff(game.timerScale)

  // A fresh match (or a legacy round with no order) waits for the coordinator
  // to draw this match's prompt order before anyone sees a prompt.
  const deckSize = FIBBAGE_FACTS.length
  const order = round ? promptOrderOf(round, deckSize) : []
  const needsOrder = !!round && order.length === 0 && round.phase === 'lying' &&
    Object.keys(round.lies).length === 0
  const total = order.length || MATCH_PROMPTS
  const num = round?.num ?? 0
  const isFinal = order.length > 0 && promptMultiplier(num, order.length) > 1

  const fact = round && !needsOrder ? FIBBAGE_FACTS[round.promptIndex % deckSize] : null

  const secret = useCommitReveal(gameId, SECRET_KEY, round ? round.promptIndex : undefined)
  // Only trust a stored secret that matches this round's commitment — the same
  // deck index can come round again in a later match.
  const myHash = round?.lies?.[mySeat]?.hash
  const mySecret = secret.secret && (!myHash || secret.secret.hash === myHash) ? secret.secret : null
  const { now: serverNow } = useServerClock(game.status === 'playing' && round ? 500 : 0)

  const [lieInput, setLieInput] = useState('')
  const [inputError, setInputError] = useState('')
  const [inputErrorId, setInputErrorId] = useState(0) // restarts the feedback shake
  const [localLie, setLocalLie] = useState(false)   // I committed this round
  const [localVote, setLocalVote] = useState(null)  // optionId I picked locally
  const [submitting, runSubmit] = useBusy()
  const [starting, runStart] = useBusy()
  const [closing, runClose] = useBusy()
  const [readying, runReady] = useBusy()

  // Reset per-round local state when the prompt advances (render-phase derive).
  const roundId = round ? `${round.num ?? 'x'}-${round.promptIndex}` : null
  const [prevRoundId, setPrevRoundId] = useState(roundId)
  if (prevRoundId !== roundId) {
    setPrevRoundId(roundId)
    setLieInput('')
    setInputError('')
    setLocalLie(false)
    setLocalVote(null)
  }

  const prevPhase = useRef(round?.phase)
  const subPublished = useRef(false)
  const revealPublished = useRef(false)
  const scoringStarted = useRef(false)
  const advancingToVoting = useRef(false)
  const advancingToReveal = useRef(false)
  const closingLies = useRef(false)
  const drawing = useRef(false)
  const advancingRound = useRef(null)
  const stampingLie = useRef(false)
  const lastRoundId = useRef(roundId)
  const lastPromptIndex = useRef(round?.promptIndex ?? null)
  useEffect(() => {
    if (lastRoundId.current === roundId) return
    // The previous prompt's secret is spent once the round moves on.
    const prevIndex = lastPromptIndex.current
    if (prevIndex != null && prevIndex !== round?.promptIndex) {
      clearSecret(secretKey(SECRET_KEY, gameId, prevIndex))
    }
    lastPromptIndex.current = round?.promptIndex ?? null
    lastRoundId.current = roundId
    subPublished.current = false
    revealPublished.current = false
    scoringStarted.current = false
    advancingToVoting.current = false
    advancingToReveal.current = false
    closingLies.current = false
    stampingLie.current = false
  }, [roundId, gameId]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const lieDeadline = round ? phaseDeadline(round.lieStartedAt, round.lieDeadline, LIE_MS, timerScale) : null
  const voteDeadline = round ? phaseDeadline(round.voteStartedAt, round.voteDeadline, VOTE_MS, timerScale) : null
  const lieWindow = scaledMs(LIE_MS, timerScale)
  const voteWindow = scaledMs(VOTE_MS, timerScale)
  const advanceWindow = scaledMs(ADVANCE_MS, timerScale) // null when the room runs untimed
  const lyingClosed = !!round && round.phase === 'lying' &&
    (round.closedAt != null || (lieDeadline != null && serverNow >= lieDeadline))
  // Everyone drops their anonymous ballot submission once all lies are in, or
  // once lying has been closed early (deadline / coordinator).
  const collecting = !!round && round.phase === 'lying' &&
    (allLied(seats, round.lies) || round.closedAt != null)

  // ---- COORDINATOR: draw this match's prompt order once (seeded; avoids the
  // room's seen/fibbage history), in the same transaction that records it as
  // seen and stamps the first lying phase. -------------------------------------
  useEffect(() => {
    if (!amCoordinator || !needsOrder || game.status !== 'playing' || paused) return
    if (drawing.current) return
    drawing.current = true
    const fallbackSeed = Math.floor(Math.random() * 2147483647)
    runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current || !current.round) return current
      const r = current.round
      if ((r.phase ?? 'lying') !== 'lying' || promptOrderOf(r, deckSize).length) return
      if (r.lies && Object.keys(r.lies).length) return
      const deckSeed = r.deckSeed ?? fallbackSeed
      const drawn = drawPromptOrder(deckSize, deckSeed, current.seen?.fibbage)
      return {
        ...current,
        round: {
          phase: 'lying', deckSeed, order: drawn, num: 0, promptIndex: drawn[0],
          lieStartedAt: getServerNow(),
        },
        seen: { ...(current.seen || {}), fibbage: markSeen(current.seen?.fibbage, drawn) },
      }
    }).catch(() => {}).finally(() => { drawing.current = false })
  }, [amCoordinator, needsOrder, game.status, paused, gameId, serverNow]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- COORDINATOR: a round with an order but no lying start stamp (legacy /
  // interrupted write) gets one, so its deadline can run. ----------------------
  useEffect(() => {
    if (!amCoordinator || !round || round.phase !== 'lying' || needsOrder) return
    if (round.lieStartedAt != null || round.lieDeadline != null || stampingLie.current) return
    stampingLie.current = true
    update(ref(db, `games/${gameId}/round`), { lieStartedAt: getServerNow() })
      .catch(() => { stampingLie.current = false })
  }, [amCoordinator, round?.phase, round?.lieStartedAt, round?.lieDeadline, needsOrder, gameId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- PLAYER: once lies are being collected, publish my plaintext lie into the
  // anonymous ballot pool (random key → no authorship in the DB). The
  // coordinator builds the ballot from this pool and then deletes it. ----------
  useEffect(() => {
    if (!isPlayer || !collecting) return
    if (subPublished.current) return
    const stored = secret.read()
    if (!stored || !stored.text || !stored.subKey) return
    if (round.lies[mySeat]?.hash !== stored.hash) return // not committed (yet) this round
    subPublished.current = true
    update(ref(db, `games/${gameId}/round/subs`), { [stored.subKey]: stored.text })
      .catch(() => { subPublished.current = false })
  }, [isPlayer, collecting, round?.lies, gameId, mySeat]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close lying early: freezes new lies and tells everyone to drop their ballot
  // submission. Idempotent (only the first close stamps closedAt).
  const closeLying = (promptIndex) => runTransaction(ref(db, `games/${gameId}/round`), cur => {
    if (!cur) return cur
    if (cur.phase !== 'lying' || cur.promptIndex !== promptIndex || cur.closedAt != null) return
    return { ...cur, closedAt: getServerNow() }
  })

  // ---- COORDINATOR: the lie deadline passed → close lying. ---------------------
  useEffect(() => {
    if (!amCoordinator || !round || round.phase !== 'lying' || paused || needsOrder) return
    if (round.closedAt != null || lieDeadline == null || serverNow < lieDeadline) return
    if (closingLies.current) return
    closingLies.current = true
    closeLying(round.promptIndex).catch(() => { closingLies.current = false })
  }, [amCoordinator, round?.phase, round?.closedAt, lieDeadline, serverNow, paused, needsOrder, gameId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- COORDINATOR: lying → voting once every committed lie's anonymous
  // submission is in — or SUB_GRACE_MS after an early close, in which case the
  // ballot uses whatever arrived instead of waiting on a seat that will never
  // respond. Builds the shuffled, author-less, truth-unmarked ballot and deletes
  // the submission pool. Idempotent guard + a stale-phase re-check inside the
  // write keeps this single-writer even during a coordinator handover. ---------
  useEffect(() => {
    if (!amCoordinator || !round || round.phase !== 'lying' || paused || !fact) return
    if (!collecting) return
    const committedIds = Object.keys(round.lies)
    const texts = Object.values(round.subs)
    const graceOver = round.closedAt != null && serverNow >= round.closedAt + SUB_GRACE_MS
    if (texts.length < committedIds.length && !graceOver) return // wait for every anonymous submission
    if (advancingToVoting.current) return
    advancingToVoting.current = true
    // Seeded per match too, so the same fact in a later match doesn't put the
    // truth back in the same ballot slot.
    const seed = hashString(`${gameId}:${round.deckSeed ?? ''}:${round.num ?? ''}:${round.promptIndex}`)
    const options = buildOptions(fact.answer, texts, seed)
    runTransaction(ref(db, `games/${gameId}/round`), current => {
      if (!current || current.phase !== 'lying') return current // already advanced
      return { ...current, phase: 'voting', options, subs: null, voteStartedAt: getServerNow() }
    }).catch(() => { advancingToVoting.current = false })
  }, [amCoordinator, round?.phase, round?.lies, round?.subs, round?.closedAt, collecting, serverNow, paused, gameId]) // eslint-disable-line react-hooks/exhaustive-deps

  // voting → reveal (phase flip only; scoring waits for author reveals).
  const closeVoting = (promptIndex) => runTransaction(ref(db, `games/${gameId}/round`), current => {
    if (!current) return current
    if (current.phase !== 'voting' || current.promptIndex !== promptIndex) return // already advanced
    return { ...current, phase: 'reveal', revealDeadline: getServerNow() + REVEAL_MS }
  })

  // ---- COORDINATOR: voting → reveal once everyone has voted, or the vote
  // deadline has passed. -------------------------------------------------------
  useEffect(() => {
    if (!amCoordinator || !round || round.phase !== 'voting' || paused) return
    const deadlinePassed = voteDeadline != null && serverNow >= voteDeadline
    if (!allVoted(seats, round.votes) && !deadlinePassed) return
    if (advancingToReveal.current) return
    advancingToReveal.current = true
    closeVoting(round.promptIndex).catch(() => { advancingToReveal.current = false })
  }, [amCoordinator, round?.phase, round?.votes, voteDeadline, serverNow, paused, gameId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- PLAYER: publish my author→lie reveal — ONLY now, at the reveal phase. This
  // is the first (and only) time the DB learns who wrote which lie. ---------------
  useEffect(() => {
    if (!isPlayer || !round || round.phase !== 'reveal') return
    if (round.reveals[mySeat] != null || revealPublished.current) return
    const stored = secret.read()
    if (!stored || stored.text == null || stored.salt == null) return
    if (round.lies[mySeat]?.hash !== stored.hash) return // no lie committed this round
    revealPublished.current = true
    update(ref(db, `games/${gameId}/round/reveals`), { [mySeat]: { text: stored.text, salt: stored.salt } })
      .catch(() => { revealPublished.current = false })
  }, [isPlayer, round?.phase, round?.reveals, round?.lies, gameId, mySeat]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- COORDINATOR: once every liar has revealed — or the reveal grace has
  // passed — verify each against its commitment, recover the answer key, and
  // apply scores once (idempotent via round.scored). The final prompt scores
  // double. A liar who never reveals (dropped offline mid-transition) simply
  // earns no authorship credit; it doesn't block scoring. ---------------------
  useEffect(() => {
    if (!amCoordinator || !round || round.phase !== 'reveal' || round.scored || !fact) return
    const deadlinePassed = round.revealDeadline != null && serverNow >= round.revealDeadline
    if (pendingLiars(round.lies, round.reveals).length > 0 && !deadlinePassed) return
    if (scoringStarted.current) return
    scoringStarted.current = true

    const run = async () => {
      try {
        const verifiedLies = {}
        const cheats = {}
        for (const [pid, val] of Object.entries(round.reveals)) {
          const hash = round.lies[pid]?.hash
          const { text, salt } = val || {}
          if (hash == null || text == null || salt == null) continue
          const ok = await secret.verify(hash, text, salt)
          if (ok) verifiedLies[pid] = text
          else cheats[pid] = true
        }
        const rich = attributeOptions(round.options, fact.answer, verifiedLies)
        const deltas = applyMultiplier(scoreRound(rich, round.votes), isFinal ? promptMultiplier(num, order.length) : 1)
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
              deltas: Object.keys(deltas).length ? deltas : null,
              cheats: Object.keys(cheats).length ? cheats : null,
              // Everyone gets a fixed look at the answers, then the round moves on.
              advanceAt: advanceWindow != null ? getServerNow() + advanceWindow : null,
              ready: null,
            },
          }
        })
      } catch {
        scoringStarted.current = false // allow a retry on transient failure
      }
    }
    run()
  }, [amCoordinator, round?.phase, round?.reveals, round?.scored, round?.revealDeadline, serverNow, gameId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Submit my lie (commit hash now; plaintext stays local until reveal) ------
  const handleSubmitLie = () => {
    if (!isPlayer || iCommitted || submitting || !fact || lyingClosed) return
    // Rejects the truth in disguise ("SCOTLAND!", "Scotlnd", "3" for "three"),
    // symbol-only and banned lies — see fibbageLogic.validateLie.
    const check = validateLie(lieInput, fact.answer)
    if (!check.ok) { setInputError(check.error); setInputErrorId(n => n + 1); return }
    const text = check.text
    setInputError('')
    runSubmit(async () => {
      // Stable random key so the anonymous ballot submission survives a reload
      // without leaking authorship (it is not derived from the playerId).
      const subKey = `${(crypto.randomUUID?.() || Math.random().toString(36).slice(2))}${Date.now().toString(36)}`
      const { hash } = await secret.commit(text, { text, subKey })
      setLocalLie(true)
      sounds.move('X')
      await update(ref(db, `games/${gameId}/round/lies`), { [mySeat]: { hash } })
    }, () => {
      setLocalLie(false)
      setInputError('SUBMIT FAILED — RETRY')
      toast.error('LIE FAILED — CHECK CONNECTION')
    })
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
      setInputErrorId(n => n + 1)
    }
  }

  // ---- Advance past a scored reveal: next prompt, or match over. Only once the
  // round has actually scored (a stray/racy click can't skip an untallied
  // round), and a transaction pinned to this prompt, so the coordinator's timer
  // and a NEXT press advance once. -----------------------------------------------
  const advanceRound = async () => {
    if (!isPlayer || !round || round.phase !== 'reveal' || !round.scored) return
    const fromIndex = round.promptIndex
    const fromNum = round.num
    await runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current || !current.round) return current
      const r = current.round
      if (r.phase !== 'reveal' || !r.scored || r.promptIndex !== fromIndex || (r.num ?? null) !== fromNum) return
      const next = nextPromptRound(r, deckSize, getServerNow())
      return next.finished
        ? { ...current, status: 'finished', proposal: null }
        : { ...current, round: next.round, proposal: null }
    })
    secret.clear()
  }

  // ---- COORDINATOR: the scored reveal auto-advances once its timer runs out —
  // or as soon as every online seat pressed READY (the only way on when the
  // room runs untimed, besides the coordinator's NEXT). --------------------------
  const everyoneReady = !!round && allReady(seats, round.ready)
  useEffect(() => {
    if (!amCoordinator || !round || round.phase !== 'reveal' || !round.scored || paused) return
    if (round.advanceAt == null && advanceWindow != null) {
      // Scored by an older client with no timer — start one now.
      update(ref(db, `games/${gameId}/round`), { advanceAt: getServerNow() + advanceWindow }).catch(() => {})
      return
    }
    const timeUp = round.advanceAt != null && serverNow >= round.advanceAt
    if (!timeUp && !everyoneReady) return
    if (advancingRound.current === roundId) return
    advancingRound.current = roundId
    advanceRound().catch(() => { advancingRound.current = null })
  }, [amCoordinator, round?.phase, round?.scored, round?.advanceAt, everyoneReady, advanceWindow, serverNow, paused, roundId, gameId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleReady = () => runReady(
    () => update(ref(db, `games/${gameId}/round/ready`), { [mySeat]: true }),
    () => toast.error('READY FAILED — CHECK CONNECTION'),
  )

  // -------------------------------------------------------------------------
  // WAITING / START / MATCH-OVER screen (status !== 'playing')
  // -------------------------------------------------------------------------
  if (game.status !== 'playing') {
    const matchOver = game.status === 'finished'
    const ranked = allSeats
      .map(id => ({ id, name: nameOf(id), score: scores[id] || 0 }))
      .sort((a, b) => b.score - a.score)
    const champs = matchChampions(scores, allSeats)
    // Exact ties at the top share the win — never decided by seat order.
    const iWon = champs.includes(mySeat)
    const headline = champs.length === 0
      ? 'NOBODY SCORED'
      : champs.length > 1
        ? (iWon ? 'YOU SHARE THE WIN!' : `${champs.map(id => nameOf(id).toUpperCase()).join(' & ')} TIE`)
        : (iWon ? 'YOU WIN!' : `${nameOf(champs[0]).toUpperCase()} WINS`)

    return (
      <div className="space-y-5 text-center">
        <div className="space-y-2">
          <p className="font-pixel text-sm text-retro-p1 text-glow-p1">FIBBAGE</p>
          <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
            Invent a fake answer. Fool the others.<br />Find the real one for big points.<br />
            {MATCH_PROMPTS} prompts — the last one scores double.
          </p>
        </div>

        {matchOver ? (
          <RoundEndPanel
            caption="MATCH OVER"
            headline={headline}
            sub={champs.length > 1 && (
              <p className="font-pixel text-[9px] text-retro-dim">EXACT TIE — CO-CHAMPIONS</p>
            )}
            scores={{
              title: 'FINAL SCORES',
              rows: ranked.map(p => ({
                id: p.id, name: p.name, score: p.score, you: p.id === mySeat,
                muted: players[p.id]?.online === false, win: champs.includes(p.id),
              })),
            }}
            actions={isPlayer ? [
              !proposal && onNewMatch && {
                key: 'new', label: 'NEW MATCH', busyLabel: 'STARTING…', onClick: onNewMatch,
              },
            ] : []}
            share={isPlayer && champs.length > 0 ? {
              gameLabel: 'FIBBAGE',
              headline,
              sub: 'Fibbage · Game Night',
            } : null}
          />
        ) : (
          <>
            {/* Lobby */}
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
                </div>
              ))}
            </div>

            {!enough && (
              <p className="font-pixel text-[10px] text-retro-p2 arcade-blink leading-relaxed">
                NEED {MIN_PLAYERS}+ PLAYERS<br />
                ({Math.max(0, MIN_PLAYERS - playerCount)} MORE TO START)
              </p>
            )}
            {!enough && <LobbyInviteButton />}

            {amCoordinator && enough && (
              <button
                onClick={() => runStart(() => onStart())}
                disabled={starting}
                className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50"
              >
                {starting ? 'STARTING…' : 'START ROUND'}
              </button>
            )}
            {!amCoordinator && enough && (
              <p className="font-pixel text-[10px] text-retro-dim arcade-blink">
                WAITING FOR {coordinatorId ? nameOf(coordinatorId).toUpperCase() : 'HOST'} TO START…
              </p>
            )}
          </>
        )}

        {isPlayer && onSwitchGame && !proposal && (
          <GameSwitcher currentType="fibbage" onSwitch={onSwitchGame} />
        )}
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
    round.phase === 'reveal' ? `「${fact.answer.toUpperCase()}」` : '_____',
  )

  const committedCount = Object.keys(round.lies).length
  const votedCount = Object.keys(round.votes).length
  // Every option renders upper-cased: the truth keeps the deck's casing in the
  // data while lies are typed with auto-capitalisation off, so mixed case
  // would point straight at the truth.
  const optionLabel = text => String(text ?? '').toUpperCase()
  const coordName = (nameOf(coordinatorId) || 'HOST').toUpperCase()

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
  const cheaterNames = Object.keys(round.cheats).map(nameOf)
  const iReady = !!round.ready[mySeat]
  const readyCount = seats.filter(id => round.ready[id]).length

  const phaseDeadlineMs = round.closedAt != null
    ? null
    : round.phase === 'lying' ? lieDeadline : round.phase === 'voting' ? voteDeadline : null
  const timerBar = (round.phase === 'lying' || round.phase === 'voting') && (
    phaseDeadlineMs != null ? (
      <RoundTimer
        endsAt={phaseDeadlineMs}
        now={serverNow}
        totalMs={round.phase === 'lying' ? lieWindow : voteWindow}
        label={round.phase === 'lying' ? 'LIE TIME' : 'VOTE TIME'}
      />
    ) : noTimer && round.closedAt == null && (
      <p className="font-pixel text-[8px] text-retro-dim text-center tracking-widest">
        NO TIMER · {amCoordinator ? 'YOU CLOSE' : `${coordName} CLOSES`} THIS PHASE
      </p>
    )
  )

  const closeButton = (label, busyLabel, action) => (
    <button
      onClick={() => runClose(action, () => toast.error('CLOSE FAILED — CHECK CONNECTION'))}
      disabled={closing}
      className="w-full py-2.5 font-pixel text-[10px] border-2 border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 hover:bg-retro-tint-p1 transition-all active:scale-95 disabled:opacity-50"
    >
      {closing ? busyLabel : label}
    </button>
  )

  return (
    <div className="space-y-4">
      {timerBar}

      {/* Prompt */}
      <div className="bg-retro-card border border-retro-border rounded p-4 space-y-2">
        <p className="font-pixel text-[8px] text-retro-dim tracking-widest text-center">
          {order.length > 0 && `PROMPT ${num + 1}/${total} · `}
          {round.phase === 'lying' ? 'INVENT A LIE' : round.phase === 'voting' ? 'WHICH IS TRUE?' : 'THE TRUTH'}
        </p>
        {isFinal && (
          <p className="font-pixel text-[9px] text-retro-p2 text-glow-p2 text-center tracking-widest">
            ★ FINAL PROMPT · DOUBLE POINTS ★
          </p>
        )}
        <p className="font-mono text-[13px] text-retro-text leading-relaxed text-center">
          {promptDisplay}
        </p>
      </div>

      {/* ---- LYING PHASE ---- */}
      {round.phase === 'lying' && (
        <div className="space-y-3">
          {isPlayer && !iCommitted && !lyingClosed ? (
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
              {!isPlayer ? 'SPECTATING' : iCommitted ? 'LIE LOCKED ✓' : "TIME'S UP — BUILDING THE BALLOT"}
            </p>
          )}
          <p className="font-pixel text-[9px] text-retro-dim text-center">
            {committedCount}/{seats.length} LIED…
          </p>
          {noTimer && amCoordinator && round.closedAt == null && committedCount > 0 &&
            closeButton('CLOSE LIES', 'CLOSING…', () => closeLying(round.promptIndex))}
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
          <p className="font-pixel text-[9px] text-retro-dim text-center pt-1">
            {iVoted ? `VOTED ✓ — ${votedCount}/${seats.length} IN` : isPlayer ? 'PICK THE TRUTH' : 'SPECTATING'}
          </p>
          {noTimer && amCoordinator && votedCount > 0 &&
            closeButton('CLOSE VOTING', 'CLOSING…', () => closeVoting(round.promptIndex))}
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
                    .map(([vid]) => nameOf(vid))
                  const authorNames = authors.map(nameOf)
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

              <RoundEndPanel
                scores={{
                  title: isFinal ? 'SCORES · FINAL PROMPT ×2' : 'SCORES',
                  rows: allSeats
                    .map(id => ({ id, name: nameOf(id), score: scores[id] || 0 }))
                    .sort((a, b) => b.score - a.score)
                    .map(p => ({
                      ...p,
                      you: p.id === mySeat,
                      delta: round.deltas[p.id] ?? (Object.keys(round.deltas).length ? 0 : null),
                    })),
                }}
                actions={!isPlayer ? [] : (amCoordinator || everyoneReady) ? [{
                  key: 'next',
                  label: order.length > 0 && num + 1 >= order.length ? 'SEE FINAL RESULTS' : 'NEXT PROMPT',
                  busyLabel: 'DEALING…',
                  variant: 'next',
                  onClick: advanceRound,
                  errorMsg: 'NEXT PROMPT FAILED — CHECK CONNECTION',
                }] : []}
              >
                <RoundTimer
                  endsAt={round.advanceAt}
                  now={serverNow}
                  totalMs={advanceWindow}
                  label={order.length > 0 && num + 1 >= order.length ? 'RESULTS IN' : 'NEXT PROMPT IN'}
                  lowMs={3000}
                />
                {isPlayer && !amCoordinator && !everyoneReady && (
                  <button
                    onClick={handleReady}
                    disabled={iReady || readying}
                    className="w-full py-2.5 font-pixel text-[10px] border-2 border-retro-border text-retro-dim rounded hover:border-retro-p1 hover:text-retro-p1 transition-all active:scale-95 disabled:opacity-60"
                  >
                    {iReady ? `READY ✓ ${readyCount}/${seats.length}` : readying ? 'SENDING…' : 'READY'}
                  </button>
                )}
              </RoundEndPanel>
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
