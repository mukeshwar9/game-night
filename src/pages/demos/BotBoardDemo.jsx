import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import GameStatus from '../../components/GameStatus'
import PlayerCard from '../../components/PlayerCard'
import { sounds } from '../../lib/sounds'
import { normalizeBoard } from '../../lib/gameLogic'
import { getGameConfig, freshGameState } from '../../lib/games'
import { pickBotMove, botDifficulties, DEFAULT_BOT_DIFFICULTY } from '../../lib/demoBots'
import { recordRoundEnd } from '../../lib/analytics'

// ─── Bot difficulty (remembered per game) ─────────────────────────────────────

const difficultyKey = type => `bot-difficulty-${type}`

function readDifficulty(type, levels) {
  try {
    const stored = localStorage.getItem(difficultyKey(type))
    return levels.includes(stored) ? stored : DEFAULT_BOT_DIFFICULTY
  } catch {
    return DEFAULT_BOT_DIFFICULTY
  }
}

// ─── Generic bot harness ──────────────────────────────────────────────────────

export default function BotBoardDemo({ type, mode = 'bot' }) {
  const isLocal = mode === 'local'
  const cfg = getGameConfig(type)
  const makeInit = () => ({
    ...freshGameState(type),
    status: 'playing', winner: null, winningLine: [], currentTurn: 'X',
  })
  const [game, setGame] = useState(makeInit)
  const timerRef = useRef(null)
  // Only the levels this game's bot actually distinguishes (demoBots.js).
  const levels = isLocal ? [] : botDifficulties(type)
  const [difficulty, setDifficulty] = useState(() => readDifficulty(type, levels))
  const chooseDifficulty = (level) => {
    setDifficulty(level)
    try { localStorage.setItem(difficultyKey(type), level) } catch { /* private mode */ }
  }

  // Apply a move the same way Game.jsx handleMove does; returns next game or null if illegal.
  const applyOne = (g, payload, symbol) => {
    const board = cfg.boardSize ? normalizeBoard(g.board, cfg.boardSize) : (g.board || [])
    const index = cfg.getMoveIndex ? cfg.getMoveIndex(board, payload) : 0
    if (cfg.boardSize && index === -1) return null
    let updates, result
    if (cfg.applyMove) {
      const applied = cfg.applyMove({ board, game: g, index, move: payload, symbol })
      if (!applied) return null
      updates = applied.updates
      result = applied.result
    } else {
      const nb = [...board]
      nb[index] = symbol
      result = cfg.getWinner(nb)
      updates = { board: nb, currentTurn: symbol === 'X' ? 'O' : 'X' }
    }
    // Mirror Game.jsx's handleMove: mark the cell/edge just played so boards
    // render the same lasting last-move ring in the demo as in the live game.
    // A hook that already set its own lastMove wins.
    if (cfg.boardSize > 0 && updates.lastMove === undefined) updates.lastMove = index
    const next = { ...g, ...updates }
    if (result) {
      next.winner = result.winner
      next.status = 'finished'
      next.winningLine = result.line || []
    }
    return next
  }

  const handleHumanMove = (payload) => {
    setGame(g => {
      if (g.status !== 'playing') return g
      const symbol = isLocal ? g.currentTurn : 'X'
      if (!isLocal && g.currentTurn !== 'X') return g
      return applyOne(g, payload, symbol) || g
    })
  }

  const prevPig = useRef({ idx: 0, turnScore: 0, rolls: 0 })
  const prevStatus = useRef(game.status)
  useEffect(() => {
    if (type !== 'dice' && type !== 'dice-big') return
    const rolled = (game.diceRollIndex ?? 0) > prevPig.current.idx
    const bankedOrBust = (game.diceTurnScore ?? 0) === 0 && prevPig.current.turnScore > 0
    if (rolled || bankedOrBust) {
      if (game.diceLast === 1) sounds.pigBust(prevPig.current.rolls)
      else if (rolled) sounds.pigRoll((game.diceRolls || []).length)
      else sounds.pigBank()
    }
    prevPig.current = {
      idx: game.diceRollIndex ?? 0,
      turnScore: game.diceTurnScore ?? 0,
      rolls: Array.isArray(game.diceRolls) ? game.diceRolls.length : 0,
    }
  }, [game, type])

  useEffect(() => {
    if (prevStatus.current === 'playing' && game.status === 'finished') {
      if (game.winner === 'draw') sounds.draw()
      else if (isLocal || game.winner === 'X') sounds.win()
      else sounds.lose()
      // Once per finished game: this only fires on the playing → finished edge.
      recordRoundEnd(type, isLocal ? 'local' : 'solo', 'finished')
    }
    prevStatus.current = game.status
  }, [game.status, game.winner, isLocal, type])

  // Bot turn driver — re-runs whenever game changes; handles extra-turns/passes/dice streaks
  // because it simply fires again while it's still O's turn. Skipped entirely
  // in local mode — both seats are human, no timer needed.
  useEffect(() => {
    if (isLocal) return
    if (game.status !== 'playing' || game.currentTurn !== 'O') return
    timerRef.current = setTimeout(() => {
      setGame(g => {
        if (g.status !== 'playing' || g.currentTurn !== 'O') return g
        const move = pickBotMove(type, g, 'O', difficulty)
        if (move === null || move === undefined) return g
        return applyOne(g, move, 'O') || g
      })
    }, 600)
    return () => clearTimeout(timerRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, type, difficulty])

  const reset = () => { clearTimeout(timerRef.current); setGame(makeInit()) }

  const board = cfg.boardSize ? normalizeBoard(game.board, cfg.boardSize) : []
  const canMove = game.status === 'playing' && (isLocal || game.currentTurn === 'X')

  return (
    <div className="space-y-4">
      {levels.length > 1 && (
        <div role="group" aria-label="CPU difficulty" className="flex items-center justify-center gap-1.5">
          <span className="font-pixel text-[8px] text-retro-dim tracking-widest mr-1">CPU</span>
          {levels.map(level => (
            <button
              key={level}
              onClick={() => chooseDifficulty(level)}
              aria-pressed={difficulty === level}
              className={cn(
                'px-3 py-1 font-pixel text-[8px] uppercase rounded border-2 transition-all active:scale-95',
                difficulty === level
                  ? 'border-retro-cta text-retro-cta shadow-neon-cta'
                  : 'border-retro-border text-retro-dim hover:border-retro-p1/50',
              )}
            >
              {level}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {isLocal ? (
          <>
            <PlayerCard name="PLAYER 1" symbol="X" isActive={game.status === 'playing' && game.currentTurn === 'X'} isMe={false} />
            <PlayerCard name="PLAYER 2" symbol="O" isActive={game.status === 'playing' && game.currentTurn === 'O'} isMe={false} />
          </>
        ) : (
          <>
            <PlayerCard name="You" symbol="X" isActive={canMove} isMe />
            <PlayerCard name="CPU" symbol="O" isActive={game.status === 'playing' && game.currentTurn === 'O'} isMe={false} />
          </>
        )}
      </div>
      <cfg.BoardComponent
        board={board}
        onMove={handleHumanMove}
        disabled={!canMove}
        winningLine={game.winningLine || []}
        currentTurn={game.currentTurn}
        lastMove={game.lastMove ?? null}
        {...(cfg.boardProps ? cfg.boardProps(game) : {})}
      />
      <GameStatus
        status={game.status}
        winner={game.winner}
        currentTurn={game.currentTurn}
        mySymbol={isLocal ? null : 'X'}
        extraTurn={!!game.extraTurn}
        onPlayAgain={game.status === 'finished' ? reset : null}
      />
    </div>
  )
}
