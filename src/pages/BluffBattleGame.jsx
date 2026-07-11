import { useCallback, useEffect, useRef, useState } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import { commit, verifyReveal } from '../lib/commit'
import {
  DICE_PER_PLAYER,
  FACES,
  countFace,
  isBidHigher,
  rollDice,
  resolveChallenge,
} from '../lib/bluffLogic'
import GameSwitcher from '../components/GameSwitcher'
import GameStatus from '../components/GameStatus'
import SpectatorCard from '../components/SpectatorCard'
import OfflineNotice from '../components/loading/OfflineNotice'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const MATCH_WINS = 3
const DIE_GLYPH = { 1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅' }

function normalizeRound(raw) {
  return {
    phase: raw?.phase ?? 'rolling',
    turn: raw?.turn ?? 'X',
    bids: toBids(raw?.bids),
    commitX: raw?.commitX ?? null,
    commitO: raw?.commitO ?? null,
    revealX: raw?.revealX ?? null,
    revealO: raw?.revealO ?? null,
    diceCountX: raw?.diceCountX ?? DICE_PER_PLAYER,
    diceCountO: raw?.diceCountO ?? DICE_PER_PLAYER,
    caller: raw?.caller ?? null,
    outcome: raw?.outcome ?? null,
  }
}

function toBids(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  return Object.values(raw)
}

function toDice(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  return Object.values(raw).map(Number)
}

function Die({ value, accent }) {
  return (
    <span
      className={cn(
        'text-3xl leading-none select-none',
        accent === 'X' ? 'text-retro-p1 text-glow-p1' : accent === 'O' ? 'text-retro-p2 text-glow-p2' : 'text-retro-text',
      )}
    >
      {DIE_GLYPH[value] ?? '?'}
    </span>
  )
}

export default function BluffBattleGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onNewMatch, proposal,
}) {
  const round = normalizeRound(game.bluffRound)
  const { phase, turn, bids } = round
  const myKey = mySymbol === 'O' ? 'O' : 'X'
  const opKey = myKey === 'X' ? 'O' : 'X'
  const isSpectator = mySymbol === null

  const myDiceCount = round[`diceCount${myKey}`]
  const opDiceCount = round[`diceCount${opKey}`]
  const myCommit = round[`commit${myKey}`]
  const lastBid = bids.length ? bids[bids.length - 1] : null

  const scoreX = game.scores?.X || 0
  const scoreO = game.scores?.O || 0
  const matchWinner = scoreX >= MATCH_WINS ? 'X' : scoreO >= MATCH_WINS ? 'O' : null

  const [myDice, setMyDice] = useState(null)
  const [bidQty, setBidQty] = useState(1)
  const [bidFace, setBidFace] = useState(2)
  const [busy, setBusy] = useState(false)
  const [showDice, setShowDice] = useState(true)
  const verifiedFor = useRef(null)
  const prevBidCount = useRef(bids.length)
  const prevMyCommitRef = useRef(undefined)

  const roundKey = `bluff-roll-${gameId}`

  // --- Load my dice from sessionStorage (per round, keyed by commit) ---
  useEffect(() => {
    if (isSpectator) return
    if (myCommit === prevMyCommitRef.current) return
    prevMyCommitRef.current = myCommit
    const stored = sessionStorage.getItem(roundKey)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronizes local dice state with sessionStorage (an external store) for this round's commit; guarded above so it only runs once per commit change
    if (!stored) { setMyDice(null); return }
    try {
      const parsed = JSON.parse(stored)
      // Only trust the stored roll if it matches the live commit for this round
      if (parsed.commit && myCommit && parsed.commit === myCommit) {
        setMyDice(parsed.dice)
      } else {
        setMyDice(null)
      }
    } catch { setMyDice(null) }
  }, [roundKey, myCommit, isSpectator])

  // --- Reset local bid inputs when a new bid lands or phase resets ---
  useEffect(() => {
    if (bids.length !== prevBidCount.current) {
      const lb = bids.length ? bids[bids.length - 1] : null
      if (lb) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- seeds the bid-input controls for the new current bid; guarded above so it only runs once per bid count change
        setBidQty(lb.qty)
        setBidFace(Math.min(lb.face + 1, FACES))
      } else {
        setBidQty(1)
        setBidFace(2)
      }
      prevBidCount.current = bids.length
    }
  }, [bids.length]) // eslint-disable-line react-hooks/exhaustive-deps -- reads the latest `bids` array from the closure; only the count should retrigger this reset

  // --- Roll: every non-spectator rolls hidden dice, stores them, publishes commit ---
  const handleRoll = useCallback(async () => {
    if (isSpectator || busy) return
    setBusy(true)
    try {
      const dice = rollDice(myDiceCount)
      const { hash, salt } = await commit(JSON.stringify(dice))
      sessionStorage.setItem(roundKey, JSON.stringify({ dice, salt, commit: hash }))
      setMyDice(dice)
      sounds.drop()
      await update(ref(db, `games/${gameId}/bluffRound`), { [`commit${myKey}`]: hash })
    } catch {
      toast.error('ROLL FAILED — CHECK CONNECTION')
    } finally {
      setBusy(false)
    }
  }, [isSpectator, busy, myDiceCount, roundKey, gameId, myKey])

  // --- Both committed → advance rolling → bidding (idempotent) ---
  useEffect(() => {
    if (phase !== 'rolling') return
    if (round.commitX && round.commitO) {
      update(ref(db, `games/${gameId}/bluffRound`), { phase: 'bidding' }).catch(() => {})
    }
  }, [phase, round.commitX, round.commitO, gameId])

  // --- Raise a bid ---
  const handleBid = useCallback(async () => {
    if (phase !== 'bidding' || turn !== mySymbol || busy) return
    const next = { qty: Number(bidQty), face: Number(bidFace) }
    if (!isBidHigher(lastBid, next)) {
      toast.error('BID MUST GO HIGHER')
      return
    }
    setBusy(true)
    try {
      await runTransaction(ref(db, `games/${gameId}/bluffRound`), (cur) => {
        if (!cur || cur.phase !== 'bidding' || cur.turn !== mySymbol) return
        const curBids = toBids(cur.bids)
        const prev = curBids.length ? curBids[curBids.length - 1] : null
        if (!isBidHigher(prev, next)) return // someone else moved — abort
        return {
          ...cur,
          bids: [...curBids, { ...next, by: mySymbol }],
          turn: mySymbol === 'X' ? 'O' : 'X',
        }
      })
      sounds.move(mySymbol)
    } catch {
      toast.error('BID FAILED — CHECK CONNECTION')
    } finally {
      setBusy(false)
    }
  }, [phase, turn, mySymbol, busy, bidQty, bidFace, lastBid, gameId])

  // --- Call LIAR → move both clients to reveal, record caller ---
  const handleCallLiar = useCallback(async () => {
    if (phase !== 'bidding' || turn !== mySymbol || busy || !lastBid) return
    setBusy(true)
    try {
      await runTransaction(ref(db, `games/${gameId}/bluffRound`), (cur) => {
        if (!cur || cur.phase !== 'bidding' || cur.turn !== mySymbol) return
        const curBids = toBids(cur.bids)
        if (!curBids.length) return
        return { ...cur, phase: 'reveal', caller: mySymbol }
      })
    } catch {
      toast.error('CALL FAILED — CHECK CONNECTION')
    } finally {
      setBusy(false)
    }
  }, [phase, turn, mySymbol, busy, lastBid, gameId])

  // --- Reveal: publish my dice+salt so the opponent can verify ---
  useEffect(() => {
    if (phase !== 'reveal' || isSpectator) return
    if (round[`reveal${myKey}`]) return
    const stored = sessionStorage.getItem(roundKey)
    if (!stored) return
    try {
      const { dice, salt, commit: storedCommit } = JSON.parse(stored)
      if (!storedCommit || storedCommit !== myCommit) return
      update(ref(db, `games/${gameId}/bluffRound`), {
        [`reveal${myKey}`]: { dice, salt },
      }).catch(() => {})
    } catch { /* ignore */ }
  }, [phase, isSpectator, round, myKey, myCommit, roundKey, gameId])

  // --- Resolve: once both reveals + commits present, verify & decide loser ---
  useEffect(() => {
    if (phase !== 'reveal') return
    if (round.outcome) return
    const { revealX, revealO, commitX, commitO, caller } = round
    if (!revealX || !revealO || !commitX || !commitO || !caller || !lastBid) return
    if (verifiedFor.current === bids.length + '-' + caller) return
    verifiedFor.current = bids.length + '-' + caller

    const diceX = toDice(revealX.dice)
    const diceO = toDice(revealO.dice)

    Promise.all([
      verifyReveal(commitX, JSON.stringify(diceX), revealX.salt),
      verifyReveal(commitO, JSON.stringify(diceO), revealO.salt),
    ]).then(([okX, okO]) => {
      // A failed commit verification = that player cheated → they lose the die.
      let loser, actual, bidMet, cheat = null
      if (!okX || !okO) {
        cheat = !okX ? 'X' : 'O'
        loser = cheat
        actual = countFace([...diceX, ...diceO], lastBid.face, true)
        bidMet = actual >= lastBid.qty
      } else {
        const bidder = lastBid.by
        const res = resolveChallenge({
          bid: lastBid, diceX, diceO, caller, bidder,
        })
        loser = res.loser; actual = res.actual; bidMet = res.bidMet
      }

      const newDiceX = round.diceCountX - (loser === 'X' ? 1 : 0)
      const newDiceO = round.diceCountO - (loser === 'O' ? 1 : 0)
      const dead = newDiceX <= 0 ? 'X' : newDiceO <= 0 ? 'O' : null
      const matchOver = dead
        ? (dead === 'X' ? 'O' : 'X')
        : null

      // One client writes the outcome via transaction (idempotent guard)
      runTransaction(ref(db, `games/${gameId}`), (cur) => {
        if (!cur) return
        const r = cur.bluffRound
        if (!r || r.phase !== 'reveal' || r.outcome) return // already resolved
        const out = {
          ...cur,
          bluffRound: {
            ...r,
            outcome: { loser, actual, bidMet, cheat, bid: lastBid },
            diceCountX: newDiceX,
            diceCountO: newDiceO,
          },
        }
        if (matchOver) {
          const winner = matchOver
          out.status = 'finished'
          out.winner = winner
          out.scores = { ...(cur.scores || {}), [winner]: (cur.scores?.[winner] || 0) + 1 }
        }
        return out
      }).catch(() => {})
    })
  }, [phase, round, bids.length, lastBid, gameId])

  // --- Sounds when the showdown outcome lands (once per exchange) ---
  const outcome = round.outcome
  const announcedRef = useRef(null)
  useEffect(() => {
    if (!outcome) return
    const sig = bids.length + '-' + (round.caller || '')
    if (announcedRef.current === sig) return
    announcedRef.current = sig
    if (isSpectator) { sounds.go(); return }
    if (game.status === 'finished') return // match-end sound handled by Game.jsx
    if (outcome.loser === mySymbol) sounds.lose()
    else sounds.win()
  }, [outcome, bids.length, round.caller, isSpectator, mySymbol, game.status])

  // --- NEXT ROUND: clear reveal/bids/commits, alternate opening turn, reroll ---
  const handleNextRound = useCallback(async () => {
    if (isSpectator) return
    const r = game.bluffRound || {}
    const dc = normalizeRound(r)
    // loser of the prior exchange opens the next bidding round
    const opener = dc.outcome?.loser || (dc.turn === 'X' ? 'O' : 'X')
    sessionStorage.removeItem(roundKey)
    try {
      await update(ref(db, `games/${gameId}/bluffRound`), {
        phase: 'rolling',
        turn: opener,
        bids: null,
        commitX: null, commitO: null,
        revealX: null, revealO: null,
        caller: null, outcome: null,
        // diceCountX / diceCountO carry over (already decremented)
      })
    } catch { toast.error('NEXT ROUND FAILED — CHECK CONNECTION') }
  }, [isSpectator, game.bluffRound, roundKey, gameId])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Match over
  if (game.status === 'finished' && matchWinner) {
    return (
      <GameStatus
        status={game.status}
        winner={game.winner}
        mySymbol={mySymbol}
        scores={game.scores}
        players={game.players}
        gameType={game.gameType}
        onNewMatch={!proposal ? onNewMatch : null}
        onSwitchGame={!proposal ? onSwitchGame : null}
      />
    )
  }

  const myAccent = myKey === 'X' ? 'text-retro-p1 text-glow-p1' : 'text-retro-p2 text-glow-p2'
  const opName = (game.players?.[opKey]?.name || opKey).toUpperCase()

  return (
    <div className="space-y-4">
      {isSpectator && <SpectatorCard game={game} />}

      {/* Dice-count tracker */}
      {isSpectator ? (
        <div className="flex items-center justify-between font-pixel text-[9px]">
          <span className="text-retro-p1 text-glow-p1">
            {(game.players?.X?.name || 'X').toUpperCase()}: {round.diceCountX} {'●'.repeat(Math.max(0, round.diceCountX))}
          </span>
          <span className="text-retro-p2 text-glow-p2">
            {(game.players?.O?.name || 'O').toUpperCase()}: {round.diceCountO} {'●'.repeat(Math.max(0, round.diceCountO))}
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between font-pixel text-[9px]">
          <span className="text-retro-p1 text-glow-p1">YOU: {myDiceCount} {'●'.repeat(Math.max(0, myDiceCount))}</span>
          <span className="text-retro-p2 text-glow-p2">{opName}: {opDiceCount} {'●'.repeat(Math.max(0, opDiceCount))}</span>
        </div>
      )}

      {/* My cup */}
      {!isSpectator && (
        <div className="bg-retro-card border border-retro-border rounded p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-pixel text-[8px] text-retro-dim">YOUR CUP (HIDDEN)</p>
            {myDice && (
              <button
                onClick={() => setShowDice(s => !s)}
                className="font-pixel text-[8px] text-retro-dim hover:text-retro-text transition-colors"
              >
                {showDice ? 'HIDE' : 'PEEK'}
              </button>
            )}
          </div>
          <div className="flex justify-center gap-2 min-h-[2.5rem] items-center">
            {myDice
              ? (showDice
                  ? myDice.map((d, i) => <Die key={i} value={d} accent={myKey} />)
                  : myDice.map((_, i) => <span key={i} className={cn('text-3xl leading-none', myAccent)}>▦</span>))
              : <span className="font-pixel text-[9px] text-retro-dim">NOT ROLLED YET</span>}
          </div>
        </div>
      )}

      {/* ROLLING phase */}
      {phase === 'rolling' && (
        <div className="text-center space-y-3">
          {!isSpectator && !myDice && (
            <button
              onClick={handleRoll}
              disabled={busy}
              className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-40"
            >
              ROLL DICE
            </button>
          )}
          {!isSpectator && myDice && (
            <p className="font-pixel text-[9px] text-retro-win text-glow-win arcade-blink">
              ROLLED ✓ — WAITING FOR {opName}…
            </p>
          )}
          {isSpectator && (
            <p className="font-pixel text-[9px] text-retro-dim">PLAYERS ARE ROLLING…</p>
          )}
        </div>
      )}

      {/* BIDDING phase */}
      {phase === 'bidding' && (
        <div className="space-y-3">
          {/* Current bid */}
          <div className="bg-retro-surface border border-retro-border rounded p-3 text-center space-y-1">
            <p className="font-pixel text-[8px] text-retro-dim">CURRENT BID</p>
            {lastBid ? (
              <p className="font-pixel text-sm">
                <span className="text-retro-cta text-glow-cta">{lastBid.qty}</span>
                <span className="text-retro-dim"> × </span>
                <span className={lastBid.by === 'X' ? 'text-retro-p1 text-glow-p1' : 'text-retro-p2 text-glow-p2'}>
                  {DIE_GLYPH[lastBid.face]}
                </span>
                <span className="font-mono text-[10px] text-retro-dim"> ({lastBid.face}s, 1s wild)</span>
              </p>
            ) : (
              <p className="font-pixel text-[10px] text-retro-dim">NO BID YET — OPEN THE BIDDING</p>
            )}
          </div>

          {/* Turn status */}
          <p className="text-center font-pixel text-[10px]">
            {isSpectator ? (
              <span className="text-retro-dim">{turn === 'X' ? (game.players?.X?.name || 'X') : (game.players?.O?.name || 'O')}&apos;S TURN</span>
            ) : turn === mySymbol ? (
              <span className="text-retro-cta text-glow-cta arcade-blink">YOUR TURN — RAISE OR CALL</span>
            ) : (
              <span className="text-retro-dim">WAITING FOR {opName}…</span>
            )}
          </p>

          {/* Bid controls — only on my turn */}
          {!isSpectator && turn === mySymbol && (
            <div className="space-y-3">
              <div className="flex items-end justify-center gap-3">
                <div className="flex flex-col items-center gap-1">
                  <span className="font-pixel text-[8px] text-retro-dim">QTY</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setBidQty(q => Math.max(1, q - 1))}
                      className="w-11 h-11 font-pixel text-xs border border-retro-border rounded text-retro-text hover:border-retro-p1/50 active:scale-90"
                    >−</button>
                    <span className="font-pixel text-base text-retro-cta text-glow-cta w-6 text-center">{bidQty}</span>
                    <button
                      onClick={() => setBidQty(q => Math.min(myDiceCount + opDiceCount, q + 1))}
                      className="w-11 h-11 font-pixel text-xs border border-retro-border rounded text-retro-text hover:border-retro-p1/50 active:scale-90"
                    >+</button>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="font-pixel text-[8px] text-retro-dim">FACE</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setBidFace(f => Math.max(1, f - 1))}
                      className="w-11 h-11 font-pixel text-xs border border-retro-border rounded text-retro-text hover:border-retro-p1/50 active:scale-90"
                    >−</button>
                    <span className="text-2xl leading-none text-retro-cta text-glow-cta w-7 text-center">{DIE_GLYPH[bidFace]}</span>
                    <button
                      onClick={() => setBidFace(f => Math.min(FACES, f + 1))}
                      className="w-11 h-11 font-pixel text-xs border border-retro-border rounded text-retro-text hover:border-retro-p1/50 active:scale-90"
                    >+</button>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={handleBid}
                  disabled={busy}
                  className="flex-1 max-w-[10rem] py-2.5 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-40"
                >
                  RAISE BID
                </button>
                <button
                  onClick={handleCallLiar}
                  disabled={busy || !lastBid}
                  className="flex-1 max-w-[10rem] py-2.5 border-2 border-retro-p2 text-retro-p2 font-pixel text-[10px] rounded hover:shadow-neon-p2 hover:bg-retro-tint-p2 transition-all active:scale-95 disabled:opacity-30 disabled:cursor-default"
                >
                  CALL LIAR!
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* REVEAL phase */}
      {phase === 'reveal' && (
        <RevealPanel
          round={round}
          game={game}
          mySymbol={mySymbol}
          myKey={myKey}
          opName={opName}
          isSpectator={isSpectator}
          matchWinner={matchWinner}
          onNextRound={handleNextRound}
          onSwitchGame={onSwitchGame}
          proposal={proposal}
        />
      )}

      {!opponentOnline && !isSpectator && phase !== 'reveal' && <OfflineNotice label="OPPONENT" />}

      {!proposal && phase !== 'reveal' && onSwitchGame && (
        <GameSwitcher currentType="bluff" onSwitch={onSwitchGame} />
      )}
    </div>
  )
}

function RevealPanel({
  round, game, mySymbol, myKey, opName,
  isSpectator, matchWinner, onNextRound, onSwitchGame, proposal,
}) {
  const outcome = round.outcome
  const revealX = round.revealX
  const revealO = round.revealO
  const bothRevealed = revealX && revealO

  const diceX = toDice(revealX?.dice)
  const diceO = toDice(revealO?.dice)

  if (!outcome || !bothRevealed) {
    return (
      <div className="text-center space-y-2 py-4">
        <p className="font-pixel text-xs text-retro-p2 text-glow-p2 arcade-blink">LIAR CALLED!</p>
        <p className="font-pixel text-[9px] text-retro-dim">REVEALING CUPS…</p>
      </div>
    )
  }

  const bid = outcome.bid
  const allCount = countFace([...diceX, ...diceO], bid.face, true)
  const iLost = !isSpectator && outcome.loser === mySymbol

  return (
    <div className="space-y-3">
      <p className="text-center font-pixel text-xs text-retro-p2 text-glow-p2">SHOWDOWN!</p>

      {/* Both cups laid bare */}
      <div className="grid grid-cols-2 gap-2">
        <CupReveal
          label={isSpectator ? (game.players?.X?.name || 'X') : (myKey === 'X' ? 'YOU' : opName)}
          dice={diceX} face={bid.face} accent="X"
        />
        <CupReveal
          label={isSpectator ? (game.players?.O?.name || 'O') : (myKey === 'O' ? 'YOU' : opName)}
          dice={diceO} face={bid.face} accent="O"
        />
      </div>

      {/* Tally */}
      <div className="bg-retro-surface border border-retro-border rounded p-3 text-center space-y-1">
        <p className="font-mono text-[10px] text-retro-dim">
          BID: <span className="text-retro-cta">{bid.qty} × {DIE_GLYPH[bid.face]}</span> (1s wild)
        </p>
        <p className="font-pixel text-[10px] text-retro-text">
          ACTUAL {bid.face}s + WILDS: <span className="text-retro-cta text-glow-cta">{allCount}</span>
        </p>
        <p className="font-pixel text-[9px] text-retro-dim">
          {outcome.bidMet ? 'BID WAS TRUE — CALLER LOSES A DIE' : 'BID WAS A BLUFF — BIDDER LOSES A DIE'}
        </p>
        {outcome.cheat && (
          <p className="font-pixel text-[9px] text-retro-p2 text-glow-p2"
             style={{ animation: 'blink-text 0.6s step-end infinite' }}>
            ⚠ {outcome.cheat === mySymbol ? 'YOU' : opName} CHEATED — DIE FORFEIT
          </p>
        )}
      </div>

      {/* Outcome line */}
      {!isSpectator && (
        <p className={cn(
          'text-center font-pixel text-sm',
          iLost ? 'text-retro-p2 text-glow-p2' : 'text-retro-cta text-glow-cta',
        )}>
          {iLost ? 'YOU LOSE A DIE' : `${opName} LOSES A DIE`}
        </p>
      )}

      {/* Match / next-round controls */}
      {matchWinner ? (
        <GameStatus
          status="finished"
          winner={game.winner}
          mySymbol={mySymbol}
          scores={game.scores}
          players={game.players}
          gameType={game.gameType}
          onNewMatch={null}
          onSwitchGame={!proposal ? onSwitchGame : null}
        />
      ) : (
        !isSpectator && (
          <div className="text-center space-y-2">
            <button
              onClick={onNextRound}
              className="px-6 py-2.5 font-pixel text-[10px] border-2 border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 hover:bg-retro-tint-p1 transition-all active:scale-95"
            >
              NEXT ROUND
            </button>
            {onSwitchGame && !proposal && (
              <GameSwitcher currentType="bluff" onSwitch={onSwitchGame} />
            )}
          </div>
        )
      )}
    </div>
  )
}

function CupReveal({ label, dice, face, accent }) {
  return (
    <div className="bg-retro-card border border-retro-border rounded p-3 space-y-2">
      <p className={cn(
        'font-pixel text-[8px] text-center truncate',
        accent === 'X' ? 'text-retro-p1' : 'text-retro-p2',
      )}>
        {label}
      </p>
      <div className="flex flex-wrap justify-center gap-1">
        {dice.map((d, i) => {
          const counts = d === face || d === 1
          return (
            <span
              key={i}
              className={cn(
                'text-2xl leading-none',
                counts
                  ? (accent === 'X' ? 'text-retro-p1 text-glow-p1' : 'text-retro-p2 text-glow-p2')
                  : 'text-retro-dim opacity-50',
              )}
            >
              {DIE_GLYPH[d] ?? '?'}
            </span>
          )
        })}
      </div>
    </div>
  )
}
