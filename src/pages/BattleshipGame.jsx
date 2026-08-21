import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import BattleshipBoard from '../components/BattleshipBoard'
import GameStatus from '../components/GameStatus'
import SpectatorCard from '../components/SpectatorCard'
import OfflineNotice from '../components/loading/OfflineNotice'
import {
  FLEET_SPEC,
  shipCells,
  validateFleet,
  serializeFleet,
  randomFleet,
  gradeShot,
  allSunk,
  remainingShips,
  verifyTranscript,
} from '../lib/battleshipLogic'
import { commit } from '../lib/commit'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'
import { toast } from 'sonner'

// BATTLESHIP — hidden-information duel secured by salted-hash commit-reveal
// (docs/prds/battleship.md). Fleets live ONLY in localStorage until the reveal;
// the defender grades incoming shots from its local copy; verifyTranscript
// re-grades the whole transcript at reveal and voids cheaters.

const REVEAL_GRACE_MS = 30000

const fleetKey = gameId => `battleship-fleet-${gameId}`

function readSecret(gameId) {
  try { return JSON.parse(localStorage.getItem(fleetKey(gameId)) || 'null') } catch { return null }
}

function shotsArray(raw) {
  if (!raw) return []
  return Object.keys(raw)
    .sort()
    .map(key => ({ key, ...raw[key] }))
}

function cellsOf(fleet, ship) {
  const spec = FLEET_SPEC.find(s => s.ship === ship)
  return shipCells(spec.size, fleet[ship].orient, fleet[ship].cell)
}

export default function BattleshipGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const me = mySymbol === 'X' ? 'X' : 'O'
  const opp = me === 'X' ? 'O' : 'X'
  const isSpectator = !mySymbol

  const round = game.round || {}
  const phase = round.phase ?? 'placing'
  const commits = round.commits || {}
  const reveals = round.reveal || {}
  const verified = round.verified || {}

  const [secret, setSecret] = useState(() => readSecret(gameId))
  // Placement draft
  const [draft, setDraft] = useState({})
  const [selected, setSelected] = useState('carrier')
  const [placeError, setPlaceError] = useState('')
  const [readying, runReady] = useBusy()
  const [conceding, runConcede] = useBusy()

  const prevShotCount = useRef(0)
  const gradingRef = useRef(false)
  const verifyingRef = useRef(false)

  const shots = useMemo(() => shotsArray(round.shots), [round.shots])
  const myFleet = secret?.fleet ?? null
  const iCommitted = !!commits[me]
  const bothCommitted = !!commits.X && !!commits.O
  const myShots = useMemo(() => shots.filter(s => s.by === me), [shots, me])
  const oppShots = useMemo(() => shots.filter(s => s.by === opp), [shots, opp])
  const turn = round.turn ?? 'X'
  const myTurn = phase === 'battle' && turn === me
  const pendingGrade = shots.some(s => !s.result && s.by !== me)
  const lastMyShot = myShots[myShots.length - 1]
  const lastOppShot = oppShots[oppShots.length - 1]

  const myRemaining = useMemo(
    () => (myFleet ? remainingShips(myFleet, oppShots) : []),
    [myFleet, oppShots],
  )
  // Opponent ship status derives from MY shot results (sunk labels only).

  // ── Phase flip: both commits in → battle begins, X first ─────────────────
  useEffect(() => {
    if (phase !== 'placing' || !bothCommitted) return
    update(ref(db, `games/${gameId}/round`), { phase: 'battle', turn: 'X' }).catch(() => {})
  }, [phase, bothCommitted, gameId])

  // ── DEFENDER: grade ungraded opponent shots from my LOCAL fleet ──────────
  useEffect(() => {
    if (phase !== 'battle' || !myFleet || isSpectator) return
    const target = shots.find(s => !s.result && s.by !== me)
    if (!target || gradingRef.current) return
    gradingRef.current = true
    const run = async () => {
      try {
        const prior = shots.filter(s => s.cell !== target.cell && s.by !== me)
        const result = gradeShot(myFleet, target.cell, prior)
        if (result == null) {
          // Repeat/out-of-range shot slipped through — mark it dead.
          await update(ref(db, `games/${gameId}/round/shots/${target.key}`), { result: 'miss' })
          return
        }
        const updates = { [`round/shots/${target.key}/result`]: result }
        if (allSunk(myFleet, [...oppShots.map(s => ({ cell: s.cell })), { cell: target.cell }])) {
          // My fleet is gone — the shooter wins. Flip to reveal; verification follows.
          updates['round/phase'] = 'reveal'
          updates['round/result'] = { winner: target.by, reason: 'sunk' }
        } else {
          // Hit (or sink without ending the battle) = shoot again; miss flips.
          updates['round/turn'] = result === 'miss' ? (target.by === 'X' ? 'O' : 'X') : target.by
        }
        await update(ref(db, `games/${gameId}/round`), updates)
      } finally {
        gradingRef.current = false
      }
    }
    run()
  }, [phase, shots, myFleet, me, gameId, isSpectator]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Battle sounds (page-driven audio, hangwoman precedent) ───────────────
  useEffect(() => {
    const n = shots.length
    if (n === prevShotCount.current) return
    const fresh = shots.slice(prevShotCount.current)
    prevShotCount.current = n
    for (const s of fresh) {
      if (!s.result) continue
      if (s.by === me) {
        if (s.result.startsWith('sunk:')) sounds.bust()
        else if (s.result === 'hit') sounds.hit(4)
        else sounds.miss()
      }
    }
  }, [shots, me])

  // ── REVEAL: publish my { fleet, salt } once the phase opens ──────────────
  useEffect(() => {
    if (phase !== 'reveal' && phase !== 'done') return
    if (!secret || reveals[me]) return
    update(ref(db, `games/${gameId}/round/reveal/${me}`), secret).catch(() => {})
  }, [phase, secret, reveals, me, gameId])

  // Loser refuses to reveal → claim after grace.
  const [nowTs, setNowTs] = useState(() => Date.now())
  useEffect(() => {
    if (phase !== 'reveal') return
    const id = setInterval(() => setNowTs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [phase])
  useEffect(() => {
    if (phase !== 'reveal' || !isPlayerInRound(game)) return
    const bothRevealed = !!reveals.X && !!reveals.O
    if (bothRevealed) return
    const revealedAt = round.revealAt ?? null
    if (!revealedAt) {
      update(ref(db, `games/${gameId}/round`), { revealAt: Date.now() }).catch(() => {})
      return
    }
    if (nowTs - revealedAt < REVEAL_GRACE_MS) return
    // Grace expired — whoever still has their fleet published wins by forfeit.
    runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current?.round || current.status === 'finished') return
      if (current.round.reveal?.X && current.round.reveal?.O) return
      const winner = current.round.reveal?.X ? 'X' : 'O'
      return {
        ...current,
        status: 'finished',
        winner,
        scores: { ...current.scores, [winner]: (current.scores?.[winner] || 0) + 1 },
        round: { ...current.round, result: { winner, reason: 'forfeit' } },
      }
    }).catch(() => {})
  }, [phase, reveals, round.revealAt, nowTs, gameId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── VERIFY: re-grade the opponent's whole transcript at reveal ───────────
  useEffect(() => {
    if (phase !== 'reveal' && phase !== 'done') return
    const mine = reveals[me]
    const theirs = reveals[opp]
    if (!mine || !theirs || verified[me] != null || verifyingRef.current) return
    verifyingRef.current = true
    const run = async () => {
      try {
        const verdict = await verifyTranscript(
          theirs.fleet, theirs.salt, commits[opp],
          shots.filter(s => s.by === opp).map(s => ({ cell: s.cell, result: s.result })),
        )
        await update(ref(db, `games/${gameId}/round/verified`), { [me]: verdict.ok })
        if (!verdict.ok) {
          // Cheater caught — award the win to the honest side (me).
          await runTransaction(ref(db, `games/${gameId}`), current => {
            if (!current || current.status === 'finished') return
            return {
              ...current,
              status: 'finished',
              winner: me,
              scores: { ...current.scores, [me]: (current.scores?.[me] || 0) + 1 },
              round: { ...current.round, result: { winner: me, reason: 'cheat' } },
            }
          })
        }
      } finally {
        verifyingRef.current = false
      }
    }
    run()
  }, [phase, reveals, verified, commits, shots, me, opp, gameId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Final win transaction once BOTH sides verify clean ───────────────────
  useEffect(() => {
    if (game.status === 'finished') return
    if (!(verified.X && verified.O)) return
    runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current?.round?.result || current.status === 'finished') return
      const { winner } = current.round.result
      if (winner !== 'X' && winner !== 'O') return
      return {
        ...current,
        status: 'finished',
        winner,
        scores: { ...current.scores, [winner]: (current.scores?.[winner] || 0) + 1 },
      }
    }).catch(() => {})
  }, [verified, game.status, gameId])

  // ── Placement actions ─────────────────────────────────────────────────────
  const placeShip = useCallback((cell) => {
    if (!selected) return
    const orient = draft[selected]?.orient ?? 'h'
    const candidate = { ...draft, [selected]: { orient, cell } }
    const err = validateFleet(candidate)
    if (err && err.includes('overlap')) { setPlaceError('SHIPS OVERLAP'); return }
    if (err && err.includes('overflows')) { setPlaceError("DOESN'T FIT — ROTATE OR MOVE LEFT/UP"); return }
    setPlaceError('')
    const next = { ...candidate }
    setDraft(next)
    const nextMissing = FLEET_SPEC.find(s => !next[s.ship])
    setSelected(nextMissing?.ship ?? null)
  }, [draft, selected])

  const rotateSelected = () => {
    if (!selected) return
    setDraft(d => ({
      ...d,
      [selected]: { orient: d[selected]?.orient === 'v' ? 'h' : 'v', cell: d[selected]?.cell ?? 0 },
    }))
  }

  const randomize = () => {
    const fleet = randomFleet()
    setDraft(fleet)
    setSelected(null)
    setPlaceError('')
  }

  const clearDock = () => { setDraft({}); setSelected('carrier'); setPlaceError('') }

  const draftValid = validateFleet(draft) === null

  const handleReady = () => {
    if (!draftValid || readying) return
    runReady(async () => {
      const { hash, salt } = await commit(serializeFleet(draft))
      const newSecret = { fleet: draft, salt }
      try { localStorage.setItem(fleetKey(gameId), JSON.stringify(newSecret)) } catch { /* private mode */ }
      setSecret(newSecret)
      sounds.go()
      await update(ref(db, `games/${gameId}/round/commits`), { [me]: hash })
    }, () => toast.error('READY FAILED — CHECK CONNECTION'))
  }

  // ── Shooting ──────────────────────────────────────────────────────────────
  const handleShoot = useCallback((cell) => {
    if (!myTurn || !iCommitted) return
    if (myShots.some(s => s.cell === cell)) return
    update(ref(db, `games/${gameId}/round/shots`), {
      [`${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`]: { by: me, cell, result: null },
    }).catch(() => toast.error('SHOT FAILED — RETRY'))
  }, [myTurn, iCommitted, myShots, gameId, me])

  const handleConcede = () => {
    if (phase !== 'battle' || conceding) return
    runConcede(async () => {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.status === 'finished') return
        return {
          ...current,
          status: 'finished',
          winner: opp,
          scores: { ...current.scores, [opp]: (current.scores?.[opp] || 0) + 1 },
          round: { ...current.round, result: { winner: opp, reason: 'forfeit' } },
        }
      })
    }, () => toast.error('CONCEDE FAILED — RETRY'))
  }

  // ── Derived view models ───────────────────────────────────────────────────
  const shotsToMap = arr => Object.fromEntries(arr.filter(s => s.result).map(s => [s.cell, s.result]))
  const myWatersShots = shotsToMap(oppShots)
  const targetingShots = shotsToMap(myShots)
  const myFleetCells = useMemo(() => {
    if (!myFleet) {
      // During placement, render the draft instead.
      const set = new Set()
      for (const ship of Object.keys(draft)) cellsOf(draft, ship).forEach(c => set.add(c))
      return set
    }
    const set = new Set()
    for (const ship of Object.keys(myFleet)) cellsOf(myFleet, ship).forEach(c => set.add(c))
    return set
  }, [myFleet, draft])

  const matchOver = game.status === 'finished'
  const result = round.result
  const bothVerified = verified.X && verified.O

  // Reveal-time opponent fleet cells (fog lifts only after reveal).
  const oppRevealedFleet = reveals[opp]?.fleet ?? null
  const oppRevealedCells = useMemo(() => {
    if (!oppRevealedFleet) return null
    const set = new Set()
    for (const ship of Object.keys(oppRevealedFleet)) cellsOf(oppRevealedFleet, ship).forEach(c => set.add(c))
    return set
  }, [oppRevealedFleet])

  // -------------------------------------------------------------------------
  // SPECTATOR: two tracking views, zero fleet data.
  // -------------------------------------------------------------------------
  if (isSpectator) {
    return (
      <div className="space-y-4">
        <SpectatorCard />
        {phase === 'placing' ? (
          <p className="font-pixel text-[10px] text-retro-dim text-center arcade-blink py-6">
            RIVALS ARE DEPLOYING THEIR FLEETS…
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {['X', 'O'].map(sym => (
              <div key={sym} className="space-y-1">
                <p className="font-pixel text-[8px] text-retro-dim tracking-widest">
                  {sym} TARGETING
                </p>
                <BattleshipBoard
                  shots={shotsToMap(shots.filter(s => s.by === sym))}
                  accent={sym === 'X' ? 'p1' : 'p2'}
                />
              </div>
            ))}
          </div>
        )}
        {matchOver && result && (
          <p className="font-pixel text-[10px] text-retro-cta text-center">
            {(game.players?.[result.winner]?.name || result.winner)} WINS
            {result.reason === 'cheat' && ' — VERIFICATION FAILED'}
          </p>
        )}
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // PLACING PHASE
  // -------------------------------------------------------------------------
  if (phase === 'placing') {
    return (
      <div className="space-y-4">
        <div className="text-center space-y-1">
          <p className="font-pixel text-[10px] text-retro-p1 text-glow-p1">DEPLOY YOUR FLEET</p>
          <p className="font-mono text-[10px] text-retro-dim leading-relaxed">
            Tap a ship, then tap your waters. Your fleet never leaves this device
            until the reveal — only its hash is published.
          </p>
        </div>

        <div className="flex justify-center">
          <BattleshipBoard
            shots={{}}
            fleetCells={myFleetCells}
            onCell={placeShip}
            disabled={!!secret}
          />
        </div>

        {!secret && (
          <>
            {/* Ship dock */}
            <div className="space-y-1.5">
              {FLEET_SPEC.map(({ ship, size }) => {
                const placed = !!draft[ship]
                const isSelected = selected === ship
                return (
                  <button
                    key={ship}
                    onClick={() => !placed && setSelected(ship)}
                    disabled={placed}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2 rounded border-2 transition-all active:scale-[0.98]',
                      isSelected && !placed
                        ? 'border-retro-cta text-retro-cta shadow-neon-cta'
                        : placed
                          ? 'border-retro-win/60 text-retro-win opacity-70'
                          : 'border-retro-border text-retro-text hover:border-retro-p1/50',
                    )}
                  >
                    <span className="font-mono text-[11px] uppercase">{ship}</span>
                    <span className="font-pixel text-[9px] tracking-widest">
                      {placed ? '✓ DEPLOYED' : '■ '.repeat(size)}
                    </span>
                  </button>
                )
              })}
            </div>

            {placeError && (
              <p className="font-pixel text-[9px] text-retro-danger text-center">{placeError}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={rotateSelected}
                disabled={!selected}
                className="flex-1 py-2 font-pixel text-[9px] border border-retro-border text-retro-dim rounded hover:border-retro-p1/50 active:scale-95 disabled:opacity-40"
              >
                ⟳ ROTATE
              </button>
              <button
                onClick={randomize}
                className="flex-1 py-2 font-pixel text-[9px] border border-retro-border text-retro-dim rounded hover:border-retro-p1/50 active:scale-95"
              >
                ⚄ RANDOM
              </button>
              <button
                onClick={clearDock}
                className="flex-1 py-2 font-pixel text-[9px] border border-retro-border text-retro-dim rounded hover:border-retro-p2/50 active:scale-95"
              >
                ✕ CLEAR
              </button>
            </div>

            <button
              onClick={handleReady}
              disabled={!draftValid || readying}
              className="w-full py-2.5 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95 disabled:opacity-40"
            >
              {readying ? 'COMMITTING…' : draftValid ? 'READY — LOCK IN FLEET' : `PLACE ${5 - Object.keys(draft).length} MORE`}
            </button>
          </>
        )}

        {secret && (
          <p className="font-pixel text-[10px] text-retro-win text-glow-win text-center arcade-blink">
            FLEET COMMITTED ✓{iCommitted ? '' : ' — PUBLISHING…'}
            <br />
            <span className="text-retro-dim">
              WAITING FOR {opp === 'X' ? 'X' : 'O'} TO COMMIT…
            </span>
          </p>
        )}
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // BATTLE / REVEAL / DONE
  // -------------------------------------------------------------------------
  const showReveal = phase === 'reveal' || phase === 'done' || matchOver

  return (
    <div className="space-y-4">
      {opponentOnline === false && phase === 'battle' && (
        <OfflineNotice name={game.players?.[opp]?.name} />
      )}

      {/* Status line */}
      {!matchOver && (
        <div className="text-center space-y-1">
          {pendingGrade ? (
            <p className="font-pixel text-[10px] text-retro-p2 arcade-blink">
              SHOT FIRED — WAITING FOR RIVAL TO GRADE…
            </p>
          ) : myTurn ? (
            <p className="font-pixel text-[11px] text-retro-cta text-glow-cta arcade-blink">
              YOUR SHOT{lastMyShot?.result === 'hit' || lastMyShot?.result?.startsWith('sunk:') ? ' — HIT! GO AGAIN' : ''}
            </p>
          ) : (
            <p className="font-pixel text-[10px] text-retro-dim">
              RIVAL AIMS…
            </p>
          )}
        </div>
      )}

      {/* Grids */}
      <div className="grid sm:grid-cols-2 gap-4 justify-items-center">
        <div className="space-y-1 w-full max-w-[340px]">
          <p className="font-pixel text-[8px] text-retro-dim tracking-widest">
            TARGETING {myTurn && !matchOver && <span className="text-retro-cta">· YOUR SHOT</span>}
          </p>
          <BattleshipBoard
            shots={targetingShots}
            fleetCells={oppRevealedCells}
            lastCell={lastMyShot?.cell}
            onCell={handleShoot}
            disabled={!myTurn || pendingGrade || matchOver}
            accent={me === 'X' ? 'p1' : 'p2'}
          />
          {/* Enemy silhouettes */}
          <div className="flex flex-wrap gap-2 pt-1">
            {FLEET_SPEC.map(({ ship }) => {
              const sunkCount = myShots.filter(s => s.result === `sunk:${ship}`).length
              return (
                <span
                  key={ship}
                  className={cn(
                    'font-pixel text-[7px] uppercase px-1.5 py-0.5 rounded border',
                    sunkCount ? 'border-retro-win text-retro-win' : 'border-retro-border text-retro-dim',
                  )}
                >
                  {sunkCount ? `✕ ${ship}` : ship}
                </span>
              )
            })}
          </div>
        </div>

        <div className="space-y-1 w-full max-w-[340px]">
          <p className="font-pixel text-[8px] text-retro-dim tracking-widest">YOUR WATERS</p>
          <BattleshipBoard
            shots={myWatersShots}
            fleetCells={myFleetCells}
            lastCell={lastOppShot?.cell}
            accent={opp === 'X' ? 'p1' : 'p2'}
          />
          {/* Own fleet status */}
          <div className="flex flex-wrap gap-2 pt-1">
            {myRemaining.map(({ ship, sunk }) => (
              <span
                key={ship}
                className={cn(
                  'font-pixel text-[7px] uppercase px-1.5 py-0.5 rounded border',
                  sunk ? 'border-retro-danger text-retro-danger' : 'border-retro-p1 text-retro-p1',
                )}
              >
                {sunk ? `✕ ${ship}` : ship}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Reveal / verification banner */}
      {showReveal && !matchOver && (
        <div className="bg-retro-card border border-retro-border rounded p-3 text-center space-y-1">
          <p className="font-pixel text-[10px] text-retro-cta arcade-blink">FLEETS REVEALED — VERIFYING…</p>
          <p className="font-mono text-[10px] text-retro-dim">
            X VERDICT: {verified.X == null ? '…' : verified.X ? 'CLEAN ✓' : 'FAILED ✕'} ·
            O VERDICT: {verified.O == null ? '…' : verified.O ? 'CLEAN ✓' : 'FAILED ✕'}
          </p>
        </div>
      )}

      {/* Concede */}
      {phase === 'battle' && !matchOver && (
        <button
          onClick={handleConcede}
          disabled={conceding}
          className="w-full py-2 font-pixel text-[9px] border border-retro-border text-retro-dim rounded hover:border-retro-danger hover:text-retro-danger active:scale-95 disabled:opacity-40"
        >
          {conceding ? 'CONCEDING…' : 'CONCEDE THE BATTLE'}
        </button>
      )}

      {/* Storage-lost recovery */}
      {phase === 'battle' && !myFleet && (
        <div className="bg-retro-card border-2 border-retro-danger/60 rounded p-3 text-center space-y-2">
          <p className="font-pixel text-[9px] text-retro-danger">FLEET RECORD LOST ON THIS DEVICE</p>
          <p className="font-mono text-[10px] text-retro-dim leading-relaxed">
            Without your fleet you cannot grade rival shots honestly.<br />
            Concede to settle the round.
          </p>
          <button
            onClick={handleConcede}
            disabled={conceding}
            className="px-4 py-2 bg-retro-danger text-retro-bg font-pixel text-[9px] rounded active:scale-95 disabled:opacity-40"
          >
            {conceding ? 'CONCEDING…' : 'CONCEDE'}
          </button>
        </div>
      )}

      <GameStatus
        status={game.status}
        winner={game.winner}
        currentTurn={null}
        mySymbol={me}
        onPlayAgain={matchOver && onPlayAgain ? onPlayAgain : null}
      />

      {matchOver && result && (
        <p className="font-mono text-[10px] text-retro-dim text-center">
          {result.reason === 'cheat' && 'VERIFICATION FAILED — WIN AWARDED'}
          {result.reason === 'forfeit' && 'WIN BY FORFEIT'}
          {result.reason === 'sunk' && bothVerified && 'TRANSCRIPT VERIFIED ✓'}
        </p>
      )}

      {onSwitchGame && !proposal && matchOver && (
        <div className="text-center">
          {onNewMatch && !proposal && (
            <button
              onClick={onNewMatch}
              className="mb-2 px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
            >
              NEW MATCH
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function isPlayerInRound(game) {
  return !!(game.players?.X && game.players?.O)
}
