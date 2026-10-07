import { useSyncExternalStore } from 'react'

// The active theme id (`data-theme` on <html>), so canvas-painted sprites can
// repaint when the theme changes — they read colours from the --c-* tokens.
function subscribe(onChange) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}
const getSnapshot = () => document.documentElement.getAttribute('data-theme') || ''

export function useThemeKey() {
  return useSyncExternalStore(subscribe, getSnapshot, () => '')
}
