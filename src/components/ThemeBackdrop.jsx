import { Suspense } from 'react'
import useThemeId from '../hooks/useThemeId'
import { themeBackdrop } from '../lib/theme'
import { lazyWithRetry } from '../lib/lazyWithRetry'

// Animated scene behind the menus for themes that declare a `backdrop` in
// THEMES (SHORELINE: BeachBackdrop.jsx). The scene is its own chunk, so other
// themes never download it. `active` is false on game screens, where the
// waves would only compete with the board.
const BeachBackdrop = lazyWithRetry(() => import('./BeachBackdrop'))

export default function ThemeBackdrop({ active }) {
  const theme = useThemeId()
  if (!active || themeBackdrop(theme) !== 'beach') return null
  return <Suspense fallback={null}><BeachBackdrop /></Suspense>
}

