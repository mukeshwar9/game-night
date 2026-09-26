import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, runTransaction, set } from 'firebase/database'
import { db } from '../lib/firebase'
import { isRoomCoordinator } from '../lib/coordinator'
import {
  seatOrder, getCard, pickCardIndex, dealChameleon, payloadFor, parsePayload, readDeal,
  clueOrder, normalizeClues, normalizeVotes, currentClueGiver, cluesDone, validateClue,
  resolveAccused, allOnlineVoted, outcomeOf, scoreRound, matchWinners,
  CHAMELEON_MIN_PLAYERS, CHAMELEON_SEEN_KEY, CHAMELEON_MATCH_POINTS, CLUE_MAX_LEN,
} from '../lib/chameleonLogic'
import { seal, openWithPrivate, openWithKey, staleRecipients } from '../lib/sealed'
import { markSeen, normalizeSeen } from '../lib/seenHistory'
import { normalizeList } from '../lib/normalize'
import useSealKey from '../hooks/useSealKey'
import GameSwitcher from '../components/GameSwitcher'
import RoundEndPanel, { ScoreList } from '../components/RoundEndPanel'
import LoadingLine from '../components/loading/LoadingLine'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'
import { toast } from 'sonner'

// Rules (deal, clue order + validation, vote, outcome, scoring) live in
// src/lib/chameleonLogic.js.
//
// -----------------------------------------------------------------------------
// HIDDEN-ROLE MODEL — read before touching the round shape.
//
// Every field under `games/$id` is world-readable, so neither the Chameleon's
// identity nor the secret word is ever written in plaintext during a round.
// The dealer (the coordinator who taps START / NEXT ROUND) seals one entry
// per participant to that player's published key (src/lib/sealed.js):
// 'CHAMELEON' for the Chameleon, 'WORD:<slot>' for everyone else, padded to
// one length so ciphertext size gives nothing away. A client can open only
// its own entry.
//
// Reveals publish per-entry AES keys (`round.openKeys/{uid}`), which lets
// every client open AND verify that one entry (AES-GCM rejects a forged key
// or plaintext):
//   * after the vote, only the ACCUSED entry is opened — if it says
//     CHAMELEON, the Chameleon guesses the word before anything else leaks;
//   * then every entry is opened and the round is scored. Each player's own
//     client publishes its key, and so does the dealer, so the reveal works
//     even if one of them has dropped. Contradicting entries (a dealer who
//     sealed two Chameleons or two words) are flagged on the result screen.
//
// Remaining trust limits (no server to enforce them):
//   * The DEALING client chose the deal, so it knows the Chameleon and the
//     word. The honest client never shows it to the dealer, but a dealer with
//     devtools could read its own sessionStorage/memory.
//   * Clues are plain text and turn order is enforced client-side only.
//   * A player who reopens the room in a new tab gets a fresh key; the dealer
//     re-seals their entry, but if the dealer also lost its tab they sit out
//     until the next round.
// -----------------------------------------------------------------------------

// Dealer-only sessionStorage: this round's deal + per-entry reveal keys.
const dealKey = (gameId) => `chameleon-deal-${gameId}`

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

const aadFor = (roundId, uid) => `chameleon|${roundId}|${uid}`
const SKIPPED_CLUE = '(skipped)'

// Build a sealed round. Participants are the seated, online players whose
// sealing key is published. Stores the deal in the dealer's sessionStorage.
async function dealRound({ gameId, participants, sealKeys, seen, prevCardIndex, roundNo }) {
  const id = newRoundId()
  const cardIndex = pickCardIndex(seen, prevCardIndex)
  const deal = dealChameleon(participants)
  const sealed = {}
  const keys = {}
  for (const uid of participants) {
    const { box, key } = await seal(sealKeys[uid], payloadFor(uid, deal), aadFor(id, uid))
    sealed[uid] = box
    keys[uid] = key
  }
  writeDealSecret(gameId, { roundId: id, ...deal, keys })
  return {
    id, roundNo, phase: 'clues', cardIndex,
    participants, order: clueOrder(participants, roundNo),
    sealed, clues: null, votes: null, accused: null, openKeys: null, guess: null, result: null,
  }
}

export default function ChameleonGame({ gameId, game, mySeat, players, onSwitchGame, onNewMatch, proposal }) {
  const round = game.round || {}
  const live = game.status === 'playing' || game.status === 'finished'
  const phase = live ? (round.phase || null) : null
  const seats = useMemo(() => seatOrder(players), [players])
  const participants = useMemo(() => normalizeList(round.participants), [round.participants])
  const order = useMemo(() => normalizeList(round.order), [round.order])
  const card = getCard(round.cardIndex)
  const amSeated = !!players?.[mySeat]
  const amParticipant = participants.includes(mySeat)
  // Online-aware host fallback (src/lib/coordinator.js): the host or TRANSFER HOST
  // pick while connected, else the next online seat by join order.
  const amCoordinator = isRoomCoordinator(mySeat, players, game.hostUid ?? null)
  const isOnline = (id) => players?.[id]?.online !== false
  const nameOf = (id) => players?.[id]?.name || 'PLAYER'
  const scores = game.scores || {}
  const clues = normalizeClues(round.clues)
  const votes = normalizeVotes(round.votes)
  const openKeys = useMemo(() => normalizeClues(round.openKeys), [round.openKeys])
  const myVote = votes[mySeat] || null

  const { pair, sealKeys, supported: sealSupported } = useSealKey(gameId, amSeated ? mySeat : null, game.sealKeys)
  const readyIds = seats.filter(id => isOnline(id) && sealKeys[id])
  const canDeal = readyIds.length >= CHAMELEON_MIN_PLAYERS

  const [dealing, runDeal] = useBusy()
  const [sending, runSend] = useBusy()
  const [skipping, runSkip] = useBusy()
  const [voting, runVote] = useBusy()
  const [resolving, runResolve] = useBusy()
  const [guessing, runGuess] = useBusy()
  const [clueInput, setClueInput] = useState('')
  const [clueError, setClueError] = useState('')

  // ---------------------------------------------------------------------------
  // My sealed entry: am I the Chameleon, and if not, which word is secret?
  // ---------------------------------------------------------------------------
  const myBox = round.sealed?.[mySeat] || null
  const [mine, setMine] = useState(null) // { ct, parsed, key, failed }
  useEffect(() => {
    if (!pair || !myBox || !round.id) return
    if (mine?.ct === myBox.ct) return
    let alive = true
    openWithPrivate(pair.privJwk, pair.pub, myBox, aadFor(round.id, mySeat)).then(res => {
      if (!alive) return
      const parsed = res ? parsePayload(res.plaintext) : null
      setMine({ ct: myBox.ct, parsed, key: res?.key || null, failed: !parsed })
    })
    return () => { alive = false }
  }, [pair, myBox, round.id, mySeat, mine])
  const myEntry = myBox && mine?.ct === myBox.ct ? mine : null
  const amChameleon = !!myEntry?.parsed?.chameleon
  const mySecretIndex = myEntry?.parsed && !myEntry.parsed.chameleon ? myEntry.parsed.secretIndex : null
  const mySecretWord = mySecretIndex != null ? card?.words[mySecretIndex] : null

  // ---------------------------------------------------------------------------
  // Entries opened by published reveal keys (unmask → accused only; reveal →
  // everyone). Each open is verified by AES-GCM.
  // ---------------------------------------------------------------------------
  const [openedMap, setOpenedMap] = useState({}) // { [uid]: { sig, parsed } }
  const openSig = participants.map(uid => `${uid}:${openKeys[uid] || ''}:${round.sealed?.[uid]?.ct || ''}`).join('|')
  useEffect(() => {
    if (!round.id) return
    const todo = participants.filter(uid => {
      const sig = `${openKeys[uid] || ''}:${round.sealed?.[uid]?.ct || ''}`
      return openKeys[uid] && round.sealed?.[uid] && openedMap[uid]?.sig !== sig
    })
    if (todo.length === 0) return
    let alive = true
    Promise.all(todo.map(async uid => {
      const sig = `${openKeys[uid]}:${round.sealed[uid].ct}`
      const text = await openWithKey(openKeys[uid], round.sealed[uid], aadFor(round.id, uid))
      return [uid, { sig, parsed: parsePayload(text) }]
    })).then(entries => {
      if (alive) setOpenedMap(prev => ({ ...prev, ...Object.fromEntries(entries) }))
    })
    return () => { alive = false }
    // openSig captures every input that matters; the objects change identity per snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSig, round.id])
  const opened = useMemo(() => {
    const out = {}
    for (const uid of participants) {
      const sig = `${openKeys[uid] || ''}:${round.sealed?.[uid]?.ct || ''}`
      if (openedMap[uid]?.sig === sig) out[uid] = openedMap[uid].parsed
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedMap, openSig])
  const dealView = readDeal(opened)

  // ---------------------------------------------------------------------------
  // Dealer: re-seal to a participant whose published key changed (new tab).
  // ---------------------------------------------------------------------------
  const dealSecret = round.id ? readDealSecret(gameId, round.id) : null
  const amDealer = !!dealSecret
  const needReseal = amDealer && phase && phase !== 'reveal'
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
        const { box, key } = await seal(sealKeys[uid], payloadFor(uid, secret), aadFor(roundId, uid))
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
  // Reveal keys: in UNMASK only the accused entry is opened (by the accused's
  // own client and by the dealer); in REVEAL every entry is.
  // ---------------------------------------------------------------------------
  const accused = round.accused || null
  const publishWanted = useMemo(() => {
    if (phase === 'unmask' && accused) return [accused]
    if (phase === 'reveal') return participants
    return []
  }, [phase, accused, participants])
  const publishKey = publishWanted.filter(uid => !openKeys[uid]).join(',')
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

  // ---------------------------------------------------------------------------
  // Coordinator phase transitions. Every write is a transaction that
  // re-checks round id + phase, so a coordinator handover stays single-writer.
  // ---------------------------------------------------------------------------
  const roundTx = (fn) => runTransaction(ref(db, `games/${gameId}/round`), cur => {
    if (!cur) return cur
    if (cur.id !== round.id) return
    return fn(cur)
  })

  // Clues → vote once nobody online still owes a clue.
  const cluesComplete = phase === 'clues' && cluesDone(order, clues, isOnline)
  useEffect(() => {
    if (!amCoordinator || !cluesComplete) return
    roundTx(cur => (cur.phase === 'clues' ? { ...cur, phase: 'vote' } : undefined)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amCoordinator, cluesComplete])

  // Vote → unmask (or straight to reveal on a tie).
  const resolveVote = () => roundTx(cur => {
    if (cur.phase !== 'vote') return
    const who = resolveAccused(normalizeVotes(cur.votes))
    return { ...cur, phase: who ? 'unmask' : 'reveal', accused: who }
  })
  const everyoneVoted = phase === 'vote' && allOnlineVoted(participants, players, votes)
  useEffect(() => {
    if (!amCoordinator || !everyoneVoted) return
    resolveVote().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amCoordinator, everyoneVoted])

  // Unmask → guess (the accused IS the Chameleon) or reveal (they aren't).
  const accusedParsed = accused ? opened[accused] : undefined
  useEffect(() => {
    if (!amCoordinator || phase !== 'unmask' || !accusedParsed) return
    roundTx(cur => (cur.phase === 'unmask'
      ? { ...cur, phase: accusedParsed.chameleon ? 'guess' : 'reveal' }
      : undefined)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amCoordinator, phase, accusedParsed])

  // Reveal → score, once the Chameleon (and, for a guess, the word) is known.
  const guessIndex = Number.isInteger(round.guess) && round.guess >= 0 ? round.guess : null
  const scoreReady = phase === 'reveal' && !round.result && !!dealView.chameleonId &&
    (accused !== dealView.chameleonId || guessIndex == null || dealView.secretIndex != null)
  useEffect(() => {
    if (!amCoordinator || !scoreReady) return
    const { chameleonId, secretIndex, consistent } = dealView
    const roundId = round.id
    runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current) return current
      const r = current.round
      if (!r || r.id !== roundId || r.phase !== 'reveal' || r.result) return
      const parts = normalizeList(r.participants)
      const g = Number.isInteger(r.guess) && r.guess >= 0 ? r.guess : null
      const outcome = outcomeOf({ accused: r.accused || null, chameleonId, guessIndex: g, secretIndex })
      const nextScores = scoreRound(current.scores, parts, chameleonId, outcome)
      const liveIds = seatOrder(current.players)
      const over = matchWinners(liveIds, nextScores).length > 0
      const seen = { ...(current.seen || {}), [CHAMELEON_SEEN_KEY]: markSeen(normalizeSeen(current.seen?.[CHAMELEON_SEEN_KEY]), [r.cardIndex]) }
      return {
        ...current,
        scores: nextScores,
        seen,
        round: { ...r, result: { chameleon: chameleonId, secretIndex: secretIndex ?? -1, outcome, consistent } },
        lastActivityAt: Date.now(),
        ...(over ? { status: 'finished' } : {}),
      }
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amCoordinator, scoreReady])

  // --- Sounds on the result ---
  const result = round.result || null
  const prevOutcome = useRef(null)
  useEffect(() => {
    const key = result ? `${round.id}:${result.outcome}` : null
    if (key && prevOutcome.current !== key && amParticipant && result.outcome !== 'void') {
      const chamWon = result.outcome !== 'caught'
      const iAmIt = result.chameleon === mySeat
      ;((chamWon === iAmIt) ? sounds.win : sounds.lose)()
    }
    prevOutcome.current = key
  }, [result, round.id, amParticipant, mySeat])

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const startRound = (isNext) => runDeal(async () => {
    if (!amCoordinator) return
    if (!pair || !canDeal) { toast.error('WAITING FOR PLAYERS TO CONNECT'); return }
    const next = await dealRound({
      gameId,
      participants: readyIds,
      sealKeys,
      seen: game.seen?.[CHAMELEON_SEEN_KEY],
      prevCardIndex: isNext ? (round.cardIndex ?? null) : null,
      roundNo: isNext ? (round.roundNo || 0) + 1 : 0,
    })
    const prevId = round.id || null
    await runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current) return current
      if (isNext) {
        if (current.status !== 'playing' || current.round?.id !== prevId || !current.round?.result) return
        return { ...current, round: next, proposal: null, lastActivityAt: Date.now() }
      }
      if (current.status === 'playing') return
      return { ...current, status: 'playing', winner: null, scores: {}, round: next, proposal: null, lastActivityAt: Date.now() }
    })
  }, () => toast.error('DEAL FAILED — CHECK CONNECTION'))

  const submitClue = () => runSend(async () => {
    const v = validateClue(clueInput, mySecretWord)
    if (!v.ok) { setClueError(v.error); return }
    setClueError('')
    await runTransaction(ref(db, `games/${gameId}/round/clues/${mySeat}`), cur => (cur ? undefined : v.clue))
    setClueInput('')
    sounds.move('X')
  }, () => toast.error('CLUE FAILED — CHECK CONNECTION'))

  const skipClue = (uid) => runSkip(async () => {
    if (!amCoordinator) return
    await runTransaction(ref(db, `games/${gameId}/round/clues/${uid}`), cur => (cur ? undefined : SKIPPED_CLUE))
  }, () => toast.error('SKIP FAILED — CHECK CONNECTION'))

  const castVote = (uid) => runVote(async () => {
    if (!amParticipant || phase !== 'vote' || myVote || uid === mySeat) return
    sounds.move('O')
    await runTransaction(ref(db, `games/${gameId}/round/votes/${mySeat}`), cur => (cur ? undefined : uid))
  }, () => toast.error('VOTE FAILED — CHECK CONNECTION'))

  const forceResolve = () => runResolve(resolveVote, () => toast.error('RESOLVE FAILED — CHECK CONNECTION'))

  // The Chameleon's last chance (or the coordinator skipping a vanished one: -1).
  const submitGuess = (index) => runGuess(async () => {
    await roundTx(cur => {
      if (cur.phase !== 'guess' || Number.isInteger(cur.guess)) return
      return { ...cur, guess: index, phase: 'reveal' }
    })
  }, () => toast.error('GUESS FAILED — CHECK CONNECTION'))

  const skipStuck = (toPhase) => runResolve(async () => {
    if (!amCoordinator) return
    await roundTx(cur => {
      if (cur.phase !== 'unmask' && cur.phase !== 'guess') return
      return { ...cur, phase: toPhase, ...(cur.phase === 'guess' ? { guess: -1 } : {}) }
    })
  }, () => toast.error('SKIP FAILED — CHECK CONNECTION'))

  const voidRound = () => runResolve(async () => {
    if (!amCoordinator) return
    await roundTx(cur => (cur.phase === 'reveal' && !cur.result
      ? { ...cur, result: { chameleon: dealView.chameleonId || '', secretIndex: dealView.secretIndex ?? -1, outcome: 'void', consistent: dealView.consistent } }
      : undefined))
  }, () => toast.error('END ROUND FAILED — CHECK CONNECTION'))

  // ---------------------------------------------------------------------------
  // Render: lobby
  // ---------------------------------------------------------------------------
  if (!live || !phase) {
    return (
      <div className="space-y-5">
        <div className="text-center space-y-2">
          <p className="font-pixel text-xs text-retro-cta text-glow-cta tracking-widest">CHAMELEON</p>
          <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
            Everyone sees the same 16 words — and all but one of you knows the secret one.
            Give a clue, then vote out the Chameleon before they blend in.
          </p>
        </div>

        <div className="bg-retro-card border border-retro-border rounded p-4 space-y-2">
          <p className="font-pixel text-[9px] text-retro-dim tracking-wider">PLAYERS ({seats.length})</p>
          <ul className="space-y-1">
            {seats.map((id, i) => {
              const p = players?.[id] || {}
              const ready = isOnline(id) && !!sealKeys[id]
              return (
                <li key={id} className="flex items-center justify-between font-mono text-[11px]">
                  <span className={cn(id === mySeat ? 'text-retro-p1 text-glow-p1' : 'text-retro-text')}>
                    {i + 1}. {p.name || 'PLAYER'}{id === mySeat ? ' (YOU)' : ''}
                  </span>
                  <span className={cn('font-pixel text-[8px]', ready ? 'text-retro-win text-glow-win' : 'text-retro-dim')}>
                    {!isOnline(id) ? 'OFF' : ready ? 'READY' : 'JOINING…'}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>

        {amCoordinator ? (
          <div className="text-center">
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
                {seats.length < CHAMELEON_MIN_PLAYERS
                  ? `NEED ${CHAMELEON_MIN_PLAYERS - seats.length} MORE PLAYER${CHAMELEON_MIN_PLAYERS - seats.length === 1 ? '' : 'S'}`
                  : 'WAITING FOR PLAYERS TO CONNECT…'}
              </p>
            )}
          </div>
        ) : (
          <p className="text-center font-pixel text-[10px] text-retro-dim arcade-blink">
            {seats.length >= CHAMELEON_MIN_PLAYERS ? 'WAITING TO START…' : `WAITING FOR PLAYERS (${seats.length}/${CHAMELEON_MIN_PLAYERS})`}
          </p>
        )}

        {!sealSupported && (
          <p className="text-center font-pixel text-[9px] text-retro-p2 leading-relaxed">
            THIS BROWSER CAN&apos;T SEAL SECRET CARDS — OPEN THE GAME OVER HTTPS
          </p>
        )}
        {!proposal && onSwitchGame && <GameSwitcher currentType="chameleon" onSwitch={onSwitchGame} />}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: an active round
  // ---------------------------------------------------------------------------
  const giver = phase === 'clues' ? currentClueGiver(order, clues, isOnline) : null
  const scoreRows = [...seats]
    .sort((a, b) => (scores[b] || 0) - (scores[a] || 0))
    .map(id => ({
      id, name: nameOf(id), score: scores[id] || 0, you: id === mySeat, muted: !isOnline(id),
      marker: result?.chameleon === id ? '🦎' : null,
      win: (scores[id] || 0) >= CHAMELEON_MATCH_POINTS,
    }))
  const revealedSecret = result && result.secretIndex >= 0 ? result.secretIndex : null
  // Grid highlight: my own secret while playing; the real word once revealed.
  const highlight = revealedSecret ?? (amChameleon ? null : mySecretIndex)
  const guessMode = phase === 'guess' && amChameleon

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-2 font-pixel text-[8px] tracking-widest">
        {['clues', 'vote', 'unmask', 'reveal'].map(p => (
          <span key={p} className={cn(p === phase || (p === 'unmask' && phase === 'guess') ? 'text-retro-cta text-glow-cta' : 'text-retro-dim')}>
            {p === 'unmask' ? 'UNMASK' : p.toUpperCase()}
          </span>
        ))}
      </div>

      {/* My role */}
      {amParticipant && !result && (
        <div className="bg-retro-surface border border-retro-border/60 rounded p-3 text-center" data-testid="chameleon-role">
          {!myEntry ? (
            mine?.failed ? (
              <p className="font-mono text-[10px] text-retro-dim">This device can&apos;t open your card (new tab?) — waiting for a re-deal…</p>
            ) : (
              <LoadingLine label="UNSEALING YOUR CARD…" />
            )
          ) : amChameleon ? (
            <>
              <p className="font-pixel text-sm text-retro-p2 text-glow-p2">YOU ARE THE CHAMELEON</p>
              <p className="font-mono text-[10px] text-retro-dim mt-1">You don&apos;t know the secret word. Blend in!</p>
            </>
          ) : (
            <>
              <p className="font-pixel text-[9px] text-retro-dim tracking-widest">THE SECRET WORD IS</p>
              <p className="font-pixel text-base text-retro-cta text-glow-cta mt-1">{mySecretWord}</p>
            </>
          )}
        </div>
      )}
      {!amParticipant && !result && (
        <p className="text-center font-pixel text-[9px] text-retro-dim">
          {amSeated ? 'YOU JOINED MID-ROUND — YOU’RE IN FROM THE NEXT ONE' : 'SPECTATING — THE SECRET IS SEALED TO PLAYERS'}
        </p>
      )}

      {/* Topic card */}
      {card && (
        <div className="bg-retro-card border-2 border-retro-border rounded p-3 space-y-2">
          <p className="text-center font-pixel text-[10px] text-retro-p1 text-glow-p1 tracking-widest">{card.topic}</p>
          <div className="grid grid-cols-4 gap-1.5" role={guessMode ? 'group' : undefined} aria-label={guessMode ? 'Guess the secret word' : undefined}>
            {card.words.map((w, i) => {
              const isHit = highlight === i
              const isGuess = result && guessIndex === i
              const cls = cn(
                'min-h-12 px-1 py-1.5 rounded border font-mono text-[10px] leading-tight text-center break-words flex items-center justify-center',
                isHit ? 'border-retro-cta text-retro-cta bg-retro-tint-cta font-bold' : 'border-retro-border text-retro-text',
                isGuess && !isHit && 'border-retro-p2 text-retro-p2',
              )
              return guessMode ? (
                <button
                  key={w}
                  onClick={() => submitGuess(i)}
                  disabled={guessing}
                  className={cn(cls, 'hover:border-retro-p2 hover:text-retro-p2 active:scale-95 transition-all disabled:opacity-50')}
                >
                  {w}
                </button>
              ) : (
                <div key={w} className={cls} aria-current={isHit ? 'true' : undefined}>
                  {isHit ? `★ ${w}` : w}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Clues */}
      <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1">
        <p className="font-pixel text-[8px] text-retro-dim tracking-widest">CLUES</p>
        {order.map(uid => {
          const c = clues[uid]
          const isGiver = uid === giver
          return (
            <div key={uid} className="flex items-center justify-between gap-2 font-mono text-[11px]">
              <span className={cn('truncate', uid === mySeat ? 'text-retro-p1' : 'text-retro-text', !isOnline(uid) && 'opacity-60')}>
                {isGiver ? '▶ ' : ''}{nameOf(uid)}{uid === mySeat ? ' (YOU)' : ''}
              </span>
              <span className={cn('shrink-0', c ? 'text-retro-cta' : 'text-retro-dim')}>
                {c || (isGiver ? 'THINKING…' : '—')}
              </span>
            </div>
          )
        })}
      </div>

      {phase === 'clues' && (
        <div className="space-y-2">
          {giver === mySeat ? (
            <form
              className="space-y-2"
              onSubmit={(e) => { e.preventDefault(); submitClue() }}
            >
              <p className="text-center font-pixel text-[10px] text-retro-cta text-glow-cta">YOUR CLUE</p>
              <div className="flex gap-2">
                <input
                  value={clueInput}
                  onChange={(e) => { setClueInput(e.target.value); setClueError('') }}
                  maxLength={CLUE_MAX_LEN}
                  placeholder="ONE WORD CLUE"
                  aria-label="Your clue"
                  autoComplete="off"
                  className="flex-1 min-w-0 bg-retro-surface border-2 border-retro-border rounded px-3 py-2 font-mono text-sm text-retro-text focus:border-retro-cta outline-none"
                />
                <button
                  type="submit"
                  aria-label="Send clue"
                  disabled={sending || !clueInput.trim()}
                  className="px-4 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-40"
                >
                  {sending ? 'SENDING…' : 'SEND'}
                </button>
              </div>
              {clueError && <p className="text-center font-pixel text-[9px] text-retro-p2">{clueError}</p>}
            </form>
          ) : (
            <p className="text-center font-pixel text-[10px] text-retro-dim arcade-blink">
              {giver ? `${nameOf(giver)} IS THINKING OF A CLUE…` : 'ALL CLUES IN…'}
            </p>
          )}
          {amCoordinator && giver && giver !== mySeat && (
            <div className="text-center">
              <button
                onClick={() => skipClue(giver)}
                disabled={skipping}
                className="px-4 py-1.5 border border-retro-border text-retro-dim font-pixel text-[9px] rounded hover:border-retro-p2 hover:text-retro-p2 transition-all active:scale-95 disabled:opacity-40"
              >
                {skipping ? 'SKIPPING…' : `SKIP ${nameOf(giver)}`}
              </button>
            </div>
          )}
        </div>
      )}

      {phase === 'vote' && (
        <div className="space-y-2">
          <p className="text-center font-pixel text-[10px] text-retro-cta text-glow-cta">WHO IS THE CHAMELEON?</p>
          {amParticipant ? participants.map(uid => {
            const isMe = uid === mySeat
            const picked = myVote === uid
            return (
              <button
                key={uid}
                onClick={() => castVote(uid)}
                disabled={!!myVote || isMe || voting}
                className={cn(
                  'w-full min-h-11 flex items-center justify-between px-4 py-2.5 rounded border-2 font-mono text-[11px] transition-all active:scale-[0.98]',
                  picked ? 'border-retro-p2 text-retro-p2 shadow-neon-p2 bg-retro-tint-p2' : 'border-retro-border text-retro-text hover:border-retro-p2/60',
                  (!!myVote || isMe) && !picked ? 'opacity-50' : '',
                )}
              >
                <span>{picked ? '✓ ' : ''}{nameOf(uid)}{isMe ? ' (YOU)' : ''}</span>
                <span className={cn('font-pixel text-[8px]', votes[uid] ? 'text-retro-win text-glow-win' : 'text-retro-dim')}>
                  {votes[uid] ? 'VOTED' : '…'}
                </span>
              </button>
            )
          }) : (
            <p className="text-center font-pixel text-[10px] text-retro-dim py-3">WATCHING THE VOTE</p>
          )}
          <p className="text-center font-pixel text-[9px] text-retro-dim">
            {Object.keys(votes).length}/{participants.length} VOTED
          </p>
          {amCoordinator && Object.keys(votes).length > 0 && (
            <div className="text-center">
              <button
                onClick={forceResolve}
                disabled={resolving}
                className="px-5 py-2 border-2 border-retro-p2 text-retro-p2 font-pixel text-[10px] rounded hover:shadow-neon-p2 transition-all active:scale-95 disabled:opacity-40"
              >
                {resolving ? 'RESOLVING…' : 'RESOLVE VOTE NOW'}
              </button>
            </div>
          )}
        </div>
      )}

      {phase === 'unmask' && (
        <div className="space-y-2 text-center">
          <p className="font-pixel text-[10px] text-retro-cta text-glow-cta">THE GROUP ACCUSES {nameOf(accused)}…</p>
          <LoadingLine label="UNMASKING…" />
          {amCoordinator && (
            <button
              onClick={() => skipStuck('reveal')}
              disabled={resolving}
              className="px-4 py-1.5 border border-retro-border text-retro-dim font-pixel text-[9px] rounded hover:border-retro-p2 hover:text-retro-p2 transition-all active:scale-95 disabled:opacity-40"
            >
              {resolving ? 'SKIPPING…' : 'SKIP TO REVEAL'}
            </button>
          )}
        </div>
      )}

      {phase === 'guess' && (
        <div className="space-y-2 text-center">
          {amChameleon ? (
            <>
              <p className="font-pixel text-sm text-retro-p2 text-glow-p2">CAUGHT! ONE LAST CHANCE</p>
              <p className="font-mono text-[11px] text-retro-dim">Tap the word you think was secret to steal the round.</p>
            </>
          ) : (
            <p className="font-pixel text-[10px] text-retro-p2 text-glow-p2 arcade-blink">
              {nameOf(accused)} WAS THE CHAMELEON — GUESSING THE WORD…
            </p>
          )}
          {amCoordinator && !amChameleon && (
            <button
              onClick={() => skipStuck('reveal')}
              disabled={resolving}
              className="px-4 py-1.5 border border-retro-border text-retro-dim font-pixel text-[9px] rounded hover:border-retro-p2 hover:text-retro-p2 transition-all active:scale-95 disabled:opacity-40"
            >
              {resolving ? 'SKIPPING…' : 'SKIP GUESS'}
            </button>
          )}
        </div>
      )}

      {phase === 'reveal' && !result && (
        <div className="space-y-2 text-center">
          <LoadingLine label="REVEALING…" />
          {amCoordinator && (
            <button
              onClick={voidRound}
              disabled={resolving}
              className="px-4 py-1.5 border border-retro-border text-retro-dim font-pixel text-[9px] rounded hover:border-retro-p2 hover:text-retro-p2 transition-all active:scale-95 disabled:opacity-40"
            >
              {resolving ? 'ENDING…' : 'END ROUND WITHOUT SCORING'}
            </button>
          )}
        </div>
      )}

      {result && (
        <ResultPanel
          result={result}
          accused={accused}
          guessIndex={guessIndex}
          card={card}
          nameOf={nameOf}
          mySeat={mySeat}
          scoreRows={scoreRows}
          finished={game.status === 'finished'}
          winners={seats.filter(id => (scores[id] || 0) >= CHAMELEON_MATCH_POINTS)}
          amSeated={amSeated}
          amCoordinator={amCoordinator}
          proposal={proposal}
          onNext={() => startRound(true)}
          dealing={dealing}
          onNewMatch={onNewMatch}
        />
      )}

      {!result && <ScoreList title={`SCORES · FIRST TO ${CHAMELEON_MATCH_POINTS}`} rows={scoreRows} />}
      {(result || !amSeated) && !proposal && onSwitchGame && <GameSwitcher currentType="chameleon" onSwitch={onSwitchGame} />}
    </div>
  )
}

const OUTCOME_TEXT = {
  escaped: 'THE CHAMELEON ESCAPED!',
  stolen: 'CAUGHT — BUT THEY STOLE IT!',
  caught: 'CHAMELEON CAUGHT!',
  void: 'ROUND ENDED — NO SCORE',
}

function ResultPanel({
  result, accused, guessIndex, card, nameOf, mySeat, scoreRows, finished, winners,
  amSeated, amCoordinator, proposal, onNext, dealing, onNewMatch,
}) {
  const chamName = result.chameleon ? nameOf(result.chameleon) : '???'
  const secretWord = result.secretIndex >= 0 ? card?.words[result.secretIndex] : null
  const iWasIt = result.chameleon === mySeat
  const details = (
    <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1 text-center font-mono text-[11px] text-retro-dim">
      <p>The Chameleon was <span className="text-retro-p2 text-glow-p2">{chamName}{iWasIt ? ' (YOU)' : ''}</span></p>
      <p>The secret word was <span className="text-retro-cta text-glow-cta">{secretWord || '???'}</span></p>
      {accused
        ? <p>The group accused {nameOf(accused)}</p>
        : <p>The vote was tied — nobody was accused</p>}
      {guessIndex != null && card && <p>The Chameleon guessed {card.words[guessIndex]}</p>}
      {result.consistent === false && (
        <p className="font-pixel text-[8px] text-retro-p2">⚠ THE DEAL DIDN&apos;T ADD UP — SCORES MAY BE WRONG</p>
      )}
    </div>
  )

  if (finished && winners.length > 0) {
    const iWon = winners.includes(mySeat)
    const names = winners.map(nameOf)
    const headline = iWon ? 'YOU WIN!' : winners.length > 1 ? `${names.join(' & ')} WIN` : `${names[0]} WINS`
    return (
      <RoundEndPanel
        caption="MATCH OVER"
        headline={headline}
        sub={<p className="font-pixel text-[9px] text-retro-dim">{OUTCOME_TEXT[result.outcome] || ''}</p>}
        scores={{ title: 'SCORES', rows: scoreRows }}
        actions={amSeated ? [
          !proposal && onNewMatch && { key: 'new', label: 'NEW MATCH', busyLabel: 'STARTING…', onClick: onNewMatch },
        ] : []}
        share={amSeated ? { gameLabel: 'CHAMELEON', headline, sub: 'Chameleon · Game Night' } : null}
      >
        {details}
      </RoundEndPanel>
    )
  }

  return (
    <div className="space-y-3">
      <p className={cn(
        'text-center font-pixel text-base',
        result.outcome === 'caught' ? 'text-retro-win text-glow-win' : 'text-retro-p2 text-glow-p2',
      )}>
        {OUTCOME_TEXT[result.outcome] || ''}
      </p>
      {details}
      <ScoreList title={`SCORES · FIRST TO ${CHAMELEON_MATCH_POINTS}`} rows={scoreRows} />
      {amCoordinator && !proposal ? (
        <button
          onClick={onNext}
          disabled={dealing}
          className="w-full py-2.5 font-pixel text-[10px] border-2 border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 hover:bg-retro-tint-p1 transition-all active:scale-95 disabled:opacity-40"
        >
          {dealing ? 'DEALING…' : 'NEXT ROUND'}
        </button>
      ) : !proposal && (
        <p className="text-center font-pixel text-[10px] text-retro-dim arcade-blink">WAITING FOR THE NEXT ROUND…</p>
      )}
    </div>
  )
}
