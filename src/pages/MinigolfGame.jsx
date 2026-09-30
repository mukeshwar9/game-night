import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, runTransaction, update } from 'firebase/database'
import { db } from '../lib/firebase'
import MinigolfPlay from '../components/MinigolfPlay'
import MinigolfScorecard from '../components/MinigolfScorecard'
import GameSwitcher from '../components/GameSwitcher'
import { COURSES, DEFAULT_COURSE, coursePar, getCourse } from '../lib/minigolfCourses'
import { formatVsPar, matchWinner, replayCourse, standings, vsPar } from '../lib/minigolfLogic'
import { normalizeGolfOrder, normalizeGolfShots, shotKey, skipCount } from '../lib/minigolfRoom'
import { isRoomCoordinator } from '../lib/coordinator'
import { SEAT_GLYPHS, seatColor } from '../lib/minigolfUi'
import { sounds } from '../lib/sounds'
import useBusy from '@/hooks/useBusy'
import useServerClock from '../hooks/useServerClock'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// MINIGOLF — online room (nPlayer, 2–4 golfers + spectators).
//
// The room stores only inputs: golfOrder (seats at START), golfShots
// (s0000, s0001… = { by, h, a, p, k }), golfSkip[h][uid] (coordinator
// pick-ups) and the lobby picks golfCourse / golfClock. Every client — players,
// spectators, a reloaded tab — rebuilds turns, balls and scores with
// replayCourse(), so there is no turn pointer to drift. A stroke is written in
// a whole-room transaction that re-runs the replay on the server's copy and
// only appends when it really is the writer's turn; the stroke that completes
// the course also finishes the match (status, winner, scores) in the same
// write.
//
// Idle and dropped golfers: every seated client times the current turn
// locally (durations only, so clock skew can't matter). The room coordinator
// (online-aware, coordinator.js) picks the ball up when the shot clock runs
// out, or after AWAY_GRACE_MS offline; a golfer picked up while offline is
// marked away, and their later turns are picked up at once until they return.

const AWAY_GRACE_MS = 60_000
const CLOCK_WARN_MS = 10_000
const CLOCKS = [[20, '20 S'], [30, '30 S'], [0, 'OFF']]
const DEFAULT_CLOCK = 30

function playersToSeats(players) {
  return Object.values(players || {})
    .filter(p => p && p.playerId)
    .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0) || String(a.playerId).localeCompare(String(b.playerId)))
}

function Seg({ options, value, onChange, disabled, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-flow-col auto-cols-fr rounded border border-retro-border overflow-hidden">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          disabled={disabled}
          onClick={() => onChange(v)}
          className={cn(
            'min-h-10 font-pixel text-[9px] border-r last:border-r-0 border-retro-border transition-colors disabled:cursor-default',
            value === v ? 'bg-retro-tint-cta text-retro-cta' : 'bg-retro-card text-retro-dim enabled:hover:text-retro-text',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

// Finish the match inside a transaction's return value when the replay says
// the course is complete.
function withFinish(room, replay, order) {
  if (!replay.done) return room
  const winner = matchWinner(replay.scores, order)
  const scores = { ...(room.scores || {}) }
  if (winner !== 'draw') scores[winner] = (scores[winner] || 0) + 1
  return { ...room, status: 'finished', winner, scores }
}

export default function MinigolfGame({ gameId, game, mySeat, players, onStart, onSwitchGame, onNewMatch }) {
  const [busy, run] = useBusy()
  const seats = useMemo(() => playersToSeats(players), [players])
  const status = game.status ?? 'waiting'
  const course = game.golfCourse || DEFAULT_COURSE
  const clock = game.golfClock ?? DEFAULT_CLOCK
  const order = useMemo(() => normalizeGolfOrder(game.golfOrder), [game.golfOrder])
  const shots = useMemo(() => normalizeGolfShots(game.golfShots), [game.golfShots])
  const skips = game.golfSkip ?? null
  const amSeated = !!mySeat && !!players?.[mySeat]
  const amGolfer = order.includes(mySeat)
  const amCoordinator = isRoomCoordinator(mySeat, players, game.hostUid)
  const inMatch = (status === 'playing' || status === 'finished') && order.length >= 2

  const meta = useMemo(() => {
    const m = {}
    order.forEach((uid, i) => { m[uid] = { name: (players?.[uid]?.name || 'GONE').toUpperCase().slice(0, 12), seat: i } })
    return m
  }, [order, players])

  const state = useMemo(
    () => (inMatch ? replayCourse({ course, order, shots, skips }) : null),
    [inMatch, course, order, shots, skips],
  )
  const [playBusy, setPlayBusy] = useState(false)
  const myTurn = status === 'playing' && !!state && !state.done && state.turn === mySeat

  const putt = (shot) => {
    if (!myTurn) return
    runTransaction(ref(db, `games/${gameId}`), (g) => {
      if (!g || g.status !== 'playing') return g
      const ord = normalizeGolfOrder(g.golfOrder)
      const list = normalizeGolfShots(g.golfShots)
      const cur = replayCourse({ course: g.golfCourse, order: ord, shots: list, skips: g.golfSkip })
      if (cur.done || cur.turn !== mySeat) return // not my turn on the server copy: abort
      const stroke = { by: mySeat, h: cur.pos, a: shot.a, p: shot.p, k: shot.k }
      const next = replayCourse({ course: g.golfCourse, order: ord, shots: [...list, stroke], skips: g.golfSkip })
      const room = { ...g, golfShots: { ...(g.golfShots || {}), [shotKey(list.length)]: stroke }, lastActivityAt: Date.now() }
      return withFinish(room, next, ord)
    }).catch(() => toast.error('PUTT FAILED — CHECK CONNECTION'))
  }

  // ─── Shot clock + away handling ──────────────────────────────────────────
  const turnUid = state && !state.done && status === 'playing' ? state.turn : null
  const turnKey = turnUid ? `${shots.length}:${skipCount(skips)}:${turnUid}` : null
  const turnOnline = turnUid ? players?.[turnUid]?.online !== false && !!players?.[turnUid] : true
  const turnAway = !!(turnUid && game.golfAway?.[turnUid])
  // Local durations only (clock skew can't matter): when this client first saw
  // the current turn, adjusted during render when the turn changes.
  const { now } = useServerClock(500)
  const [turnSeen, setTurnSeen] = useState({ key: null, since: 0 })
  if (turnKey !== turnSeen.key) setTurnSeen({ key: turnKey, since: now })
  const waited = turnSeen.key === turnKey ? Math.max(0, now - turnSeen.since) : 0
  // Offline → grace, then pick up; already away → pick up at once; online →
  // the host's shot clock (OFF never times out an online golfer).
  const limitMs = !turnOnline ? (turnAway ? 1500 : AWAY_GRACE_MS) : clock > 0 ? clock * 1000 : null
  const secsLeft = limitMs != null ? Math.max(0, Math.ceil((limitMs - waited) / 1000)) : null

  const firedFor = useRef(null)
  useEffect(() => {
    if (!turnKey || !amCoordinator || !amSeated || limitMs == null || playBusy) return
    if (waited < limitMs || firedFor.current === turnKey) return
    firedFor.current = turnKey
    const [shotCount, , uid] = turnKey.split(':')
    const reason = turnOnline ? 'timeout' : 'away'
    runTransaction(ref(db, `games/${gameId}`), (g) => {
      if (!g || g.status !== 'playing') return g
      const ord = normalizeGolfOrder(g.golfOrder)
      const list = normalizeGolfShots(g.golfShots)
      if (String(list.length) !== shotCount) return // a stroke landed meanwhile
      const cur = replayCourse({ course: g.golfCourse, order: ord, shots: list, skips: g.golfSkip })
      if (cur.done || cur.turn !== uid) return
      const golfSkip = { ...(g.golfSkip || {}) }
      golfSkip[cur.pos] = { ...(golfSkip[cur.pos] || {}), [uid]: reason }
      const next = replayCourse({ course: g.golfCourse, order: ord, shots: list, skips: golfSkip })
      const room = { ...g, golfSkip, lastActivityAt: Date.now() }
      if (reason === 'away') room.golfAway = { ...(g.golfAway || {}), [uid]: true }
      return withFinish(room, next, ord)
    }).catch(() => {})
  }, [turnKey, amCoordinator, amSeated, limitMs, waited, turnOnline, playBusy, gameId])

  // Back from away: clear my own flag so my turns play normally again.
  useEffect(() => {
    if (!mySeat || !game.golfAway?.[mySeat] || players?.[mySeat]?.online === false) return
    update(ref(db, `games/${gameId}/golfAway`), { [mySeat]: null }).catch(() => {})
  }, [game.golfAway, mySeat, players, gameId])

  // My turn begins → a short cue (not while the previous stroke still plays).
  const prevMyTurn = useRef(false)
  useEffect(() => {
    const ready = myTurn && !playBusy
    if (ready && !prevMyTurn.current && order.length > 1) sounds.go()
    prevMyTurn.current = ready
  }, [myTurn, playBusy, order.length])

  const setRoom = (patch) => {
    if (!amCoordinator) return
    update(ref(db, `games/${gameId}`), patch).catch(() => toast.error('UPDATE FAILED — CHECK CONNECTION'))
  }

  // ─── Lobby ─────────────────────────────────────────────────────────────────
  if (!inMatch || !state) {
    const enough = seats.length >= 2
    return (
      <div className="w-full max-w-sm mx-auto space-y-3 text-center">
        <div className="space-y-1.5">
          <p className="font-pixel text-sm text-retro-cta text-glow-cta">MINIGOLF</p>
          <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
            2–4 golfers take turns, fewest strokes wins.<br />Pull back anywhere on the course to putt.
          </p>
        </div>

        <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1.5 text-left">
          <p className="font-pixel text-[9px] text-retro-dim tracking-widest">GOLFERS ({Math.min(seats.length, 4)}/4)</p>
          {seats.length === 0 && <p className="font-mono text-[11px] text-retro-dim arcade-blink">WAITING…</p>}
          {seats.map((p, i) => (
            <div key={p.playerId} className="flex items-center gap-2 font-mono text-[11px]">
              {i < 4 ? (
                <span className="shrink-0 w-5 h-5 rounded-full grid place-items-center text-[9px]" style={{ background: seatColor(i), color: 'rgb(var(--c-bg))' }} aria-hidden="true">{SEAT_GLYPHS[i]}</span>
              ) : <span className="shrink-0 w-5 text-center text-retro-dim" aria-hidden="true">👀</span>}
              <span className={cn('truncate flex-1', p.playerId === mySeat ? 'text-retro-p1' : 'text-retro-text', p.online === false && 'opacity-40')}>
                {p.name}{p.playerId === mySeat ? ' (YOU)' : ''}
              </span>
              {i >= 4 && <span className="font-pixel text-[8px] text-retro-dim">WATCHING</span>}
            </div>
          ))}
        </div>

        <div className="space-y-1.5 text-left">
          <p className="font-pixel text-[8px] text-retro-dim tracking-widest">COURSE{amCoordinator ? '' : ' · HOST PICKS'}</p>
          <Seg label="Course" disabled={!amCoordinator} value={course} onChange={(v) => setRoom({ golfCourse: v })} options={Object.values(COURSES).map(c => [c.id, c.label])} />
          <p className="font-pixel text-[8px] text-retro-dim tracking-widest pt-1">SHOT CLOCK</p>
          <Seg label="Shot clock" disabled={!amCoordinator} value={clock} onChange={(v) => setRoom({ golfClock: v })} options={CLOCKS} />
          <p className="font-mono text-[10px] text-retro-dim">{getCourse(course).holes.length} holes · par {coursePar(course)} · 6 strokes max per hole</p>
        </div>

        {amCoordinator && enough && (
          <button
            type="button"
            onClick={() => run(async () => { await onStart() })}
            disabled={busy}
            className="px-6 min-h-11 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50"
          >
            {busy ? 'STARTING…' : `START (${Math.min(seats.length, 4)} GOLFERS)`}
          </button>
        )}
        {amCoordinator && !enough && (
          <p className="font-pixel text-[10px] text-retro-p2 arcade-blink">NEED 2+ PLAYERS — SHARE THE ROOM CODE</p>
        )}
        {!amCoordinator && (
          <p className="font-pixel text-[10px] text-retro-dim arcade-blink">
            {amSeated ? 'WAITING FOR THE HOST TO START…' : 'SPECTATING — WAITING TO START…'}
          </p>
        )}
        <GameSwitcher currentType="minigolf" onSwitch={onSwitchGame} />
      </div>
    )
  }

  // ─── Finished (rendered by MinigolfPlay once the last stroke has played) ──
  const renderResults = () => {
    const s = standings(state.scores, order)
    const winner = game.winner ?? null
    const headline = winner === 'draw' ? 'TIE!' : winner === mySeat ? 'YOU WIN!' : `${meta[winner]?.name ?? '?'} WINS!`
    return (
      <div className="w-full max-w-sm mx-auto space-y-3">
        <div className="text-center space-y-1">
          <p className="font-pixel text-lg text-retro-cta text-glow-cta">{headline}</p>
          <p className="font-mono text-[11px] text-retro-dim">{getCourse(course).label} · par {coursePar(course)}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          {s.map(r => (
            <div key={r.uid} className={cn('flex items-center gap-2 rounded border px-2 py-1.5 bg-retro-card', r.rank === 1 ? 'border-retro-cta' : 'border-retro-border')}>
              <span className="font-pixel text-[9px] w-8 text-retro-dim">{r.rank}{['ST', 'ND', 'RD', 'TH'][Math.min(r.rank - 1, 3)]}</span>
              <span className="w-5 h-5 rounded-full grid place-items-center text-[9px]" style={{ background: seatColor(meta[r.uid].seat), color: 'rgb(var(--c-bg))' }} aria-hidden="true">{SEAT_GLYPHS[meta[r.uid].seat]}</span>
              <span className="flex-1 min-w-0 truncate font-pixel text-[9px] text-retro-text">{meta[r.uid].name}{r.uid === mySeat ? ' (YOU)' : ''}</span>
              <span className="font-pixel text-[9px] text-retro-text">{r.total} ({formatVsPar(vsPar(state.scores[r.uid], course))})</span>
            </div>
          ))}
        </div>
        <div className="rounded border border-retro-border bg-retro-card p-2">
          <MinigolfScorecard course={course} order={order} meta={meta} scores={state.scores} />
        </div>
        {amCoordinator ? (
          <button
            type="button"
            onClick={() => run(async () => { await onNewMatch() })}
            disabled={busy}
            className="w-full min-h-11 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50"
          >
            {busy ? 'RESETTING…' : 'PLAY AGAIN'}
          </button>
        ) : (
          <p className="text-center font-pixel text-[9px] text-retro-dim">WAITING FOR THE HOST TO PLAY AGAIN…</p>
        )}
        <GameSwitcher currentType="minigolf" onSwitch={onSwitchGame} />
      </div>
    )
  }

  // ─── Playing ───────────────────────────────────────────────────────────────
  const turnName = turnUid ? meta[turnUid]?.name ?? '?' : ''
  const showClock = secsLeft != null && (!turnOnline || waited >= CLOCK_WARN_MS)
  let statusText
  if (myTurn) statusText = showClock ? `YOUR PUTT · ${secsLeft}s` : 'YOUR PUTT · DRAG ANYWHERE'
  else if (turnUid && !turnOnline) statusText = `${turnName} OFFLINE · PICK-UP IN ${secsLeft}s`
  else if (turnUid) statusText = `${turnName} IS PUTTING${showClock ? ` · ${secsLeft}s` : '…'}`
  if (!amGolfer) statusText = `${statusText ?? ''}${statusText ? ' · ' : ''}WATCHING`

  return (
    <div className="w-full max-w-sm mx-auto">
      <MinigolfPlay
        course={course}
        order={order}
        meta={meta}
        state={state}
        controllable={myTurn}
        onShot={putt}
        onBusyChange={setPlayBusy}
        renderDone={renderResults}
        statusText={statusText}
      />
    </div>
  )
}
