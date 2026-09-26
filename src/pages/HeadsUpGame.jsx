import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, runTransaction, update } from 'firebase/database'
import { db } from '../lib/firebase'
import { isRoomCoordinator } from '../lib/coordinator'
import {
  seatOrder, totalTurns, guesserForTurn, nextTurnNo, pickDealer, normalizeCategory, categoryLabel,
  dealHand, packHand, unpackHand, promptText, normalizeResults, applyCardResult, countGot,
  handExhausted, scoreTurn, matchWinners,
  HU_MIN_PLAYERS, HU_TURN_SECONDS, HU_SEEN_KEY, HU_MIXED, HU_GOT, HU_PASS,
} from '../lib/headsUpLogic'
import { HEADSUP_CATEGORIES } from '../lib/decks/headsup'
import { seal, openWithPrivate, staleRecipients } from '../lib/sealed'
import { seenPatch } from '../lib/seenHistory'
import { scaledMs, timersOff } from '../lib/timerScale'
import { formatClockSecs } from '../lib/format'
import { normalizeList } from '../lib/normalize'
import useSealKey from '../hooks/useSealKey'
import useServerClock, { getServerNow } from '../hooks/useServerClock'
import GameSwitcher from '../components/GameSwitcher'
import RoundEndPanel, { ScoreList } from '../components/RoundEndPanel'
import LoadingLine from '../components/loading/LoadingLine'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'
import { toast } from 'sonner'

// Rules (turn order, dealing, card results, scoring) live in
// src/lib/headsUpLogic.js.
//
// -----------------------------------------------------------------------------
// HIDDEN-PROMPT MODEL — read before touching the turn shape.
//
// Every field under `games/$id` is world-readable, so the turn's prompts are
// never written in plaintext while the turn is live. Instead the DEALER — the
// online-aware coordinator among everyone EXCEPT the guesser (pickDealer) —
// deals a hand of prompt indices and SEALS it to each describer's published
// key (src/lib/sealed.js: per-recipient ECDH + AES-GCM). The guesser has no
// entry, so the guesser's client holds nothing it could decrypt — not even
// from devtools. The hand is revealed in plaintext (`turn.shown`, the cards
// actually played) only after the turn ends.
//
// Remaining trust limits (no server to enforce them):
//   * The dealer and every describer know the prompts — by design.
//   * GOT IT / PASS are honour-system taps from any seated player.
//   * A describer on a device that lost its key (new tab) can't see the cards
//     until the dealer re-seals; a dealer that lost its hand can't re-seal,
//     so that describer sits the turn out.
// -----------------------------------------------------------------------------

// Dealer-only sessionStorage: this turn's plaintext hand, for re-sealing to a
// describer whose key changed mid-turn.
const handKey = (gameId) => `headsup-hand-${gameId}`

function readHand(gameId, turnId) {
  try {
    const v = JSON.parse(sessionStorage.getItem(handKey(gameId)) || 'null')
    return v && v.turnId === turnId && Array.isArray(v.hand) ? v.hand : null
  } catch {
    return null
  }
}

function newTurnId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

function newTurn(guesser) {
  return { id: newTurnId(), guesser, sealed: null, dealtBy: null, handSize: 0, results: '', endsAt: null, shown: null, got: null }
}

const aadFor = (turnId, uid) => `headsup|${turnId}|${uid}`

export default function HeadsUpGame({ gameId, game, mySeat, players, onSwitchGame, onNewMatch, proposal }) {
  const round = game.round || {}
  const phase = game.status === 'playing' || game.status === 'finished' ? (round.phase || null) : null
  const turn = round.turn || null
  const category = normalizeCategory(round.category)
  const seats = useMemo(() => seatOrder(players), [players])
  const order = useMemo(() => normalizeList(round.order), [round.order])
  const playerCount = seats.length
  const enoughPlayers = playerCount >= HU_MIN_PLAYERS
  // Online-aware host fallback (src/lib/coordinator.js): the host or TRANSFER HOST
  // pick while connected, else the next online seat by join order.
  const amCoordinator = isRoomCoordinator(mySeat, players, game.hostUid ?? null)
  const amSeated = !!players?.[mySeat]
  const amGuesser = !!turn && turn.guesser === mySeat
  const isOnline = (id) => players?.[id]?.online !== false
  const nameOf = (id) => players?.[id]?.name || 'PLAYER'
  const scores = game.scores || {}
  const results = normalizeResults(turn?.results)
  const cardIndex = results.length
  const noTimer = timersOff(game.timerScale)

  // Sealing key: every seated player publishes one; spectators don't.
  const { pair, sealKeys, supported: sealSupported } = useSealKey(gameId, amSeated ? mySeat : null, game.sealKeys)

  const { now } = useServerClock(phase === 'play' ? 250 : 0)
  const secsLeft = turn?.endsAt ? Math.max(0, Math.ceil((turn.endsAt - now) / 1000)) : null

  const [starting, runStart] = useBusy()
  const [beginning, runBegin] = useBusy()
  const [ending, runEnd] = useBusy()
  const [advancing, runAdvance] = useBusy()
  const [tapping, runTap] = useBusy()

  // ---------------------------------------------------------------------------
  // My sealed hand for this turn (describers only).
  // ---------------------------------------------------------------------------
  const myBox = turn?.sealed?.[mySeat] || null
  const [opened, setOpened] = useState(null) // { ct, hand, failed }
  useEffect(() => {
    if (!pair || !myBox || !turn?.id || amGuesser) return
    if (opened?.ct === myBox.ct) return
    let alive = true
    openWithPrivate(pair.privJwk, pair.pub, myBox, aadFor(turn.id, mySeat)).then(res => {
      if (!alive) return
      const hand = res ? unpackHand(res.plaintext) : null
      setOpened({ ct: myBox.ct, hand, failed: !hand })
    })
    return () => { alive = false }
  }, [pair, myBox, turn?.id, mySeat, amGuesser, opened])
  const myHand = !amGuesser && myBox && opened?.ct === myBox.ct ? opened.hand : null
  const currentPrompt = myHand ? promptText(myHand[cardIndex]) : null

  // ---------------------------------------------------------------------------
  // Dealer: seal a fresh hand to every describer once the turn is set up, and
  // re-seal to anyone whose published key changed. The dealer is never the
  // guesser (pickDealer), so the guesser's client never sees the hand.
  // ---------------------------------------------------------------------------
  const dealerId = turn && phase === 'ready' && !turn.sealed ? pickDealer(order, turn.guesser, players) : null
  const dealingFor = useRef(null)
  useEffect(() => {
    if (dealerId !== mySeat || !pair || !turn?.id) return
    if (dealingFor.current === turn.id) return
    dealingFor.current = turn.id
    const turnId = turn.id
    const guesser = turn.guesser
    const recipients = order.filter(id => id !== guesser && sealKeys[id])
    ;(async () => {
      const hand = dealHand(category, game.seen?.[HU_SEEN_KEY])
      const payload = packHand(hand)
      const sealed = {}
      for (const id of recipients) sealed[id] = (await seal(sealKeys[id], payload, aadFor(turnId, id))).box
      try { sessionStorage.setItem(handKey(gameId), JSON.stringify({ turnId, hand })) } catch { /* private mode */ }
      await runTransaction(ref(db, `games/${gameId}/round/turn`), cur => {
        if (!cur) return cur
        if (cur.id !== turnId || cur.sealed) return
        return { ...cur, sealed, dealtBy: mySeat, handSize: hand.length }
      })
    })().catch(() => {
      dealingFor.current = null
      toast.error('DEALING FAILED — CHECK CONNECTION')
    })
  }, [dealerId, mySeat, pair, turn?.id, turn?.guesser, order, sealKeys, category, game.seen, gameId])

  const describerIds = useMemo(() => order.filter(id => id !== turn?.guesser), [order, turn?.guesser])
  const needReseal = turn?.dealtBy === mySeat && (phase === 'ready' || phase === 'play')
    ? staleRecipients(describerIds, sealKeys, turn.sealed).join(',')
    : ''
  const resealing = useRef(null)
  useEffect(() => {
    if (!needReseal || !turn?.id) return
    const hand = readHand(gameId, turn.id)
    if (!hand) return
    const turnId = turn.id
    const job = `${turnId}:${needReseal}`
    if (resealing.current === job) return
    resealing.current = job
    ;(async () => {
      const patch = {}
      for (const id of needReseal.split(',')) {
        patch[id] = (await seal(sealKeys[id], packHand(hand), aadFor(turnId, id))).box
      }
      await runTransaction(ref(db, `games/${gameId}/round/turn`), cur => {
        if (!cur) return cur
        if (cur.id !== turnId) return
        return { ...cur, sealed: { ...(cur.sealed || {}), ...patch } }
      })
    })().catch(() => { resealing.current = null })
  }, [needReseal, turn?.id, sealKeys, gameId])

  // ---------------------------------------------------------------------------
  // Coordinator: end the turn when the clock runs out or the hand is used up.
  // Every client ticks `now`; only the coordinator writes, and the write
  // re-checks the phase so a handover mid-transition stays single-writer.
  // ---------------------------------------------------------------------------
  const endTurn = async () => {
    const turnId = turn?.id
    await runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current) return current
      const r = current.round
      if (!r || r.phase !== 'play' || r.turn?.id !== turnId) return
      const res = normalizeResults(r.turn.results)
      return {
        ...current,
        scores: scoreTurn(current.scores, r.turn.guesser, res),
        round: { ...r, phase: 'recap', turn: { ...r.turn, got: countGot(res), endsAt: null } },
        lastActivityAt: Date.now(),
      }
    })
  }

  const timeUp = phase === 'play' && turn?.endsAt != null && now >= turn.endsAt
  const handDone = phase === 'play' && turn?.handSize > 0 && handExhausted(results, turn.handSize)
  useEffect(() => {
    if (!amCoordinator || !(timeUp || handDone)) return
    endTurn().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amCoordinator, timeUp, handDone])

  // ---------------------------------------------------------------------------
  // Recap: a describer who holds the hand publishes the cards actually played,
  // and marks them seen for the room.
  // ---------------------------------------------------------------------------
  const revealing = useRef(null)
  useEffect(() => {
    if (phase !== 'recap' || !turn?.id || turn.shown || !myHand) return
    if (revealing.current === turn.id) return
    revealing.current = turn.id
    const turnId = turn.id
    const played = myHand.slice(0, normalizeResults(turn.results).length)
    runTransaction(ref(db, `games/${gameId}/round/turn`), cur => {
      if (!cur) return cur
      if (cur.id !== turnId || cur.shown) return
      return { ...cur, shown: played.length ? played : [-1] }
    }).then(({ committed }) => {
      if (committed && played.length) {
        return update(ref(db, `games/${gameId}`), seenPatch(HU_SEEN_KEY, game.seen?.[HU_SEEN_KEY], played))
      }
    }).catch(() => { revealing.current = null })
  }, [phase, turn?.id, turn?.shown, turn?.results, myHand, gameId, game.seen])

  // --- Sounds: a tick per card, a bell when the turn ends. ---
  const prevLen = useRef(0)
  const prevPhase = useRef(phase)
  useEffect(() => {
    if (phase === 'play' && results.length > prevLen.current) {
      if (results[results.length - 1] === HU_GOT) sounds.hit()
      else sounds.wall()
    }
    prevLen.current = results.length
  }, [phase, results])
  useEffect(() => {
    if (phase === 'play' && prevPhase.current !== 'play') sounds.go()
    if (phase === 'recap' && prevPhase.current === 'play') sounds.bell()
    prevPhase.current = phase
  }, [phase])

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const pickCategory = (id) => {
    if (!amCoordinator) return
    update(ref(db, `games/${gameId}/round`), { category: id })
      .catch(() => toast.error('COULDN’T CHANGE CATEGORY — CHECK CONNECTION'))
  }

  const startMatch = () => runStart(async () => {
    if (!amCoordinator || !enoughPlayers) return
    const seatIds = seatOrder(players)
    const total = totalTurns(seatIds.length)
    const first = nextTurnNo(seatIds, 0, total, isOnline) ?? 0
    const { committed } = await runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current) return current
      if (current.status === 'playing') return
      return {
        ...current,
        status: 'playing', winner: null, proposal: null, lastActivityAt: Date.now(),
        scores: {},
        round: {
          category: normalizeCategory(current.round?.category),
          phase: 'ready', order: seatIds, total, turnNo: first,
          turn: newTurn(guesserForTurn(seatIds, first)),
        },
      }
    })
    if (!committed) toast.error('MATCH ALREADY STARTED')
  }, () => toast.error('START FAILED — CHECK CONNECTION'))

  const beginTurn = () => runBegin(async () => {
    const turnId = turn?.id
    const ms = scaledMs(HU_TURN_SECONDS * 1000, game.timerScale)
    await runTransaction(ref(db, `games/${gameId}/round`), cur => {
      if (!cur) return cur
      if (cur.phase !== 'ready' || cur.turn?.id !== turnId || !cur.turn?.sealed) return
      return { ...cur, phase: 'play', turn: { ...cur.turn, endsAt: ms == null ? null : getServerNow() + ms } }
    })
  }, () => toast.error('START FAILED — CHECK CONNECTION'))

  const tap = (result) => runTap(async () => {
    if (phase !== 'play' || !amSeated) return
    const turnId = turn?.id
    const at = cardIndex
    await runTransaction(ref(db, `games/${gameId}/round/turn`), cur => {
      if (!cur) return cur
      if (cur.id !== turnId) return
      const next = applyCardResult(cur.results, at, result, cur.handSize || 0)
      if (next == null) return
      return { ...cur, results: next }
    })
  }, () => toast.error('TAP FAILED — CHECK CONNECTION'))

  const endTurnNow = () => runEnd(endTurn, () => toast.error('END TURN FAILED — CHECK CONNECTION'))

  // NEXT TURN (or SKIP TURN from the ready screen): move to the next online
  // guesser; the match ends once every scheduled turn has been played.
  const advance = (fromPhase) => runAdvance(async () => {
    if (!amCoordinator) return
    const turnId = turn?.id
    await runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current) return current
      const r = current.round
      if (!r || r.phase !== fromPhase || r.turn?.id !== turnId) return
      const ord = normalizeList(r.order)
      const online = (id) => current.players?.[id]?.online !== false
      const t = nextTurnNo(ord, (r.turnNo || 0) + 1, r.total || 0, online)
      if (t == null) {
        return { ...current, status: 'finished', round: { ...r, phase: 'recap' }, lastActivityAt: Date.now() }
      }
      return { ...current, round: { ...r, phase: 'ready', turnNo: t, turn: newTurn(guesserForTurn(ord, t)) }, lastActivityAt: Date.now() }
    })
  }, () => toast.error('NEXT TURN FAILED — CHECK CONNECTION'))

  // ---------------------------------------------------------------------------
  // Render: lobby
  // ---------------------------------------------------------------------------
  if (game.status !== 'playing' && game.status !== 'finished') {
    return (
      <div className="space-y-5">
        <div className="text-center space-y-2">
          <p className="font-pixel text-xs text-retro-cta text-glow-cta tracking-widest">HEADS UP</p>
          <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
            Charades for your video call. One player guesses; everyone else sees the word
            and acts or describes it. Beat the clock!
          </p>
        </div>

        <PlayerList seats={seats} players={players} mySeat={mySeat} />

        <div className="bg-retro-card border border-retro-border rounded p-4 space-y-2">
          <p className="font-pixel text-[9px] text-retro-dim tracking-wider">CATEGORY</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Category">
            {[{ id: HU_MIXED, label: 'MIXED' }, ...HEADSUP_CATEGORIES].map(c => (
              <button
                key={c.id}
                role="radio"
                aria-checked={category === c.id}
                onClick={() => pickCategory(c.id)}
                disabled={!amCoordinator}
                className={cn(
                  'px-2.5 py-1.5 rounded border font-pixel text-[8px] transition-all',
                  category === c.id
                    ? 'border-retro-cta text-retro-cta bg-retro-tint-cta'
                    : 'border-retro-border text-retro-dim',
                  amCoordinator && category !== c.id && 'hover:border-retro-cta/60 hover:text-retro-text',
                  !amCoordinator && category !== c.id && 'opacity-60',
                )}
              >
                {category === c.id ? '✓ ' : ''}{c.label}
              </button>
            ))}
          </div>
          {!amCoordinator && <p className="font-mono text-[9px] text-retro-dim">The host picks the category.</p>}
        </div>

        {amCoordinator ? (
          <div className="text-center">
            {enoughPlayers ? (
              <button
                onClick={startMatch}
                disabled={starting}
                className="px-6 py-2.5 min-w-[8.5rem] bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-40"
              >
                {starting ? 'STARTING…' : 'START MATCH'}
              </button>
            ) : (
              <p className="font-pixel text-[10px] text-retro-dim arcade-blink">
                NEED {HU_MIN_PLAYERS - playerCount} MORE PLAYER{HU_MIN_PLAYERS - playerCount === 1 ? '' : 'S'}
              </p>
            )}
          </div>
        ) : (
          <p className="text-center font-pixel text-[10px] text-retro-dim arcade-blink">
            {enoughPlayers ? 'WAITING TO START…' : `WAITING FOR PLAYERS (${playerCount}/${HU_MIN_PLAYERS})`}
          </p>
        )}

        {!sealSupported && (
          <p className="text-center font-pixel text-[9px] text-retro-p2 leading-relaxed">
            THIS BROWSER CAN&apos;T SEAL SECRET CARDS — OPEN THE GAME OVER HTTPS
          </p>
        )}
        {!proposal && onSwitchGame && <GameSwitcher currentType="headsup" onSwitch={onSwitchGame} />}
      </div>
    )
  }

  const scoreRows = [...order]
    .sort((a, b) => (scores[b] || 0) - (scores[a] || 0))
    .map(id => ({ id, name: nameOf(id), score: scores[id] || 0, you: id === mySeat, muted: !isOnline(id) }))

  // ---------------------------------------------------------------------------
  // Render: match over
  // ---------------------------------------------------------------------------
  if (game.status === 'finished') {
    const winnerIds = matchWinners(order, scores)
    const iWon = winnerIds.includes(mySeat)
    const names = winnerIds.map(nameOf)
    const headline = winnerIds.length === 0
      ? 'NOBODY SCORED'
      : iWon && winnerIds.length === 1 ? 'YOU WIN!'
        : winnerIds.length > 1 ? `${names.join(' & ')} TIE` : `${names[0]} WINS`
    return (
      <div className="space-y-5">
        <RoundEndPanel
          caption="MATCH OVER"
          headline={headline}
          scores={{ title: 'WORDS GUESSED', rows: scoreRows.map(r => ({ ...r, win: winnerIds.includes(r.id) })) }}
          actions={amSeated ? [
            !proposal && onNewMatch && { key: 'new', label: 'NEW MATCH', busyLabel: 'STARTING…', onClick: onNewMatch },
          ] : []}
          share={amSeated ? { gameLabel: 'HEADS UP', headline, sub: 'Heads Up · Game Night' } : null}
        />
        {!proposal && onSwitchGame && <GameSwitcher currentType="headsup" onSwitch={onSwitchGame} />}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: a turn (ready / play / recap)
  // ---------------------------------------------------------------------------
  const guesserName = turn ? nameOf(turn.guesser) : 'PLAYER'
  const turnLabel = `TURN ${(round.turnNo || 0) + 1}/${round.total || order.length}`
  const shown = normalizeList(turn?.shown).filter(i => i >= 0)
  const got = countGot(results)
  const passed = results.length - got
  const canEnd = (amCoordinator || amGuesser) && !turn?.endsAt

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between font-pixel text-[8px] tracking-widest text-retro-dim">
        <span>{turnLabel}</span>
        <span>{categoryLabel(category)}</span>
      </div>

      {/* READY: who's up, dealing status, START TURN */}
      {phase === 'ready' && (
        <div className="space-y-4">
          <div className="bg-retro-card border-2 border-retro-border rounded p-5 text-center space-y-3">
            {amGuesser ? (
              <>
                <p className="font-pixel text-[9px] text-retro-dim tracking-widest">YOU&apos;RE GUESSING</p>
                <p className="font-pixel text-lg text-retro-p1 text-glow-p1">FACE THE CAMERA</p>
                <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
                  Your friends will act out or describe each word. Shout your guesses —
                  your screen only shows the timer.
                </p>
              </>
            ) : (
              <>
                <p className="font-pixel text-[9px] text-retro-dim tracking-widest">UP NEXT</p>
                <p className="font-pixel text-lg text-retro-p1 text-glow-p1">{guesserName} GUESSES</p>
                <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
                  {amSeated
                    ? 'The words appear on your screen. Act them out or describe them without saying the word — and don’t show your screen!'
                    : 'Spectating — the words are sealed to the players.'}
                </p>
              </>
            )}
          </div>

          {turn?.sealed ? (
            amSeated && (
              <div className="text-center">
                <button
                  onClick={beginTurn}
                  disabled={beginning}
                  className="px-6 py-3 min-w-[10rem] bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-40"
                >
                  {beginning ? 'STARTING…' : 'START TURN'}
                </button>
              </div>
            )
          ) : (
            <LoadingLine label="SHUFFLING THE DECK…" />
          )}

          {amCoordinator && (
            <div className="text-center">
              <button
                onClick={() => advance('ready')}
                disabled={advancing}
                className="px-4 py-2 border border-retro-border text-retro-dim font-pixel text-[9px] rounded hover:border-retro-p2 hover:text-retro-p2 transition-all active:scale-95 disabled:opacity-40"
              >
                {advancing ? 'SKIPPING…' : `SKIP ${guesserName}'S TURN`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* PLAY: guesser sees only the clock + buttons; describers see the card */}
      {phase === 'play' && (
        <div className="space-y-4">
          <div className="text-center" aria-live="off">
            {secsLeft != null ? (
              <p className={cn(
                'font-pixel tracking-widest',
                amGuesser ? 'text-5xl' : 'text-2xl',
                secsLeft <= 10 ? 'text-retro-p2 text-glow-p2 arcade-blink' : 'text-retro-cta text-glow-cta',
              )}>
                {formatClockSecs(secsLeft)}
              </p>
            ) : (
              <p className="font-pixel text-sm tracking-widest text-retro-cta text-glow-cta">NO TIMER</p>
            )}
          </div>

          {amGuesser ? (
            <div className="bg-retro-card border-2 border-retro-p1 rounded p-5 text-center space-y-2">
              <p className="font-pixel text-[10px] text-retro-p1 text-glow-p1 tracking-widest">YOU&apos;RE GUESSING</p>
              <p className="font-mono text-[11px] text-retro-dim">Guess out loud — the word is hidden from you.</p>
            </div>
          ) : amSeated ? (
            <div
              className="bg-retro-card border-2 border-retro-cta rounded px-4 py-8 text-center space-y-3 min-h-[11rem] flex flex-col items-center justify-center"
              data-testid="headsup-card"
            >
              <p className="font-pixel text-[9px] text-retro-dim tracking-widest">
                {guesserName} IS GUESSING · CARD {cardIndex + 1}
              </p>
              {currentPrompt ? (
                <p data-testid="headsup-prompt" className="font-pixel text-2xl sm:text-3xl leading-snug text-retro-cta text-glow-cta break-words max-w-full">
                  {currentPrompt.toUpperCase()}
                </p>
              ) : opened?.failed ? (
                <p className="font-mono text-[11px] text-retro-dim">
                  This device can&apos;t open this turn&apos;s cards (new tab?). Help guess — you&apos;ll be back next turn.
                </p>
              ) : (
                <LoadingLine label="UNSEALING…" />
              )}
            </div>
          ) : (
            <p className="text-center font-pixel text-[10px] text-retro-dim py-6">SPECTATING — WORDS ARE SEALED TO PLAYERS</p>
          )}

          {amSeated && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => tap(HU_PASS)}
                disabled={tapping}
                className="min-h-20 rounded border-2 border-retro-p2 text-retro-p2 font-pixel text-sm hover:shadow-neon-p2 hover:bg-retro-tint-p2 transition-all active:scale-95 disabled:opacity-50"
              >
                ✗ PASS
              </button>
              <button
                onClick={() => tap(HU_GOT)}
                disabled={tapping}
                className="min-h-20 rounded bg-retro-win text-retro-bg font-pixel text-sm hover:shadow-neon-win transition-all active:scale-95 disabled:opacity-50"
              >
                ✓ GOT IT
              </button>
            </div>
          )}

          <p className="text-center font-pixel text-[9px] text-retro-dim tracking-widest">
            GOT {got} · PASSED {passed}
          </p>

          {canEnd && (
            <div className="text-center">
              <button
                onClick={endTurnNow}
                disabled={ending}
                className="px-4 py-2 border border-retro-border text-retro-dim font-pixel text-[9px] rounded hover:border-retro-p2 hover:text-retro-p2 transition-all active:scale-95 disabled:opacity-40"
              >
                {ending ? 'ENDING…' : 'END TURN'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* RECAP: the words that were played, then NEXT TURN */}
      {phase === 'recap' && (
        <div className="space-y-4">
          <div className="text-center space-y-1">
            <p className="font-pixel text-[10px] text-retro-dim tracking-widest">TIME&apos;S UP</p>
            <p className="font-pixel text-base text-retro-cta text-glow-cta">
              {amGuesser ? 'YOU' : guesserName} GOT {turn?.got ?? got}
            </p>
          </div>
          <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1">
            {shown.length > 0 ? shown.map((idx, i) => {
              const ok = results[i] === HU_GOT
              return (
                <div key={`${idx}-${i}`} className="flex items-center justify-between font-mono text-[11px]">
                  <span className={ok ? 'text-retro-text' : 'text-retro-dim line-through'}>{promptText(idx)}</span>
                  <span className={cn('font-pixel text-[9px]', ok ? 'text-retro-win' : 'text-retro-p2')}>
                    {ok ? '✓ GOT' : '✗ PASS'}
                  </span>
                </div>
              )
            }) : results.length === 0 ? (
              <p className="font-mono text-[11px] text-retro-dim text-center">No cards played.</p>
            ) : (
              <LoadingLine label="REVEALING THE WORDS…" />
            )}
          </div>

          <ScoreList title="SCORES" rows={scoreRows} />

          {amCoordinator ? (
            <button
              onClick={() => advance('recap')}
              disabled={advancing}
              className="w-full py-2.5 font-pixel text-[10px] border-2 border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 hover:bg-retro-tint-p1 transition-all active:scale-95 disabled:opacity-40"
            >
              {advancing ? 'DEALING…' : 'NEXT TURN'}
            </button>
          ) : (
            <p className="text-center font-pixel text-[10px] text-retro-dim arcade-blink">WAITING FOR THE HOST…</p>
          )}
        </div>
      )}

      {phase === 'ready' && <ScoreList title="SCORES" rows={scoreRows} />}
      {phase === 'play' && !amGuesser && <ScoreList title="SCORES" rows={scoreRows} />}
      {!noTimer ? null : (
        <p className="text-center font-mono text-[9px] text-retro-dim">Timers are off — end each turn by hand.</p>
      )}
    </div>
  )
}

function PlayerList({ seats, players, mySeat }) {
  return (
    <div className="bg-retro-card border border-retro-border rounded p-4 space-y-2">
      <p className="font-pixel text-[9px] text-retro-dim tracking-wider">PLAYERS ({seats.length})</p>
      <ul className="space-y-1">
        {seats.map((id, i) => {
          const p = players?.[id] || {}
          return (
            <li key={id} className="flex items-center justify-between font-mono text-[11px]">
              <span className={cn(id === mySeat ? 'text-retro-p1 text-glow-p1' : 'text-retro-text')}>
                {i + 1}. {p.name || 'PLAYER'}{id === mySeat ? ' (YOU)' : ''}
              </span>
              <span className={cn('font-pixel text-[8px]', p.online !== false ? 'text-retro-win text-glow-win' : 'text-retro-dim')}>
                {p.online !== false ? 'ONLINE' : 'OFF'}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
