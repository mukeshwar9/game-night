import { useState } from 'react'

// Phone Battleship shows one 10x10 grid at a time (two stacked grids never fit
// a phone screen together). The view follows the game: your waters while you
// deploy and while the rival aims, the targeting grid when it is your shot,
// and the targeting grid again once the fleets are revealed. The player can
// still flip it by hand; the next turn change takes over again.
export function autoView({ phase, myTurn }) {
  if (phase === 'placing') return 'fleet'
  if (phase === 'battle') return myTurn ? 'target' : 'fleet'
  return 'target'
}

export default function useBattleshipView({ phase, myTurn }) {
  const auto = autoView({ phase, myTurn })
  const [view, setView] = useState(auto)
  const [prevAuto, setPrevAuto] = useState(auto)
  if (prevAuto !== auto) {
    setPrevAuto(auto)
    setView(auto)
  }
  return [view, setView]
}
