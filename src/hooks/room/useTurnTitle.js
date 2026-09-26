import { useEffect } from 'react'

const PREFIX = 'YOUR TURN · '

// Prefix document.title with "YOUR TURN · " while this tab is in the
// background and it's this player's move — visible from the tab strip or a
// video-call app. Restored as soon as the tab is visible again, the turn
// passes, or the room unmounts.
export default function useTurnTitle(myTurn) {
  useEffect(() => {
    const strip = () => { if (document.title.startsWith(PREFIX)) document.title = document.title.slice(PREFIX.length) }
    const sync = () => {
      strip()
      if (myTurn && document.visibilityState === 'hidden') document.title = PREFIX + document.title
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      strip()
    }
  }, [myTurn])
}
