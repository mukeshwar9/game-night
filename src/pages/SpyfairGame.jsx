import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import { commit, verifyReveal } from '../lib/commit'
import { isCoordinator } from '../lib/coordinator'
import GameSwitcher from '../components/GameSwitcher'
import { sounds } from '../lib/sounds'
import { shareResult } from '../lib/shareCard'
import { SPYFAIR_LOCATIONS } from '../lib/decks/spyfair'
import {
  pickSpyFromRotation,
  recordSpy,
  pickFreshLocation,
  pushRecentLocation,
  normalizeIdList,
} from '../lib/partyBots'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'
import { toast } from 'sonner'

const QUESTION_SECONDS = 240 // 4 minutes of out-of-band questioning
const MATCH_WINS = 3

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

// Host-only sessionStorage: the committed location's { locationIndex, salt, commitment }
// for the round this client dealt, so it can be revealed + verified at the result
// phase. Only trusted when it verifies against the live round's commitment (a
// client that dealt an earlier round may resolve a later one after a handover).
const locKey = (gameId) => `spyfair-loc-${gameId}`

// Room-level round-to-round memory, `games/$id/spyfairRotation`:
//   { spied: [playerId…], recent: [locationIndex…] }
// `spied` is the rotation bag (who has been spy this cycle — everyone is spy once
// before anyone repeats) and `recent` the last few locations (not dealt again for
// SPYFAIR_RECENT_LOCATIONS rounds). Deliberately OUTSIDE `round` so it survives
// NEW MATCH, and only updated at the RESULT phase, when the spy and location are
// public anyway — writing it at deal time would expose both.
function readRotation(raw) {
  return { spied: normalizeIdList(raw?.spied), recent: normalizeIdList(raw?.recent).map(Number) }
}

// Recover the spy's playerId from the per-player private map (role === 'SPY').
// Used at result time so we never need a top-level `spy` field during the round.
function findSpy(privates) {
  for (const [pid, v] of Object.entries(privates || {})) {
    if (v && v.role === 'SPY') return pid
  }
  return null
}

// Deal a fresh round: pick the spy from the rotation bag + a location not used in the
// last few rounds, hand out private roles, and COMMIT the location. Stores the reveal
// secret in the dealer's sessionStorage. Returns the round object to write to
// Firebase — note it contains NO plaintext spy/locationIndex.
async function dealRound(gameId, order, rotationRaw) {
  const rotation = readRotation(rotationRaw)
  const lastSpy = rotation.spied[rotation.spied.length - 1] ?? null
  const { spyId } = pickSpyFromRotation(order.map(p => p.playerId), rotation.spied, lastSpy)
  const spy = order.find(p => p.playerId === spyId) || order[0]
  const locationIndex = pickFreshLocation(rotation.recent)
  const loc = SPYFAIR_LOCATIONS[locationIndex]
  const roleBag = [...loc.roles].sort(() => Math.random() - 0.5)
  const privates = {}
  let r = 0
  for (const p of order) {
    if (p.playerId === spy.playerId) privates[p.playerId] = { role: 'SPY', location: '' }
    else { privates[p.playerId] = { role: roleBag[r % roleBag.length] || 'Local', location: loc.name }; r++ }
  }
  const { hash, salt } = await commit(String(locationIndex))
  try { sessionStorage.setItem(locKey(gameId), JSON.stringify({ locationIndex, salt, commitment: hash })) } catch { /* ignore */ }
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
    spyGuess: null,   // the spy's one location guess (index), questioning or vote phase
    outcome: null,    // result: 'caught' | 'escaped' | 'guessed' | 'wrongGuess'
    private: privates,
  }
}

// Seat order is stable: sort players by joinedAt, then playerId as tiebreak.
function seatOrder(players) {
  return Object.values(players || {})
    .filter(Boolean)
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0) || String(a.playerId).localeCompare(String(b.playerId)))
}

function normalizeVotes(raw) {
  if (!raw || typeof raw !== 'object') return {}
  return raw
}

// Tally votes -> the accused playerId with the most votes (null if tie / none).
function tallyVotes(votes) {
  const counts = {}
  for (const accused of Object.values(votes)) {
    if (!accused) continue
    counts[accused] = (counts[accused] || 0) + 1
  }
  let top = null
  let topCount = 0
  let tied = false
  for (const [pid, n] of Object.entries(counts)) {
    if (n > topCount) { top = pid; topCount = n; tied = false }
    else if (n === topCount) { tied = true }
  }
  return { top, topCount, tied }
}

function fmtClock(secs) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
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
  const enoughPlayers = playerCount >= 3
  // Deterministic host-fallback: the coordinator is the lowest-uid ONLINE seat, not
  // the fixed `isHost` — so a host disconnect hands transitions off instead of
  // freezing the match. Every write below that used to be `isHost`-gated is now
  // gated on this, and each write itself re-checks phase inside a transaction so a
  // handover mid-transition stays single-writer/idempotent.
  const amCoordinator = !!mySeat && !!players?.[mySeat] && isCoordinator(mySeat, seatIds, players)

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
  // the host's manual RESOLVE VOTE NOW button covers that case deliberately.
  const onlineSeats = seats.filter(p => p.online !== false)
  const allOnlineVoted = onlineSeats.length > 0 &&
    onlineSeats.every(p => votes[p.playerId]) &&
    votesCast >= 2

  const scores = game.scores || {}
  // Co-winners: everyone who has crossed MATCH_WINS, not just the earliest joiner —
  // a round that pushes two players over the line at once is a shared victory.
  const winners = seats.filter(p => (scores[p.playerId] || 0) >= MATCH_WINS)

  const [secretRevealed, setSecretRevealed] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [showLocations, setShowLocations] = useState(false)
  const [guessPick, setGuessPick] = useState(null)  // spy's selected location index
  const [guessing, runGuess] = useBusy()
  const [locVerify, setLocVerify] = useState(null) // result-phase: true/false/null(unknown)
  const [sharing, runShare] = useBusy()

  const prevPhase = useRef(phase)
  const resolvedRef = useRef(null)

  // --- Live clock for the questioning countdown ---
  useEffect(() => {
    if (phase !== 'questioning') return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [phase])

  // Reset the peek-to-reveal flap (and the spy's pending guess pick) whenever a
  // new round begins.
  useEffect(() => {
    if (phase === 'reveal' && prevPhase.current !== 'reveal') {
      setSecretRevealed(false)
      setGuessPick(null)
    }
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
    if (phase !== 'vote' && phase !== 'questioning') resolvedRef.current = null
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
  // Coordinator actions — gated on `amCoordinator` (the lowest-uid ONLINE seat),
  // not the fixed `isHost`, so a host disconnect hands these off instead of
  // freezing the match. See the `amCoordinator` comment above for the invariant.
  // -------------------------------------------------------------------------
  async function startRound() {
    if (!amCoordinator || !enoughPlayers || busy) return
    setBusy(true)
    try {
      const round = await dealRound(gameId, seatOrder(players), game.spyfairRotation)
      await update(ref(db, `games/${gameId}`), {
        status: 'playing',
        winner: null,
        round,
        proposal: null,
      })
      onStart?.()
    } catch {
      toast.error('START FAILED — CHECK CONNECTION')
    } finally {
      setBusy(false)
    }
  }

  async function beginQuestioning() {
    if (!amCoordinator) return
    await runTransaction(ref(db, `games/${gameId}/round`), current => {
      if (!current || current.phase !== 'reveal') return current
      return { ...current, phase: 'questioning', timerEnds: Date.now() + QUESTION_SECONDS * 1000 }
    }).catch(() => {})
  }

  async function callVote() {
    if (!amCoordinator) return
    await runTransaction(ref(db, `games/${gameId}/round`), current => {
      if (!current || current.phase !== 'questioning') return current
      return { ...current, phase: 'vote' }
    }).catch(() => {})
  }

  // Resolve the round — by the spy's location guess if they made one, otherwise by
  // the vote. One transaction on the room, so a guess landing mid-tally can't race
  // the vote into a double resolve.
  //   * Spy guess: right → the spy wins the round; wrong → every non-spy scores.
  //   * Vote: plurality — the player with the MOST votes is accused; a tie for most
  //     votes accuses nobody. Caught (accused === spy) → every non-spy scores;
  //     otherwise the spy scores.
  async function resolveRound() {
    try {
      // Reveal the committed location now (result phase). Prefer this client's stored
      // secret — but only if it really belongs to the live round (it verifies against
      // the commitment). Otherwise fall back to recovering the index from a non-spy
      // private entry (verification is then skipped on the result screen).
      let secret = null
      try { secret = JSON.parse(sessionStorage.getItem(locKey(gameId)) || 'null') } catch { /* ignore */ }
      const commitment = round.locationCommitment ?? null
      if (secret && (commitment == null || secret.salt == null ||
          !(await verifyReveal(commitment, String(secret.locationIndex), secret.salt)))) {
        secret = null
      }

      await runTransaction(ref(db, `games/${gameId}`), current => {
        const r = current?.round
        if (!r) return
        const byGuess = r.spyGuess != null
        if (!(r.phase === 'vote' || (r.phase === 'questioning' && byGuess))) return // already resolved
        const seatList = seatOrder(current.players || {})
        // Spy identity is not a top-level field during the round — recover it from the
        // private map (the role === 'SPY' entry) and only now publish it at result.
        const spyId = findSpy(r.private)

        const trusted = secret && (r.locationCommitment ?? null) === commitment
        let locationIndex = trusted ? secret.locationIndex : null
        if (locationIndex == null) {
          const someLoc = Object.values(r.private || {}).map(x => x?.location).find(Boolean)
          const idx = SPYFAIR_LOCATIONS.findIndex(l => l.name === someLoc)
          locationIndex = idx >= 0 ? idx : null
        }

        let spyWon
        let outcome
        let accused = null
        if (byGuess) {
          spyWon = locationIndex != null && Number(r.spyGuess) === locationIndex
          outcome = spyWon ? 'guessed' : 'wrongGuess'
        } else {
          const { top, tied } = tallyVotes(normalizeVotes(r.votes))
          accused = tied ? null : top
          const spyCaught = !tied && top === spyId
          spyWon = !spyCaught
          outcome = spyCaught ? 'caught' : 'escaped'
        }

        const scores = { ...(current.scores || {}) }
        if (spyWon) {
          if (spyId) scores[spyId] = (scores[spyId] || 0) + 1
        } else {
          // Every non-spy player earns a point for the catch (or the spy's miss).
          for (const p of seatList) {
            if (p.playerId === spyId) continue
            scores[p.playerId] = (scores[p.playerId] || 0) + 1
          }
        }
        const someoneWonMatch = Object.values(scores).some(n => n >= MATCH_WINS)

        // The spy and location are public from here on — safe to roll the rotation.
        const rotation = readRotation(current.spyfairRotation)
        const nextRotation = {
          spied: recordSpy(rotation.spied, seatList.map(p => p.playerId), spyId),
          recent: locationIndex == null ? rotation.recent : pushRecentLocation(rotation.recent, locationIndex),
        }

        return {
          ...current,
          scores,
          spyfairRotation: nextRotation,
          ...(someoneWonMatch ? { status: 'finished' } : {}),
          round: {
            ...r,
            phase: 'result',
            spyWon,
            outcome,
            accused,
            spy: spyId,
            locationIndex,
            locationSalt: trusted ? secret.salt : null,
          },
        }
      })
    } catch {
      toast.error('RESOLVE FAILED — CHECK CONNECTION')
    }
  }

  // Manual fallback for the coordinator: tally whatever votes are in RIGHT NOW. Covers
  // flapping presence (a gone player still reading online:true) where the auto-resolve
  // never fires. Idempotent vs the auto path: the resolvedRef check-and-set is
  // synchronous (no await before it), and resolveRound itself re-reads the round and
  // bails unless phase is still 'vote' — same guards the auto-resolve effect relies on.
  async function forceResolveVote() {
    if (!amCoordinator || phase !== 'vote' || votesCast === 0) return
    if (resolvedRef.current === 'vote') return
    resolvedRef.current = 'vote'
    await resolveRound()
  }

  async function nextRound() {
    if (!amCoordinator || busy) return
    setBusy(true)
    try {
      const round = await dealRound(gameId, seatOrder(players), game.spyfairRotation)
      await update(ref(db, `games/${gameId}`), { round, proposal: null })
    } catch {
      toast.error('DEAL FAILED — CHECK CONNECTION')
    } finally {
      setBusy(false)
    }
  }

  // -------------------------------------------------------------------------
  // Player actions
  // -------------------------------------------------------------------------
  async function castVote(accusedId) {
    if (amSpectator || phase !== 'vote' || myVote) return
    sounds.move(amSpy ? 'O' : 'X')
    await update(ref(db, `games/${gameId}/round/votes`), { [mySeat]: accusedId }).catch(() => {})
  }

  // --- Spy: one location guess, during questioning or the vote. Written with a
  // transaction that re-checks the phase, that no guess exists yet, and that the
  // writer really is the spy; the coordinator then resolves the round. ---
  const canGuess = amSpy && (phase === 'questioning' || phase === 'vote') && round.spyGuess == null
  const handleSpyGuess = () => runGuess(async () => {
    if (!canGuess || guessPick == null) return
    const index = guessPick
    const { committed } = await runTransaction(ref(db, `games/${gameId}/round`), current => {
      if (!current || (current.phase !== 'questioning' && current.phase !== 'vote')) return
      if (current.spyGuess != null) return
      if (current.private?.[mySeat]?.role !== 'SPY') return
      return { ...current, spyGuess: index }
    })
    if (!committed) toast.error('TOO LATE — THE ROUND HAS MOVED ON')
    else sounds.move('O')
  }, () => toast.error('GUESS FAILED — CHECK CONNECTION'))

  // --- Coordinator: the spy guessed — resolve the round right away. ---
  useEffect(() => {
    if (!amCoordinator || round.spyGuess == null) return
    if (phase !== 'questioning' && phase !== 'vote') return
    if (resolvedRef.current === 'guess') return
    resolvedRef.current = 'guess'
    resolveRound()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amCoordinator, phase, round.spyGuess])

  // --- Coordinator: once every ONLINE player has voted (min 2 votes), resolve. ---
  // Also fires when the last non-voter drops offline mid-vote, un-sticking the round.
  useEffect(() => {
    if (!amCoordinator || phase !== 'vote' || !allOnlineVoted) return
    if (resolvedRef.current === 'vote') return
    resolvedRef.current = 'vote'
    resolveRound()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amCoordinator, phase, allOnlineVoted])

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
            Ask questions and vote out the spy — the spy wins by blending in,
            or by naming the location.
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
                disabled={busy}
                className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-40"
              >
                START ROUND
              </button>
            ) : (
              <p className="font-pixel text-[10px] text-retro-dim arcade-blink">
                NEED {3 - playerCount} MORE PLAYER{3 - playerCount === 1 ? '' : 'S'}
              </p>
            )}
          </div>
        ) : (
          <p className="text-center font-pixel text-[10px] text-retro-dim arcade-blink">
            {enoughPlayers ? 'WAITING TO START…' : `WAITING FOR PLAYERS (${playerCount}/3)`}
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
    return (
      <div className="space-y-5 text-center">
        <p className="font-pixel text-[10px] text-retro-dim tracking-widest">MATCH OVER</p>
        <p className={cn('font-pixel text-base', iWon ? 'text-retro-cta text-glow-cta' : 'text-retro-dim')}>
          {headline}
        </p>
        {winners.length > 1 && (
          <p className="font-pixel text-[9px] text-retro-dim">SHARED VICTORY</p>
        )}
        <ScoreBoard seats={seats} scores={scores} mySeat={mySeat} spyId={round.spy} />
        {!amSpectator && (
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
                  gameLabel: 'SPYFAIR',
                  headline,
                  sub: 'Spyfair · Game Night',
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
          <span key={p} className={cn(p === phase ? 'text-retro-cta text-glow-cta' : 'text-retro-dim/50')}>
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
                    You don&apos;t know the location. Blend in and survive the vote —
                    or work it out and guess it from the location list. One guess:
                    right wins you the round, wrong loses it.
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
                className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta transition-all active:scale-95"
              >
                START QUESTIONING
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
            <p className={cn(
              'font-pixel text-2xl tracking-widest',
              secsLeft <= 30 ? 'text-retro-p2 text-glow-p2 arcade-blink' : 'text-retro-cta text-glow-cta',
            )}>
              {fmtClock(secsLeft)}
            </p>
            <p className="font-mono text-[10px] text-retro-dim leading-relaxed">
              Ask each other questions — out loud or in the chat. Spot the spy.
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
                className="px-5 py-2 border-2 border-retro-p2 text-retro-p2 font-pixel text-[10px] rounded hover:shadow-neon-p2 transition-all active:scale-95"
              >
                CALL THE VOTE NOW
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
          <p className="text-center font-mono text-[10px] text-retro-dim">
            Most votes is accused. A tie for most votes lets the spy escape.
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
                className="px-5 py-2 border-2 border-retro-p2 text-retro-p2 font-pixel text-[10px] rounded hover:shadow-neon-p2 transition-all active:scale-95"
              >
                RESOLVE VOTE NOW
              </button>
              <p className="font-mono text-[9px] text-retro-dim">Tallies the votes cast so far</p>
            </div>
          )}
        </div>
      )}

      {/* LOCATION LIST: everyone's reference; the spy's one guess lives here too */}
      {(phase === 'reveal' || phase === 'questioning' || phase === 'vote') && (
        <div className="bg-retro-surface border border-retro-border/60 rounded p-3 space-y-2">
          <button
            onClick={() => setShowLocations(v => !v)}
            aria-expanded={showLocations}
            className="w-full min-h-11 font-pixel text-[9px] text-retro-dim hover:text-retro-text tracking-widest transition-colors"
          >
            {showLocations ? '▾ HIDE LOCATIONS' : `▸ ALL ${SPYFAIR_LOCATIONS.length} LOCATIONS`}
            {canGuess && !showLocations ? ' · GUESS' : ''}
          </button>
          {showLocations && (
            <>
              {canGuess ? (
                <p className="font-mono text-[10px] text-retro-p2 text-center leading-relaxed">
                  Spy: pick a location and lock it in. One guess — right wins
                  the round, wrong loses it.
                </p>
              ) : amSpy && round.spyGuess != null ? (
                <p className="font-pixel text-[9px] text-retro-p2 text-center">GUESS LOCKED — RESOLVING…</p>
              ) : null}
              <ul className="grid grid-cols-2 gap-1.5" aria-label="Possible locations">
                {SPYFAIR_LOCATIONS.map((loc, i) => (
                  <li key={loc.name}>
                    {canGuess ? (
                      <button
                        onClick={() => setGuessPick(i)}
                        aria-pressed={guessPick === i}
                        className={cn(
                          'w-full min-h-9 px-2 py-1.5 rounded border font-mono text-[9px] transition-all active:scale-95',
                          guessPick === i
                            ? 'border-retro-p2 text-retro-p2 bg-retro-tint-p2'
                            : 'border-retro-border text-retro-text hover:border-retro-p2/60',
                        )}
                      >
                        {loc.name}
                      </button>
                    ) : (
                      <span className="block px-2 py-1.5 rounded border border-retro-border/40 font-mono text-[9px] text-retro-dim">
                        {loc.name}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {canGuess && guessPick != null && (
                <button
                  onClick={handleSpyGuess}
                  disabled={guessing}
                  className="w-full min-h-11 px-4 py-2 border-2 border-retro-p2 text-retro-p2 font-pixel text-[10px] rounded hover:shadow-neon-p2 transition-all active:scale-95 disabled:opacity-40"
                >
                  {guessing ? 'GUESSING…' : `LOCK GUESS: ${SPYFAIR_LOCATIONS[guessPick]?.name}`}
                </button>
              )}
            </>
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
            const guessedName = round.spyGuess != null ? SPYFAIR_LOCATIONS[round.spyGuess]?.name : null
            const headline = round.outcome === 'guessed' ? 'SPY NAMED THE LOCATION!'
              : round.outcome === 'wrongGuess' ? 'SPY GUESSED WRONG!'
                : spyWon ? 'SPY ESCAPES!' : 'SPY CAUGHT!'
            return (
              <>
                <p className={cn(
                  'font-pixel text-base',
                  spyWon ? 'text-retro-p2 text-glow-p2' : 'text-retro-win text-glow-win',
                )}>
                  {headline}
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
                  {guessedName && (
                    <p className="font-mono text-[10px] text-retro-dim">
                      The spy guessed: {guessedName}
                    </p>
                  )}
                  {accusedPlayer && (
                    <p className="font-mono text-[10px] text-retro-dim">
                      Most votes: {accusedPlayer.name || '???'}
                    </p>
                  )}
                  {round.outcome === 'escaped' && !accusedPlayer && (
                    <p className="font-mono text-[10px] text-retro-dim">
                      Tie for most votes — nobody accused
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
                    disabled={busy}
                    className="px-6 py-2.5 font-pixel text-[10px] border-2 border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 hover:bg-retro-tint-p1 transition-all active:scale-95 disabled:opacity-40"
                  >
                    NEXT ROUND
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
