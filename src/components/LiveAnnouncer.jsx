import { useEffect, useState } from 'react'

// One polite, visually hidden live region for the room shell: pass the
// current turn/result text and screen readers speak it whenever it changes
// ("YOUR TURN", "O WINS"). Render it once, outside anything that remounts
// per move, so the region exists before its first message — a live region
// created together with its text is often not announced.
//
//   <LiveAnnouncer message={statusText} />
//
// Re-announcing: identical consecutive text is not spoken twice by most
// screen readers. Pass a changing `announceKey` (e.g. a move counter) to
// force a repeat of the same words.
//
// The text is written shortly after the region clears, which makes
// VoiceOver and NVDA treat every change as new content.
export default function LiveAnnouncer({ message, announceKey, politeness = 'polite' }) {
  const [spoken, setSpoken] = useState('')

  useEffect(() => {
    const clear = setTimeout(() => setSpoken(''), 0)
    const say = message ? setTimeout(() => setSpoken(message), 50) : null
    return () => {
      clearTimeout(clear)
      clearTimeout(say)
    }
  }, [message, announceKey])

  return (
    <div className="sr-only" role="status" aria-live={politeness} aria-atomic="true">
      {spoken}
    </div>
  )
}
