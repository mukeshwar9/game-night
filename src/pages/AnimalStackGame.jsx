import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ref, runTransaction, update } from 'firebase/database'
import { toast } from 'sonner'
import { db } from '../lib/firebase'
import { stateTop, pieceAt, heartsFor, TURN_MS, ROT_STEPS, AIM_LIMIT_CM } from '../lib/animalStackLogic'
import {
  readStack, cpState, pendingDrop, turnUid, applyDrop, applySettle, applyNextTower, applyAway,
  AWAY_GRACE_MS, IDLE_GRACE_MS, ROUNDOVER_MS, MAX_SEATS,
} from '../lib/animalStackRoom'
import { isRoomCoordinator } from '../lib/coordinator'
import { sounds } from '../lib/sounds'
import useBusy from '@/hooks/useBusy'
import useStackPlayback from '../hooks/useStackPlayback'
import AnimalStackArena from '../components/AnimalStackArena'
import AnimalStackRail from '../components/AnimalStackRail'
import { PLAYER_GLYPHS, PLAYER_TOKENS } from '../components/animalStackDraw'
import GameSwitcher from '../components/GameSwitcher'
import LiveAnnouncer from '../components/LiveAnnouncer'
import WinEffect from '../components/WinEffect'
import { cn } from '@/lib/utils'

// ANIMAL STACK — online room (nPlayer, 2-4 seats).
//
// Room model: uid-keyed players with a lobby → coordinator START (Game.jsx's
// handleNStart runs the registry startRound = startStackMatch). Everything
// per-match lives in games/{id}/stack; the rules are in animalStackRoom.js.
//
// Sync is deterministic replay over RTDB (no WebRTC): the seat to move appends
// {x, r}; every client simulates that drop from the checkpoint with the same
// fixed-step physics and the first to finish writes the outcome. The tower
// on screen is always the checkpoint `cp`; a client whose own replay hashes
// differently snaps to it.
//
// Timers: the seat to move auto-drops itself when its 15 s runs out. Every
// other seated client times how long it has seen that seat offline (or the
// turn sitting open) using local durations only, and past the grace period
// drops for them — a second miss while offline knocks them out.

const TEXT_TOK = { p1: 'text-retro-p1', p2: 'text-retro-p2', p3: 'text-retro-p3', p4: 'text-retro-p4' }
const CTA = 'min-h-11 px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50'
const SEC = 'min-h-11 px-5 py-2.5 border-2 border-retro-border text-retro-text font-pixel text-[10px] rounded transition-all active:scale-95 hover:border-retro-p1/50 hover:text-retro-p1 disabled:opacity-50'

function lobbySeats(players) {
  return Object.values(players || {})
    .filter(p => p && p.playerId)
    .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0) || String(a.playerId).localeCompare(String(b.playerId)))
}

export default function AnimalStackGame({ gameId, game, mySeat, players, onStart, onSwitchGame, onNewMatch }) {
  const [busy, run] = useBusy()
  const status = game.status ?? 'waiting'
  const stack = useMemo(() => readStack(game.stack), [game.stack])
  const amCoordinator = isRoomCoordinator(mySeat, players, game.hostUid)
  const roomRef = useMemo(() => ref(db, `games/${gameId}`), [gameId])

  if (!stack || status === 'waiting') {
    return <Lobby players={players} mySeat={mySeat} amCoordinator={amCoordinator} busy={busy} onStart={() => run(async () => { await onStart() })} onSwitchGame={onSwitchGame} />
  }
  return (
    <Match
      key={`${gameId}:${stack.base}`}
      game={game} stack={stack} players={players} mySeat={mySeat} roomRef={roomRef}
      amCoordinator={amCoordinator} onStart={onStart} onNewMatch={onNewMatch} onSwitchGame={onSwitchGame}
    />
  )
}

function Lobby({ players, mySeat, amCoordinator, busy, onStart, onSwitchGame }) {
  const seats = lobbySeats(players)
  const enough = seats.length >= 2
  const amSeated = !!players?.[mySeat]
  return (
    <div className="w-full max-w-sm mx-auto space-y-3 text-center">
      <div className="space-y-1.5">
        <p className="font-pixel text-sm text-retro-cta text-glow-cta">ANIMAL STACK</p>
        <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
          2–4 players. Take turns dropping animals on one tower.<br />Topple it and you lose a heart — last one standing wins.
        </p>
      </div>
      <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1.5 text-left">
        <p className="font-pixel text-[9px] text-retro-dim tracking-widest">SEATS ({Math.min(seats.length, MAX_SEATS)}/{MAX_SEATS})</p>
        {seats.length === 0 && <p className="font-mono text-[11px] text-retro-dim arcade-blink">WAITING…</p>}
        {seats.slice(0, MAX_SEATS).map((p, i) => (
          <div key={p.playerId} className="flex items-center gap-2 font-mono text-[11px]">
            <span className={cn('w-5 text-center', TEXT_TOK[PLAYER_TOKENS[i]])}>{PLAYER_GLYPHS[i]}</span>
            <span className={cn('truncate flex-1', p.playerId === mySeat ? 'text-retro-p1' : 'text-retro-text', p.online === false && 'opacity-40')}>
              {p.name}{p.playerId === mySeat ? ' (YOU)' : ''}
            </span>
          </div>
        ))}
        <p className="font-mono text-[10px] text-retro-dim pt-1">
          {seats.length <= 2 ? '♥♥♥ each in a duel' : '♥♥ each with 3–4 players'} · 15 s to aim
        </p>
      </div>
      {amCoordinator && enough && (
        <button onClick={onStart} disabled={busy} className={CTA}>{busy ? 'STARTING…' : `START · ${Math.min(seats.length, MAX_SEATS)} PLAYERS`}</button>
      )}
      {amCoordinator && !enough && (
        <p className="font-pixel text-[10px] text-retro-p2 arcade-blink">NEED 2+ PLAYERS — SHARE THE ROOM CODE</p>
      )}
      {!amCoordinator && (
        <p className="font-pixel text-[10px] text-retro-dim arcade-blink">{amSeated ? 'WAITING TO START…' : 'SPECTATING — WAITING TO START…'}</p>
      )}
      <GameSwitcher currentType="animalstack" onSwitch={onSwitchGame} />
    </div>
  )
}

function Match({ game, stack, players, mySeat, roomRef, amCoordinator, onStart, onNewMatch, onSwitchGame }) {
  const [busy, run] = useBusy()
  const status = game.status
  const tower = useMemo(() => cpState(stack), [stack.cp.poses]) // eslint-disable-line react-hooks/exhaustive-deps
  const top = useMemo(() => stateTop(tower), [tower])
  const myIdx = stack.order.indexOf(mySeat)
  const amSeated = myIdx >= 0 && !!players?.[mySeat]
  const owner = turnUid(stack)
  const myTurn = !!owner && owner === mySeat && status === 'playing'
  const n = stack.cp.n
  const k = pieceAt(stack.seed, n)
  const next = pieceAt(stack.seed, n + 1)
  const nameOf = (uid) => (players?.[uid]?.name || 'PLAYER').toUpperCase()
  const fx = useRef(null)

  const [aim, setAim] = useState({ x: 0, r: 0 })
  const aimRef = useRef(aim)
  useEffect(() => { aimRef.current = aim })
  const [stamp, setStamp] = useState(null) // { round } of the tower that toppled
  const [clock, setClock] = useState({ key: null, since: 0, now: 0 })
  const [winFxDone, setWinFxDone] = useState(false)
  const endWinFx = useCallback(() => setWinFxDone(true), [])

  const { simRef, play, reset } = useStackPlayback({
    onLand: ({ speed, x, y }) => { sounds.stackLand(speed); fx.current?.burst(x, y) },
  })

  // ── Turn start (derived during render): re-centre my aim ────────────────
  const turnKey = stack.phase === 'aim' && owner ? `${stack.round}:${n}:${stack.turn}` : null
  const [seenTurn, setSeenTurn] = useState(null)
  if (turnKey && turnKey !== seenTurn) {
    setSeenTurn(turnKey)
    setAim({ x: 0, r: 0 })
  }
  const banner = turnKey
    ? { id: turnKey, player: stack.turn, text: owner === mySeat ? `${PLAYER_GLYPHS[stack.turn]} YOUR DROP` : `${PLAYER_GLYPHS[stack.turn]} ${nameOf(owner)} IS AIMING…` }
    : null
  useEffect(() => { if (turnKey && owner === mySeat) sounds.go() }, [turnKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Ghost aim: mirror my aim ≤6 Hz so everyone sees the piece move ─────────
  const lastGhost = useRef({ at: 0, x: null, r: null })
  useEffect(() => {
    if (!myTurn) return
    const g = lastGhost.current
    const x = Math.round(aim.x * 100) / 100
    if (g.x === x && g.r === aim.r) return
    const send = () => {
      lastGhost.current = { at: Date.now(), x, r: aim.r }
      update(roomRef, { 'stack/aim': { x, r: aim.r } }).catch(() => {})
    }
    const wait = 160 - (Date.now() - g.at)
    if (wait <= 0) { send(); return }
    const t = setTimeout(send, wait)
    return () => clearTimeout(t)
  }, [aim, myTurn, roomRef])

  const drop = useCallback(() => {
    if (!myTurn) return
    const a = aimRef.current
    runTransaction(roomRef, (g) => {
      if (!g) return g
      return applyDrop(g, mySeat, { x: a.x * 100, r: a.r }, { expectedN: n }) ?? g
    }).catch(() => toast.error('DROP FAILED — CHECK CONNECTION'))
  }, [myTurn, roomRef, mySeat, n])

  // ── Settle: every client replays the pending drop; seated ones report it ──
  const played = useRef({ key: null, result: null })
  const pend = stack.phase === 'settle' ? pendingDrop(stack) : null
  const pendKey = pend ? `${stack.round}:${pend.n}` : null
  useEffect(() => {
    if (!pend || played.current.key === pendKey) return
    played.current = { key: pendKey, result: null, n: pend.n, round: stack.round }
    const byIdx = stack.order.indexOf(pend.by)
    sounds.stackRelease()
    play(tower, pend).then((res) => {
      if (simRef.current) simRef.current.outline = PLAYER_TOKENS[Math.max(0, byIdx)]
      if (played.current.key === pendKey) played.current.result = res
      if (res.fell) {
        sounds.stackTopple(); fx.current?.shake(); setStamp({ round: stack.round })
      }
      if (!amSeated) return
      runTransaction(roomRef, (g) => {
        if (!g) return g
        return applySettle(g, pend.n, res) ?? g
      }).catch(() => {})
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendKey])

  // Desync tripwire: my replay of drop n must hash to the checkpoint.
  useEffect(() => {
    const p = played.current
    if (!p.result || p.result.fell || p.round !== stack.round || stack.cp.n !== p.n + 1) return
    if (p.result.hash !== stack.cp.hash) {
      console.warn('[animalstack] desync: local', p.result.hash, 'checkpoint', stack.cp.hash)
      reset() // draw the checkpoint tower instead of my sim
    }
  }, [stack.cp.hash, stack.cp.n, stack.round, reset])

  // New tower: clear the fallen sim.
  useEffect(() => { reset() }, [stack.round, reset])

  // ── Round over: after a pause any seated client starts the next tower ─────
  useEffect(() => {
    if (stack.phase !== 'roundover' || !amSeated) return
    const round = stack.round
    const t = setTimeout(() => {
      runTransaction(roomRef, (g) => {
        if (!g) return g
        return applyNextTower(g, round) ?? g
      }).catch(() => {})
    }, ROUNDOVER_MS)
    return () => clearTimeout(t)
  }, [stack.phase, stack.round, amSeated, roomRef])

  // ── Clocks: my own 15 s, and everyone's view of the seat to move ──────────
  const clockKey = owner ? `${stack.round}:${n}:${owner}` : null
  useEffect(() => {
    if (!clockKey) return
    const since = Date.now()
    let lastSec = -1
    let fired = false
    const tick = () => {
      const t = Date.now()
      setClock({ key: clockKey, since, now: t })
      const left = TURN_MS - (t - since)
      if (owner === mySeat) {
        const sec = Math.ceil(left / 1000)
        if (left < 5000 && left > 0 && sec !== lastSec) { lastSec = sec; sounds.stackTick() }
        if (left <= 0 && !fired) { fired = true; drop() }
        return
      }
      if (!amSeated || fired) return
      const offline = players?.[owner]?.online === false || !players?.[owner]
      const elapsed = t - since
      if ((offline && elapsed >= AWAY_GRACE_MS) || elapsed >= IDLE_GRACE_MS) {
        fired = true
        runTransaction(roomRef, (g) => {
          if (!g) return g
          return applyAway(g, owner, n) ?? g
        }).catch(() => {})
      }
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clockKey, players?.[owner]?.online])

  // ── Win celebration + sting, once per finish ──────────────────────────
  const finished = status === 'finished'
  useEffect(() => {
    if (!finished) return
    if (stack.winner === mySeat) sounds.win()
    else if (amSeated) sounds.lose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished])
  const showWinFx = finished && stack.winner === mySeat && !winFxDone

  const onAimDelta = (dx) => setAim(a => ({ ...a, x: Math.max(-AIM_LIMIT_CM / 100, Math.min(AIM_LIMIT_CM / 100, a.x + dx)) }))
  const onRotate = (dir) => { setAim(a => ({ ...a, r: (a.r + dir + ROT_STEPS) % ROT_STEPS })); sounds.stackRotate() }

  const seats = stack.order.map((uid) => ({
    id: uid, name: nameOf(uid), hearts: stack.hearts[stack.order.indexOf(uid)] ?? 0,
    offline: players?.[uid]?.online === false || !players?.[uid],
  }))
  const ghost = stack.aim && !myTurn ? { x: Number(stack.aim.x) || 0, r: Number(stack.aim.r) || 0 } : { x: 0, r: 0 }
  const hover = stack.phase === 'aim' && owner
    ? { k, x: myTurn ? aim.x : ghost.x, r: myTurn ? aim.r : ghost.r, player: stack.turn }
    : null
  const elapsed = clock.key === clockKey ? clock.now - clock.since : 0
  const timerFrac = owner ? Math.max(0, (TURN_MS - elapsed) / TURN_MS) : null
  const awayOwner = owner && owner !== mySeat && (players?.[owner]?.online === false || !players?.[owner])
  const awaySecs = Math.max(0, Math.ceil((AWAY_GRACE_MS - elapsed) / 1000))
  const toppler = stack.result?.toppler

  const announce = finished
    ? (stack.winner === mySeat ? 'You win!' : stack.winner ? `${nameOf(stack.winner)} wins!` : 'Match over.')
    : stack.phase === 'roundover' && toppler ? `Topple! ${nameOf(toppler)} loses a heart.`
      : owner === mySeat ? `Your drop. Tower ${top.toFixed(1)} metres.`
        : owner ? `${nameOf(owner)}'s drop.` : ''

  let hint
  if (stack.phase === 'settle') hint = 'SETTLING…'
  else if (stack.phase === 'roundover') hint = 'NEXT TOWER…'
  else if (owner && !myTurn) hint = amSeated ? 'NOT YOUR TURN' : 'WATCHING'

  return (
    <div className="w-full max-w-md mx-auto space-y-3">
      <LiveAnnouncer message={announce} />
      {showWinFx && <WinEffect winner="X" intensity="match" onDone={endWinFx} />}

      {awayOwner && stack.phase === 'aim' && (
        <p className="text-center font-pixel text-[9px] text-retro-danger" role="status">
          {nameOf(owner)} IS AWAY — {amSeated ? `AUTO-DROP IN ${awaySecs}s` : 'THEIR DROP WILL BE MADE FOR THEM'}
        </p>
      )}

      <AnimalStackArena
        tower={tower}
        top={top}
        simRef={simRef}
        hover={status === 'playing' ? hover : null}
        next={status === 'playing' ? next : null}
        canAct={myTurn}
        onAimDelta={onAimDelta}
        onRotate={onRotate}
        onDrop={drop}
        hint={hint}
        banner={banner}
        stamp={stamp && stamp.round === stack.round ? 'TOPPLE!' : null}
        timerFrac={stack.phase === 'aim' && status === 'playing' ? timerFrac : null}
        heightLabel={`▲ ${top.toFixed(1)} M`}
        rail={<AnimalStackRail seats={seats} turn={status === 'playing' ? stack.turn : -1} you={myIdx >= 0 ? myIdx : null} maxHearts={heartsFor(stack.order.length)} />}
        fxRef={fx}
        ariaLabel={`Tower ${top.toFixed(1)} metres, ${tower.length} animals`}
      />

      {stack.phase === 'roundover' && toppler && (
        <div className="border-2 border-retro-border bg-retro-card rounded p-3 text-center space-y-1" style={{ animation: 'modal-pop 0.28s ease-out' }}>
          <p className="font-pixel text-[9px] text-retro-dim tracking-widest">TOWER {stack.round} TOPPLED BY</p>
          <p className={cn('font-pixel text-sm', TEXT_TOK[PLAYER_TOKENS[stack.order.indexOf(toppler)]])}>
            {PLAYER_GLYPHS[stack.order.indexOf(toppler)]} {toppler === mySeat ? 'YOU' : nameOf(toppler)}{' '}
            {(stack.hearts[stack.order.indexOf(toppler)] ?? 0) > 0 ? '−♥' : 'ARE OUT'}
          </p>
          <p className="font-mono text-[11px] text-retro-dim">next tower in a moment…</p>
        </div>
      )}

      {status === 'finished' && (
        <div className="border-2 border-retro-border bg-retro-card rounded p-4 text-center space-y-3" style={{ animation: 'modal-pop 0.28s ease-out' }}>
          <p className="font-pixel text-[10px] text-retro-dim tracking-widest">MATCH OVER</p>
          <p className={cn('font-pixel text-base', stack.winner === mySeat ? 'text-retro-cta text-glow-cta' : TEXT_TOK[PLAYER_TOKENS[Math.max(0, stack.order.indexOf(stack.winner))]])}>
            {stack.winner === mySeat ? 'YOU WIN!' : stack.winner ? `${nameOf(stack.winner)} WINS!` : 'MATCH OVER'}
          </p>
          <p className="font-mono text-[11px] text-retro-dim">last one standing after {stack.round} tower{stack.round > 1 ? 's' : ''}</p>
          {amCoordinator ? (
            <div className="flex gap-2 justify-center flex-wrap">
              <button className={CTA} disabled={busy} onClick={() => run(async () => { await onStart() })}>{busy ? 'STARTING…' : 'PLAY AGAIN'}</button>
              <button
                className={SEC}
                disabled={busy}
                onClick={() => run(async () => {
                  try { await onNewMatch() } catch { toast.error('NEW MATCH FAILED — CHECK CONNECTION') }
                })}
              >
                LOBBY
              </button>
            </div>
          ) : (
            <p className="font-pixel text-[9px] text-retro-dim arcade-blink">WAITING FOR THE HOST…</p>
          )}
        </div>
      )}

      <p className="font-mono text-[10px] text-retro-dim text-center leading-relaxed">
        DRAG TO AIM · ⟲ ⟳ TURN 15° · DROP LETS GO · ANY ANIMAL IN THE WATER = TOPPLE
      </p>
      <GameSwitcher currentType="animalstack" onSwitch={onSwitchGame} />
    </div>
  )
}
