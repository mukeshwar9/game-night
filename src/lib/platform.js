// @ts-check
// Where the app is running: a browser tab/installed PWA, or the Capacitor
// shell (ios/, android/, docs/MOBILE.md). The native bridge injects
// window.Capacitor before any page script runs, so this needs no import of
// @capacitor/core and adds nothing to the web bundle; native-only code loads
// its plugins with a dynamic import behind `isNative`.

/** @param {any} [win] */
export function detectNativePlatform(win = globalThis) {
  try {
    const cap = win?.Capacitor
    if (!cap?.isNativePlatform?.()) return null
    const p = cap.getPlatform?.()
    return p === 'ios' || p === 'android' ? p : null
  } catch {
    return null
  }
}

/** 'ios' | 'android' inside the Capacitor shell, null on the web. */
export const nativePlatform = detectNativePlatform()
export const isNative = nativePlatform !== null
export const isIOS = nativePlatform === 'ios'
export const isAndroid = nativePlatform === 'android'

/**
 * True on a low-end device: little memory or few cores. Either signal alone
 * is enough; when the browser reports neither (deviceMemory is Chromium-only)
 * we cannot tell, so it counts as low-end.
 * @param {{ deviceMemory?: number, hardwareConcurrency?: number } | null | undefined} nav
 */
export function isLowEndDevice(nav = globalThis.navigator) {
  const mem = typeof nav?.deviceMemory === 'number' && nav.deviceMemory > 0 ? nav.deviceMemory : null
  const cores = typeof nav?.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0 ? nav.hardwareConcurrency : null
  if (mem === null && cores === null) return true
  return (mem !== null && mem <= 4) || (cores !== null && cores <= 4)
}

/**
 * devicePixelRatio to size a canvas backing store with. The web and iOS keep
 * the real ratio; Android WebViews on weak GPUs choke on 3x+ canvases, so the
 * shell caps it at 2 on low-end devices and 3 elsewhere. Callers keep their own
 * `|| 1` / Math.max fallbacks: an unusable raw value is returned unchanged.
 * @param {number} [raw]
 * @param {{ platform?: 'ios' | 'android' | null, nav?: any }} [opts]
 */
export function canvasPixelRatio(raw = globalThis.devicePixelRatio, { platform = nativePlatform, nav = globalThis.navigator } = {}) {
  if (platform !== 'android' || !(raw > 0)) return raw
  return Math.min(raw, isLowEndDevice(nav) ? 2 : 3)
}

// The web origin every shared or invited link points at. Inside the shell the
// page's own origin is capacitor://localhost (iOS) or https://localhost
// (Android), which means nothing to the person receiving the link. Override
// with VITE_PUBLIC_ORIGIN once the custom domain is live.
export const DEFAULT_PUBLIC_ORIGIN = 'https://game-night-91464.web.app'
export const PUBLIC_ORIGIN = normalizeOrigin(import.meta.env?.VITE_PUBLIC_ORIGIN) || DEFAULT_PUBLIC_ORIGIN

/** @param {unknown} value */
export function normalizeOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) return ''
  try {
    const u = new URL(value.trim())
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return ''
    return u.origin
  } catch {
    return ''
  }
}

/**
 * Origin for links other people open. The web keeps its own origin (preview
 * channels, localhost and the e2e server share links to themselves); the
 * shell uses PUBLIC_ORIGIN.
 * @param {{ native?: boolean, locationOrigin?: string, publicOrigin?: string }} [opts]
 */
export function resolveShareOrigin({
  native = isNative,
  locationOrigin = typeof location === 'undefined' ? '' : location.origin,
  publicOrigin = PUBLIC_ORIGIN,
} = {}) {
  if (native || !locationOrigin || !/^https?:$/.test(safeProtocol(locationOrigin))) return publicOrigin
  return locationOrigin
}

/** @param {string} origin */
function safeProtocol(origin) {
  try { return new URL(origin).protocol } catch { return '' }
}

/** Shareable absolute URL for an app path, e.g. shareUrl(`/game/${id}`). */
export function shareUrl(path = '/') {
  const p = String(path || '/')
  return `${resolveShareOrigin()}${p.startsWith('/') ? p : `/${p}`}`
}

/**
 * The current page as a shareable URL (path + search + hash on the share
 * origin), replacing window.location.href in share payloads.
 * @param {{ pathname?: string, search?: string, hash?: string }} [loc]
 */
export function shareCurrentUrl(loc = typeof location === 'undefined' ? {} : location) {
  return shareUrl(`${loc.pathname || '/'}${loc.search || ''}${loc.hash || ''}`)
}
