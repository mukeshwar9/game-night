// Pure helpers deciding whether a window-level keydown belongs to a game.
// Games listen on `window` so a physical keyboard works without focusing the
// board, but the room chat (EmoteBar) and other text fields share the page:
// a key typed there must never become a letter guess, and Cmd/Ctrl/Alt
// chords (Cmd+R, Ctrl+C) are browser shortcuts, not game input.

const TEXT_INPUT_TYPES = new Set([
  'text', 'search', 'email', 'url', 'tel', 'password', 'number', '',
])

/** True when `target` is an element the user types text into. */
export function isTextEntryTarget(target) {
  if (!target) return false
  if (target.isContentEditable) return true
  const tag = String(target.tagName || '').toUpperCase()
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = String(target.type ?? '').toLowerCase()
    return TEXT_INPUT_TYPES.has(type)
  }
  return false
}

/** True when a keydown event should be left alone by game key handlers. */
export function shouldIgnoreGameKey(event) {
  if (!event) return true
  if (event.ctrlKey || event.metaKey || event.altKey) return true
  if (event.isComposing) return true
  return isTextEntryTarget(event.target)
}
