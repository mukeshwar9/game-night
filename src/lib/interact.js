import { useMemo, useState } from 'react'

// Select-then-move interaction for two-stage board games (Breakthrough,
// Ataxx, Kamisado, Onitama, Santorini…). The board component calls
// `useSelectMove(moves, onCommit)` with the CURRENT mover's complete
// legal-move list [{ from, to, …payload }], and gets:
//   selected  — currently selected source cell (or null)
//   targets   — [{ index, move }] legal landings for the selection
//   tap(i)    — pass every board tap here; a legal landing commits
//               onCommit(move) and resets the selection.
// A tap on another movable source re-selects; anything else clears.
//
// The selection self-clears when the game state changes WITHOUT a
// setState-in-effect (React Compiler rule): the valid selection is derived —
// if `selected` no longer appears in the fresh move list, we treat it as
// cleared (returns null from the memo).
export function useSelectMove(moves, onCommit, autoSource = null) {
  const [picked, setPicked] = useState(null)

  const byFrom = useMemo(() => {
    const m = new Map()
    for (const mv of moves) {
      if (!m.has(mv.from)) m.set(mv.from, [])
      m.get(mv.from).push(mv)
    }
    return m
  }, [moves])

  // Derived "selected": the tapped source if still movable, else the
  // autoSource (e.g. a game-forced piece) when it is a movable source.
  // Derived, never an effect — picked always wins while it stays legal.
  const selected = picked != null && byFrom.has(picked)
    ? picked
    : autoSource != null && byFrom.has(autoSource) ? autoSource : null

  const targets = selected != null
    ? byFrom.get(selected).map(mv => ({ index: mv.to, move: mv }))
    : []

  const tap = (i) => {
    const hit = targets.find(t => t.index === i)
    if (hit) {
      setPicked(null)
      onCommit(hit.move)
      return
    }
    setPicked(byFrom.has(i) ? i : null)
  }

  return { selected, targets, tap, movable: byFrom }
}
