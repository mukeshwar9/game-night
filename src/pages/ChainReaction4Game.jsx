import { useEffect, useMemo, useRef } from 'react'
import { ref, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import { CR_SYMBOLS_4, CR_COLS, CR_ROWS, applyChainReaction4Move } from '../lib/chainReactionLogic'
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

const SYMBOL_LABEL = { X: 'CYAN', O: 'PINK', A: 'PURPLE', B: 'ORANGE' }

function playersToSeats(players) {
  return Object.values(players || {})
    .filter(p => p && p.playerId)
    .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0) || String(a.playerId).localeCompare(String(b.playerId)))
}

export default function ChainReaction4Game({
  gameId, game, mySeat, players, isHost,
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
          symbols: CR_SYMBOLS_4, cols: CR_COLS, rows: CR_ROWS,
        })
        if (!res) return g
        return { ...g, ...res.updates, ...(res.result ? { winner: res.result.winner, status: 'finished' } : {}) }
      })
    })
  }

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

        {isHost && enough && (
          <button
            onClick={start}
            disabled={busy}
            className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50"
          >
            {busy ? 'STARTING…' : 'START MATCH'}
          </button>
        )}
        {isHost && !enough && (
          <p className="font-pixel text-[10px] text-retro-p2 arcade-blink">
            NEED 2+ PLAYERS — SHARE THE ROOM CODE
          </p>
        )}
        {!isHost && (
          <p className="font-pixel text-[10px] text-retro-dim arcade-blink">
            WAITING FOR HOST…
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

      {status === 'finished' && winner && (
        <div className="text-center space-y-2 py-2">
          <p className={cn('font-pixel text-sm', crSymbolColor(winner).legend)}>
            {winner === mySymbol ? 'YOU WIN!' : `${(seats.find(p => seatSymbols[p.playerId] === winner)?.name ?? winner).toUpperCase()} WINS`}
          </p>
          {isHost && (
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
