import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, update, get } from 'firebase/database'
import { db } from '../lib/firebase'
import { commit, verifyReveal } from '../lib/commit'
import GameSwitcher from '../components/GameSwitcher'
import { sounds } from '../lib/sounds'
import { shareResult } from '../lib/shareCard'
import { SPYFAIR_LOCATIONS } from '../lib/decks/spyfair'
import { cn } from '@/lib/utils'

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

// Host-only sessionStorage: the committed location's { locationIndex, salt } for the
// current round, so it can be revealed + verified at the result phase.
const locKey = (gameId) => `spyfair-loc-${gameId}`

// Recover the spy's playerId from the per-player private map (role === 'SPY').
// Used at result time so we never need a top-level `spy` field during the round.
function findSpy(privates) {
  for (const [pid, v] of Object.entries(privates || {})) {
    if (v && v.role === 'SPY') return pid
  }
  return null
}

// Deal a fresh round: pick the spy + location, hand out private roles, and COMMIT the
// location. Stores the reveal secret in the host's sessionStorage. Returns the round
// object to write to Firebase — note it contains NO plaintext spy/locationIndex.
async function dealRound(gameId, order) {
  const spy = order[Math.floor(Math.random() * order.length)]
  const locationIndex = Math.floor(Math.random() * SPYFAIR_LOCATIONS.length)
  const loc = SPYFAIR_LOCATIONS[locationIndex]
  const roleBag = [...loc.roles].sort(() => Math.random() - 0.5)
  const privates = {}
  let r = 0
  for (const p of order) {
    if (p.playerId === spy.playerId) privates[p.playerId] = { role: 'SPY', location: '' }
    else { privates[p.playerId] = { role: roleBag[r % roleBag.length] || 'Local', location: loc.name }; r++ }
  }
  const { hash, salt } = await commit(String(locationIndex))
  try { sessionStorage.setItem(locKey(gameId), JSON.stringify({ locationIndex, salt })) } catch { /* ignore */ }
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
  gameId, game, mySeat, players, isHost,
  onStart, onSwitchGame, onNewMatch, proposal,
}) {
  const round = game.round || {}
  const phase = round.phase || null
  const seats = useMemo(() => seatOrder(players), [players])
  const playerCount = seats.length
  const enoughPlayers = playerCount >= 3

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
  const matchWinner = seats.find(p => (scores[p.playerId] || 0) >= MATCH_WINS) || null

  const [secretRevealed, setSecretRevealed] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [locVerify, setLocVerify] = useState(null) // result-phase: true/false/null(unknown)

  const prevPhase = useRef(phase)
  const resolvedRef = useRef(null)

  // --- Live clock for the questioning countdown ---
  useEffect(() => {
    if (phase !== 'questioning') return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [phase])

  // Reset the peek-to-reveal flap whenever a new round begins.
  useEffect(() => {
    if (phase === 'reveal' && prevPhase.current !== 'reveal') setSecretRevealed(false)
  }, [phase])

  // --- Host: when the questioning timer expires, advance to the vote phase. ---
  useEffect(() => {
    if (!isHost || phase !== 'questioning' || !round.timerEnds) return
    if (now < round.timerEnds) return
    update(ref(db, `games/${gameId}/round`), { phase: 'vote' }).catch(() => {})
  }, [isHost, phase, round.timerEnds, now, gameId])

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
  // Host actions
  // -------------------------------------------------------------------------
  async function startRound() {
    if (!isHost || !enoughPlayers || busy) return
    setBusy(true)
    try {
      const round = await dealRound(gameId, seatOrder(players))
      await update(ref(db, `games/${gameId}`), {
        status: 'playing',
        winner: null,
        round,
        proposal: null,
      })
      onStart?.()
    } catch { /* ignore */ } finally {
      setBusy(false)
    }
  }

  async function beginQuestioning() {
    if (!isHost) return
    await update(ref(db, `games/${gameId}/round`), {
      phase: 'questioning',
      timerEnds: Date.now() + QUESTION_SECONDS * 1000,
    }).catch(() => {})
  }

  async function callVote() {
    if (!isHost) return
    await update(ref(db, `games/${gameId}/round`), { phase: 'vote' }).catch(() => {})
  }

  async function resolveRound() {
    try {
      const snap = await get(ref(db, `games/${gameId}/round`))
      const r = snap.val() || {}
      if (r.phase !== 'vote') return // already resolved by someone else
      const v = normalizeVotes(r.votes)
      const { top, tied } = tallyVotes(v)
      // Spy identity is not a top-level field during the round — recover it from the
      // private map (the role === 'SPY' entry) and only now publish it at result.
      const spyId = findSpy(r.private)
      // Spy is caught only if the group lands a clear majority on the spy.
      const spyCaught = !tied && top === spyId
      const spyWon = !spyCaught

      const liveScores = { ...(game.scores || {}) }
      if (spyWon) {
        if (spyId) liveScores[spyId] = (liveScores[spyId] || 0) + 1
      } else {
        // Every non-spy player earns a point for the catch.
        for (const p of seatOrder(players)) {
          if (p.playerId === spyId) continue
          liveScores[p.playerId] = (liveScores[p.playerId] || 0) + 1
        }
      }

      const someoneWonMatch = Object.values(liveScores).some(s => s >= MATCH_WINS)

      // Reveal the committed location now (result phase). Prefer the host's stored
      // secret so it can be verified against the commitment; if the host lost it (e.g.
      // reload), fall back to recovering the index from a non-spy private entry so the
      // result screen still shows the correct location (verification is then skipped).
      let secret = null
      try { secret = JSON.parse(sessionStorage.getItem(locKey(gameId)) || 'null') } catch { /* ignore */ }
      let locationIndex = secret?.locationIndex
      const locationSalt = secret?.salt ?? null
      if (locationIndex == null) {
        const someLoc = Object.values(r.private || {}).map(x => x?.location).find(Boolean)
        const idx = SPYFAIR_LOCATIONS.findIndex(l => l.name === someLoc)
        locationIndex = idx >= 0 ? idx : null
      }

      await update(ref(db, `games/${gameId}`), {
        'round/phase': 'result',
        'round/spyWon': spyWon,
        'round/accused': top || null,
        'round/spy': spyId,
        'round/locationIndex': locationIndex,
        'round/locationSalt': locationSalt,
        scores: liveScores,
        ...(someoneWonMatch ? { status: 'finished' } : {}),
      })
    } catch { /* ignore */ }
  }

  // Manual fallback for the host: tally whatever votes are in RIGHT NOW. Covers flapping
  // presence (a gone player still reading online:true) where the auto-resolve never fires.
  // Idempotent vs the auto path: the resolvedRef check-and-set is synchronous (no await
  // before it), and resolveRound itself re-reads the round and bails unless phase is
  // still 'vote' — same guards the auto-resolve effect relies on.
  async function forceResolveVote() {
    if (!isHost || phase !== 'vote' || votesCast === 0) return
    if (resolvedRef.current === 'vote') return
    resolvedRef.current = 'vote'
    await resolveRound()
  }

  async function nextRound() {
    if (!isHost || busy) return
    setBusy(true)
    try {
      const round = await dealRound(gameId, seatOrder(players))
      await update(ref(db, `games/${gameId}`), { round, proposal: null })
    } catch { /* ignore */ } finally {
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

  // --- Host: once every ONLINE player has voted (min 2 votes), resolve the round. ---
  // Also fires when the last non-voter drops offline mid-vote, un-sticking the round.
  useEffect(() => {
    if (!isHost || phase !== 'vote' || !allOnlineVoted) return
    if (resolvedRef.current === 'vote') return
    resolvedRef.current = 'vote'
    resolveRound()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, phase, allOnlineVoted])

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

        {isHost ? (
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
              <p className="font-pixel text-[10px] text-retro-dim animate-pulse">
                NEED {3 - playerCount} MORE PLAYER{3 - playerCount === 1 ? '' : 'S'}
              </p>
            )}
          </div>
        ) : (
          <p className="text-center font-pixel text-[10px] text-retro-dim animate-pulse">
            {enoughPlayers ? 'WAITING FOR HOST TO START…' : `WAITING FOR PLAYERS (${playerCount}/3)`}
          </p>
        )}

        {!proposal && onSwitchGame && <GameSwitcher currentType="spyfair" onSwitch={onSwitchGame} />}
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render: match over
  // -------------------------------------------------------------------------
  if (matchWinner && game.status === 'finished' && phase === 'result') {
    const iWon = matchWinner.playerId === mySeat
    return (
      <div className="space-y-5 text-center">
        <p className="font-pixel text-[10px] text-retro-dim tracking-widest">MATCH OVER</p>
        <p className={cn('font-pixel text-base', iWon ? 'text-retro-cta text-glow-cta' : 'text-retro-dim')}>
          {iWon ? 'YOU WIN!' : `${matchWinner.name || 'PLAYER'} WINS`}
        </p>
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
              onClick={() => shareResult({
                gameLabel: 'SPYFAIR',
                headline: iWon ? 'YOU WIN!' : `${matchWinner.name || 'PLAYER'} WINS`,
                sub: 'Spyfair · Game Night',
                accentVar: '--c-cta',
                url: window.location.href,
              })}
              className="px-6 py-2.5 font-pixel text-xs border-2 border-retro-border text-retro-dim rounded hover:border-retro-cta hover:text-retro-cta transition-all active:scale-95"
            >
              SHARE
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

          {isHost ? (
            <div className="text-center">
              <button
                onClick={beginQuestioning}
                className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta transition-all active:scale-95"
              >
                START QUESTIONING
              </button>
            </div>
          ) : (
            <p className="text-center font-pixel text-[10px] text-retro-dim animate-pulse">
              WAITING FOR HOST TO START QUESTIONING…
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
              secsLeft <= 30 ? 'text-retro-p2 text-glow-p2 animate-pulse' : 'text-retro-cta text-glow-cta',
            )}>
              {fmtClock(secsLeft)}
            </p>
            <p className="font-mono text-[10px] text-retro-dim leading-relaxed">
              Ask each other questions out loud. Spot the spy.
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

          {isHost && (
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
                      'w-full flex items-center justify-between px-4 py-2.5 rounded border-2 font-mono text-[11px] transition-all active:scale-[0.98]',
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
          {/* Host escape hatch: presence can flap, leaving the auto-resolve waiting on a
              seat that will never vote — let the host tally the votes cast so far. */}
          {isHost && votesCast > 0 && (
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

                {isHost && !proposal && (
                  <button
                    onClick={nextRound}
                    disabled={busy}
                    className="px-6 py-2.5 font-pixel text-[10px] border-2 border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 hover:bg-retro-tint-p1 transition-all active:scale-95 disabled:opacity-40"
                  >
                    NEXT ROUND
                  </button>
                )}
                {!isHost && !proposal && (
                  <p className="font-pixel text-[10px] text-retro-dim animate-pulse">WAITING FOR HOST…</p>
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
