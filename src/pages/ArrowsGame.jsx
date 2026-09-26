import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, update, runTransaction, onValue } from 'firebase/database'
import { db } from '../lib/firebase'
import GameSwitcher from '../components/GameSwitcher'
import GameStatus from '../components/GameStatus'
import ArrowsBoard from '../components/ArrowsBoard'
import { RaceRow } from '../components/ArrowsHud'
import {
  generateArrowsLevel,
  applyArrowTap,
  normalizeGone,
  countGone,
  tierForRound,
  randomArrowsSeed,
  arrowsMatchWinner,
  getArrowsMatchEnd,
  ARROWS_LIVES,
  ARROWS_MATCH_TARGET,
  ARROWS_MAX_ROUNDS,
} from '../lib/arrowsLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// Arrows race. Both players get an identical board (generated from
// `arrowsSeed`) and clear their own copy at the same time: first to empty
// their board takes the round, running out of lives forfeits it.
//
// Each player's board is simulated locally — a tap resolves and animates on
// the same frame, so neither side waits on the network. Firebase only carries
// progress (`arrowsGone{X|O}/{index}: true`, `arrowsLives{X|O}`) for the
// rival's race bar, spectators and reload recovery; the round end is one
// transaction so a photo finish resolves to whoever lands first.

const COUNTDOWN_MS = 3000

function playerName(game, sym) {
  return game.players?.[sym]?.name?.toUpperCase() ?? sym
}

export default function ArrowsGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const isSpectator = !mySymbol
  const me = mySymbol === 'O' ? 'O' : 'X'
  const op = me === 'X' ? 'O' : 'X'

  const round = game.arrowsRound ?? 0
  const tier = tierForRound(round)
  const seed = game.arrowsSeed ?? null
  const startedAt = game.arrowsStartedAt ?? null
  const level = useMemo(() => (seed != null ? generateArrowsLevel(seed, tier) : null), [seed, tier])
  const total = level?.arrows.length ?? 0

  const remoteGone = {
    X: normalizeGone(game.arrowsGoneX, total),
    O: normalizeGone(game.arrowsGoneO, total),
  }
  const remoteLives = { X: game.arrowsLivesX ?? ARROWS_LIVES, O: game.arrowsLivesO ?? ARROWS_LIVES }

  // My own board is local and authoritative for me; seeded from Firebase so
  // a reload mid-round resumes where I was.
  const [myGone, setMyGone] = useState(() => remoteGone[me])
  const [myLives, setMyLives] = useState(() => remoteLives[me])
  const [feedback, setFeedback] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const [clockOffset, setClockOffset] = useState(0)
  const streak = useRef(0)
  const prevSeedRef = useRef(seed)
  const writeErrorAt = useRef(0)
  const wentLive = useRef(false)

  // New round (new seed): reset my local board during render, the
  // derive-from-prop-change pattern, so the board never lags a seed flip.
  if (prevSeedRef.current !== seed) {
    prevSeedRef.current = seed
    setMyGone(Array(total).fill(false))
    setMyLives(ARROWS_LIVES)
    setFeedback(null)
  }

  useEffect(() => {
    streak.current = 0
    wentLive.current = false
  }, [seed])

  // Server-corrected clock so both players' countdowns end together.
  useEffect(() => {
    const unsub = onValue(ref(db, '.info/serverTimeOffset'), (snap) => setClockOffset(snap.val() ?? 0))
    return () => unsub()
  }, [])
  const serverNow = now + clockOffset
  const countdownEnd = startedAt != null ? startedAt + COUNTDOWN_MS : null
  const isCountdown = countdownEnd != null && serverNow < countdownEnd
  const isRacing = countdownEnd != null && serverNow >= countdownEnd && game.status === 'playing'

  useEffect(() => {
    if (game.status !== 'playing' || (startedAt != null && !isCountdown)) return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [game.status, startedAt, isCountdown])

  useEffect(() => {
    if (isRacing && !wentLive.current) {
      wentLive.current = true
      if (!isSpectator) sounds.go()
    }
  }, [isRacing, isSpectator])

  // Auto-start: once both players are seated and online, the first client to
  // notice stamps a shared start time (server clock) — and a seed, for a room
  // that predates it. The transaction makes a double start a no-op.
  const bothSeated = !!game.players?.X && !!game.players?.O
  useEffect(() => {
    if (isSpectator || game.status !== 'playing' || startedAt != null) return
    if (!bothSeated || !opponentOnline) return
    runTransaction(ref(db, `games/${gameId}`), (current) => {
      if (!current || current.status !== 'playing' || current.arrowsStartedAt != null) return
      return {
        ...current,
        arrowsSeed: current.arrowsSeed ?? randomArrowsSeed(),
        arrowsStartedAt: Date.now() + clockOffset,
      }
    }).catch(() => toast.error('COULD NOT START ROUND — CHECK CONNECTION'))
  }, [isSpectator, game.status, startedAt, bothSeated, opponentOnline, gameId, clockOffset])

  // One transaction ends the round; the seed guard stops a late write from a
  // previous round finishing the next one.
  const resolveEnd = (winner) => {
    runTransaction(ref(db, `games/${gameId}`), (current) => {
      if (!current || current.status !== 'playing' || current.arrowsSeed !== seed) return
      const scores = { ...(current.scores || {}) }
      scores[winner] = (scores[winner] || 0) + 1
      return { ...current, winner, status: 'finished', scores, lastActivityAt: Date.now() }
    }).catch(() => toast.error('ROUND RESULT FAILED — CHECK CONNECTION'))
  }

  const writeProgress = (updates) => {
    update(ref(db, `games/${gameId}`), updates).catch(() => {
      // One toast per burst — a dropped connection would otherwise fire one
      // per tap.
      if (Date.now() - writeErrorAt.current > 4000) toast.error('SYNC FAILED — CHECK CONNECTION')
      writeErrorAt.current = Date.now()
    })
  }

  // Backstop for the rival's end-of-round: if they cleared or ran dry but
  // their own transaction never landed, settle it from here.
  const opCleared = countGone(remoteGone[op])
  const opLives = remoteLives[op]
  useEffect(() => {
    if (isSpectator || game.status !== 'playing' || !total) return
    if (opCleared >= total) resolveEnd(op)
    else if (opLives <= 0) resolveEnd(me)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolveEnd is idempotent (status/seed guarded)
  }, [opCleared, opLives, total, game.status, isSpectator])

  const handleTap = (index) => {
    if (!isRacing || isSpectator || !level) return
    const applied = applyArrowTap(level, myGone, myLives, index)
    if (!applied) return
    if (applied.result === 'blocked') {
      streak.current = 0
      setMyLives(applied.lives)
      setFeedback({ index, blocker: applied.blocker, gap: applied.gap, key: Date.now() })
      sounds.buzz()
      writeProgress({ [`arrowsLives${me}`]: applied.lives, lastActivityAt: Date.now() })
      if (applied.lives <= 0) resolveEnd(op)
      return
    }
    setMyGone(applied.gone)
    sounds.hit(Math.min(streak.current, 8))
    streak.current += 1
    writeProgress({ [`arrowsGone${me}/${index}`]: true, lastActivityAt: Date.now() })
    if (countGone(applied.gone) >= total) resolveEnd(me)
  }

  const scoreX = game.scores?.X || 0
  const scoreO = game.scores?.O || 0
  const matchEnd = arrowsMatchWinner(game.scores) ?? getArrowsMatchEnd(game)
  const matchOver = !!matchEnd
  const tierLabel = tier.toUpperCase()

  const counts = isSpectator
    ? { X: countGone(remoteGone.X), O: countGone(remoteGone.O) }
    : { [me]: countGone(myGone), [op]: opCleared }
  const lives = isSpectator ? remoteLives : { [me]: myLives, [op]: opLives }

  const endReason = (sym) => {
    if (game.status !== 'finished') return null
    if (game.winner === sym) return counts[sym] >= total ? 'CLEARED' : 'WINNER'
    if (lives[sym] <= 0) return 'OUT'
    return null
  }

  const raceRows = (
    <div className="grid grid-cols-2 gap-2">
      {['X', 'O'].map((sym) => (
        <RaceRow
          key={sym}
          sym={sym}
          name={sym === mySymbol ? 'YOU' : playerName(game, sym)}
          isMe={sym === mySymbol}
          cleared={counts[sym]}
          total={total}
          lives={lives[sym]}
          status={endReason(sym) ?? (lives[sym] <= 0 ? 'OUT' : null)}
        />
      ))}
    </div>
  )

  const header = (
    <div className="flex items-center justify-between font-pixel text-[9px] text-retro-dim tracking-wider">
      <span>ROUND {round + 1}/{ARROWS_MAX_ROUNDS} · {tierLabel}</span>
      <span className="tabular-nums">
        <span className="text-retro-p1">{scoreX}</span> – <span className="text-retro-p2">{scoreO}</span>
        <span className="ml-1.5">FIRST TO {ARROWS_MATCH_TARGET}</span>
      </span>
    </div>
  )

  const cover = (content) => (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-retro-surface rounded-lg border-2 border-retro-border text-center px-4">
      {content}
    </div>
  )

  const preRace = (() => {
    if (isCountdown) {
      const secs = Math.max(1, Math.ceil((countdownEnd - serverNow) / 1000))
      return cover(
        <>
          <p className="font-pixel text-4xl text-retro-cta text-glow-cta tabular-nums" aria-live="assertive">{secs}</p>
          <p className="font-pixel text-[8px] text-retro-dim leading-relaxed">
            {total} ARROWS · {tierLabel}<br />SAME BOARD FOR BOTH — FIRST TO CLEAR WINS
          </p>
        </>,
      )
    }
    if (startedAt == null && game.status === 'playing') {
      return cover(
        <p className="font-pixel text-[9px] text-retro-dim leading-relaxed">
          {!bothSeated ? 'WAITING FOR A RIVAL' : !opponentOnline && !isSpectator ? 'WAITING FOR OPPONENT TO RECONNECT' : 'GET READY…'}
        </p>,
      )
    }
    return null
  })()

  const liveMsg = game.status === 'finished'
    ? `Round over. ${game.winner === 'draw' ? 'Draw.' : `${playerName(game, game.winner)} wins the round.`}`
    : `Cleared X ${counts.X} of ${total}, O ${counts.O} of ${total}. Lives X ${lives.X}, O ${lives.O}.`

  if (!level) {
    return <p className="text-center font-pixel text-[9px] text-retro-dim">GET READY…</p>
  }

  if (game.status === 'finished') {
    const winnerSym = game.winner
    const why = winnerSym === 'X' || winnerSym === 'O'
      ? (counts[winnerSym] >= total
        ? `${winnerSym === mySymbol ? 'YOU' : playerName(game, winnerSym)} CLEARED THE BOARD`
        : `${(winnerSym === 'X' ? 'O' : 'X') === mySymbol ? 'YOU' : playerName(game, winnerSym === 'X' ? 'O' : 'X')} RAN OUT OF LIVES`)
      : null
    return (
      <div className="space-y-4">
        {header}
        {why && <p className="text-center font-pixel text-[9px] text-retro-cta">{why}</p>}
        {raceRows}
        <GameStatus
          status={game.status}
          winner={game.winner}
          mySymbol={mySymbol}
          scores={game.scores}
          players={game.players}
          gameType={game.gameType}
          matchTarget={ARROWS_MATCH_TARGET}
          matchOver={matchOver}
          matchWinnerOverride={matchEnd}
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
      <div className="space-y-3">
        {header}
        <p className="text-center font-pixel text-[8px] text-retro-dim">SPECTATING — SAME BOARD, TWO RACERS</p>
        {raceRows}
        <div className="relative grid grid-cols-2 gap-2">
          {['X', 'O'].map((sym) => (
            <div key={sym} className="space-y-1">
              <p className={cn('font-pixel text-[8px] truncate', sym === 'X' ? 'text-retro-p1' : 'text-retro-p2')}>
                {playerName(game, sym)}
              </p>
              <ArrowsBoard
                key={`${seed}-${tier}-${sym}`}
                level={level}
                gone={remoteGone[sym]}
                compact
                label={`${playerName(game, sym)} board, ${total - countGone(remoteGone[sym])} arrows left`}
              />
            </div>
          ))}
          {preRace}
        </div>
        <p className="sr-only" aria-live="polite">{liveMsg}</p>
        {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {header}
      {raceRows}
      <div className="relative">
        <ArrowsBoard
          key={`${seed}-${tier}`}
          level={level}
          gone={myGone}
          onTap={handleTap}
          interactive={isRacing && myLives > 0}
          feedback={feedback}
        />
        {preRace}
      </div>
      <p className="sr-only" aria-live="polite">{liveMsg}</p>
      {isRacing && round === 0 && counts[me] === 0 && (
        <p className="text-center font-pixel text-[8px] text-retro-dim leading-relaxed">
          TAP AN ARROW WHOSE PATH IS CLEAR — IT SLIDES OFF.<br />BLOCKED TAPS COST A LIFE.
        </p>
      )}
      {isRacing && !opponentOnline && (
        <p className="text-center font-pixel text-[8px] text-retro-dim">OPPONENT OFFLINE — KEEP CLEARING</p>
      )}
    </div>
  )
}
