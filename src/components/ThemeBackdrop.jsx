import { Suspense } from 'react'
import useThemeId from '../hooks/useThemeId'
import { themeBackdrop } from '../lib/theme'
import { lazyWithRetry } from '../lib/lazyWithRetry'

// Animated scene behind the pages for themes that declare a `backdrop` in
// THEMES (SHORELINE: BeachBackdrop.jsx, GLASS: GlassBackdrop.jsx). Each scene is
// its own chunk, so other themes never download it. `active` is false on
// full-screen worlds that draw their own ground.
const BeachBackdrop = lazyWithRetry(() => import('./BeachBackdrop'))
// GLASS's art stays up on every screen (the glass HUD needs something to sit
// over) but holds still where `active` is false.
const GlassBackdrop = lazyWithRetry(() => import('./GlassBackdrop'))

export default function ThemeBackdrop({ active }) {
  const theme = useThemeId()
  const scene = themeBackdrop(theme)
  if (scene === 'glass') return <Suspense fallback={null}><GlassBackdrop still={!active} /></Suspense>
  if (!active || scene !== 'beach') return null
  return <Suspense fallback={null}><BeachBackdrop /></Suspense>
}

