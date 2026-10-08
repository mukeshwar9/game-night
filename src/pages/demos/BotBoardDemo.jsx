import { useState, useRef, useEffect } from 'react'
import useFocusArena from '../../hooks/useFocusArena'
import { cn } from '@/lib/utils'
import GameStatus from '../../components/GameStatus'
import PlayerCard from '../../components/PlayerCard'
import { sounds } from '../../lib/sounds'
import { normalizeBoard } from '../../lib/gameLogic'
import { getGameConfig, freshGameState } from '../../lib/games'
import { pickBotMove, botDifficulties, observeDemoMove, DEFAULT_BOT_DIFFICULTY } from '../../lib/demoBots'
import { recordRoundEnd } from '../../lib/analytics'
import { trackGameFinished } from '../../lib/track'
import { readBotRecord, recordBotResult, easierLevel, formatLevelRecord, describeLevelRecord } from '../../lib/botRecordLogic'
import { canFocus } from '../../lib/focusLogic'
import useFocusMode from '../../hooks/useFocusMode'
import FocusStage, { FocusButton, FocusSeat } from '../../components/FocusStage'

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

// The player's own display name (mirrored to localStorage from the profile),
// so the card reads "NOVA · YOU" rather than the doubled "You / YOU".
function localName() {
  try { return localStorage.getItem('playerName') || 'YOU' } catch { return 'YOU' }
}

// Boards plus their controls that run taller than a phone screen once the app
// header is counted: bring them to the top of the screen on mount.
const TALL_BOARDS = new Set(['onitama', 'blockade'])

// Pass-and-play for games that reveal something to the player whose turn it is
// (registry `handoffGate`: Simon's flash, Visual Memory's lit tiles). Without a gate
// the reveal started the instant the last move landed — while the phone was still in
// the previous player's hands. The board stays hidden until the new player taps.
function HandoffGate({ name, onReady }) {
  return (
    <div className="min-h-[20rem] flex flex-col items-center justify-center gap-5 rounded border-2 border-dashed border-retro-border bg-retro-surface p-6 text-center" role="status">
      <p className="font-pixel text-[9px] text-retro-dim tracking-widest">PASS THE DEVICE</p>
      <p className="font-pixel text-base text-retro-cta text-glow-cta">{name}</p>
      <p className="font-pixel text-[8px] text-retro-dim leading-relaxed max-w-[16rem]">THE PATTERN SHOWS AS SOON AS YOU TAP, SO MAKE SURE IT IS YOUR TURN.</p>
      <button
        type="button"
        onClick={onReady}
        className="px-6 py-3 min-h-11 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta press"
      >
        I'M READY
      </button>
    </div>
  )
}

export default function BotBoardDemo({ type, mode = 'bot' }) {
  const rootRef = useRef(null)
  useFocusArena(rootRef, TALL_BOARDS.has(type))
  const isLocal = mode === 'local'
  const cfg = getGameConfig(type)
  const makeInit = () => ({
    ...freshGameState(type),
    status: 'playing', winner: null, winningLine: [], currentTurn: 'X',
  })
  const [game, setGame] = useState(makeInit)
  // Which seat has tapped I'M READY for the current turn (pass-and-play gate only).
  const [readyFor, setReadyFor] = useState(null)
  // Focus mode (registry `focus`): the board alone, full screen.
  const focusMode = useFocusMode()
  const timerRef = useRef(null)
  // Only the levels this game's bot actually distinguishes (demoBots.js).
  const levels = isLocal ? [] : botDifficulties(type)
  const [difficulty, setDifficulty] = useState(() => readDifficulty(type, levels))
  // The player's W–L–D against each level, shown under the picker.
  const [record, setRecord] = useState(() => readBotRecord(type))
  // The level this game counts under: the easiest one picked since its first
  // move, so switching to HARD just before winning doesn't log a HARD win.
  const countedLevelRef = useRef(difficulty)
  // The human always moves first, so a tap on the board starts the game.
  const startedRef = useRef(false)
  const chooseDifficulty = (level) => {
    setDifficulty(level)
    countedLevelRef.current = startedRef.current ? easierLevel(countedLevelRef.current, level, levels) : level
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
    // Bots that learn from what is turned up (Pairs) note this move. Local only.
    if (!isLocal) Object.assign(next, observeDemoMove(type, g, cfg.boardSize ? index : null, difficulty))
    if (result) {
      next.winner = result.winner
      next.status = 'finished'
      next.winningLine = result.line || []
    }
    return next
  }

  const handleHumanMove = (payload) => {
    if (game.status === 'playing') startedRef.current = true
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
      trackGameFinished(type, isLocal ? 'local' : 'solo', isLocal ? 'finished' : game.winner === 'draw' ? 'draw' : game.winner === 'X' ? 'win' : 'loss')
      if (!isLocal) {
        const outcome = game.winner === 'draw' ? 'draw' : game.winner === 'X' ? 'win' : 'loss'
        setRecord(recordBotResult(type, countedLevelRef.current, outcome))
      }
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

  const reset = () => {
    clearTimeout(timerRef.current); setGame(makeInit()); setReadyFor(null)
    countedLevelRef.current = difficulty
    startedRef.current = false
  }
  const gated = isLocal && !!cfg.handoffGate && game.status === 'playing' && readyFor !== game.currentTurn
  const seatName = game.currentTurn === 'O' ? 'PLAYER 2' : 'PLAYER 1'

  const board = cfg.boardSize ? normalizeBoard(game.board, cfg.boardSize) : []
  const canMove = game.status === 'playing' && (isLocal || game.currentTurn === 'X')
  const focusable = canFocus(cfg)
  const focusOn = focusMode.on && focusable
  const seats = isLocal
    ? { X: { name: 'PLAYER 1' }, O: { name: 'PLAYER 2' } }
    : { X: { name: localName() }, O: { name: 'CPU' } }

  // The board and its status line: in the card, or split between the focus
  // stage (board) and its footer (status, PLAY AGAIN).
  const boardEl = gated ? (
    <HandoffGate name={seatName} onReady={() => setReadyFor(game.currentTurn)} />
  ) : (
    <cfg.BoardComponent
      board={board}
      onMove={handleHumanMove}
      disabled={!canMove}
      winningLine={game.winningLine || []}
      currentTurn={game.currentTurn}
      lastMove={game.lastMove ?? null}
      {...(isLocal && type === 'mancala' ? { mySymbol: game.currentTurn, accent: game.currentTurn === 'X' ? 'p1' : 'p2', hotseat: true, players: seats } : {})}
      {...(cfg.boardProps ? cfg.boardProps(game) : {})}
    />
  )
  const statusEl = (
    <GameStatus
      status={game.status}
      winner={game.winner}
      currentTurn={game.currentTurn}
      mySymbol={isLocal ? null : 'X'}
      players={seats}
      extraTurn={!!game.extraTurn}
      onPlayAgain={game.status === 'finished' ? reset : null}
    />
  )

  return (
    <div ref={rootRef} className="scroll-mt-3 space-y-4">
      {levels.length > 1 && (
        <div role="group" aria-label="CPU difficulty" className="flex items-center justify-center gap-1.5">
          <span className="font-pixel text-[8px] text-retro-dim tracking-widest mr-1">CPU</span>
          {levels.map(level => (
            <button
              key={level}
              onClick={() => chooseDifficulty(level)}
              aria-pressed={difficulty === level}
              aria-label={`${level}, your record ${describeLevelRecord(record[level])}`}
              className={cn(
                'min-h-11 px-4 py-1 font-pixel text-[9px] uppercase rounded border-2 transition press flex flex-col items-center justify-center gap-1',
                difficulty === level
                  ? 'border-retro-cta text-retro-cta shadow-neon-cta'
                  : 'border-retro-border text-retro-dim hover:border-retro-p1/50',
              )}
            >
              <span>{level}</span>
              {formatLevelRecord(record[level]) && (
                <span data-testid={`bot-record-${level}`} className="text-[7px] text-retro-dim">{formatLevelRecord(record[level])}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {levels.length === 1 && formatLevelRecord(record[levels[0]]) && (
        <p data-testid={`bot-record-${levels[0]}`} className="font-pixel text-[8px] text-retro-dim text-center tracking-widest">
          YOU VS CPU · {formatLevelRecord(record[levels[0]])}
        </p>
      )}
      {focusOn ? (
        <FocusStage
          label={cfg.label}
          onExit={focusMode.exit}
          hud={(
            <div className="flex items-center gap-1.5">
              <FocusSeat symbol="X" name={seats.X.name} active={game.status === 'playing' && game.currentTurn === 'X'} isMe={!isLocal} />
              <FocusSeat symbol="O" name={seats.O.name} active={game.status === 'playing' && game.currentTurn === 'O'} />
            </div>
          )}
          footer={statusEl}
        >
          {boardEl}
        </FocusStage>
      ) : (
        <>
          <div className={cn('grid gap-2 items-center', focusable ? 'grid-cols-[1fr_1fr_auto]' : 'grid-cols-2')}>
            {isLocal ? (
              <>
                <PlayerCard name="PLAYER 1" symbol="X" isActive={game.status === 'playing' && game.currentTurn === 'X'} isMe={false} />
                <PlayerCard name="PLAYER 2" symbol="O" isActive={game.status === 'playing' && game.currentTurn === 'O'} isMe={false} />
              </>
            ) : (
              <>
                <PlayerCard name={localName()} symbol="X" isActive={canMove} isMe />
                <PlayerCard name="CPU" symbol="O" isActive={game.status === 'playing' && game.currentTurn === 'O'} isMe={false} />
              </>
            )}
            {focusable && <FocusButton onClick={focusMode.enter} className="m-0 min-h-11 min-w-11 inline-flex items-center justify-center p-0" />}
          </div>
          {boardEl}
          {statusEl}
        </>
      )}
    </div>
  )
}
