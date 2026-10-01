import { useState } from 'react'

const isCoarse = () => {
  try { return window.matchMedia('(pointer: coarse)').matches } catch { return false }
}

// Two-tap placement for small touch targets: the first tap on a touch screen
// only marks a cell/column/edge, a second tap on the same one commits. A mouse
// keeps single-click placement. `isOpen(key)` says whether the marked target
// is still a legal one (a move by the opponent can invalidate it), so a stale
// mark never lets a lone tap commit.
export default function useTapConfirm({ disabled = false, isOpen = () => true } = {}) {
  const [twoTap] = useState(isCoarse)
  const [marked, setMarked] = useState(null)
  const pending = marked != null && !disabled && isOpen(marked) ? marked : null
  const tap = (key, commit) => {
    if (!twoTap || pending === key) {
      setMarked(null)
      commit()
    } else {
      setMarked(key)
    }
  }
  return { pending, tap }
}
