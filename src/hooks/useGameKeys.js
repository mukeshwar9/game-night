import { useEffect, useRef } from 'react'
import { shouldIgnoreGameKey } from '../lib/keyGuard'

// Window-level physical-keyboard input for games, shared by every word game.
//
// - Keys typed into text fields (the room chat, setter inputs) and
//   Cmd/Ctrl/Alt chords are ignored — see src/lib/keyGuard.js.
// - `onKey(event)` returns true when it consumed the key; only then is the
//   browser default prevented, so Backspace/Enter/Space keep working
//   everywhere the game does not use them.
// - The latest `onKey` is read through a ref, so the listener never closes
//   over stale state (the Word Hunt demo used to drop typed words because
//   its handler captured the word list from the render that started play).
export default function useGameKeys(onKey, { enabled = true } = {}) {
  const onKeyRef = useRef(onKey)
  useEffect(() => { onKeyRef.current = onKey })

  useEffect(() => {
    if (!enabled) return
    const handler = (event) => {
      if (shouldIgnoreGameKey(event)) return
      if (onKeyRef.current?.(event)) event.preventDefault()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled])
}
