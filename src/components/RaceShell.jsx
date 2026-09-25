import { useEffect, useMemo, useRef } from 'react'
import { ref, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import useServerClock, { getServerNow } from '../hooks/useServerClock'
import useBusy from '@/hooks/useBusy'
import GameSwitcher from './GameSwitcher'
import RaceResults from './RaceResults'
import RoundEndPanel from './RoundEndPanel'
import Avatar from './Avatar'
import { isRoomCoordinator } from '../lib/coordinator'
import { scaledMs, timersOff } from '../lib/timerScale'
import { formatClock, secondsLeft } from '../lib/format'
import { recordMatch } from '../lib/profile'
import { sounds } from '../lib/sounds'
import {
  RACE_MATCH_WINS, RACE_MIN_PLAYERS,
  normalizeRaceRound, normalizeRaceResult, seatedIds, isSeatOnline, allReady,
  rankRace, tiedIds, matchChampions, canEndRace, racePhase, raceGoAt,
  newRoundId, newRaceSeed, startRaceRound, toggleRaceReady, finishRaceRound,
} from '../lib/raceLogic'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// Shared room flow for the N-player races (a party room: players keyed by
// uid, 2–8 racers). Every race page is this shell plus a game-specific
// `Racer` (the live play surface) and `race` config built from its logic
// module:
//
//   waiting  → lobby: everyone taps READY (all online ready = start), or the
//              coordinator taps START NOW
//   playing  → 3s countdown, then every racer plays the same seeded content;
//              a live RaceResults table shows everyone's progress; the round
//              ends when everyone is done, the deadline passes, or the only
//              racers left have been offline for a while (never blocks)
//   finished → ranked RaceResults (ties, DNF) + round wins; PLAY AGAIN is a
//              ready-up for the next round (2 players = propose-and-accept),
//              the coordinator can START NOW; first to RACE_MATCH_WINS takes
//              the match → NEW MATCH
//
// race config: { type, title, rules[], baseMs, scaled, entry(stats, round),
//   isDone(stats), row(stats, round), liveKey?(stats, round),
//   decided?(statsById, racers), start?(room) → { extras, seen }, clockLabel }

const TICK_MS = 250

function PlayerList({ ids, players, mySeat, readySet, scores }) {
  return (
    <ul className="bg-retro-card border border-retro-border rounded p-3 space-y-1.5" aria-label="Racers">
      {ids.map(id => {
        const p = players?.[id]
        const online = isSeatOnline(players, id)
        const ready = readySet.has(id)
        const wins = Number(scores?.[id]) || 0
        return (
          <li key={id} className={cn('flex items-center gap-2', !online && 'opacity-50')}>
            <Avatar id={p?.avatar} size={20} />
            <span className={cn('font-mono text-[11px] truncate flex-1', id === mySeat ? 'text-retro-p1' : 'text-retro-text')}>
              {p?.name || 'PLAYER'}{id === mySeat ? ' (YOU)' : ''}
            </span>
            {wins > 0 && <span className="font-pixel text-[8px] text-retro-cta" title="Round wins">★{wins}</span>}
            <span className={cn('font-pixel text-[8px] w-14 text-right', ready ? 'text-retro-win' : 'text-retro-dim')}>
              {!online ? 'AWAY' : ready ? '✓ READY' : '…'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export default function RaceShell({
  gameId, game, mySeat, players, onSwitchGame, onNewMatch, race, Racer, Final,
}) {
  const round = normalizeRaceRound(game.round)
  const result = normalizeRaceResult(game.raceResult)
  const scores = game.scores || {}
  const status = game.status
  const isSeated = !!mySeat && !!players?.[mySeat]
  const amCoordinator = isRoomCoordinator(mySeat, players, game.hostUid ?? null)
  const seats = seatedIds(players)
  const onlineSeats = seats.filter(id => isSeatOnline(players, id))
  const readyIds = round?.ready ?? []
  const readySet = new Set(readyIds)
  const iAmReady = readySet.has(mySeat)
  const champions = matchChampions(scores)
  const matchOver = champions.length > 0

  const liveRound = status === 'playing' && round?.id && round.gameType === race.type ? round : null
  const racers = liveRound?.racers ?? []
  const isRacer = !!liveRound && racers.includes(mySeat)
  const { now } = useServerClock(liveRound ? TICK_MS : 0)
  const phase = liveRound ? racePhase(liveRound, now) : 'idle'
  const goAt = raceGoAt(liveRound)
  const statsPath = liveRound && isRacer ? `games/${gameId}/round/stats/${liveRound.id}/${mySeat}` : null
  const myStats = liveRound?.stats?.[mySeat] ?? null
  const myDone = isRacer && race.isDone(myStats)

  const [readying, runReady] = useBusy()
  const [starting, runStart] = useBusy()
  const [ending, runEnd] = useBusy()

  const offlineRef = useRef(new Map())
  const finishTriedRef = useRef(null)
  const autoStartRef = useRef(null)
  const prevStatusRef = useRef(status)
  const recordedRef = useRef(null)
  const goSoundRef = useRef(null)

  const gameRef = () => ref(db, `games/${gameId}`)

  // ── transitions ──────────────────────────────────────────────────────

  const startParams = (cur, force) => {
    const extrasSeen = race.start ? race.start(cur) : {}
    const t = getServerNow()
    return {
      gameType: race.type,
      starterId: mySeat,
      force,
      now: t,
      id: newRoundId(t),
      seed: newRaceSeed(),
      durationMs: race.scaled ? scaledMs(race.baseMs, cur.timerScale) : race.baseMs,
      extras: extrasSeen?.extras ?? {},
      seen: extrasSeen?.seen ?? null,
    }
  }

  const startRound = async (force) => {
    const res = await runTransaction(gameRef(), cur => startRaceRound(cur, startParams(cur, force)))
    return res.committed
  }

  const toggleReady = () => runReady(async () => {
    await runTransaction(gameRef(), cur => {
      const toggled = toggleRaceReady(cur, mySeat, race.type)
      if (!toggled) return undefined
      // The last ready tap starts the round in the same write.
      return startRaceRound(toggled, startParams(toggled, false)) ?? toggled
    })
  }, () => toast.error('READY FAILED — CHECK CONNECTION'))

  const finishRound = async (roundId, force) => {
    const res = await runTransaction(gameRef(), cur => finishRaceRound(cur, {
      gameType: race.type,
      roundId,
      now: getServerNow(),
      entryOf: race.entry,
      isDone: race.isDone,
      decidedBy: race.decided ?? null,
      offlineSince: (id) => offlineRef.current.get(id) ?? null,
      force,
    }))
    return res.committed
  }

  // ── effects ──────────────────────────────────────────────────────────

  // Track how long each racer has been continuously offline (server clock),
  // so a dropped phone stops holding the round open after a grace period.
  const racersKey = racers.join(',')
  useEffect(() => {
    const m = offlineRef.current
    for (const id of racersKey ? racersKey.split(',') : []) {
      if (players?.[id] && isSeatOnline(players, id)) m.delete(id)
      else if (!m.has(id)) m.set(id, getServerNow())
    }
  }, [players, racersKey])

  // Any seated client ends the round once it can (deadline / all done /
  // decided / only long-offline racers left) — the transaction re-checks, so
  // concurrent attempts commit once.
  const liveId = liveRound?.id ?? null
  useEffect(() => {
    if (!liveRound || !isSeated || finishTriedRef.current === liveRound.id) return
    const ok = canEndRace({
      racers: liveRound.racers,
      isDone: (id) => race.isDone(liveRound.stats[id]),
      offlineSince: (id) => offlineRef.current.get(id) ?? null,
      endsAt: liveRound.endsAt,
      now,
      decided: !!race.decided?.(liveRound.stats, liveRound.racers),
    })
    if (!ok) return
    finishTriedRef.current = liveRound.id
    finishRound(liveRound.id, false)
      .then(committed => { if (!committed) finishTriedRef.current = null })
      .catch(() => { finishTriedRef.current = null })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finishRound/race are stable per render; `now` drives the re-check
  }, [now, liveId, game.round, isSeated])

  // The coordinator starts the round once every ONLINE seat is ready — covers
  // the last unready player dropping offline instead of tapping READY.
  const everyoneReady = status !== 'playing' && !(status === 'finished' && matchOver) && allReady(players, readyIds)
  const readyKey = everyoneReady ? `${[...readyIds].sort().join(',')}|${onlineSeats.join(',')}` : null
  useEffect(() => {
    if (!amCoordinator || !readyKey || autoStartRef.current === readyKey) return
    autoStartRef.current = readyKey
    startRound(false).catch(() => { autoStartRef.current = null })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startRound reads the live room inside its transaction
  }, [amCoordinator, readyKey])

  // GO beep for racers when the countdown ends.
  useEffect(() => {
    if (phase !== 'racing' || !isRacer || goSoundRef.current === liveId) return
    goSoundRef.current = liveId
    sounds.go()
  }, [phase, isRacer, liveId])

  // Round-end audio + match history (seen live, not on a reload into results).
  const resultId = result?.roundId ?? null
  useEffect(() => {
    const prev = prevStatusRef.current
    prevStatusRef.current = status
    if (prev !== 'playing' || status !== 'finished' || !result) return
    const rank = result.ranks[mySeat]
    if (rank == null) return
    const won = rank === 1 && !result.dnf[mySeat]
    const champs = matchChampions(game.scores)
    if (won) (champs.includes(mySeat) ? sounds.matchWin() : sounds.win())
    else sounds.lose()
    if (champs.length && recordedRef.current !== result.roundId) {
      recordedRef.current = result.roundId
      // Head-to-head history only means something with exactly one opponent.
      const others = result.order.filter(id => id !== mySeat)
      const op = others.length === 1 ? players?.[others[0]] : null
      recordMatch({
        gameType: race.type,
        won: champs.includes(mySeat),
        opponentName: op?.name,
        opponentUid: op?.playerId ?? (others.length === 1 ? others[0] : undefined),
        opponentAvatar: op?.avatar,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires on the status/result transition only
  }, [status, resultId])

  // ── rows ─────────────────────────────────────────────────────────────

  const rowFor = (id, rnd, extra) => {
    const p = players?.[id]
    return {
      id,
      name: p?.name || 'PLAYER',
      avatar: p?.avatar,
      you: id === mySeat,
      online: !!p && isSeatOnline(players, id),
      wins: Number(scores?.[id]) || 0,
      ...race.row(rnd?.stats?.[id] ?? null, rnd),
      ...extra,
    }
  }

  const liveRows = useMemo(() => {
    if (!liveRound) return []
    const keyOf = race.liveKey ?? ((s, r) => race.entry(s, r).sortKey)
    const { order, ranks } = rankRace(liveRound.racers.map(id => ({ id, sortKey: keyOf(liveRound.stats[id] ?? null, liveRound) })))
    return order.map(id => rowFor(id, liveRound, { place: ranks[id] }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt when the round/players/scores change
  }, [game.round, players, game.scores, mySeat])

  const finalRows = useMemo(() => {
    if (!result) return []
    const tied = tiedIds(result.ranks)
    return result.order.map(id => rowFor(id, round, {
      place: result.ranks[id], tied: tied.has(id), dnf: !!result.dnf[id],
      status: result.dnf[id] ? 'idle' : race.row(round?.stats?.[id] ?? null, round).status,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt when the result/round/players change
  }, [game.raceResult, game.round, players, game.scores, mySeat])

  const nameOf = (id) => (players?.[id]?.name || 'PLAYER').toUpperCase()
  const switcher = isSeated && onSwitchGame && (
    <GameSwitcher currentType={race.type} onSwitch={onSwitchGame} />
  )

  // ── render: live round ───────────────────────────────────────────────

  if (liveRound) {
    const pendingOnline = racers.filter(id => !race.isDone(liveRound.stats[id]) && isSeatOnline(players, id)).length
    const timeLeft = liveRound.endsAt != null ? liveRound.endsAt - now : null
    const noDeadline = liveRound.endsAt == null
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="font-pixel text-[9px] text-retro-dim tracking-widest">{race.title}</span>
          {timeLeft != null && phase === 'racing' && (
            <span className={cn(
              'font-pixel tabular-nums',
              race.scaled ? 'text-[9px] text-retro-dim' : 'text-lg text-retro-win text-glow-win',
              timeLeft < 10_000 && 'text-retro-danger text-glow-danger',
            )}>
              {race.scaled ? `ENDS IN ${formatClock(timeLeft)}` : formatClock(timeLeft)}
            </span>
          )}
        </div>

        {phase === 'countdown' && (
          <div className="bg-retro-card border border-retro-border rounded p-8 text-center space-y-3">
            <p className="font-pixel text-[9px] text-retro-dim arcade-blink">GET READY!</p>
            <p className="font-pixel text-7xl text-retro-win text-glow-win">{secondsLeft(goAt - now)}</p>
            <p className="font-pixel text-[8px] text-retro-dim">{racers.length} RACERS · SAME {race.sameWhat || 'CONTENT'}</p>
          </div>
        )}

        {phase === 'racing' && isRacer && (
          <Racer
            key={liveRound.id}
            gameId={gameId}
            game={game}
            round={liveRound}
            mySeat={mySeat}
            myStats={myStats}
            statsPath={statsPath}
            goAt={goAt}
            now={now}
            done={myDone}
          />
        )}

        {phase === 'racing' && isRacer && myDone && pendingOnline > 0 && (
          <p className="font-pixel text-[9px] text-retro-cta text-center arcade-blink">
            WAITING FOR {pendingOnline} RACER{pendingOnline === 1 ? '' : 'S'}…
          </p>
        )}

        {!isRacer && (
          <p className="font-pixel text-[9px] text-retro-dim text-center">
            {isSeated ? "YOU'LL RACE NEXT ROUND" : 'SPECTATING'}
          </p>
        )}

        <RaceResults title="LIVE" rows={liveRows} />

        {noDeadline && amCoordinator && phase === 'racing' && (
          <div className="text-center">
            <button
              onClick={() => runEnd(() => finishRound(liveRound.id, true), () => toast.error('END ROUND FAILED — CHECK CONNECTION'))}
              disabled={ending}
              className="px-4 py-2 border border-retro-border text-retro-text font-pixel text-[9px] rounded hover:border-retro-cta transition-all active:scale-95 disabled:opacity-50"
            >
              {ending ? 'ENDING…' : 'END ROUND'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── render: finished round ───────────────────────────────────────────

  if (status === 'finished' && result && result.gameType === race.type) {
    const winners = result.order.filter(id => result.ranks[id] === 1 && !result.dnf[id])
    const iWon = winners.includes(mySeat)
    const headline = matchOver
      ? (champions.includes(mySeat) ? 'YOU WIN THE MATCH!' : `${champions.map(nameOf).join(' & ')} WINS THE MATCH`)
      : winners.length === 0 ? 'NO FINISHERS'
        : iWon ? (winners.length > 1 ? 'TIED FOR FIRST!' : 'YOU WIN!')
          : `${winners.map(nameOf).join(' & ')} ${winners.length > 1 ? 'TIE' : 'WINS'}`
    const readyCount = onlineSeats.filter(id => readySet.has(id)).length
    const canForce = amCoordinator && !matchOver && onlineSeats.length >= RACE_MIN_PLAYERS
    return (
      <div className="space-y-4">
        <RoundEndPanel
          caption={matchOver ? 'MATCH OVER' : `ROUND OVER · FIRST TO ${RACE_MATCH_WINS} WINS`}
          headline={headline}
          actions={isSeated ? [
            !matchOver && {
              key: 'again',
              label: iAmReady ? `READY ✓ ${readyCount}/${onlineSeats.length}` : `PLAY AGAIN${readyCount ? ` ${readyCount}/${onlineSeats.length}` : ''}`,
              busyLabel: 'READYING…',
              onClick: () => runTransaction(gameRef(), cur => {
                const toggled = toggleRaceReady(cur, mySeat, race.type)
                if (!toggled) return undefined
                return startRaceRound(toggled, startParams(toggled, false)) ?? toggled
              }),
              errorMsg: 'PLAY AGAIN FAILED — CHECK CONNECTION',
            },
            canForce && readyCount > 0 && !everyoneReady && {
              key: 'force', label: 'START NOW', busyLabel: 'STARTING…',
              onClick: () => startRound(true),
            },
            matchOver && onNewMatch && {
              key: 'new', label: 'NEW MATCH', busyLabel: 'STARTING…', onClick: onNewMatch,
            },
          ] : []}
          share={isSeated && iWon ? {
            gameLabel: race.title,
            headline: matchOver ? 'I WON THE MATCH!' : 'I WON THE RACE!',
            sub: `${race.title} · ${result.order.length} racers · Game Night`,
          } : null}
        >
          <RaceResults title="RESULTS" final rows={finalRows} />
          {Final && <Final gameId={gameId} game={game} round={round} result={result} mySeat={mySeat} players={players} />}
          {!matchOver && readyCount > 0 && !iAmReady && isSeated && (
            <p className="font-pixel text-[9px] text-retro-cta text-center arcade-blink">
              {onlineSeats.filter(id => readySet.has(id)).map(nameOf).join(' & ')} WANT{readyCount === 1 ? 'S' : ''} A REMATCH
            </p>
          )}
        </RoundEndPanel>
        {switcher}
      </div>
    )
  }

  // ── render: lobby ────────────────────────────────────────────────────

  const enough = onlineSeats.length >= RACE_MIN_PLAYERS
  const noClock = timersOff(game.timerScale) && race.scaled
  return (
    <div className="space-y-4">
      <div className="bg-retro-card border border-retro-border rounded p-5 text-center space-y-3">
        <p className="font-pixel text-[10px] text-retro-cta tracking-widest">{race.title} · {RACE_MIN_PLAYERS}–8 RACERS</p>
        <div className="font-pixel text-[8px] text-retro-dim space-y-1 text-left mx-auto w-fit leading-relaxed">
          {race.rules.map(r => <p key={r}>● {r}</p>)}
          {noClock && <p>● NO TIME LIMIT — HOST ENDS THE ROUND</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="font-pixel text-[9px] text-retro-dim tracking-widest">PLAYERS ({seats.length})</p>
        <PlayerList ids={seats} players={players} mySeat={mySeat} readySet={readySet} scores={scores} />
      </div>

      {!enough && (
        <p className="font-pixel text-[10px] text-retro-p2 text-center arcade-blink leading-relaxed">
          NEED {RACE_MIN_PLAYERS}+ PLAYERS — INVITE A FRIEND
        </p>
      )}

      {isSeated && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={toggleReady}
            disabled={readying}
            aria-pressed={iAmReady}
            className={cn(
              'px-6 py-2.5 font-pixel text-xs rounded transition-all active:scale-95 disabled:opacity-50',
              iAmReady
                ? 'border-2 border-retro-win text-retro-win'
                : 'bg-retro-cta text-retro-bg hover:shadow-neon-cta',
            )}
          >
            {readying ? 'READYING…' : iAmReady ? '✓ READY' : 'READY'}
          </button>
          {amCoordinator && enough && (
            <button
              onClick={() => runStart(() => startRound(true), () => toast.error('START FAILED — CHECK CONNECTION'))}
              disabled={starting}
              className="px-6 py-2.5 border-2 border-retro-p1 text-retro-p1 font-pixel text-xs rounded hover:shadow-neon-p1 transition-all active:scale-95 disabled:opacity-50"
            >
              {starting ? 'STARTING…' : 'START NOW'}
            </button>
          )}
        </div>
      )}
      {isSeated && enough && (
        <p className="font-pixel text-[8px] text-retro-dim text-center leading-relaxed">
          STARTS WHEN EVERYONE IS READY{amCoordinator ? '' : ' · HOST CAN START ANYTIME'}
        </p>
      )}
      {!isSeated && (
        <p className="font-pixel text-[9px] text-retro-dim text-center">SPECTATING</p>
      )}

      {switcher}
    </div>
  )
}
