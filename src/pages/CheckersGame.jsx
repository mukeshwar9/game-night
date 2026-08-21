import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import CheckersBoard from '../components/CheckersBoard'
import GameStatus from '../components/GameStatus'
import SpectatorCard from '../components/SpectatorCard'
import {
  normalizeCheckers,
  getLegalMoves,
  applyCheckersMove,
  getCheckersWinner,
} from '../lib/checkersLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// CHECKERS — thin custom page: selection state + standard win machinery.
// Board state lives in the standard `board` key (string[64]).

export default function CheckersGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, proposal,
}) {
  const me = mySymbol === 'X' ? 'X' : 'O'
  const isSpectator = !mySymbol
  const board = useMemo(() => normalizeCheckers(game.board), [game.board])
  const myTurn = game.status === 'playing' && game.currentTurn === me

  const [selected, setSelected] = useState(null)
  const [lastFrom, setLastFrom] = useState(null)
  const [lastTo, setLastTo] = useState(null)
  const prevShotRef = useRef({ count: 0 })

  const moves = useMemo(
    () => (myTurn ? getLegalMoves(board, me) : []),
    [board, myTurn, me],
  )
  const selectedMoves = useMemo(
    () => (selected != null ? moves.filter(m => m.from === selected) : []),
    [moves, selected],
  )
  const legalTargets = selectedMoves
    .map(m => ({ to: m.to, path: m.path }))
    .filter((v, i, a) => a.findIndex(x => x.to === v.to) === i)

  // Reset selection when turn/board changes (render-phase pattern).
  const [prevBoardKey, setPrevBoardKey] = useState(null)
  const boardKey = `${game.currentTurn}:${board.join('')}`
  if (prevBoardKey !== boardKey) {
    setPrevBoardKey(boardKey)
    if (selected != null) setSelected(null)
  }

  // Move + end sounds (piece-count delta detection).
  useEffect(() => {
    const pieces = board.filter(c => c !== '').length
    const prev = prevShotRef.current.count
    if (prevShotRef.current.init && pieces < prev) {
      if (myTurn || game.status !== 'playing') sounds.bust()
      else sounds.miss()
      sounds.move(me)
    }
    prevShotRef.current = { init: true, count: pieces }
  }, [board, me, myTurn, game.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCell = (cell) => {
    if (!myTurn) return
    const piece = board[cell]
    if (piece && piece.toLowerCase() === me.toLowerCase()) {
      const hasMoves = moves.some(m => m.from === cell)
      if (hasMoves) setSelected(cell)
      return
    }
    if (selected == null) return
    const move = selectedMoves.find(m => m.to === cell)
    if (!move) return
    setLastFrom(move.from); setLastTo(move.to)
    setSelected(null)
    if (move.captures?.length) sounds.bust()
    void runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current || current.status !== 'playing') return
      if (current.currentTurn !== me) return
      const curBoard = normalizeCheckers(current.board)
      const applied = applyCheckersMove(curBoard, move.from, move.to)
      if (!applied) return
      const winner = getCheckersWinner(applied.board)
      const next = {
        ...current,
        board: applied.board,
        currentTurn: me === 'X' ? 'O' : 'X',
      }
      if (winner) {
        next.winner = winner.winner
        next.status = 'finished'
        if (winner.winner !== 'draw') {
          next.scores = { ...current.scores, [winner.winner]: (current.scores?.[winner.winner] || 0) + 1 }
        }
      }
      return next
    }).catch(() => {})
  }

  if (isSpectator) {
    return (
      <div className="space-y-4">
        <SpectatorCard />
        <div className="flex justify-center">
          <CheckersBoard board={board} disabled accent="p1" />
        </div>
        <GameStatus status={game.status} winner={game.winner} currentTurn={game.currentTurn} mySymbol="X" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        {game.status === 'playing' && (
          <p className={cn('font-pixel text-[10px] arcade-blink', myTurn ? 'text-retro-cta text-glow-cta' : 'text-retro-dim')}>
            {myTurn ? `YOUR MOVE — ${moves.length} LEGAL` : 'RIVAL MOVES…'}
          </p>
        )}
      </div>

      <div className="flex justify-center">
        <CheckersBoard
          board={board}
          selected={selected}
          legalTargets={legalTargets}
          onSelect={handleCell}
          disabled={!myTurn}
          accent={me === 'X' ? 'p1' : 'p2'}
          lastFrom={lastFrom}
          lastTo={lastTo}
        />
      </div>

      {selected != null && legalTargets.length > 0 && (
        <p className="font-pixel text-[9px] text-retro-dim text-center">
          PICK A PULSING TARGET{legalTargets[0]?.captures?.length ? ' · JUMP!' : ''}
        </p>
      )}

      <GameStatus
        status={game.status}
        winner={game.winner}
        currentTurn={game.currentTurn}
        mySymbol={me}
        onPlayAgain={onPlayAgain ?? null}
      />

      {opponentOnline === false && game.status === 'playing' && (
        <p className="font-pixel text-[8px] text-retro-dim text-center">RIVAL OFFLINE</p>
      )}

      {matchControls(onSwitchGame, proposal)}
    </div>
  )
}

function matchControls(onSwitchGame, proposal) {
  if (!onSwitchGame || proposal) return null
  return (
    <p className="font-pixel text-[8px] text-retro-dim text-center opacity-60">
      SWITCH GAMES FROM THE END SCREEN
    </p>
  )
}
