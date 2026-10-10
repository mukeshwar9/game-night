import { useEffect, useRef } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../../lib/firebase'
import { getGameConfig } from '../../lib/games'

// Runs the current game's registry `roomEffect` (if any) on every room
// snapshot — per-game background protocols such as Pig's seed coin flip
// (./pigSeedProtocol.js). `memo` survives snapshots and game switches for the
// life of the room page, like the refs the protocol used to keep in Game.jsx.
export default function useRoomEffect({ game, gameId, mySymbol }) {
  const memo = useRef({})
  useEffect(() => {
    if (!game) return
    const roomEffect = getGameConfig(game.gameType).roomEffect
    if (!roomEffect) return
    roomEffect({
      game,
      gameId,
      mySymbol: mySymbol.current,
      memo: memo.current,
      write: (patch) => update(ref(db, `games/${gameId}`), patch),
      transact: (fn) => runTransaction(ref(db, `games/${gameId}`), fn),
    })
  }, [game, gameId, mySymbol])
}
