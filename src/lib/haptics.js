// One haptics entry point. In the native shell (Capacitor) it drives the
// platform taptic engine through the Haptics plugin, which also works on iOS
// where navigator.vibrate does not exist. In a plain browser it stays silent:
// web vibration was switched off on purpose (see sounds.js) and is not
// re-enabled here.

// Maps a vibrate()-style pattern (a duration or [pause, buzz, pause, buzz…])
// to a plugin impact style: short = light, medium = medium, long = heavy.
export function impactStyle(pattern) {
  const list = Array.isArray(pattern) ? pattern : [pattern]
  const total = list.reduce((sum, n) => sum + (Number(n) || 0), 0)
  if (total <= 0) return null
  if (total <= 14) return 'LIGHT'
  if (total <= 60) return 'MEDIUM'
  return 'HEAVY'
}

function nativeHaptics() {
  try {
    return globalThis.Capacitor?.isNativePlatform?.() ? globalThis.Capacitor.Plugins?.Haptics ?? null : null
  } catch {
    return null
  }
}

export function haptic(pattern) {
  const style = impactStyle(pattern)
  if (!style) return
  const plugin = nativeHaptics()
  if (!plugin) return
  try {
    const result = plugin.impact({ style })
    if (result?.catch) result.catch(() => {})
  } catch { /* haptics are never worth a crash */ }
}
