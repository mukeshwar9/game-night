import { useEffect, useMemo, useRef } from 'react'
import { ref, runTransaction } from 'firebase/database'
import { toast } from 'sonner'
import { db } from '../lib/firebase'
import { CoopEndActions, CoopTeamBar } from '../components/CoopShell'
import GameSwitcher from '../components/GameSwitcher'
import UpdraftArena from '../components/UpdraftArena'
import { ThumbBand } from '../components/UpdraftControls'
import TouchCoachmark from '../components/TouchCoachmark'
import useServerClock from '../hooks/useServerClock'
import { useUpdraftControls } from '../hooks/useUpdraftControls'
import { settleRoom, useHiddenFall, useRoomWriter, useSeatSync, useUpdraftAutoStart } from '../hooks/useUpdraftRoom'
import { playRunSounds, useUpdraftRun } from '../hooks/useUpdraftRun'
import {
  COOP_GOAL_Y, COOP_LIMIT_MS, COOP_LIVES, COUNTDOWN_MS, VIEW_H, checkpointFor, closedGateAbove, coopOutcome,
  createRun, generateTower, keysEarned, normalizeKeys, normalizeSeat, respawnRun, toMetres,
} from '../lib/updraftLogic'
import { sounds } from '../lib/sounds'

// UPDRAFT co-op — Twin Towers. Each seat climbs its own copy of one seeded
// tower; every GATE_EVERY there is a gate only the PARTNER can open, by
// grabbing (or climbing past) the matching key on their own tower. The team
// shares COOP_LIVES falls — a fall respawns you at your last gate — and wins
// together when both reach the flag before the timer runs out. Keys land in
// `updraft/keys/{seat}`; lives and the run's end are whole-room transactions
// (a clear credits both seats, the co-op scoring precedent).

const RESPAWN_MS = 900

function playerName(game, sym) {
  return game.players?.[sym]?.name?.toUpperCase() ?? sym
}

export default function UpdraftCoopGame({
  gameId, game, mySymbol, opponentOnline, onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const isSpectator = !mySymbol
  const me = mySymbol === 'O' ? 'O' : 'X'
  const op = me === 'X' ? 'O' : 'X'
  const u = game.updraft ?? {}
  const seed = u.seed ?? null
  const lives = Number.isFinite(Number(u.lives)) ? Number(u.lives) : COOP_LIVES
  const tower = useMemo(() => (seed != null ? generateTower(seed, { coop: true, top: COOP_GOAL_Y }) : null), [seed])
  const remote = { X: normalizeSeat(u.X), O: normalizeSeat(u.O) }
  const keys = { X: normalizeKeys(u.keys?.X), O: normalizeKeys(u.keys?.O) }
  const write = useRoomWriter(gameId)

  const { startedAt, bothSeated } = useUpdraftAutoStart({ gameId, game, isSpectator, opponentOnline })
  const { now } = useServerClock({ tickMs: 250, ticking: game.status === 'playing' })
  const liveAt = startedAt != null ? startedAt + COUNTDOWN_MS : null
  const isCountdown = liveAt != null && now < liveAt
  const isRacing = liveAt != null && now >= liveAt && game.status === 'playing'
  const timeUp = liveAt != null && now >= liveAt + COOP_LIMIT_MS

  const arenaRef = useRef(null)
  const touchRef = useRef(null)
  const controls = useUpdraftControls(arenaRef, touchRef, isRacing && !isSpectator)
  const partnerKeysRef = useRef(keys[op])
  useEffect(() => { partnerKeysRef.current = keys[op] })

  const respawnTimer = useRef(null)
  const climber = useUpdraftRun({
    tower,
    active: isRacing && !isSpectator,
    readInput: controls.readInput,
    envFor: (r) => ({ goal: COOP_GOAL_Y, ceiling: closedGateAbove(tower, r.y, partnerKeysRef.current) }),
    onEvents: (events) => {
      playRunSounds(events, sounds)
      if (events.some(e => e.type === 'fall')) loseLife()
    },
  })
  const run = climber.run

  // A fall spends a shared life on its own path, so it never contends with
  // the partner's seat stream; the run ends (at 0) through the outcome below.
  const loseLife = () => {
    runTransaction(ref(db, `games/${gameId}/updraft/lives`), (v) => (typeof v === 'number' ? Math.max(0, v - 1) : undefined))
      .then(({ committed, snapshot }) => {
        if (!committed || !(snapshot.val() > 0)) return
        respawnTimer.current = setTimeout(() => {
          const r = climber.runRef.current
          climber.setRun(respawnRun(r, tower, checkpointFor(tower, r.best)))
        }, RESPAWN_MS)
      })
      .catch(() => toast.error('SYNC FAILED — CHECK CONNECTION'))
  }
  useEffect(() => () => clearTimeout(respawnTimer.current), [])

  // New run (new seed): a fresh climber. A reload mid-run starts back at the
  // last gate passed.
  const seenSeed = useRef(null)
  useEffect(() => {
    if (!tower || seenSeed.current === seed) return
    seenSeed.current = seed
    clearTimeout(respawnTimer.current)
    const mine = normalizeSeat(game.updraft?.[me])
    if (mine.top) climber.setRun({ ...createRun(), best: mine.best, top: true, y: mine.y })
    else if (mine.best > 0) climber.setRun({ ...respawnRun(createRun(), tower, checkpointFor(tower, mine.best)), best: mine.best })
    else climber.setRun(createRun())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per seed
  }, [seed, tower])

  useHiddenFall({
    active: isRacing && !isSpectator && !run.dead && !run.top,
    onFall: () => {
      if (climber.runRef.current.dead) return
      climber.setRun({ ...climber.runRef.current, dead: true })
      loseLife()
    },
  })

  // Publish every key I have earned (grabbed, or its gate climbed past).
  const earned = tower && !isSpectator ? keysEarned(tower, run) : []
  const missing = earned.filter(g => !keys[me][g])
  useEffect(() => {
    if (!missing.length || !isRacing) return
    const patch = {}
    for (const g of missing) patch[`updraft/keys/${me}/${g}`] = true
    write(patch)
  }, [missing.join(','), isRacing]) // eslint-disable-line react-hooks/exhaustive-deps -- keyed by the missing set

  const wentLive = useRef(false)
  useEffect(() => {
    if (isRacing && !wentLive.current) {
      wentLive.current = true
      if (!isSpectator) sounds.go()
    }
    if (!isRacing) wentLive.current = false
  }, [isRacing, isSpectator])

  // Settle the run: both at the flag → cleared (both scores +1); no lives
  // left or the timer running out → failed.
  const seats = isSpectator ? remote : { [me]: normalizeSeat(run), [op]: remote[op] }
  const outcome = isRacing ? coopOutcome({ ...seats, lives }, { timeUp }) : null
  useSeatSync({ write, me: isSpectator ? null : me, run, active: isRacing || run.top, quiet: !!outcome })
  useEffect(() => {
    if (!outcome || isSpectator || game.status !== 'playing') return
    settleRoom(gameId, (current) => {
      if (current.status !== 'playing' || current.updraft?.seed !== seed) return
      const next = { ...current, status: 'finished', winner: 'draw', updraft: { ...current.updraft, result: outcome }, lastActivityAt: Date.now() }
      if (outcome === 'cleared') next.scores = { X: (current.scores?.X || 0) + 1, O: (current.scores?.O || 0) + 1 }
      return next
    }, 'RUN RESULT FAILED — CHECK CONNECTION')
  }, [outcome, isSpectator, game.status, gameId, seed])

  if (!tower) return <p className="text-center font-pixel text-[9px] text-retro-dim">GET READY…</p>

  const heights = isSpectator ? { X: remote.X.best, O: remote.O.best } : { [me]: run.best, [op]: remote[op].best }
  const remaining = liveAt != null ? Math.max(0, Math.ceil((liveAt + COOP_LIMIT_MS - now) / 1000)) : null
  const clock = remaining != null ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : '3:00'
  const hearts = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, COOP_LIVES - lives))
  const cleared = Math.min(game.scores?.X || 0, game.scores?.O || 0)
  const partnerName = playerName(game, op)

  const viewSide = isSpectator ? (remote.X.y >= remote.O.y ? 'X' : 'O') : me
  const otherSide = viewSide === 'X' ? 'O' : 'X'
  const view = isSpectator
    ? { ...createRun(), x: Number(u[viewSide]?.x) || 0, y: remote[viewSide].y, best: remote[viewSide].best, camY: Math.max(-80, remote[viewSide].y - VIEW_H * 0.4) }
    : run
  const gateKeys = keys[otherSide]
  const gates = tower.gates.map((gy, i) => ({
    y: gy,
    open: !!gateKeys[i + 1],
    label: gateKeys[i + 1] ? `GATE ${i + 1} OPEN` : `GATE ${i + 1} · ${isSpectator ? playerName(game, otherSide) : partnerName} HAS THE KEY`,
  }))
  const liveMsg = `Team heights: X ${toMetres(heights.X)} metres, O ${toMetres(heights.O)} metres. ${lives} lives left.`

  const preRace = (() => {
    if (game.status !== 'playing') return null
    if (isCountdown) {
      const secs = Math.max(1, Math.ceil((liveAt - now) / 1000))
      return (
        <>
          <p className="font-pixel text-4xl text-retro-cta text-glow-cta tabular-nums" aria-live="assertive">{secs}</p>
          <p className="font-pixel text-[8px] text-retro-dim leading-relaxed">
            BOTH REACH {toMetres(COOP_GOAL_Y)}m<br />YOUR ⚷ KEYS OPEN {partnerName}&apos;S GATES
          </p>
        </>
      )
    }
    if (startedAt == null) {
      return (
        <p className="font-pixel text-[9px] text-retro-dim leading-relaxed">
          {!bothSeated ? 'WAITING FOR A PARTNER' : !opponentOnline && !isSpectator ? 'WAITING FOR PARTNER TO RECONNECT' : 'GET READY…'}
        </p>
      )
    }
    if (!isSpectator && run.top && !remote[op].top) {
      return <p className="font-pixel text-[9px] text-retro-win leading-relaxed">YOU MADE IT!<br />CHEER {partnerName} ON</p>
    }
    if (!isSpectator && run.dead) return <p className="font-pixel text-[9px] text-retro-danger">FELL — BACK TO YOUR LAST GATE</p>
    return null
  })()

  const arena = (
    <UpdraftArena
      ref={arenaRef}
      tower={tower}
      run={view}
      mySide={viewSide}
      ghost={{ x: Number(u[otherSide]?.x) || 0, y: remote[otherSide].y, dead: remote[otherSide].dead }}
      ghostSide={otherSide}
      goal={COOP_GOAL_Y}
      gates={gates}
      keysOn={!isSpectator}
      rail={[{ side: 'X', y: heights.X }, { side: 'O', y: heights.O }]}
      hud={(
        <>
          <span className="px-1.5 py-1 rounded border border-retro-cta text-retro-cta bg-retro-deep/70" aria-label={`${lives} lives`}>{hearts}</span>
          <span className="px-1.5 py-1 rounded border border-retro-border text-retro-text bg-retro-deep/70 tabular-nums mr-5">{clock}</span>
        </>
      )}
      label={`Updraft co-op. ${liveMsg}`}
      overlay={preRace && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-retro-deep/80 text-center px-6">{preRace}</div>
      )}
    />
  )

  const teamBar = (
    <CoopTeamBar
      game={game}
      mySymbol={mySymbol}
      opponentOnline={opponentOnline}
      status={game.status === 'finished' ? (u.result === 'cleared' ? 'CLEARED!' : 'RUN OVER') : `${toMetres(heights.X)}m · ${toMetres(heights.O)}m`}
      tone={game.status === 'finished' ? (u.result === 'cleared' ? 'win' : 'bad') : undefined}
      stats={`RUNS CLEARED ${cleared}`}
    />
  )

  if (game.status === 'finished') {
    return (
      <div className="space-y-3 max-w-sm mx-auto">
        {teamBar}
        <p className="text-center font-pixel text-[9px] text-retro-cta leading-relaxed">
          {u.result === 'cleared' ? 'BOTH OF YOU REACHED THE FLAG!' : lives <= 0 ? 'OUT OF LIVES' : 'TIME RAN OUT'}
          <br />X {toMetres(heights.X)}m · O {toMetres(heights.O)}m
        </p>
        {!isSpectator && (
          <CoopEndActions gameType={game.gameType} onPlayAgain={onPlayAgain} onNewMatch={onNewMatch} onSwitchGame={onSwitchGame} proposal={proposal} playAgainLabel="CLIMB AGAIN" />
        )}
        <p className="sr-only" aria-live="polite">{liveMsg}</p>
      </div>
    )
  }

  if (isSpectator) {
    return (
      <div className="space-y-3 max-w-sm mx-auto">
        {teamBar}
        {arena}
        <p className="sr-only" aria-live="polite">{liveMsg}</p>
        {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
      </div>
    )
  }

  return (
    <div className="space-y-2 max-w-sm mx-auto">
      {teamBar}
      <div ref={touchRef} className="space-y-2 touch-none">
        {arena}
        <TouchCoachmark gameKey="updraft" gesture="drag" text="DRAG LEFT/RIGHT TO STEER" active={isCountdown} />
        <ThumbBand tilt={controls.tilt} setTilt={controls.setTilt} />
      </div>
      <p className="sr-only" aria-live="polite">{liveMsg}</p>
      {isRacing && !opponentOnline && (
        <p className="text-center font-pixel text-[8px] text-retro-dim">PARTNER OFFLINE — THEIR GATES WAIT FOR THEM</p>
      )}
    </div>
  )
}
