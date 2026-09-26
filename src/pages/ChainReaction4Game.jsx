import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import { CR_SYMBOLS_4, CR_COLS, CR_ROWS, applyChainReaction4Move } from '../lib/chainReactionLogic'
import { CR4_OFFLINE_GRACE_MS, awayTurnOwner, dealtSymbols, skipAwayTurn } from '../lib/chainReaction4Logic'
import { isRoomCoordinator } from '../lib/coordinator'
import ChainReactionBoard from '../components/ChainReactionBoard'
import { crSymbolColor } from '../components/crColors'
import GameSwitcher from '../components/GameSwitcher'
import { sounds } from '../lib/sounds'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'

// CHAIN REACTION — 4P (nPlayer variant, 2–4 players)
//
// Room model: uid-keyed players (party-game infra) with a lobby → host START
// flow. On start, join-order seats deal the colors X O A B and the shared
// turn pointer begins on X. Moves go through runTransaction so simultaneous
// taps from four humans can't double-fire one cell.
//
// Elimination: once EVERYONE has placed at least once, a cascade that wipes
// your last orb marks you out; turns skip you; last color standing wins.
//
// Host leaving: START / NEW MATCH go to the online-aware coordinator (lowest
// online seat), not the fixed creator. A player who drops on their own turn is
// skipped once any seated player has seen them offline for
// CR4_OFFLINE_GRACE_MS (chainReaction4Logic.skipAwayTurn, in a transaction).

// Seat labels are theme-neutral: the four orb colors come from --c-* tokens
// and change per theme (Matcha's "cyan" seat is green), so naming a hue lies.
// A swatch glyph in the seat's own color carries identity instead.
const SYMBOL_LABEL = { X: '● P1', O: '● P2', A: '● P3', B: '● P4' }

function playersToSeats(players) {
  return Object.values(players || {})
    .filter(p => p && p.playerId)
    .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0) || String(a.playerId).localeCompare(String(b.playerId)))
}

export default function ChainReaction4Game({
  gameId, game, mySeat, players,
  onStart, onSwitchGame, onNewMatch,
}) {
  const [busy, run] = useBusy()
  const seats = useMemo(() => playersToSeats(players), [players])
  const seatSymbols = game.crSeatSymbols || {}
  const mySymbol = seatSymbols[mySeat] ?? null
  const status = game.status ?? 'waiting'
  const winner = game.winner ?? null
  const eliminated = game.crEliminated || {}
  const currentTurn = game.currentTurn
  const myTurn = status === 'playing' && !!mySymbol && currentTurn === mySymbol && !eliminated[mySymbol]
  const amSeated = !!mySeat && !!players?.[mySeat]
  // Online-aware host: a creator who closed the tab hands START / NEW MATCH to
  // the next online seat instead of leaving everyone on "WAITING FOR HOST".
  const amCoordinator = isRoomCoordinator(mySeat, players, game.hostUid)

  // The player to move has dropped (offline or left the room).
  const away = awayTurnOwner(game, players)
  const awayKey = away ? `${game.crMoves ?? 0}:${away.symbol}` : null
  const [awayClock, setAwayClock] = useState({ key: null, since: 0, now: 0 })

  const cellCounts = useMemo(() => {
    const board = game.board || []
    const counts = {}
    for (const sym of CR_SYMBOLS_4) counts[sym] = board.filter(c => c && c[0] === sym).length
    return counts
  }, [game.board])

  const start = () => run(async () => { await onStart() })

  // The turn-transactional move. The transaction body re-validates: my color,
  // my turn, not eliminated, legal cell. A loser's stale tap just no-ops.
  const place = (index) => {
    if (!mySymbol || !myTurn) return
    run(async () => {
      await runTransaction(ref(db, `games/${gameId}`), (g) => {
        if (!g || g.status !== 'playing') return g
        const expected = (g.crSeatSymbols || {})[mySeat]
        if (!expected || g.currentTurn !== expected) return g
        if ((g.crEliminated || {})[expected]) return g
        const res = applyChainReaction4Move({
          board: g.board || [], game: g, index, symbol: expected,
          // Only the dealt colours rotate — a 2–3 player match would
          // otherwise hand the turn to an unowned colour and freeze.
          symbols: dealtSymbols(g.crSeatSymbols), cols: CR_COLS, rows: CR_ROWS,
        })
        if (!res) return g
        return { ...g, ...res.updates, ...(res.result ? { winner: res.result.winner, status: 'finished' } : {}) }
      })
    })
  }

  // Away skip: every seated client times how long it has seen the player to
  // move as away (local durations only, so clock skew can't matter). Past the
  // grace period any of them may pass the turn on; the transaction re-checks
  // presence and the expected turn, so racing clients skip at most once.
  useEffect(() => {
    if (!awayKey || !amSeated) return
    const expected = awayKey.split(':')[1]
    const since = Date.now()
    const tick = () => {
      const t = Date.now()
      setAwayClock({ key: awayKey, since, now: t })
      if (t - since < CR4_OFFLINE_GRACE_MS) return
      runTransaction(ref(db, `games/${gameId}`), (g) => {
        if (!g) return g
        const res = skipAwayTurn(g, g.players, expected)
        if (!res) return // nothing to skip any more — abort, no write
        return { ...g, ...res.updates, lastActivityAt: Date.now() }
      }).catch(() => {})
    }
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [awayKey, amSeated, gameId])
  const awaySecsLeft = awayClock.key === awayKey
    ? Math.max(0, Math.ceil((CR4_OFFLINE_GRACE_MS - (awayClock.now - awayClock.since)) / 1000))
    : Math.ceil(CR4_OFFLINE_GRACE_MS / 1000)

  // Sound reactions: my placement drops, my elimination loses, my win
  // celebrates. All derived from state transitions inside one effect — never
  // during render.
  const prevRef = useRef({ board: null, winner: null })
  useEffect(() => {
    const prev = prevRef.current
    if (prev.board !== game.board) {
      if (prev.board != null) {
        if (game.crLastMove?.by === mySymbol) sounds.drop()
        const count = (b) => (b || []).filter((c) => c && c[0] === mySymbol).length
        if (mySymbol && prev.board && count(prev.board) > 0 && count(game.board) === 0 && !winner) sounds.lose()
      }
      prevRef.current = { board: game.board, winner }
    }
    if (winner && winner === mySymbol && prev.winner !== winner) sounds.win()
  }, [game.board, game.crLastMove, mySymbol, winner])

  // ─── Lobby ─────────────────────────────────────────────────────────────────
  if (status !== 'playing' || !game.board) {
    const enough = seats.length >= 2
    return (
      <div className="w-full max-w-sm mx-auto space-y-3 text-center">
        <div className="space-y-1.5">
          <p className="font-pixel text-sm text-retro-p1 text-glow-p1">CHAIN REACTION 4P</p>
          <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
            2–4 players. One grid, four colors.<br />Wipe every rival orb — last color standing wins.
          </p>
        </div>

        <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1.5">
          <p className="font-pixel text-[9px] text-retro-dim tracking-widest">
            PLAYERS ({seats.length}/4)
          </p>
          {seats.length === 0 && <p className="font-mono text-[11px] text-retro-dim arcade-blink">WAITING…</p>}
          {seats.map((p, i) => (
            <div key={p.playerId} className="flex items-center justify-between font-mono text-[11px]">
              <span className={cn('truncate', p.playerId === mySeat ? 'text-retro-p1' : 'text-retro-text', p.online === false && 'opacity-40')}>
                {p.name}{p.playerId === mySeat ? ' (YOU)' : ''}
              </span>
              <span className={crSymbolColor(CR_SYMBOLS_4[i]).legend}>{SYMBOL_LABEL[CR_SYMBOLS_4[i]]}</span>
            </div>
          ))}
        </div>

        {amCoordinator && enough && (
          <button
            onClick={start}
            disabled={busy}
            className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50"
          >
            {busy ? 'STARTING…' : 'START MATCH'}
          </button>
        )}
        {amCoordinator && !enough && (
          <p className="font-pixel text-[10px] text-retro-p2 arcade-blink">
            NEED 2+ PLAYERS — SHARE THE ROOM CODE
          </p>
        )}
        {!amCoordinator && (
          <p className="font-pixel text-[10px] text-retro-dim arcade-blink">
            {amSeated ? 'WAITING TO START…' : 'SPECTATING — WAITING TO START…'}
          </p>
        )}

        <GameSwitcher currentType="chainreaction4" onSwitch={onSwitchGame} />
      </div>
    )
  }

  // ─── Playing / finished ────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-sm mx-auto space-y-2">
      {/* Roster strip: color · name · status; mine highlighted */}
      <div className="grid grid-cols-2 gap-1.5">
        {seats.map((p, i) => {
          const sym = seatSymbols[p.playerId] ?? CR_SYMBOLS_4[i]
          const col = crSymbolColor(sym)
          const isMe = p.playerId === mySeat
          const out = !!eliminated[sym]
          return (
            <div
              key={p.playerId}
              className={cn(
                'flex items-center gap-1.5 rounded border px-2 py-1.5 transition-all',
                out ? 'opacity-35 border-retro-border/40' : currentTurn === sym ? col.cell : 'border-retro-border/40',
              )}
            >
              <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', col.orb)} />
              <span className={cn('font-mono text-[10px] truncate flex-1', isMe ? 'text-retro-p1' : 'text-retro-text')}>
                {p.name}{isMe ? ' (YOU)' : ''}
              </span>
              <span className={cn('font-pixel text-[8px]', out ? 'text-retro-danger' : col.text)}>
                {out ? 'OUT' : cellCounts[sym]}
              </span>
            </div>
          )
        })}
      </div>

      <ChainReactionBoard
        board={game.board || []}
        onMove={place}
        disabled={!myTurn || busy}
        currentTurn={currentTurn}
        crLastMove={game.crLastMove ?? null}
        cols={CR_COLS}
        rows={CR_ROWS}
        symbols={CR_SYMBOLS_4}
      />

      {/* Turn banner */}
      {status === 'playing' && (
        <p className={cn('text-center font-pixel text-[10px]', myTurn ? crSymbolColor(mySymbol).legend : 'text-retro-dim')}>
          {myTurn
            ? `YOUR TURN — PLACE ${SYMBOL_LABEL[mySymbol]}`
            : eliminated[mySymbol]
              ? 'YOU ARE OUT — SPECTATING'
              : `${(seats.find(p => seatSymbols[p.playerId] === currentTurn)?.name ?? currentTurn).toUpperCase()}'S TURN…`}
        </p>
      )}
      {status === 'playing' && away && !myTurn && (
        <p className="text-center font-pixel text-[9px] text-retro-p2" role="status">
          {`${(seats.find(p => p.playerId === away.uid)?.name ?? SYMBOL_LABEL[away.symbol] ?? away.symbol).toUpperCase()} IS OFFLINE — `}
          {amSeated ? `SKIPPING IN ${awaySecsLeft}s` : 'THEIR TURN WILL BE SKIPPED'}
        </p>
      )}

      {status === 'finished' && winner && (
        <div className="text-center space-y-2 py-2">
          <p className={cn('font-pixel text-sm', crSymbolColor(winner).legend)}>
            {winner === mySymbol ? 'YOU WIN!' : `${(seats.find(p => seatSymbols[p.playerId] === winner)?.name ?? winner).toUpperCase()} WINS`}
          </p>
          {amCoordinator && (
            <button
            onClick={() => run(async () => {
              try { await onNewMatch() } catch { toast.error('NEW MATCH FAILED — CHECK CONNECTION') }
            })}
              disabled={busy}
              className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50"
            >
              {busy ? 'RESETTING…' : 'NEW MATCH'}
            </button>
          )}
        </div>
      )}

      <GameSwitcher currentType="chainreaction4" onSwitch={onSwitchGame} />
    </div>
  )
}
