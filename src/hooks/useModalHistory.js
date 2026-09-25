import { useEffect, useRef } from 'react'

// Wires an open overlay into the browser/Android back-gesture history stack
// (M-06). Call it once from a mounted-while-open overlay: it pushes a no-op
// history marker on mount so the system back gesture pops that marker
// instead of navigating the underlying route, and closes the overlay via
// `onClose` when that happens. On a normal close (backdrop tap, Escape, a
// button inside the overlay) the overlay unmounts first — the cleanup then
// consumes the still-pending marker with a programmatic back-step so it
// never lingers as an extra dead entry in history.
// A marker whose consuming back-step is scheduled but not yet executed. When
// the next overlay effect mounts inside the same task (StrictMode's dev-only
// mount → cleanup → remount, or one overlay swapped for another), it adopts
// the still-live marker instead of pushing a second one — otherwise the
// deferred history.back() lands *after* the remount attaches its popstate
// listener and instantly closes the freshly opened overlay.
let pendingBack = false

// history.back() only queues a traversal. A navigate() that lands between
// scheduling the marker's back-step and the traversal itself gets popped by
// it — seen when a room is created in a few ms right after its bottom sheet
// closes, bouncing the player off /game/:id. `settling` covers that window;
// code that navigates right after an overlay closes awaits
// waitForModalHistory() first.
let settling = null
let settle = () => {}

export function waitForModalHistory() {
  return settling || Promise.resolve()
}

function beginSettling() {
  if (!settling) settling = new Promise(resolve => { settle = resolve })
}

function endSettling() {
  settling = null
  settle()
}

export default function useModalHistory(onClose) {
  const pushedRef = useRef(false)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (pendingBack) {
      pendingBack = false // adopt the marker the outgoing effect left behind
    } else {
      window.history.pushState({ modalHistory: true }, '')
    }
    pushedRef.current = true

    const onPopState = () => {
      pushedRef.current = false
      onCloseRef.current()
    }
    window.addEventListener('popstate', onPopState)

    return () => {
      window.removeEventListener('popstate', onPopState)
      if (pushedRef.current) {
        pushedRef.current = false
        pendingBack = true
        beginSettling()
        setTimeout(() => {
          if (!pendingBack) return endSettling() // adopted by a remount
          pendingBack = false
          // Only consume the marker if we're still sitting on it. If closing
          // the overlay also navigated (pick-a-mode → /solo/:type), the new
          // route's entry is on top — a back-step here would pop the player
          // right back off the page they just entered.
          if (!window.history.state?.modalHistory) return endSettling()
          const done = () => {
            window.removeEventListener('popstate', done)
            clearTimeout(fallback)
            endSettling()
          }
          const fallback = setTimeout(done, 400)
          window.addEventListener('popstate', done)
          window.history.back()
        }, 0)
      }
    }
  }, [])
}
