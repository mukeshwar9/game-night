import { useEffect, useRef } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import {
  normalizeChimpLayout, generateChimpLayout, CHIMP_START_LEVEL, CHIMP_GRID,
} from '../lib/chimpLogic'
import ChimpBoard from '../components/ChimpBoard'
import GameStatus from '../components/GameStatus'
import GameSwitcher from '../components/GameSwitcher'
import { sounds } from '../lib/sounds'
import { toast } from 'sonner'

export default function ChimpGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onNewMatch, proposal,
}) {
  const layout = normalizeChimpLayout(game.chimpLayout)
  const level   = game.chimpLevel ?? CHIMP_START_LEVEL

  const myKey  = mySymbol === 'X' ? 'X' : 'O'
  const opKey  = myKey === 'X' ? 'O' : 'X'

  const myProgress = game[`chimpProgress${myKey}`] ?? 0
  const opProgress = game[`chimpProgress${opKey}`] ?? 0
  const myDone     = game[`chimpDone${myKey}`]     ?? false
  const opDone     = game[`chimpDone${opKey}`]     ?? false

  const prevDoneX = useRef(game.chimpDoneX ?? false)
  const prevDoneO = useRef(game.chimpDoneO ?? false)

  // When both players are done, one client advances the level (transaction ensures
  // only the first write wins; the second sees doneX/O already reset and aborts).
  const tryAdvanceLevel = async () => {
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current) return
        if (!current.chimpDoneX || !current.chimpDoneO) return  // abort
        const newLevel  = (current.chimpLevel ?? CHIMP_START_LEVEL) + 1
        const newLayout = generateChimpLayout(newLevel)
        return {
          ...current,
          chimpLevel: newLevel,
          chimpLayout: newLayout,
          chimpProgressX: 0,
          chimpProgressO: 0,
          chimpDoneX: false,
          chimpDoneO: false,
        }
      })
    } catch { /* other client already advanced — ignore */ }
  }

  // Also trigger from the watcher side (the player who finishes second)
  useEffect(() => {
    const doneX = game.chimpDoneX ?? false
    const doneO = game.chimpDoneO ?? false
    if (doneX && doneO && (!prevDoneX.current || !prevDoneO.current)) {
      tryAdvanceLevel()
    }
    prevDoneX.current = doneX
    prevDoneO.current = doneO
  }, [game.chimpDoneX, game.chimpDoneO])

  const handleCellClick = async (cellIndex) => {
    if (!mySymbol || myDone || game.status !== 'playing') return
    if (cellIndex < 0 || cellIndex >= CHIMP_GRID) return

    const expected = layout[myProgress]
    if (expected !== cellIndex) {
      sounds.lose()
      try {
        await update(ref(db, `games/${gameId}`), {
          winner: opKey,
          status: 'finished',
          [`scores/${opKey}`]: (game.scores?.[opKey] || 0) + 1,
        })
      } catch { toast.error('MOVE FAILED — CHECK CONNECTION') }
      return
    }

    sounds.move(mySymbol)
    const newProgress = myProgress + 1

    if (newProgress === level) {
      try {
        await update(ref(db, `games/${gameId}`), {
          [`chimpProgress${myKey}`]: newProgress,
          [`chimpDone${myKey}`]: true,
        })
        await tryAdvanceLevel()
      } catch { toast.error('MOVE FAILED — CHECK CONNECTION') }
    } else {
      try {
        await update(ref(db, `games/${gameId}`), { [`chimpProgress${myKey}`]: newProgress })
      } catch { toast.error('MOVE FAILED — CHECK CONNECTION') }
    }
  }

  const matchWinner = (game.scores?.X || 0) >= 3 ? 'X' : (game.scores?.O || 0) >= 3 ? 'O' : null

  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
        <GameStatus
          status={game.status}
          winner={game.winner}
          mySymbol={mySymbol}
          scores={game.scores}
          players={game.players}
          gameType={game.gameType}
          onPlayAgain={!matchWinner && !proposal ? onNewMatch : null}
          onNewMatch={matchWinner && !proposal ? onNewMatch : null}
          onSwitchGame={!proposal ? onSwitchGame : null}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ChimpBoard
        onMove={handleCellClick}
        disabled={!mySymbol || myDone}
        chimpLayout={layout}
        myProgress={myProgress}
        opProgress={opProgress}
        myDone={myDone}
        opDone={opDone}
        chimpLevel={level}
      />
      {!opponentOnline && mySymbol && (
        <p className="font-pixel text-[10px] text-retro-p2 text-center animate-pulse">
          OPPONENT DISCONNECTED
        </p>
      )}
      {!proposal && <GameSwitcher onSwitchGame={onSwitchGame} />}
    </div>
  )
}
