import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, runTransaction, set } from 'firebase/database'
import { db } from '../lib/firebase'
import { seal, openWithPrivate, openWithKey, staleRecipients } from '../lib/sealed'
import useSealKey from '../hooks/useSealKey'
import { isRoomCoordinator } from '../lib/coordinator'
import {
  seatOrder, normalizeVotes, tallyVotes, resolveVote, scoreRound, matchWinners, allOnlineVoted,
  pickLocationIndex, assignRoles, spyfairPayload, parseSpyfairPayload, readSpyfairDeal, legacyOpened,
  sealAad, pickSpy, recordSpy, normalizeSpyGuess, resolveSpyGuess,
  SPYFAIR_MIN_PLAYERS, SPYFAIR_QUESTION_SECONDS, SPYFAIR_SEEN_KEY,
} from '../lib/spyfairLogic'
import { normalizeList } from '../lib/normalize'
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

// Rules (dealing, tally, scoring, match winner, sealed payloads) live in
// src/lib/spyfairLogic.js, shared with SpyfairDemo.jsx so the demo can't drift
// from the live room.

// -----------------------------------------------------------------------------
// HIDDEN-ROLE MODEL — read before touching the round shape.
//
// Every field under `games/$id` is world-readable, so neither the spy's
// identity nor the location is ever written in plaintext during a round. The
// dealer (the coordinator who taps START / NEXT ROUND) seals one entry per
// participant to that player's published key (src/lib/sealed.js, keys at
// `games/$id/sealKeys/{uid}` via useSealKey): 'SPY' for the spy,
// 'LOC:<index>|<role>' for everyone else, padded to one length so ciphertext
// size gives nothing away. A client can open only its own entry; spectators
// and players who sat the round out can open none.
//
// Round flow: reveal (peek) → questioning → vote → tally → result. At TALLY
// the votes are locked and every participant publishes its entry's AES key
// (`round.openKeys/{uid}`; the dealer publishes all of them too, so the
// reveal works if a player has dropped). Every client then opens and verifies
// the entries (AES-GCM rejects a forged key or plaintext); the coordinator
// scores from what they say and writes `spy` / `locationIndex` at RESULT.
// Contradicting entries (a dealer who sealed two spies or two locations) are
// flagged UNVERIFIED on the result screen.
//
// SPY GUESS: once, during questioning or the vote, the spy may name the
// location. The guess writes `round.spyGuess: { by, index }` and publishes the
// spy's OWN reveal key in the same transaction, then jumps straight to TALLY —
// declaring yourself to guess is what the rules announce, and the published
// key lets every client prove `by` really opened a SPY card. A guess from
// anyone else (a tampered client) voids the round at scoring.
//
// SPY ROTATION: `games/$id/spyfairRotation: { spied, last }` (room-level, kept
// across NEW MATCH) is written only at RESULT, when that round's spy is public
// anyway. The pick is weighted rather than a strict bag (see pickSpy in
// spyfairLogic.js), so earlier results never make the current spy certain.
//
// Remaining trust limits (no server to enforce them):
//   * The DEALING client chose the deal, so it knows the spy and the location.
//     The honest client never shows it, but a dealer with devtools could read
//     its own sessionStorage/memory.
//   * A player who reopens the room in a new tab gets a fresh key; the dealer
//     re-seals their entry, but if the dealer also lost its tab they can't see
//     their card until the next round.
// -----------------------------------------------------------------------------

// Dealer-only sessionStorage: this round's deal + per-entry reveal keys.
const dealKey = (gameId) => `spyfair-deal-${gameId}`

function readDealSecret(gameId, roundId) {
  try {
    const v = JSON.parse(sessionStorage.getItem(dealKey(gameId)) || 'null')
    return v && v.roundId === roundId ? v : null
  } catch {
    return null
  }
}

function writeDealSecret(gameId, value) {
  try { sessionStorage.setItem(dealKey(gameId), JSON.stringify(value)) } catch { /* private mode */ }
}

function newRoundId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Deal a sealed round to `participants` (seated, online, key published): pick
// the location (avoiding the room's recently seen ones and the previous
// round's) and the spy (from the room's rotation), and seal each role to its player. The deal and the
// reveal keys stay in the dealer's sessionStorage.
async function dealRound({ gameId, participants, sealKeys, seen, rotation, prevLocationIndex = null }) {
  const id = newRoundId()
  const locationIndex = pickLocationIndex(seen, prevLocationIndex)
  const { spyId, roles } = assignRoles(participants, locationIndex, Math.random, pickSpy(participants, rotation))
  const deal = { spyId, roles, locationIndex }
  const sealed = {}
  const keys = {}
  for (const uid of participants) {
    const { box, key } = await seal(sealKeys[uid], spyfairPayload(uid, deal), sealAad(id, uid))
    sealed[uid] = box
    keys[uid] = key
  }
  writeDealSecret(gameId, { roundId: id, ...deal, keys })
  return {
    id,
    phase: 'reveal',
    participants,
    sealed,
    // Filled in at the result — see the HIDDEN-ROLE MODEL note above.
    spy: null,
    locationIndex: null,
    spyWon: null,
    accused: null,
    spyGuess: null,   // the spy's one location guess { by, index }
    outcome: null,    // result: 'caught' | 'escaped' | 'guessed' | 'wrongGuess'
    consistent: null,
    void: null,
    timerEnds: null,
    votes: null,
    openKeys: null,
  }
}

// Firebase strips empty maps: `openKeys` reads back undefined until the first write.
function normalizeKeyMap(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const out = {}
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'string' && v) out[k] = v
  return out
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
  // Deterministic host-fallback: the coordinator is the first ONLINE seat in join order, not
  // the fixed `isHost` — so a host disconnect hands transitions off instead of
  // freezing the match. Every write below that used to be `isHost`-gated is now
  // gated on this, and each write itself re-checks phase inside a transaction so a
  // handover mid-transition stays single-writer/idempotent.
  const amCoordinator = isRoomCoordinator(mySeat, players, game.hostUid)
  // Room timer scale (lobby option): 1 default, 2 relaxed, 0 = no questioning
  // clock — the coordinator calls the vote by hand.
  const noTimer = timersOff(game.timerScale)
  const isOnline = (id) => players?.[id]?.online !== false

  const myPlayer = players?.[mySeat] || null
  const amSpectator = !myPlayer

  // Rounds dealt before sealing shipped carry plaintext `round.private` —
  // still readable here so an in-flight round finishes after an update.
  const legacy = !round.sealed && !!round.private
  const participants = useMemo(
    () => (legacy ? Object.keys(round.private || {}) : normalizeList(round.participants)),
    [legacy, round.private, round.participants],
  )
  const amParticipant = participants.includes(mySeat)
  const participantSeats = seats.filter(p => participants.includes(p.playerId))

  const { pair, sealKeys, supported: sealSupported } = useSealKey(gameId, myPlayer ? mySeat : null, game.sealKeys)
  const readyIds = seatIds.filter(id => isOnline(id) && sealKeys[id])
  const canDeal = readyIds.length >= SPYFAIR_MIN_PLAYERS

  // ---------------------------------------------------------------------------
  // My sealed entry: am I the spy, and if not, where are we and who am I?
  // ---------------------------------------------------------------------------
  const myBox = round.sealed?.[mySeat] || null
  const [mine, setMine] = useState(null) // { ct, parsed, key, failed }
  useEffect(() => {
    if (!pair || !myBox || !round.id) return
    if (mine?.ct === myBox.ct) return
    let alive = true
    openWithPrivate(pair.privJwk, pair.pub, myBox, sealAad(round.id, mySeat)).then(res => {
      if (!alive) return
      const parsed = res ? parseSpyfairPayload(res.plaintext) : null
      setMine({ ct: myBox.ct, parsed, key: res?.key || null, failed: !parsed })
    })
    return () => { alive = false }
  }, [pair, myBox, round.id, mySeat, mine])
  const legacyMine = legacy ? (legacyOpened(round.private)[mySeat] ?? null) : null
  const myEntry = legacy
    ? (legacyMine ? { parsed: legacyMine } : null)
    : (myBox && mine?.ct === myBox.ct ? mine : null)
  const myCard = myEntry?.parsed || null
  const amSpy = !!myCard?.spy
  const myLocation = myCard && !myCard.spy ? SPYFAIR_LOCATIONS[myCard.locationIndex] : null
  const myRole = myCard && !myCard.spy ? myCard.role : null
  // Participant whose entry is missing or sealed to an old key (new tab): the
  // dealer re-seals it; until then there's nothing to show.
  const myCardPending = amParticipant && !myCard

  // ---------------------------------------------------------------------------
  // Entries opened by published reveal keys at TALLY. Each open is verified by
  // AES-GCM, so a forged key or entry reads as unopened.
  // ---------------------------------------------------------------------------
  const openKeys = useMemo(() => normalizeKeyMap(round.openKeys), [round.openKeys])
  const [openedMap, setOpenedMap] = useState({}) // { [uid]: { sig, parsed } }
  const openSig = participants.map(uid => `${uid}:${openKeys[uid] || ''}:${round.sealed?.[uid]?.ct || ''}`).join('|')
  useEffect(() => {
    if (!round.id || legacy) return
    const todo = participants.filter(uid => {
      const sig = `${openKeys[uid] || ''}:${round.sealed?.[uid]?.ct || ''}`
      return openKeys[uid] && round.sealed?.[uid] && openedMap[uid]?.sig !== sig
    })
    if (todo.length === 0) return
    let alive = true
    Promise.all(todo.map(async uid => {
      const sig = `${openKeys[uid]}:${round.sealed[uid].ct}`
      const text = await openWithKey(openKeys[uid], round.sealed[uid], sealAad(round.id, uid))
      return [uid, { sig, parsed: parseSpyfairPayload(text) }]
    })).then(entries => {
      if (alive) setOpenedMap(prev => ({ ...prev, ...Object.fromEntries(entries) }))
    })
    return () => { alive = false }
    // openSig captures every input that matters; the objects change identity per snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSig, round.id, legacy])
  const opened = useMemo(() => {
    if (legacy) return legacyOpened(round.private)
    const out = {}
    for (const uid of participants) {
      const sig = `${openKeys[uid] || ''}:${round.sealed?.[uid]?.ct || ''}`
      if (openedMap[uid]?.sig === sig) out[uid] = openedMap[uid].parsed
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedMap, openSig, legacy, round.private])
  const dealView = readSpyfairDeal(opened, participants)

  // ---------------------------------------------------------------------------
  // Dealer: re-seal to a participant whose published key changed (new tab).
  // ---------------------------------------------------------------------------
  const dealSecret = round.id ? readDealSecret(gameId, round.id) : null
  const amDealer = !!dealSecret
  const needReseal = amDealer && (phase === 'reveal' || phase === 'questioning' || phase === 'vote')
    ? staleRecipients(participants, sealKeys, round.sealed).join(',')
    : ''
  const resealing = useRef(null)
  useEffect(() => {
    if (!needReseal || !round.id) return
    const secret = readDealSecret(gameId, round.id)
    if (!secret) return
    const job = `${round.id}:${needReseal}`
    if (resealing.current === job) return
    resealing.current = job
    const roundId = round.id
    ;(async () => {
      const patch = {}
      const keys = { ...(secret.keys || {}) }
      for (const uid of needReseal.split(',')) {
        const { box, key } = await seal(sealKeys[uid], spyfairPayload(uid, secret), sealAad(roundId, uid))
        patch[uid] = box
        keys[uid] = key
      }
      writeDealSecret(gameId, { ...secret, keys })
      await runTransaction(ref(db, `games/${gameId}/round`), cur => {
        if (!cur) return cur
        if (cur.id !== roundId) return
        return { ...cur, sealed: { ...(cur.sealed || {}), ...patch } }
      })
    })().catch(() => { resealing.current = null })
  }, [needReseal, round.id, sealKeys, gameId])

  // ---------------------------------------------------------------------------
  // Reveal keys: at TALLY every participant publishes its own entry's key, and
  // the dealer publishes every key it holds.
  // ---------------------------------------------------------------------------
  const publishKey = phase === 'tally' && !legacy
    ? participants.filter(uid => !openKeys[uid]).join(',')
    : ''
  const myKey = myEntry?.key || null
  useEffect(() => {
    if (!publishKey || !round.id) return
    const wanted = publishKey.split(',')
    const writes = {}
    if (myKey && wanted.includes(mySeat)) writes[mySeat] = myKey
    const secret = readDealSecret(gameId, round.id)
    if (secret?.keys) for (const uid of wanted) if (secret.keys[uid]) writes[uid] = secret.keys[uid]
    for (const [uid, key] of Object.entries(writes)) {
      set(ref(db, `games/${gameId}/round/openKeys/${uid}`), key).catch(() => {})
    }
  }, [publishKey, round.id, myKey, mySeat, gameId])

  const votes = normalizeVotes(round.votes)
  const myVote = votes[mySeat] || null
  const votesCast = Object.keys(votes).length
  // Required voters = the ONLINE participants only: a player who disconnects mid-vote
  // stays in `players` with online:false and can never vote, so waiting on every seat
  // would stall the round forever. Degenerate-case guard: never auto-resolve on fewer
  // than 2 total votes, so a lone survivor of a mass presence blip can't decide the
  // round alone — the coordinator's manual RESOLVE VOTE NOW button covers that case.
  const everyOnlineVoted = allOnlineVoted(participantSeats, votes)

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
  const [dealing, runDeal] = useBusy()
  const [advancing, runAdvance] = useBusy()
  const [resolving, runResolve] = useBusy()
  const [voiding, runVoid] = useBusy()
  const [guessing, runGuess] = useBusy()
  const [showLocations, setShowLocations] = useState(false)
  const [guessPick, setGuessPick] = useState(null) // spy's selected location index

  const prevPhase = useRef(phase)
  const resolvedRef = useRef(null)

  // Reset the peek-to-reveal flap (and the spy's pending guess pick) whenever a
  // new round begins.
  useEffect(() => {
    if (phase === 'reveal' && prevPhase.current !== 'reveal') {
      setSecretRevealed(false)
      setGuessPick(null)
    }
  }, [phase])

  // --- Coordinator: when the questioning timer expires, advance to the vote phase.
  // `now` ticks for every client (see useServerClock above), so every client agrees
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

  // --- Sounds on result ---
  useEffect(() => {
    if (phase === 'result' && prevPhase.current !== 'result' && !round.void) {
      const spyWon = round.spyWon
      if (round.spy === mySeat) (spyWon ? sounds.win : sounds.lose)()
      else if (amParticipant) (spyWon ? sounds.lose : sounds.win)()
    }
    prevPhase.current = phase
  }, [phase, round.spyWon, round.spy, round.void, mySeat, amParticipant])

  // -------------------------------------------------------------------------
  // Coordinator actions — gated on `amCoordinator` (the first ONLINE seat by join order),
  // not the fixed `isHost`, so a host disconnect hands these off instead of
  // freezing the match. See the `amCoordinator` comment above for the invariant.
  // -------------------------------------------------------------------------
  const startRound = (isNext) => runDeal(async () => {
    if (!amCoordinator) return
    if (!pair || !canDeal) { toast.error('WAITING FOR PLAYERS TO CONNECT'); return }
    try {
      const next = await dealRound({
        gameId,
        participants: readyIds,
        sealKeys,
        seen: game.seen?.[SPYFAIR_SEEN_KEY],
        rotation: game.spyfairRotation,
        prevLocationIndex: isNext ? (round.locationIndex ?? null) : null,
      })
      const prevId = round.id || null
      // Transaction, not a blind update: during a coordinator handover two
      // clients can both tap START / NEXT ROUND — only the first deal lands.
      const { committed } = await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current) return current
        if (isNext) {
          if (current.status !== 'playing' || current.round?.phase !== 'result') return
          if ((current.round?.id || null) !== prevId) return
          return { ...current, round: next, proposal: null, lastActivityAt: Date.now() }
        }
        if (current.status === 'playing') return
        return { ...current, status: 'playing', winner: null, round: next, proposal: null, lastActivityAt: Date.now() }
      })
      if (committed && !isNext) onStart?.()
    } catch {
      toast.error(isNext ? 'NEXT ROUND FAILED — CHECK CONNECTION' : 'START FAILED — CHECK CONNECTION')
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

  // Vote → tally: lock the votes and record the most-accused (null on a tie);
  // the roles are unsealed next and the round scored once they are known.
  async function lockVotes() {
    try {
      await runTransaction(ref(db, `games/${gameId}/round`), current => {
        if (!current || current.phase !== 'vote') return // already resolved by someone else
        const { top, tied } = tallyVotes(normalizeVotes(current.votes))
        return { ...current, phase: 'tally', accused: tied ? null : top }
      })
    } catch {
      toast.error('VOTE FAILED — CHECK CONNECTION')
    }
  }

  // Manual fallback for the coordinator: tally whatever votes are in RIGHT NOW. Covers
  // flapping presence (a gone player still reading online:true) where the auto-resolve
  // never fires. Idempotent vs the auto path: the resolvedRef check-and-set is
  // synchronous (no await before it), and lockVotes itself re-reads the round and
  // bails unless phase is still 'vote' — same guards the auto-resolve effect relies on.
  const forceResolveVote = () => runResolve(async () => {
    if (!amCoordinator || phase !== 'vote' || votesCast === 0) return
    if (resolvedRef.current === 'vote') return
    resolvedRef.current = 'vote'
    await lockVotes()
  })

  // --- Coordinator: once every ONLINE participant has voted (min 2 votes), lock. ---
  // Also fires when the last non-voter drops offline mid-vote, un-sticking the round.
  useEffect(() => {
    if (!amCoordinator || phase !== 'vote' || !everyOnlineVoted) return
    if (resolvedRef.current === 'vote') return
    resolvedRef.current = 'vote'
    lockVotes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amCoordinator, phase, everyOnlineVoted])

  // --- Coordinator: tally → result, once the unsealed entries name the spy and
  // the location. One transaction re-checks round id + phase, so a handover
  // mid-resolve can never score the round twice. ---
  const scoreReady = phase === 'tally' && dealView.complete
  useEffect(() => {
    if (!amCoordinator || !scoreReady) return
    const { spyId, locationIndex, consistent } = dealView
    const roundId = round.id || null
    runTransaction(ref(db, `games/${gameId}`), current => {
      const r = current?.round
      if (!r || (r.id || null) !== roundId || r.phase !== 'tally') return
      const parts = r.private && !r.sealed ? Object.keys(r.private) : normalizeList(r.participants)
      const seatIdsNow = seatOrder(current.players).map(p => p.playerId)
      let spyWon
      let outcome
      let accused = r.accused ?? null
      if (normalizeSpyGuess(r.spyGuess)) {
        // The round ended on the spy's location guess.
        const g = resolveSpyGuess(r.spyGuess, spyId, locationIndex)
        if (!g.valid) {
          // Only a tampered client can guess without holding the SPY card: no score.
          return { ...current, round: { ...r, phase: 'result', void: true, spyWon: null, consistent }, lastActivityAt: Date.now() }
        }
        spyWon = g.spyWon
        outcome = g.outcome
        accused = null
      } else {
        const v = resolveVote(normalizeVotes(r.votes), spyId)
        spyWon = v.spyWon
        outcome = spyWon ? 'escaped' : 'caught'
      }
      const nextScores = scoreRound(current.scores, parts, spyId, spyWon)
      const over = matchWinners(seatIdsNow, nextScores).length > 0
      const seen = { ...(current.seen || {}), [SPYFAIR_SEEN_KEY]: markSeen(normalizeSeen(current.seen?.[SPYFAIR_SEEN_KEY]), [locationIndex]) }
      return {
        ...current,
        scores: nextScores,
        seen,
        // The spy is public from here on — safe to roll the rotation.
        spyfairRotation: recordSpy(current.spyfairRotation, seatIdsNow, spyId),
        round: { ...r, phase: 'result', spy: spyId, locationIndex, spyWon, outcome, accused, consistent },
        lastActivityAt: Date.now(),
        ...(over ? { status: 'finished' } : {}),
      }
    }).catch(() => toast.error('SCORING FAILED — CHECK CONNECTION'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amCoordinator, scoreReady])

  // Escape hatch: two or more entries can't be unsealed (those players AND the
  // dealer all left) — end the round with no score instead of waiting forever.
  const voidRound = () => runVoid(async () => {
    if (!amCoordinator) return
    const roundId = round.id || null
    await runTransaction(ref(db, `games/${gameId}/round`), cur => {
      if (!cur || (cur.id || null) !== roundId || cur.phase !== 'tally') return
      return { ...cur, phase: 'result', void: true, spyWon: null, consistent: null }
    })
  }, () => toast.error('END ROUND FAILED — CHECK CONNECTION'))

  // -------------------------------------------------------------------------
  // Player actions
  // -------------------------------------------------------------------------
  async function castVote(accusedId) {
    if (!amParticipant || phase !== 'vote' || myVote) return
    sounds.move(amSpy ? 'O' : 'X')
    await runTransaction(ref(db, `games/${gameId}/round/votes/${mySeat}`), cur => (cur ? undefined : accusedId))
      .catch(() => toast.error('VOTE FAILED — CHECK CONNECTION'))
  }

  // --- Spy: one location guess, during questioning or the vote. One transaction
  // re-checks round + phase + no earlier guess, records the guess, publishes the
  // spy's own reveal key (the proof they hold the SPY card) and moves to TALLY,
  // where every card is unsealed and the coordinator scores the guess. ---
  const spyGuess = normalizeSpyGuess(round.spyGuess)
  const canGuess = !legacy && amSpy && !!myKey && (phase === 'questioning' || phase === 'vote') && !spyGuess
  const handleSpyGuess = () => runGuess(async () => {
    if (!canGuess || guessPick == null) return
    const index = guessPick
    const roundId = round.id || null
    const key = myKey
    const { committed } = await runTransaction(ref(db, `games/${gameId}/round`), cur => {
      if (!cur || (cur.id || null) !== roundId) return
      if (cur.phase !== 'questioning' && cur.phase !== 'vote') return
      if (cur.spyGuess) return
      return {
        ...cur,
        phase: 'tally',
        spyGuess: { by: mySeat, index },
        accused: null,
        openKeys: { ...(cur.openKeys || {}), [mySeat]: key },
      }
    })
    if (!committed) toast.error('TOO LATE — THE ROUND HAS MOVED ON')
    else sounds.move('O')
  }, () => toast.error('GUESS FAILED — CHECK CONNECTION'))

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
            {seats.map((p, i) => {
              // READY = online with a published sealing key (can be dealt a card).
              const ready = isOnline(p.playerId) && !!sealKeys[p.playerId]
              return (
                <li key={p.playerId} className="flex items-center justify-between font-mono text-[11px]">
                  <span className={cn(
                    p.playerId === mySeat ? 'text-retro-p1 text-glow-p1' : 'text-retro-text',
                  )}>
                    {i + 1}. {p.name || 'PLAYER'}{p.playerId === mySeat ? ' (YOU)' : ''}
                  </span>
                  <span className={cn('font-pixel text-[8px]', ready ? 'text-retro-win text-glow-win' : 'text-retro-dim')}>
                    {!isOnline(p.playerId) ? 'OFF' : ready ? 'READY' : 'JOINING…'}
                  </span>
                </li>
              )
            })}
            {playerCount === 0 && (
              <li className="font-mono text-[11px] text-retro-dim">No players yet…</li>
            )}
          </ul>
        </div>

        {amCoordinator ? (
          <div className="text-center space-y-2">
            {canDeal ? (
              <button
                onClick={() => startRound(false)}
                disabled={dealing}
                className="px-6 py-2.5 min-w-[8.5rem] bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-40"
              >
                {dealing ? 'DEALING…' : 'START ROUND'}
              </button>
            ) : (
              <p className="font-pixel text-[10px] text-retro-dim arcade-blink">
                {playerCount < SPYFAIR_MIN_PLAYERS
                  ? `NEED ${SPYFAIR_MIN_PLAYERS - playerCount} MORE PLAYER${SPYFAIR_MIN_PLAYERS - playerCount === 1 ? '' : 'S'}`
                  : 'WAITING FOR PLAYERS TO CONNECT…'}
              </p>
            )}
          </div>
        ) : (
          <p className="text-center font-pixel text-[10px] text-retro-dim arcade-blink">
            {playerCount >= SPYFAIR_MIN_PLAYERS ? 'WAITING TO START…' : `WAITING FOR PLAYERS (${playerCount}/${SPYFAIR_MIN_PLAYERS})`}
          </p>
        )}

        {!sealSupported && (
          <p className="text-center font-pixel text-[9px] text-retro-p2 leading-relaxed">
            THIS BROWSER CAN&apos;T SEAL SECRET CARDS — OPEN THE GAME OVER HTTPS
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
          <span key={p} className={cn(p === (phase === 'tally' ? 'vote' : phase) ? 'text-retro-cta text-glow-cta' : 'text-retro-dim')}>
            {p === 'questioning' ? 'ASK' : p.toUpperCase()}
          </span>
        ))}
      </div>

      {/* REVEAL: each player privately peeks at their secret */}
      {phase === 'reveal' && (
        <div className="space-y-4">
          {amSpectator ? (
            <p className="text-center font-pixel text-[10px] text-retro-dim py-6">SPECTATING — SECRETS HIDDEN</p>
          ) : !amParticipant ? (
            <p className="text-center font-pixel text-[10px] text-retro-dim py-6 leading-relaxed">
              SITTING OUT THIS ROUND — YOU&apos;LL BE DEALT IN NEXT ROUND
            </p>
          ) : (
            <div
              data-testid="spyfair-card"
              className="bg-retro-card border-2 border-retro-border rounded p-5 text-center space-y-3 min-h-[140px] flex flex-col items-center justify-center"
            >
              {!secretRevealed ? (
                <button
                  onClick={() => { setSecretRevealed(true); sounds.hit() }}
                  className="px-5 py-3 border-2 border-retro-p1 text-retro-p1 font-pixel text-[10px] rounded hover:shadow-neon-p1 hover:bg-retro-tint-p1 transition-all active:scale-95"
                >
                  TAP TO SEE YOUR SECRET
                </button>
              ) : myCardPending ? (
                <p className="font-pixel text-[9px] text-retro-dim leading-relaxed arcade-blink">
                  {mine?.failed || (round.sealed && !myBox)
                    ? 'YOUR CARD WAS SEALED TO ANOTHER TAB — WAITING FOR THE DEALER TO RESEAL IT…'
                    : 'UNSEALING YOUR CARD…'}
                </p>
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
                  <p className="font-pixel text-lg text-retro-cta text-glow-cta">{myLocation?.name}</p>
                  <p className="font-mono text-[11px] text-retro-p1 text-glow-p1">
                    Your role: {myRole || '—'}
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
              Ask each other questions — out loud or in the chat. Spot the spy.
              {noTimer && !round.timerEnds && ' Timers are off — the vote starts when it is called.'}
            </p>
          </div>

          {amParticipant && myCard && (
            <div className="bg-retro-surface border border-retro-border/60 rounded p-3 text-center">
              {amSpy ? (
                <p className="font-pixel text-[9px] text-retro-p2 text-glow-p2">YOU ARE THE SPY — STAY HIDDEN</p>
              ) : (
                <p className="font-mono text-[10px] text-retro-dim">
                  <span className="text-retro-cta">{myLocation?.name}</span> ·{' '}
                  <span className="text-retro-p1">{myRole}</span>
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
          <p className="text-center font-mono text-[10px] text-retro-dim">
            Most votes is accused. A tie for most votes lets the spy escape.
          </p>
          {!amParticipant ? (
            <p className="text-center font-pixel text-[10px] text-retro-dim py-4">
              {amSpectator ? 'SPECTATING' : 'SITTING OUT THIS ROUND'}
            </p>
          ) : (
            <div className="space-y-2">
              {participantSeats.map(p => {
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
            {votesCast}/{participants.length} VOTED
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

      {/* LOCATION LIST: everyone's reference; the spy's one guess lives here too */}
      {(phase === 'reveal' || phase === 'questioning' || phase === 'vote') && (
        <div className="bg-retro-surface border border-retro-border/60 rounded p-3 space-y-2">
          <button
            onClick={() => setShowLocations(v => !v)}
            aria-expanded={showLocations}
            className="w-full min-h-11 font-pixel text-[9px] text-retro-dim hover:text-retro-text tracking-widest transition-colors"
          >
            {/* Same label for everyone — a spy-only hint here would show on a glance at their screen. */}
            {showLocations ? '▾ HIDE LOCATIONS' : `▸ ALL ${SPYFAIR_LOCATIONS.length} LOCATIONS`}
          </button>
          {showLocations && (
            <>
              {canGuess && (
                <p className="font-mono text-[10px] text-retro-p2 text-center leading-relaxed">
                  Spy: pick a location and lock it in. One guess — right wins
                  the round, wrong loses it.
                </p>
              )}
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

      {/* TALLY: votes locked (or the spy guessed); every client unseals the roles */}
      {phase === 'tally' && (
        <div className="space-y-3 text-center">
          {spyGuess && (
            <p className="font-mono text-[11px] text-retro-p2">
              {seats.find(p => p.playerId === spyGuess.by)?.name || 'A PLAYER'} claims to be the spy and guessed{' '}
              <span className="text-retro-cta">{SPYFAIR_LOCATIONS[spyGuess.index]?.name}</span>
            </p>
          )}
          <p className="font-pixel text-[10px] text-retro-cta text-glow-cta arcade-blink">UNSEALING THE ROLES…</p>
          <p className="font-mono text-[10px] text-retro-dim">
            {Object.keys(opened).length}/{participants.length} cards opened
          </p>
          {/* Two or more cards can't be opened when those players AND the
              dealer have all left — end the round unscored rather than hang. */}
          {amCoordinator && !dealView.complete && (
            <div className="space-y-1.5">
              <button
                onClick={voidRound}
                disabled={voiding}
                className="px-5 py-2 border-2 border-retro-p2 text-retro-p2 font-pixel text-[10px] rounded hover:shadow-neon-p2 transition-all active:scale-95 disabled:opacity-40"
              >
                {voiding ? 'ENDING…' : 'END ROUND — NO SCORE'}
              </button>
              <p className="font-mono text-[9px] text-retro-dim">Use this if players who left hold the missing cards</p>
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
            const revealedLocation = round.locationIndex != null ? SPYFAIR_LOCATIONS[round.locationIndex] : null
            const spyWon = round.spyWon
            const guessedName = spyGuess ? SPYFAIR_LOCATIONS[spyGuess.index]?.name : null
            const headline = round.outcome === 'guessed' ? 'SPY NAMED THE LOCATION!'
              : round.outcome === 'wrongGuess' ? 'SPY GUESSED WRONG!'
                : spyWon ? 'SPY ESCAPES!' : 'SPY CAUGHT!'
            return (
              <>
                {round.void ? (
                  <p className="font-pixel text-base text-retro-dim">ROUND VOID — NO SCORE</p>
                ) : (
                  <p className={cn(
                    'font-pixel text-base',
                    spyWon ? 'text-retro-p2 text-glow-p2' : 'text-retro-win text-glow-win',
                  )}>
                    {headline}
                  </p>
                )}
                {!round.void && (
                  <div className="bg-retro-card border border-retro-border rounded p-4 space-y-2">
                    <p className="font-mono text-[11px] text-retro-dim">
                      The spy was <span className="text-retro-p2 text-glow-p2">{spyPlayer?.name || '???'}</span>
                    </p>
                    <p className="font-mono text-[11px] text-retro-dim">
                      The location was <span className="text-retro-cta text-glow-cta">{revealedLocation?.name || '???'}</span>
                      {round.consistent === false && (
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
                    {round.spy === mySeat && (
                      <p className="font-pixel text-[9px] text-retro-p2">
                        {round.outcome === 'guessed' ? 'YOU NAMED IT'
                          : round.outcome === 'wrongGuess' ? 'WRONG GUESS'
                            : spyWon ? 'YOU GOT AWAY WITH IT' : 'YOU WERE EXPOSED'}
                      </p>
                    )}
                  </div>
                )}

                <ScoreBoard seats={seats} scores={scores} mySeat={mySeat} spyId={round.spy} />

                {amCoordinator && !proposal && (
                  <button
                    onClick={() => startRound(true)}
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
