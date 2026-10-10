import { useSyncExternalStore } from 'react'

// The active theme id for components that draw theme-specific markup
// (ThemeBackdrop). Source of truth: `data-theme` on <html>, written by the
// index.html bootstrap and lib/theme.js applyTheme; observed live so a switch
// from Settings, the theme switcher or another device takes effect at once.

function getSnapshot() {
  return typeof document !== 'undefined' ? document.documentElement.dataset.theme ?? null : null
}

function subscribe(onChange) {
  if (typeof document === 'undefined') return () => {}
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

export default function useThemeId() {
  return useSyncExternalStore(subscribe, getSnapshot, () => null)
}
