import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ref, runTransaction } from 'firebase/database'
import { toast } from 'sonner'
import { db } from '../lib/firebase'
import { cn } from '@/lib/utils'
import { sounds } from '../lib/sounds'
import useBusy from '../hooks/useBusy'
import useServerClock, { getServerNow } from '../hooks/useServerClock'
import { scaledMs, timersOff } from '../lib/timerScale'
import { generateSeed } from '../lib/mathLogic'
import { nextWireBomb } from '../lib/wireMatchLogic'
import {
  MAX_STRIKES, MODULE_NAMES, QUICK_PHRASES, STRIKE_PENALTY_MS,
  applyTimeout, applyWireAction, armWire, clockText, formatClock, generateBomb,
  isSolved, normalizeWireStats, strikesOf,
} from '../lib/wireLogic'
import Avatar from '../components/Avatar'
import GameSwitcher from '../components/GameSwitcher'
import WireDevice from '../components/wire/WireDevice'
import WireManual from '../components/wire/WireManual'

const PING_SHOW_MS = 8000

// Commits a new `wire` node on the whole room (so a defuse can credit both
// scores in the same write). A defuse adds 1 to both seats, the Word Co-op
// precedent; the team score shown is min(X, O).
function withWire(current, nextWire) {
  const next = { ...current, wire: nextWire, lastActivityAt: Date.now() }
  const justDefused = nextWire.phase === 'over' && current.wire?.phase !== 'over'
    && nextWire.result?.outcome === 'defused'
  if (justDefused) {
    next.scores = { ...(current.scores || {}), X: (current.scores?.X || 0) + 1, O: (current.scores?.O || 0) + 1 }
  }
  return next
}

function Seat({ symbol, player, role, online, me }) {
  return (
    <div className={cn('flex items-center gap-1.5 min-w-0', symbol === 'O' && 'flex-row-reverse text-right')}>
      <div className="relative shrink-0">
        {player?.avatar ? <Avatar id={player.avatar} size={26} /> : (
          <span className={cn(
            'flex items-center justify-center w-[26px] h-[26px] rounded border font-pixel text-[9px]',
            symbol === 'X' ? 'text-retro-p1 border-retro-p1 bg-retro-tint-p1' : 'text-retro-p2 border-retro-p2 bg-retro-tint-p2',
          )}>{symbol}</span>
        )}
        {online !== undefined && (
          <span
            className={cn('absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-retro-bg', online ? 'bg-retro-win' : 'bg-retro-dim')}
            aria-hidden="true"
          />
        )}
      </div>
      <div className="min-w-0">
        <p className="font-mono text-[10px] truncate">{player?.name || symbol}{me ? ' (you)' : ''}</p>
        <p className={cn('font-pixel text-[7px] tracking-widest', role === 'TECH' ? 'text-retro-cta' : 'text-retro-dim')}>{role}</p>
      </div>
    </div>
  )
}

function StrikeLights({ strikes }) {
  return (
    <div className="flex items-center gap-1.5" role="img" aria-label={`Strikes ${strikes} of ${MAX_STRIKES}`}>
      {Array.from({ length: MAX_STRIKES }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'w-6 h-6 rounded-full border-2 flex items-center justify-center font-pixel text-[9px]',
            i < strikes ? 'border-retro-p1 bg-retro-tint-p1 text-retro-p1 shadow-neon-p1' : 'border-retro-border text-retro-dim',
          )}
        >{i < strikes ? '✖' : ''}</span>
      ))}
    </div>
  )
}

function BombStrip({ bomb, wire, now }) {
  const text = clockText(wire, now)
  const left = wire?.endsAt ? wire.endsAt - now : null
  const urgent = left != null && left <= 30_000
  return (
    <div className="w-full rounded-lg border-2 border-retro-border bg-retro-deep p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'font-pixel text-3xl tracking-widest tabular-nums',
            urgent ? 'text-retro-p1 text-glow-p1' : 'text-retro-cta text-glow-cta',
            left != null && left <= 10_000 && 'arcade-blink',
          )}
          role="timer"
          aria-label={wire?.endsAt ? `Time left ${text}` : `Time elapsed ${text}`}
        >{text}</span>
        <StrikeLights strikes={strikesOf(wire)} />
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-pixel text-[9px] text-retro-text tracking-widest">
          <span className="text-retro-dim">SERIAL </span>{bomb.serial}
        </span>
        <span className="flex gap-2">
          {bomb.indicators.map(ind => (
            <span
              key={ind.label}
              className={cn(
                'px-1.5 py-0.5 rounded border font-pixel text-[8px] tracking-wider',
                ind.lit ? 'border-retro-win text-retro-win shadow-neon-win' : 'border-retro-border text-retro-dim',
              )}
            >{ind.lit ? '● ' : '○ '}{ind.label}</span>
          ))}
        </span>
      </div>
    </div>
  )
}

function LastAction({ wire, bomb, players }) {
  const last = wire?.last
  if (!last?.text) return null
  const who = players?.[last.by]?.name || 'TECH'
  const mod = bomb.modules[last.mod]
  return (
    <p className="w-full text-center font-mono text-[10px] text-retro-dim" aria-live="polite">
      <span className="text-retro-text">{who}</span> · {mod ? `${MODULE_NAMES[mod.type]}: ` : ''}{last.text}{' '}
      <span className={last.ok ? 'text-retro-win' : 'text-retro-p1'}>{last.ok ? '✓' : `✖ STRIKE −${STRIKE_PENALTY_MS / 1000}s`}</span>
    </p>
  )
}

function PingBar({ onPing, disabled }) {
  return (
    <div className="w-full">
      <p className="font-pixel text-[7px] text-retro-dim tracking-widest mb-1">QUICK PHRASES · NO VOICE? TAP ONE</p>
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label="Quick phrases">
        {QUICK_PHRASES.map((phrase, i) => (
          <button
            key={phrase}
            type="button"
            disabled={disabled}
            onClick={() => onPing(i)}
            className="shrink-0 min-h-9 px-2.5 rounded-full border border-retro-border bg-retro-card font-pixel text-[8px] text-retro-text hover:border-retro-cta disabled:opacity-40"
          >{phrase}</button>
        ))}
      </div>
    </div>
  )
}

function ResultCard({ wire, score }) {
  const result = wire.result
  const stats = normalizeWireStats(wire.stats)
  const defused = result?.outcome === 'defused'
  const reason = result?.reason === 'strikes' ? 'THIRD STRIKE' : result?.reason === 'time' ? 'OUT OF TIME' : null
  return (
    <div className={cn(
      'w-full rounded border-2 p-4 text-center space-y-2',
      defused ? 'border-retro-win bg-retro-card shadow-neon-win' : 'border-retro-p1 bg-retro-tint-p1',
    )}>
      <p className={cn('font-pixel text-xl tracking-widest', defused ? 'text-retro-win' : 'text-retro-p1')}>
        {defused ? 'DEFUSED!' : 'BOOM'}
      </p>
      <p className="font-mono text-[11px] text-retro-text">
        {defused
          ? `Cleared with ${result.left != null ? `${formatClock(result.left)} left` : `a ${formatClock(result.took || 0)} run`} and ${strikesOf(wire)} strike${strikesOf(wire) === 1 ? '' : 's'}.`
          : `${reason || 'The bomb went off'}.`}
      </p>
      <p className="font-pixel text-[8px] text-retro-dim tracking-widest">
        TEAM ★ {score} · STREAK {stats.streak} · BEST {stats.best} · BOOMS {stats.booms}
      </p>
      <p className="font-pixel text-[8px] text-retro-dim tracking-widest">
        {defused ? 'NEXT BOMB IS ONE LEVEL HARDER.' : 'NEXT BOMB STAYS AT THIS LEVEL.'} ROLES SWAP.
      </p>
    </div>
  )
}

export default function WireCrossedGame({
  gameId, game, mySymbol, opponentOnline, onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const wire = game?.wire?.seed ? game.wire : null
  const bomb = useMemo(
    () => (wire ? generateBomb(wire.seed, wire.level) : null),
    [wire?.seed, wire?.level], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const phase = wire?.phase || 'ready'
  const armed = phase === 'armed'
  const { now } = useServerClock({ tickMs: 250 })
  const tech = wire?.tech === 'O' ? 'O' : 'X'
  const isSpectator = !mySymbol
  const role = isSpectator ? 'spectator' : mySymbol === tech ? 'tech' : 'handbook'
  const partnerOffline = !isSpectator && opponentOnline === false
  const score = Math.min(game?.scores?.X || 0, game?.scores?.O || 0)
  const noClock = timersOff(game?.timerScale)

  const [acting, runAct] = useBusy()
  const [arming, runArm] = useBusy()
  const [pinging, runPing] = useBusy()
  const [playAgainBusy, runPlayAgain] = useBusy()
  const [newMatchBusy, runNewMatch] = useBusy()
  const [tab, setTab] = useState(0)
  const wireRef = useRef(wire)
  useEffect(() => { wireRef.current = wire })

  // A new bomb starts both players on its first module / manual page.
  const [trackedSeed, setTrackedSeed] = useState(wire?.seed)
  if (trackedSeed !== wire?.seed) {
    setTrackedSeed(wire?.seed)
    setTab(0)
  }

  // Safety net: a room without a bomb node (created before this game, or a
  // write that lost it) deals one. The transaction makes both clients safe.
  const needsBomb = !!game && game.gameType === 'wirecrossed' && game.status === 'playing' && !wire && !isSpectator
  useEffect(() => {
    if (!needsBomb) return
    runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current || current.gameType !== 'wirecrossed' || current.status !== 'playing' || current.wire?.seed) return
      return { ...current, wire: nextWireBomb(null, generateSeed()), lastActivityAt: Date.now() }
    }).catch(() => {})
  }, [needsBomb, gameId])

  // The clock ran out: whichever seated client notices first writes the boom.
  const endsAt = armed ? wire?.endsAt : null
  useEffect(() => {
    if (!endsAt || isSpectator) return undefined
    const t = setTimeout(() => {
      runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.gameType !== 'wirecrossed') return
        const next = applyTimeout(current.wire, getServerNow())
        if (!next) return
        return withWire(current, next)
      }).catch(() => {})
    }, Math.max(0, endsAt - getServerNow()) + 60)
    return () => clearTimeout(t)
  }, [endsAt, gameId, isSpectator])

  // Sounds for both screens, driven by the synced node.
  const prevWire = useRef(wire)
  useEffect(() => {
    const before = prevWire.current
    prevWire.current = wire
    if (!before || !wire || before.seed !== wire.seed) return
    if (before.phase !== 'over' && wire.phase === 'over') {
      if (wire.result?.outcome === 'defused') sounds.win()
      else sounds.bust()
      return
    }
    if (before.phase === 'ready' && wire.phase === 'armed') { sounds.go(); return }
    if (strikesOf(wire) > strikesOf(before)) { sounds.buzz(); return }
    const solvedCount = (w) => bomb ? bomb.modules.filter((_, i) => isSolved(w, i)).length : 0
    if (solvedCount(wire) > solvedCount(before)) sounds.join()
    else if (wire.last?.at && wire.last.at !== before.last?.at) sounds.step()
  }, [wire, bomb])

  // Last ten seconds tick.
  const secondsLeft = armed && wire?.endsAt ? Math.ceil((wire.endsAt - now) / 1000) : null
  const lastTick = useRef(null)
  useEffect(() => {
    if (secondsLeft == null || secondsLeft > 10 || secondsLeft <= 0) return
    if (lastTick.current !== secondsLeft) sounds.wall()
    lastTick.current = secondsLeft
  }, [secondsLeft])

  const act = useCallback((action) => {
    if (!bomb || role !== 'tech' || !armed) return
    runAct(async () => {
      const seed = bomb.seed
      const tx = await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.gameType !== 'wirecrossed' || current.status !== 'playing') return
        if (current.wire?.seed !== seed) return
        const res = applyWireAction(current.wire, bomb, action, getServerNow(), mySymbol)
        if (!res) return
        return withWire(current, res.wire)
      })
      // Hop to the next unsolved module once this one clears.
      const live = tx.committed ? tx.snapshot.val()?.wire : null
      if (live?.phase === 'armed' && isSolved(live, action.mod)) {
        const next = bomb.modules.findIndex((_, i) => !isSolved(live, i))
        if (next >= 0) setTab(next)
      }
    }, () => toast.error('ACTION FAILED — CHECK CONNECTION'))
  }, [armed, bomb, gameId, mySymbol, role, runAct])

  const arm = () => runArm(async () => {
    const seed = wire?.seed
    await runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current || current.gameType !== 'wirecrossed' || current.wire?.seed !== seed) return
      const liveBomb = generateBomb(current.wire.seed, current.wire.level)
      const next = armWire(current.wire, getServerNow(), scaledMs(liveBomb.durationMs, current.timerScale))
      if (!next) return
      return withWire(current, next)
    })
  }, () => toast.error('ARM FAILED — CHECK CONNECTION'))

  const ping = (p) => runPing(async () => {
    const seed = wire?.seed
    await runTransaction(ref(db, `games/${gameId}/wire`), current => {
      if (!current?.seed || current.seed !== seed) return
      return { ...current, ping: { by: mySymbol, p, at: getServerNow() } }
    })
  }, () => toast.error('SEND FAILED — CHECK CONNECTION'))

  const requestPlayAgain = () => runPlayAgain(async () => {
    if (onPlayAgain) await onPlayAgain()
  }, () => toast.error('NEXT BOMB FAILED — CHECK CONNECTION'))
  const requestNewMatch = () => runNewMatch(async () => {
    if (onNewMatch) await onNewMatch()
  }, () => toast.error('NEW MATCH FAILED — CHECK CONNECTION'))

  if (!wire || !bomb) {
    return <div className="py-10 text-center font-pixel text-[10px] text-retro-dim arcade-blink">WIRING THE BOMB…</div>
  }

  const players = game.players
  const pingMsg = wire.ping && now - wire.ping.at < PING_SHOW_MS && QUICK_PHRASES[wire.ping.p]
    ? { mine: wire.ping.by === mySymbol, text: QUICK_PHRASES[wire.ping.p], who: players?.[wire.ping.by]?.name || wire.ping.by }
    : null
  const solvedCount = bomb.modules.filter((_, i) => isSolved(wire, i)).length
  const activeTab = Math.min(tab, bomb.modules.length - 1)
  const module = bomb.modules[activeTab]
  const durationText = noClock ? 'NO CLOCK' : formatClock(scaledMs(bomb.durationMs, game.timerScale))

  return (
    <div className="flex flex-col items-center gap-3 py-2 max-w-md mx-auto w-full">
      {/* Seats + roles + team score */}
      <div className="w-full flex items-center justify-between gap-2">
        <Seat symbol="X" player={players?.X} role={tech === 'X' ? 'TECH' : 'HANDBOOK'} me={mySymbol === 'X'}
          online={isSpectator ? undefined : (mySymbol === 'X' ? true : opponentOnline)} />
        <div className="flex flex-col items-center shrink-0">
          <span className="font-pixel text-[9px] text-retro-win tracking-widest">TEAM ★ {score}</span>
          <span className="font-pixel text-[7px] text-retro-dim tracking-widest">BOMB {wire.bombNo || 1} · LVL {bomb.level}</span>
        </div>
        <Seat symbol="O" player={players?.O} role={tech === 'O' ? 'TECH' : 'HANDBOOK'} me={mySymbol === 'O'}
          online={isSpectator ? undefined : (mySymbol === 'O' ? true : opponentOnline)} />
      </div>

      {pingMsg && (
        <p
          className={cn(
            'w-full text-center rounded border px-2 py-1.5 font-pixel text-[10px] tracking-wider',
            pingMsg.mine ? 'border-retro-border text-retro-dim' : 'border-retro-cta text-retro-cta bg-retro-tint-cta',
          )}
          role="status"
        >{pingMsg.mine ? 'YOU: ' : `${pingMsg.who}: `}{pingMsg.text}</p>
      )}

      {partnerOffline && phase !== 'over' && (
        <p className="w-full text-center font-pixel text-[9px] text-retro-p2 tracking-wider" role="status">
          PARTNER OFFLINE — THE CLOCK KEEPS RUNNING
        </p>
      )}

      {phase === 'ready' && (
        <div className="w-full rounded-lg border-2 border-retro-border bg-retro-card p-4 space-y-3 text-center">
          <p className="font-pixel text-[12px] text-retro-cta tracking-widest">BOMB {wire.bombNo || 1}</p>
          <p className="font-mono text-[11px] text-retro-text">
            Level {bomb.level} · {bomb.modules.length} modules · {durationText} · {MAX_STRIKES} strikes
          </p>
          {role === 'tech' && (
            <p className="font-mono text-[11px] text-retro-text leading-relaxed">
              You are the <b className="text-retro-cta">TECH</b>. You see the device but not the rules. Describe what you see; your partner reads you the manual. Voice chat works best.
            </p>
          )}
          {role === 'handbook' && (
            <p className="font-mono text-[11px] text-retro-text leading-relaxed">
              You are the <b className="text-retro-cta">HANDBOOK</b>. You hold the only manual for this bomb, but you can't see it. Ask the Tech what they see and read them the rules. Voice chat works best.
            </p>
          )}
          {isSpectator && <p className="font-mono text-[11px] text-retro-dim">Waiting for the Tech to arm the bomb.</p>}
          {role === 'tech' ? (
            <button
              type="button"
              onClick={arm}
              disabled={arming || partnerOffline}
              className="w-full min-h-11 rounded bg-retro-cta text-retro-bg font-pixel text-[11px] tracking-widest hover:shadow-neon-cta disabled:opacity-40"
            >{arming ? 'ARMING…' : partnerOffline ? 'WAITING FOR PARTNER' : 'ARM THE BOMB'}</button>
          ) : role === 'handbook' && (
            <p className="font-pixel text-[9px] text-retro-dim arcade-blink">WAITING FOR THE TECH TO ARM IT…</p>
          )}
        </div>
      )}

      {phase !== 'ready' && <BombStrip bomb={bomb} wire={wire} now={phase === 'over' ? (wire.result?.at ?? now) : now} />}

      {armed && (role === 'tech' || isSpectator) && (
        <>
          <div className="w-full grid gap-1.5" style={{ gridTemplateColumns: `repeat(${bomb.modules.length}, minmax(0, 1fr))` }} role="tablist" aria-label="Modules">
            {bomb.modules.map((m, i) => (
              <button
                key={m.type}
                type="button"
                role="tab"
                aria-selected={activeTab === i}
                onClick={() => setTab(i)}
                className={cn(
                  'min-h-11 rounded border-2 font-pixel text-[8px] tracking-wider flex items-center justify-center gap-1',
                  activeTab === i ? 'border-retro-cta text-retro-cta bg-retro-tint-cta' : 'border-retro-border text-retro-dim',
                )}
              >
                <span
                  className={cn('w-2 h-2 rounded-full', isSolved(wire, i) ? 'bg-retro-win shadow-glow-dot' : 'bg-retro-structure')}
                  aria-label={isSolved(wire, i) ? 'solved' : 'live'}
                />
                {MODULE_NAMES[m.type]}
              </button>
            ))}
          </div>
          <div className="w-full rounded-lg border-2 border-retro-border bg-retro-card p-3 min-h-[16rem] flex flex-col justify-center">
            {isSolved(wire, activeTab) ? (
              <p className="text-center font-pixel text-[11px] text-retro-win tracking-widest">MODULE CLEAR ✓</p>
            ) : (
              <WireDevice
                key={`${wire.seed}-${activeTab}`}
                module={module}
                wire={wire}
                index={activeTab}
                onAction={act}
                disabled={isSpectator || acting}
                busy={acting}
                clock={() => clockText(wireRef.current, getServerNow())}
              />
            )}
          </div>
        </>
      )}

      {armed && role === 'handbook' && (
        <>
          <p className="w-full text-center font-pixel text-[8px] text-retro-dim tracking-widest">
            RULESET {bomb.ruleset} · MODULES DONE {solvedCount}/{bomb.modules.length}
          </p>
          <WireManual bomb={bomb} tab={activeTab} onTab={setTab} solved={i => isSolved(wire, i)} />
        </>
      )}

      {phase !== 'ready' && <LastAction wire={wire} bomb={bomb} players={players} />}

      {!isSpectator && phase !== 'over' && <PingBar onPing={ping} disabled={pinging} />}

      {phase === 'over' && (
        <>
          <ResultCard wire={wire} score={score} />
          {!proposal && !isSpectator && (
            <div className="w-full flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={requestPlayAgain}
                disabled={playAgainBusy || !onPlayAgain}
                className="min-h-11 px-4 py-2.5 rounded bg-retro-cta text-retro-bg font-pixel text-[10px] hover:shadow-neon-cta disabled:opacity-50"
              >{playAgainBusy ? 'LOADING…' : 'NEXT BOMB'}</button>
              <button
                type="button"
                onClick={requestNewMatch}
                disabled={newMatchBusy || !onNewMatch}
                className="min-h-11 px-4 py-2.5 rounded border-2 border-retro-border text-retro-text font-pixel text-[10px] hover:border-retro-p1/60 disabled:opacity-50"
              >{newMatchBusy ? 'RESETTING…' : 'NEW MATCH'}</button>
              {onSwitchGame && <GameSwitcher currentType="wirecrossed" onSwitch={onSwitchGame} />}
            </div>
          )}
        </>
      )}

      {armed && role === 'handbook' && (
        <p className="font-mono text-[10px] text-retro-dim text-center">Only the Tech can touch the device. Ask what they see.</p>
      )}
    </div>
  )
}
