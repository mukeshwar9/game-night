import { useEffect, useMemo, useRef } from 'react'
import { push, ref } from 'firebase/database'
import { toast } from 'sonner'
import { db } from '../lib/firebase'
import GameStatus from '../components/GameStatus'
import GameSwitcher from '../components/GameSwitcher'
import UpdraftArena from '../components/UpdraftArena'
import { ThumbBand } from '../components/UpdraftControls'
import TouchCoachmark from '../components/TouchCoachmark'
import useBusy from '../hooks/useBusy'
import useServerClock from '../hooks/useServerClock'
import { useUpdraftControls } from '../hooks/useUpdraftControls'
import { useUpdraftHazards } from '../hooks/useUpdraftHazards'
import { settleRoom, useHiddenFall, useRoomWriter, useSeatSync, useUpdraftAutoStart } from '../hooks/useUpdraftRoom'
import { playRunSounds, useUpdraftRun } from '../hooks/useUpdraftRun'
import {
  COUNTDOWN_MS, MATCH_TARGET, ROUND_LIMIT_MS, SUMMIT_Y, UPDRAFT_MODES, VIEW_H, createRun, generateTower,
  getUpdraftMode, hazardForPickup, normalizeHazards, normalizeSeat, raceOutcome, toMetres,
} from '../lib/updraftLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// UPDRAFT versus — the Ghost Race. Both seats climb the same seeded tower at
// once; each phone simulates only its own hopper and streams progress to
// `updraft/{seat}` for the rival's ghost and height rail (the Arrows race
// model: no shared physics, so latency never touches the controls). First to
// the summit takes the round; a climber who falls loses once the other
// passes their best height. CHAOS mode (the host's lobby pick, default)
// turns pickups into hazards pushed to `updraft/haz/{rival}`. One guarded
// transaction settles the round, so a photo finish goes to whoever lands it.

function playerName(game, sym) {
  return game.players?.[sym]?.name?.toUpperCase() ?? sym
}

export default function UpdraftGame({
  gameId, game, mySymbol, opponentOnline, onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const isSpectator = !mySymbol
  const me = mySymbol === 'O' ? 'O' : 'X'
  const op = me === 'X' ? 'O' : 'X'
  const u = game.updraft ?? {}
  const seed = u.seed ?? null
  const mode = getUpdraftMode(u.mode)
  const chaos = mode === 'chaos'
  const tower = useMemo(() => (seed != null ? generateTower(seed) : null), [seed])
  const remote = { X: normalizeSeat(u.X), O: normalizeSeat(u.O) }
  const write = useRoomWriter(gameId)

  const { startedAt, bothSeated } = useUpdraftAutoStart({ gameId, game, isSpectator, opponentOnline })
  const { now } = useServerClock({ tickMs: 250, ticking: game.status === 'playing' })
  const liveAt = startedAt != null ? startedAt + COUNTDOWN_MS : null
  const isCountdown = liveAt != null && now < liveAt
  const isRacing = liveAt != null && now >= liveAt && game.status === 'playing'
  const timeUp = liveAt != null && now >= liveAt + ROUND_LIMIT_MS

  const arenaRef = useRef(null)
  const touchRef = useRef(null)
  const controls = useUpdraftControls(arenaRef, touchRef, isRacing && !isSpectator)

  const climber = useUpdraftRun({
    tower,
    active: isRacing && !isSpectator,
    readInput: controls.readInput,
    envFor: () => ({ goal: SUMMIT_Y, pickups: chaos, drift: hazards.drift() }),
    onEvents: (events) => {
      playRunSounds(events, sounds)
      if (!chaos) return
      for (const e of events) {
        if (e.type === 'pickup') {
          push(ref(db, `games/${gameId}/updraft/haz/${op}`), { k: hazardForPickup(seed, e.id), at: Date.now() })
            .catch(() => toast.error('SYNC FAILED — CHECK CONNECTION'))
        }
      }
    },
  })
  const hazards = useUpdraftHazards({ tower, runRef: climber.runRef, setRun: climber.setRun })
  const run = climber.run

  // New round (new seed): a fresh climber. A reload mid-round cannot restore
  // the exact jump, so it resumes as a fall at the reported best height.
  const seenSeed = useRef(null)
  const handled = useRef(new Set())
  useEffect(() => {
    if (seed == null || seenSeed.current === seed) return
    seenSeed.current = seed
    hazards.reset()
    handled.current = new Set()
    const mine = normalizeSeat(game.updraft?.[me])
    const midRound = game.updraft?.startedAt != null && (mine.best > 0 || mine.dead || mine.top)
    climber.setRun(midRound ? { ...createRun(), best: mine.best, dead: !mine.top, top: mine.top } : createRun())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per seed
  }, [seed])

  useHiddenFall({
    active: isRacing && !isSpectator && !run.dead && !run.top,
    onFall: () => climber.setRun({ ...climber.runRef.current, dead: true }),
  })

  // Incoming hazards: each pushed id plays once, and only this round's.
  const incoming = normalizeHazards(u.haz?.[me])
  useEffect(() => {
    if (!isRacing || isSpectator || !chaos) return
    for (const h of incoming) {
      if (handled.current.has(h.id)) continue
      handled.current.add(h.id)
      if (!run.dead && !run.top) {
        sounds.buzz()
        hazards.receive(h)
      }
    }
  })

  const wentLive = useRef(false)
  useEffect(() => {
    if (isRacing && !wentLive.current) {
      wentLive.current = true
      if (!isSpectator) sounds.go()
    }
    if (!isRacing) wentLive.current = false
  }, [isRacing, isSpectator])

  // Settle the round from whichever client sees it decided first. My own
  // climber is read locally (fresher than my echo); the rival's from Firebase.
  const seats = isSpectator ? remote : { [me]: normalizeSeat(run), [op]: remote[op] }
  const outcome = isRacing ? raceOutcome(seats, { timeUp }) : null
  useSeatSync({ write, me: isSpectator ? null : me, run, active: isRacing || run.dead || run.top, quiet: !!outcome })
  useEffect(() => {
    if (!outcome || isSpectator || game.status !== 'playing') return
    settleRoom(gameId, (current) => {
      if (current.status !== 'playing' || current.updraft?.seed !== seed) return
      const scores = { ...(current.scores || {}) }
      if (outcome !== 'draw') scores[outcome] = (scores[outcome] || 0) + 1
      return { ...current, winner: outcome, status: 'finished', scores, lastActivityAt: Date.now() }
    })
  }, [outcome, isSpectator, game.status, gameId, seed])

  const [modeBusy, runMode] = useBusy()
  const setMode = (id) => runMode(
    () => write({ 'updraft/mode': id }),
    () => toast.error("COULDN'T SET THE MODE — TRY AGAIN"),
  )

  const scoreX = game.scores?.X || 0
  const scoreO = game.scores?.O || 0
  const matchOver = scoreX >= MATCH_TARGET || scoreO >= MATCH_TARGET
  const heights = isSpectator ? { X: remote.X.best, O: remote.O.best } : { [me]: run.best, [op]: remote[op].best }
  const remaining = liveAt != null ? Math.max(0, Math.ceil((liveAt + ROUND_LIMIT_MS - now) / 1000)) : null

  const header = (
    <div className="flex items-center justify-between font-pixel text-[9px] text-retro-dim tracking-wider">
      <span className={chaos ? 'text-retro-p2' : undefined}>{UPDRAFT_MODES[mode].label}{remaining != null && isRacing ? ` · ${remaining}s` : ''}</span>
      <span className="tabular-nums">
        <span className="text-retro-p1">{scoreX}</span> – <span className="text-retro-p2">{scoreO}</span>
        <span className="ml-1.5">FIRST TO {MATCH_TARGET}</span>
      </span>
    </div>
  )

  const status = (sym) => {
    const s = sym === me && !isSpectator ? normalizeSeat(run) : remote[sym]
    return s.top ? '⚑' : s.dead ? '✕' : ''
  }
  const hud = (
    <>
      {['X', 'O'].map(sym => (
        <span
          key={sym}
          className={cn(
            'px-1.5 py-1 rounded border bg-retro-deep/70 truncate max-w-[45%]',
            sym === 'X' ? 'border-retro-p1 text-retro-p1' : 'border-retro-p2 text-retro-p2 mr-5',
          )}
        >
          {sym === mySymbol ? 'YOU' : playerName(game, sym)} {toMetres(heights[sym])}m {status(sym)}
        </span>
      ))}
    </>
  )

  if (!tower) return <p className="text-center font-pixel text-[9px] text-retro-dim">GET READY…</p>

  const liveMsg = game.status === 'finished'
    ? `Round over. ${game.winner === 'draw' ? 'Draw.' : `${playerName(game, game.winner)} wins the round.`}`
    : `X ${toMetres(heights.X)} metres, O ${toMetres(heights.O)} metres.`

  // Spectators watch the leader: the camera follows the higher climber.
  const spectatorRun = () => {
    const lead = remote.X.y >= remote.O.y ? 'X' : 'O'
    const s = remote[lead]
    return { ...createRun(), x: Number(u[lead]?.x) || 0, y: s.y, best: s.best, dead: s.dead, camY: Math.max(-80, s.y - VIEW_H * 0.4), lead }
  }
  const view = isSpectator ? spectatorRun() : run
  const viewSide = isSpectator ? view.lead : me
  const ghostSide = isSpectator ? (view.lead === 'X' ? 'O' : 'X') : op
  const ghostSeat = remote[ghostSide]

  const preRace = (() => {
    if (game.status !== 'playing') return null
    if (isCountdown) {
      const secs = Math.max(1, Math.ceil((liveAt - now) / 1000))
      return (
        <>
          <p className="font-pixel text-4xl text-retro-cta text-glow-cta tabular-nums" aria-live="assertive">{secs}</p>
          <p className="font-pixel text-[8px] text-retro-dim leading-relaxed">SAME TOWER FOR BOTH<br />FIRST TO {toMetres(SUMMIT_Y)}m WINS</p>
        </>
      )
    }
    if (startedAt == null) {
      return (
        <p className="font-pixel text-[9px] text-retro-dim leading-relaxed">
          {!bothSeated ? 'WAITING FOR A RIVAL' : !opponentOnline && !isSpectator ? 'WAITING FOR OPPONENT TO RECONNECT' : 'GET READY…'}
        </p>
      )
    }
    if (!isSpectator && run.dead) {
      return (
        <>
          <p className="font-pixel text-sm text-retro-danger">YOU FELL AT {toMetres(run.best)}m</p>
          <p className="font-pixel text-[8px] text-retro-dim leading-relaxed">
            {playerName(game, op)} MUST PASS {toMetres(run.best)}m TO WIN
          </p>
        </>
      )
    }
    return null
  })()

  const arena = (
    <UpdraftArena
      ref={arenaRef}
      tower={tower}
      run={view}
      mySide={viewSide}
      ghost={{ x: Number(u[ghostSide]?.x) || 0, y: ghostSeat.y, dead: ghostSeat.dead }}
      ghostSide={ghostSide}
      goal={SUMMIT_Y}
      pickupsOn={chaos && !isSpectator}
      fog={!isSpectator && hazards.fog}
      gust={isSpectator ? 0 : hazards.gust}
      banner={isSpectator ? null : hazards.banner}
      rail={[{ side: 'X', y: heights.X }, { side: 'O', y: heights.O }]}
      hud={hud}
      label={`Updraft race. ${liveMsg}`}
      overlay={preRace && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-retro-deep/80 text-center px-6">{preRace}</div>
      )}
    />
  )

  if (game.status === 'finished') {
    const w = game.winner
    const why = w === 'X' || w === 'O'
      ? (remote[w].top || (w === me && run.top)
        ? `${w === mySymbol ? 'YOU' : playerName(game, w)} REACHED THE SUMMIT`
        : `${w === mySymbol ? 'YOU' : playerName(game, w)} CLIMBED HIGHER`)
      : 'SAME HEIGHT — DRAW'
    return (
      <div className="space-y-3 max-w-sm mx-auto">
        {header}
        <p className="text-center font-pixel text-[9px] text-retro-cta">{why}</p>
        <div className="grid grid-cols-2 gap-2 font-pixel text-[9px] text-center">
          {['X', 'O'].map(sym => (
            <div key={sym} className={cn('rounded border-2 p-2 bg-retro-card', sym === 'X' ? 'border-retro-p1 text-retro-p1' : 'border-retro-p2 text-retro-p2')}>
              {sym === mySymbol ? 'YOU' : playerName(game, sym)}<br />{toMetres(heights[sym])}m {status(sym)}
            </div>
          ))}
        </div>
        {mySymbol === 'X' && !matchOver && (
          <div className="flex justify-center gap-2" role="group" aria-label="Next round mode">
            {Object.values(UPDRAFT_MODES).map(m => (
              <button
                key={m.id}
                type="button"
                disabled={modeBusy}
                onClick={() => m.id !== mode && setMode(m.id)}
                aria-pressed={mode === m.id}
                className={cn(
                  'min-h-11 px-3 rounded border-2 font-pixel text-[8px] disabled:opacity-50',
                  mode === m.id ? 'border-retro-cta text-retro-cta bg-retro-tint-cta' : 'border-retro-border text-retro-dim',
                )}
              >{modeBusy && mode !== m.id ? 'SETTING…' : `NEXT: ${m.label}`}</button>
            ))}
          </div>
        )}
        <GameStatus
          status={game.status}
          winner={game.winner}
          mySymbol={mySymbol}
          scores={game.scores}
          players={game.players}
          gameType={game.gameType}
          matchTarget={MATCH_TARGET}
          onPlayAgain={!matchOver && !proposal && !isSpectator ? onPlayAgain : null}
          onNewMatch={matchOver && !proposal && !isSpectator ? onNewMatch : null}
          onSwitchGame={!proposal && !isSpectator ? onSwitchGame : null}
        />
        <p className="sr-only" aria-live="polite">{liveMsg}</p>
      </div>
    )
  }

  if (isSpectator) {
    return (
      <div className="space-y-3 max-w-sm mx-auto">
        {header}
        <p className="text-center font-pixel text-[8px] text-retro-dim">SPECTATING — FOLLOWING THE LEADER</p>
        {arena}
        <p className="sr-only" aria-live="polite">{liveMsg}</p>
        {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
      </div>
    )
  }

  return (
    <div className="space-y-2 max-w-sm mx-auto">
      {header}
      <div ref={touchRef} className="space-y-2 touch-none">
        {arena}
        <TouchCoachmark gameKey="updraft" gesture="drag" text="DRAG LEFT/RIGHT TO STEER" active={isCountdown} />
        <ThumbBand tilt={controls.tilt} setTilt={controls.setTilt} />
      </div>
      <p className="sr-only" aria-live="polite">{liveMsg}</p>
      {isRacing && !opponentOnline && (
        <p className="text-center font-pixel text-[8px] text-retro-dim">OPPONENT OFFLINE — KEEP CLIMBING</p>
      )}
    </div>
  )
}
