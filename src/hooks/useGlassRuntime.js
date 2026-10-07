import { useEffect } from 'react'
import useThemeId from './useThemeId'
import { isGlassTheme } from '../lib/glassLogic'
import { startGlassRuntime } from '../lib/glassRuntime'

// Runs the GLASS runtime (engine verdict, low-end step-down, highlight) while a
// GLASS theme is active and cleans up when the player picks another one.
export default function useGlassRuntime() {
  const theme = useThemeId()
  useEffect(() => (isGlassTheme(theme) ? startGlassRuntime() : undefined), [theme])
}
