import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import { commit, verifyReveal } from '../lib/commit'
import { isRoomCoordinator } from '../lib/coordinator'
import {
  seatOrder, normalizeVotes, resolveVote, scoreRound, matchWinners, allOnlineVoted,
  pickLocationIndex, assignRoles, privatesFromRoles, findSpy, recoverLocationIndex,
  SPYFAIR_MIN_PLAYERS, SPYFAIR_QUESTION_SECONDS, SPYFAIR_SEEN_KEY,
} from '../lib/spyfairLogic'
import { markSeen, normalizeSeen } from '../lib/seenHistory'
import { scaledMs, timersOff } from '../lib/timerScale'
import { formatClockSecs } from '../lib/format'
import useServerClock, { getServerNow } from '../hooks/useServerClock'
import GameSwitcher from '../components/GameSwitcher'
import RoundEndPanel from '../components/RoundEndPanel'
import { sounds } from '../lib/sounds'
import { SPYFAIR_LOCATIONS } from '../lib/decks/spyfair'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'
import { toast } from 'sonner'

// Rules (dealing, tally, scoring, match winner) live in src/lib/spyfairLogic.js,
// shared with SpyfairDemo.jsx so the demo can't drift from the live room.

// -----------------------------------------------------------------------------
// INFO-LEAK MODEL — read before touching the round shape.
//
// A fully cheat-proof Spyfair is IMPOSSIBLE in this architecture: every field under
// `games/$id` is world-readable (database.rules.json grants read:true), the host is
// itself one of the players (so it inherently knows the whole assignment), and there
// is no trusted dealer. Per-child Firebase read rules can't help either — they would
// break the whole-node `onValue` listener every screen relies on.
//
// So we do the best PARTIAL mitigation to stop CASUAL / spectator leakage:
//   * No top-level plaintext `round.spy` or `round.locationIndex` DURING the round.
//     The spy's identity is published only at the `result` phase.
//   * The location is COMMITTED at deal time (salted SHA-256 in `round.locationCommitment`,
//     matching src/lib/commit.js) and only its index + salt are revealed at `result`,
//     where the result screen verifies the reveal against the commitment. The salt is
//     held in the host's sessionStorage and never hits the DB until result.
//
// WHAT STILL LEAKS (and why a server would be required to fix it):
//   * `round.private` MUST carry each player's own role — and, for non-spies, the shared
//     location — so they can actually play. That whole map is world-readable, so a
//     determined player/spectator can read another player's entry to learn the location,
//     and can spot the `role:'SPY'` entry to unmask the spy. Hiding this needs either a
//     trusted server that authenticates each client and streams only their own role, or
//     end-to-end per-player encryption with a key exchange — neither of which exists in a
//     serverless, world-readable-node app. We only raise the bar past reading one obvious
//     top-level field.
// -----------------------------------------------------------------------------

// Dealer-only sessionStorage: the committed location's { locationIndex, salt, hash }
// for the current round, so it can be revealed + verified at the result phase.
// `hash` ties the secret to the round it belongs to — a dealer whose deal lost
// the start/next-round transaction must not reveal its stale secret later.
const locKey = (gameId) => `spyfair-loc-${gameId}`

function readLocSecret(gameId, commitment) {
  let secret = null
  try { secret = JSON.parse(sessionStorage.getItem(locKey(gameId)) || 'null') } catch { /* ignore */ }
  if (!secret || secret.locationIndex == null) return null
  if (secret.hash && secret.hash !== commitment) return null
  return secret
}

// Deal a fresh round: pick the spy + location (avoiding the room's recently seen
// locations and the previous round's), hand out private roles, and COMMIT the
// location. Stores the reveal secret in the dealer's sessionStorage. Returns the
// round object to write to Firebase — note it contains NO plaintext spy/locationIndex.
async function dealRound(gameId, order, seen, excludeLocationIndex = null) {
  const locationIndex = pickLocationIndex(seen, excludeLocationIndex)
  const { spyId, roles } = assignRoles(order.map(p => p.playerId), locationIndex)
  const { hash, salt } = await commit(String(locationIndex))
  try { sessionStorage.setItem(locKey(gameId), JSON.stringify({ locationIndex, salt, hash })) } catch { /* ignore */ }
  return {
    phase: 'reveal',
    // Hidden until the result phase — see the INFO-LEAK MODEL note above.
    spy: null,
    locationIndex: null,
    locationSalt: null,
    locationCommitment: hash,
    timerEnds: null,
    votes: null,
    spyWon: null,
    accused: null,
    private: privatesFromRoles(roles, spyId, locationIndex),
  }
}

export default function SpyfairGame({
  gameId, game, mySeat, players,
  onStart, onSwitchGame, onNewMatch, proposal,
}) {
  const round = game.round || {}
  const phase = round.phase || null
  const seats = useMemo(() => seatOrder(players), [players])
  const seatIds = useMemo(() => seats.map(p => p.playerId), [seats])
  const playerCount = seats.length
  const enoughPlayers = playerCount >= SPYFAIR_MIN_PLAYERS
  // Deterministic host-fallback: the coordinator is the first ONLINE seat in join order, not
  // the fixed `isHost` — so a host disconnect hands transitions off instead of
  // freezing the match. Every write below that used to be `isHost`-gated is now
  // gated on this, and each write itself re-checks phase inside a transaction so a
  // handover mid-transition stays single-writer/idempotent.
  const amCoordinator = isRoomCoordinator(mySeat, players, game.hostUid)
  // Room timer scale (lobby option): 1 default, 2 relaxed, 0 = no questioning
  // clock — the coordinator calls the vote by hand.
  const noTimer = timersOff(game.timerScale)

  const myPlayer = players?.[mySeat] || null
  const amSpectator = !myPlayer
  // My role/location come from my OWN private entry — the only thing I'm meant to see
  // during the round. Spy identity is not exposed via a top-level field until result.
  const myPrivate = round.private?.[mySeat] || null
  const amSpy = myPrivate?.role === 'SPY'
  // The location is only revealed (top-level) at the result phase; during the round a
  // non-spy reads it from their own private entry (`myPrivate.location`).
  const revealedLocation = round.locationIndex != null ? SPYFAIR_LOCATIONS[round.locationIndex] : null

  const votes = normalizeVotes(round.votes)
  const myVote = votes[mySeat] || null
  const votesCast = Object.keys(votes).length
  // Required voters = the ONLINE seats only: a player who disconnects mid-vote stays in
  // `players` with online:false and can never vote, so waiting on every seat would stall
  // the round forever. Degenerate-case guard: never auto-resolve on fewer than 2 total
  // votes, so a lone survivor of a mass presence blip can't decide the round alone —
  // the coordinator's manual RESOLVE VOTE NOW button covers that case deliberately.
  const everyOnlineVoted = allOnlineVoted(seats, votes)

  const scores = game.scores || {}
  // Co-winners: everyone who has crossed the match target, not just the earliest
  // joiner — a round that pushes two players over the line at once is a shared victory.
  const winnerIds = matchWinners(seatIds, scores)
  const winners = seats.filter(p => winnerIds.includes(p.playerId))

  const [secretRevealed, setSecretRevealed] = useState(false)
  // Server-corrected clock: the questioning deadline is written by one client and
  // enforced/displayed by all, so every comparison runs on server time. Ticks
  // only while the countdown is on screen.
  const { now } = useServerClock(phase === 'questioning' ? 500 : 0)
  const [starting, runStart] = useBusy()
  const [dealing, runDeal] = useBusy()
  const [advancing, runAdvance] = useBusy()
  const [resolving, runResolve] = useBusy()
  const [locVerify, setLocVerify] = useState(null) // result-phase: true/false/null(unknown)

  const prevPhase = useRef(phase)
  const resolvedRef = useRef(null)

  // Reset the peek-to-reveal flap whenever a new round begins.
  useEffect(() => {
    if (phase === 'reveal' && prevPhase.current !== 'reveal') setSecretRevealed(false)
  }, [phase])

  // --- Coordinator: when the questioning timer expires, advance to the vote phase.
  // `now` ticks for every client (see the interval above), so every client agrees
  // the deadline has passed — only the coordinator actually writes the transition,
  // and the write re-checks phase so a coordinator handover mid-flight is safe. ---
  useEffect(() => {
    if (!amCoordinator || phase !== 'questioning' || !round.timerEnds) return
    if (now < round.timerEnds) return
    runTransaction(ref(db, `games/${gameId}/round`), current => {
      if (!current || current.phase !== 'questioning') return current
      return { ...current, phase: 'vote' }
    }).catch(() => {})
  }, [amCoordinator, phase, round.timerEnds, now, gameId])

  useEffect(() => {
    if (phase !== 'vote') resolvedRef.current = null
  }, [phase])

  // --- Verify the revealed location against its commitment (result phase) ---
  useEffect(() => {
    let alive = true
    const check = async () => {
      const canVerify = phase === 'result' &&
        round.locationCommitment != null && round.locationSalt != null && round.locationIndex != null
      if (!canVerify) { if (alive) setLocVerify(null); return }
      try {
        const ok = await verifyReveal(round.locationCommitment, String(round.locationIndex), round.locationSalt)
        if (alive) setLocVerify(ok)
      } catch { if (alive) setLocVerify(null) }
    }
    check()
    return () => { alive = false }
  }, [phase, round.locationCommitment, round.locationSalt, round.locationIndex])

  // --- Sounds on result ---
  useEffect(() => {
    if (phase === 'result' && prevPhase.current !== 'result') {
      const spyWon = round.spyWon
      if (amSpy) (spyWon ? sounds.win : sounds.lose)()
      else if (!amSpectator) (spyWon ? sounds.lose : sounds.win)()
    }
    prevPhase.current = phase
  }, [phase, round.spyWon, amSpy, amSpectator])

  // -------------------------------------------------------------------------
  // Coordinator actions — gated on `amCoordinator` (the first ONLINE seat by join order),
  // not the fixed `isHost`, so a host disconnect hands these off instead of
  // freezing the match. See the `amCoordinator` comment above for the invariant.
  // -------------------------------------------------------------------------
  const startRound = () => runStart(async () => {
    if (!amCoordinator || !enoughPlayers) return
    try {
      const round = await dealRound(gameId, seatOrder(players), game.seen?.[SPYFAIR_SEEN_KEY])
      // Transaction, not a blind update: during a coordinator handover two
      // clients can both tap START — only the first deal lands.
      const { committed } = await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.status === 'playing') return
        return { ...current, status: 'playing', winner: null, round, proposal: null, lastActivityAt: Date.now() }
      })
      if (committed) onStart?.()
    } catch {
      toast.error('START FAILED — CHECK CONNECTION')
    }
  })

  const beginQuestioning = () => runAdvance(async () => {
    if (!amCoordinator) return
    const questionMs = scaledMs(SPYFAIR_QUESTION_SECONDS * 1000, game.timerScale)
    await runTransaction(ref(db, `games/${gameId}/round`), current => {
      if (!current || current.phase !== 'reveal') return current
      // Timers off: no deadline — the coordinator calls the vote by hand.
      const timerEnds = questionMs == null ? null : getServerNow() + questionMs
      return { ...current, phase: 'questioning', timerEnds }
    }).catch(() => toast.error('START FAILED — CHECK CONNECTION'))
  })

  const callVote = () => runAdvance(async () => {
    if (!amCoordinator) return
    await runTransaction(ref(db, `games/${gameId}/round`), current => {
      if (!current || current.phase !== 'questioning') return current
      return { ...current, phase: 'vote' }
    }).catch(() => toast.error('CALL FAILED — CHECK CONNECTION'))
  })

  async function resolveRound() {
    // Reveal the committed location now (result phase). Prefer the dealer's stored
    // secret so it can be verified against the commitment; if this client isn't the
    // dealer (coordinator handover) or lost it (reload), fall back to recovering the
    // index from a non-spy private entry so the result screen still shows the
    // correct location (verification is then skipped).
    const secret = readLocSecret(gameId, round.locationCommitment)
    try {
      // One transaction re-reads the round and bails unless it is still in the
      // vote, so a handover mid-resolve can never score the round twice.
      await runTransaction(ref(db, `games/${gameId}`), current => {
        const r = current?.round
        if (!r || r.phase !== 'vote') return // already resolved by someone else
        // Spy identity is not a top-level field during the round — recover it from the
        // private map (the role === 'SPY' entry) and only now publish it at result.
        const spyId = findSpy(r.private)
        const { accused, spyWon } = resolveVote(normalizeVotes(r.votes), spyId)
        const liveIds = seatOrder(current.players).map(p => p.playerId)
        const liveScores = scoreRound(current.scores, liveIds, spyId, spyWon)
        const someoneWonMatch = matchWinners(liveIds, liveScores).length > 0

        const own = secret && (!secret.hash || secret.hash === r.locationCommitment) ? secret : null
        const locationIndex = own?.locationIndex ?? recoverLocationIndex(r.private)
        const locationSalt = own?.salt ?? null
        const seen = locationIndex == null
          ? current.seen
          : { ...(current.seen || {}), [SPYFAIR_SEEN_KEY]: markSeen(normalizeSeen(current.seen?.[SPYFAIR_SEEN_KEY]), [locationIndex]) }

        return {
          ...current,
          round: { ...r, phase: 'result', spyWon, accused, spy: spyId, locationIndex, locationSalt },
          scores: liveScores,
          seen,
          lastActivityAt: Date.now(),
          ...(someoneWonMatch ? { status: 'finished' } : {}),
        }
      })
    } catch {
      toast.error('VOTE FAILED — CHECK CONNECTION')
    }
  }

  // Manual fallback for the coordinator: tally whatever votes are in RIGHT NOW. Covers
  // flapping presence (a gone player still reading online:true) where the auto-resolve
  // never fires. Idempotent vs the auto path: the resolvedRef check-and-set is
  // synchronous (no await before it), and resolveRound itself re-reads the round and
  // bails unless phase is still 'vote' — same guards the auto-resolve effect relies on.
  const forceResolveVote = () => runResolve(async () => {
    if (!amCoordinator || phase !== 'vote' || votesCast === 0) return
    if (resolvedRef.current === 'vote') return
    resolvedRef.current = 'vote'
    await resolveRound()
  })

  const nextRound = () => runDeal(async () => {
    if (!amCoordinator) return
    try {
      const round = await dealRound(gameId, seatOrder(players), game.seen?.[SPYFAIR_SEEN_KEY], game.round?.locationIndex ?? null)
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.round?.phase !== 'result' || current.status === 'finished') return
        return { ...current, round, proposal: null, lastActivityAt: Date.now() }
      })
    } catch {
      toast.error('NEXT ROUND FAILED — CHECK CONNECTION')
    }
  })

  // -------------------------------------------------------------------------
  // Player actions
  // -------------------------------------------------------------------------
  async function castVote(accusedId) {
    if (amSpectator || phase !== 'vote' || myVote) return
    sounds.move(amSpy ? 'O' : 'X')
    await runTransaction(ref(db, `games/${gameId}/round/votes/${mySeat}`), cur => (cur ? undefined : accusedId))
      .catch(() => toast.error('VOTE FAILED — CHECK CONNECTION'))
  }

  // --- Coordinator: once every ONLINE player has voted (min 2 votes), resolve. ---
  // Also fires when the last non-voter drops offline mid-vote, un-sticking the round.
  useEffect(() => {
    if (!amCoordinator || phase !== 'vote' || !everyOnlineVoted) return
    if (resolvedRef.current === 'vote') return
    resolvedRef.current = 'vote'
    resolveRound()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amCoordinator, phase, everyOnlineVoted])

  // -------------------------------------------------------------------------
  // Render: waiting lobby (status not playing, no live result to show)
  // -------------------------------------------------------------------------
  const showLobby = game.status !== 'playing' && phase !== 'result'

  if (showLobby) {
    return (
      <div className="space-y-5">
        <div className="text-center space-y-2">
          <p className="font-pixel text-xs text-retro-cta text-glow-cta tracking-widest">SPYFAIR</p>
          <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
            One of you is the SPY. Everyone else shares a secret location.
            Ask questions, find the spy — the spy survives by blending in.
          </p>
        </div>

        <div className="bg-retro-card border border-retro-border rounded p-4 space-y-2">
          <p className="font-pixel text-[9px] text-retro-dim tracking-wider">
            PLAYERS ({playerCount})
          </p>
          <ul className="space-y-1">
            {seats.map((p, i) => (
              <li key={p.playerId} className="flex items-center justify-between font-mono text-[11px]">
                <span className={cn(
                  p.playerId === mySeat ? 'text-retro-p1 text-glow-p1' : 'text-retro-text',
                )}>
                  {i + 1}. {p.name || 'PLAYER'}{p.playerId === mySeat ? ' (YOU)' : ''}
                </span>
                <span className={cn(
                  'font-pixel text-[8px]',
                  p.online ? 'text-retro-win text-glow-win' : 'text-retro-dim',
                )}>
                  {p.online ? 'ONLINE' : 'OFF'}
                </span>
              </li>
            ))}
            {playerCount === 0 && (
              <li className="font-mono text-[11px] text-retro-dim">No players yet…</li>
            )}
          </ul>
        </div>

        {amCoordinator ? (
          <div className="text-center space-y-2">
            {enoughPlayers ? (
              <button
                onClick={startRound}
                disabled={starting}
                className="px-6 py-2.5 min-w-[8.5rem] bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-40"
              >
                {starting ? 'DEALING…' : 'START ROUND'}
              </button>
            ) : (
              <p className="font-pixel text-[10px] text-retro-dim arcade-blink">
                NEED {SPYFAIR_MIN_PLAYERS - playerCount} MORE PLAYER{SPYFAIR_MIN_PLAYERS - playerCount === 1 ? '' : 'S'}
              </p>
            )}
          </div>
        ) : (
          <p className="text-center font-pixel text-[10px] text-retro-dim arcade-blink">
            {enoughPlayers ? 'WAITING TO START…' : `WAITING FOR PLAYERS (${playerCount}/${SPYFAIR_MIN_PLAYERS})`}
          </p>
        )}

        {!proposal && onSwitchGame && <GameSwitcher currentType="spyfair" onSwitch={onSwitchGame} />}
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render: match over
  // -------------------------------------------------------------------------
  if (winners.length > 0 && game.status === 'finished' && phase === 'result') {
    const iWon = winners.some(w => w.playerId === mySeat)
    const winnerNames = winners.map(w => w.name || 'PLAYER')
    const headline = iWon
      ? 'YOU WIN!'
      : winners.length > 1
        ? `${winnerNames.join(' & ')} WIN`
        : `${winnerNames[0]} WINS`
    const ranked = [...seats].sort((a, b) => (scores[b.playerId] || 0) - (scores[a.playerId] || 0))
    return (
      <div className="space-y-5">
        <RoundEndPanel
          caption="MATCH OVER"
          headline={headline}
          sub={winners.length > 1 && (
            <p className="font-pixel text-[9px] text-retro-dim">SHARED VICTORY</p>
          )}
          scores={{
            title: 'SCORES',
            rows: ranked.map(p => ({
              id: p.playerId,
              name: p.name || 'PLAYER',
              score: scores[p.playerId] || 0,
              you: p.playerId === mySeat,
              marker: p.playerId === round.spy ? '🕵' : null,
              muted: p.online === false,
              win: winnerIds.includes(p.playerId),
            })),
          }}
          actions={!amSpectator ? [
            !proposal && onNewMatch && {
              key: 'new', label: 'NEW MATCH', busyLabel: 'STARTING…', onClick: onNewMatch,
            },
          ] : []}
          share={!amSpectator ? { gameLabel: 'SPYFAIR', headline, sub: 'Spyfair · Game Night' } : null}
        />
        {!proposal && onSwitchGame && <GameSwitcher currentType="spyfair" onSwitch={onSwitchGame} />}
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render: active round (reveal / questioning / vote / result)
  // -------------------------------------------------------------------------
  const secsLeft = round.timerEnds ? Math.max(0, Math.ceil((round.timerEnds - now) / 1000)) : 0

  return (
    <div className="space-y-4">
      {/* phase ticker */}
      <div className="flex items-center justify-center gap-2 font-pixel text-[8px] tracking-widest">
        {['reveal', 'questioning', 'vote', 'result'].map(p => (
          <span key={p} className={cn(p === phase ? 'text-retro-cta text-glow-cta' : 'text-retro-dim')}>
            {p === 'questioning' ? 'ASK' : p.toUpperCase()}
          </span>
        ))}
      </div>

      {/* REVEAL: each player privately peeks at their secret */}
      {phase === 'reveal' && (
        <div className="space-y-4">
          {amSpectator ? (
            <p className="text-center font-pixel text-[10px] text-retro-dim py-6">SPECTATING — SECRETS HIDDEN</p>
          ) : (
            <div className="bg-retro-card border-2 border-retro-border rounded p-5 text-center space-y-3 min-h-[140px] flex flex-col items-center justify-center">
              {!secretRevealed ? (
                <button
                  onClick={() => { setSecretRevealed(true); sounds.hit() }}
                  className="px-5 py-3 border-2 border-retro-p1 text-retro-p1 font-pixel text-[10px] rounded hover:shadow-neon-p1 hover:bg-retro-tint-p1 transition-all active:scale-95"
                >
                  TAP TO SEE YOUR SECRET
                </button>
              ) : amSpy ? (
                <>
                  <p className="font-pixel text-[9px] text-retro-p2 tracking-widest">YOU ARE THE</p>
                  <p className="font-pixel text-xl text-retro-p2 text-glow-p2">SPY</p>
                  <p className="font-mono text-[10px] text-retro-dim leading-relaxed">
                    You don&apos;t know the location. Blend in, deflect, and try to
                    figure out where everyone is — or just survive the vote.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-pixel text-[9px] text-retro-dim tracking-widest">LOCATION</p>
                  <p className="font-pixel text-lg text-retro-cta text-glow-cta">{myPrivate?.location}</p>
                  <p className="font-mono text-[11px] text-retro-p1 text-glow-p1">
                    Your role: {myPrivate?.role || '—'}
                  </p>
                  <p className="font-mono text-[9px] text-retro-dim">Don&apos;t say the location out loud!</p>
                </>
              )}
            </div>
          )}

          {amCoordinator ? (
            <div className="text-center">
              <button
                onClick={beginQuestioning}
                disabled={advancing}
                className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-40"
              >
                {advancing ? 'STARTING…' : 'START QUESTIONING'}
              </button>
            </div>
          ) : (
            <p className="text-center font-pixel text-[10px] text-retro-dim arcade-blink">
              WAITING TO START QUESTIONING…
            </p>
          )}
        </div>
      )}

      {/* QUESTIONING: countdown + your private reminder */}
      {phase === 'questioning' && (
        <div className="space-y-4">
          <div className="bg-retro-card border border-retro-border rounded p-5 text-center space-y-2">
            <p className="font-pixel text-[8px] text-retro-dim tracking-widest">QUESTIONING</p>
            {round.timerEnds ? (
              <p className={cn(
                'font-pixel text-2xl tracking-widest',
                secsLeft <= 30 ? 'text-retro-p2 text-glow-p2 arcade-blink' : 'text-retro-cta text-glow-cta',
              )}>
                {formatClockSecs(secsLeft)}
              </p>
            ) : (
              <p className="font-pixel text-sm tracking-widest text-retro-cta text-glow-cta">NO TIMER</p>
            )}
            <p className="font-mono text-[10px] text-retro-dim leading-relaxed">
              Ask each other questions out loud. Spot the spy.
              {noTimer && !round.timerEnds && ' Timers are off — the vote starts when it is called.'}
            </p>
          </div>

          {!amSpectator && (
            <div className="bg-retro-surface border border-retro-border/60 rounded p-3 text-center">
              {amSpy ? (
                <p className="font-pixel text-[9px] text-retro-p2 text-glow-p2">YOU ARE THE SPY — STAY HIDDEN</p>
              ) : (
                <p className="font-mono text-[10px] text-retro-dim">
                  <span className="text-retro-cta">{myPrivate?.location}</span> ·{' '}
                  <span className="text-retro-p1">{myPrivate?.role}</span>
                </p>
              )}
            </div>
          )}

          {amCoordinator && (
            <div className="text-center">
              <button
                onClick={callVote}
                disabled={advancing}
                className="px-5 py-2 border-2 border-retro-p2 text-retro-p2 font-pixel text-[10px] rounded hover:shadow-neon-p2 transition-all active:scale-95 disabled:opacity-40"
              >
                {advancing ? 'CALLING…' : 'CALL THE VOTE NOW'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* VOTE: pick who you think the spy is */}
      {phase === 'vote' && (
        <div className="space-y-3">
          <p className="text-center font-pixel text-[10px] text-retro-cta text-glow-cta">
            WHO IS THE SPY?
          </p>
          {amSpectator ? (
            <p className="text-center font-pixel text-[10px] text-retro-dim py-4">SPECTATING</p>
          ) : (
            <div className="space-y-2">
              {seats.map(p => {
                const isMe = p.playerId === mySeat
                const picked = myVote === p.playerId
                const hasVoted = !!votes[p.playerId]
                return (
                  <button
                    key={p.playerId}
                    onClick={() => castVote(p.playerId)}
                    disabled={!!myVote || isMe}
                    className={cn(
                      'w-full min-h-11 flex items-center justify-between px-4 py-2.5 rounded border-2 font-mono text-[11px] transition-all active:scale-[0.98]',
                      picked
                        ? 'border-retro-p2 text-retro-p2 shadow-neon-p2 bg-retro-tint-p2'
                        : 'border-retro-border text-retro-text hover:border-retro-p2/60',
                      (!!myVote || isMe) && !picked ? 'opacity-50' : '',
                    )}
                  >
                    <span>{p.name || 'PLAYER'}{isMe ? ' (YOU)' : ''}</span>
                    <span className={cn('font-pixel text-[8px]', hasVoted ? 'text-retro-win text-glow-win' : 'text-retro-dim')}>
                      {hasVoted ? 'VOTED' : '…'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          <p className="text-center font-pixel text-[9px] text-retro-dim">
            {votesCast}/{playerCount} VOTED
          </p>
          {/* Coordinator escape hatch: presence can flap, leaving the auto-resolve
              waiting on a seat that will never vote — tally the votes cast so far. */}
          {amCoordinator && votesCast > 0 && (
            <div className="text-center space-y-1.5">
              <button
                onClick={forceResolveVote}
                disabled={resolving}
                className="px-5 py-2 border-2 border-retro-p2 text-retro-p2 font-pixel text-[10px] rounded hover:shadow-neon-p2 transition-all active:scale-95 disabled:opacity-40"
              >
                {resolving ? 'RESOLVING…' : 'RESOLVE VOTE NOW'}
              </button>
              <p className="font-mono text-[9px] text-retro-dim">Tallies the votes cast so far</p>
            </div>
          )}
        </div>
      )}

      {/* RESULT */}
      {phase === 'result' && (
        <div className="space-y-4 text-center">
          {(() => {
            const spyPlayer = seats.find(p => p.playerId === round.spy)
            const accusedPlayer = seats.find(p => p.playerId === round.accused)
            const spyWon = round.spyWon
            return (
              <>
                <p className={cn(
                  'font-pixel text-base',
                  spyWon ? 'text-retro-p2 text-glow-p2' : 'text-retro-win text-glow-win',
                )}>
                  {spyWon ? 'SPY ESCAPES!' : 'SPY CAUGHT!'}
                </p>
                <div className="bg-retro-card border border-retro-border rounded p-4 space-y-2">
                  <p className="font-mono text-[11px] text-retro-dim">
                    The spy was <span className="text-retro-p2 text-glow-p2">{spyPlayer?.name || '???'}</span>
                  </p>
                  <p className="font-mono text-[11px] text-retro-dim">
                    The location was <span className="text-retro-cta text-glow-cta">{revealedLocation?.name || '???'}</span>
                    {locVerify === false && (
                      <span className="text-retro-p2 font-pixel text-[8px]"> ⚠ UNVERIFIED</span>
                    )}
                  </p>
                  {accusedPlayer && (
                    <p className="font-mono text-[10px] text-retro-dim">
                      Most accused: {accusedPlayer.name || '???'}
                    </p>
                  )}
                  {amSpy && (
                    <p className="font-pixel text-[9px] text-retro-p2">
                      {spyWon ? 'YOU GOT AWAY WITH IT' : 'YOU WERE EXPOSED'}
                    </p>
                  )}
                </div>

                <ScoreBoard seats={seats} scores={scores} mySeat={mySeat} spyId={round.spy} />

                {amCoordinator && !proposal && (
                  <button
                    onClick={nextRound}
                    disabled={dealing}
                    className="px-6 py-2.5 font-pixel text-[10px] border-2 border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 hover:bg-retro-tint-p1 transition-all active:scale-95 disabled:opacity-40"
                  >
                    {dealing ? 'DEALING…' : 'NEXT ROUND'}
                  </button>
                )}
                {!amCoordinator && !proposal && (
                  <p className="font-pixel text-[10px] text-retro-dim arcade-blink">WAITING…</p>
                )}
              </>
            )
          })()}

          {!proposal && onSwitchGame && <GameSwitcher currentType="spyfair" onSwitch={onSwitchGame} />}
        </div>
      )}
    </div>
  )
}

function ScoreBoard({ seats, scores, mySeat, spyId }) {
  const sorted = [...seats].sort((a, b) => (scores?.[b.playerId] || 0) - (scores?.[a.playerId] || 0))
  return (
    <div className="bg-retro-surface border border-retro-border/60 rounded p-3 space-y-1">
      <p className="font-pixel text-[8px] text-retro-dim tracking-widest">SCORES</p>
      {sorted.map(p => (
        <div key={p.playerId} className="flex items-center justify-between font-mono text-[11px]">
          <span className={cn(p.playerId === mySeat ? 'text-retro-p1 text-glow-p1' : 'text-retro-text')}>
            {p.name || 'PLAYER'}{p.playerId === mySeat ? ' (YOU)' : ''}
            {p.playerId === spyId ? ' 🕵' : ''}
          </span>
          <span className="font-pixel text-[10px] text-retro-cta">{scores?.[p.playerId] || 0}</span>
        </div>
      ))}
    </div>
  )
}
