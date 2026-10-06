// Look-and-feel + celebration prefs. Local-only (device-specific needs like
// motion sickness and text size don't follow the account), mirrored to
// `data-*` attrs / inline style on <html> so CSS and canvas-free components
// react instantly with no re-render. Same shape as lib/font.js.

import { isNative } from './platform'

export const TEXT_SIZES = [
  { id: 's', label: 'S', zoom: '0.9' },
  { id: 'm', label: 'M', zoom: '' },
  { id: 'l', label: 'L', zoom: '1.125' },
  { id: 'xl', label: 'XL', zoom: '1.25' },
]

// AUTO (apps only): follow the phone's own text-size setting. The shell turns
// the web view's own text scaling off (it scaled every px font unchecked on
// Android and ignored Dynamic Type on iOS) and maps the system setting onto
// one of the sizes above, which are the layouts the app is tested at.
export const TEXT_SIZE_AUTO = { id: 'auto', label: 'AUTO' }

/** The choices Settings offers: AUTO only where a system setting can be read. */
export function textSizeOptions(native = isNative) {
  return native ? [TEXT_SIZE_AUTO, ...TEXT_SIZES] : TEXT_SIZES
}

/**
 * Maps the system's preferred text zoom (1 = default, 1.3 = 130 %) to a size.
 * @param {number} zoom
 */
export function textSizeForZoom(zoom) {
  if (!(zoom > 0)) return 'm'
  if (zoom < 0.95) return 's'
  if (zoom < 1.12) return 'm'
  if (zoom < 1.3) return 'l'
  return 'xl'
}

// The system setting, as reported by the shell (lib/native/shell.js).
let systemTextSize = 'm'

const CRT_KEY = 'retro-crt'
const MOTION_KEY = 'retro-motion'
const TEXT_SIZE_KEY = 'retro-textsize'
const WIN_FX_KEY = 'retro-winfx'
const THEME_PREVIEW_KEY = 'retro-themepreview'

function read(key) {
  try { return localStorage.getItem(key) } catch { return null }
}

function write(key, value) {
  try { localStorage.setItem(key, value) } catch { /* storage unavailable */ }
}

// OS-level reduced-motion is the default; an explicit choice overrides it.
export function getDefaultMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full'
  } catch {
    return 'full'
  }
}

export function getStoredCrt() {
  return read(CRT_KEY) !== 'off'
}

export function getStoredMotion() {
  const stored = read(MOTION_KEY)
  return stored === 'reduced' || stored === 'full' ? stored : getDefaultMotion()
}

export function getStoredTextSize() {
  const stored = read(TEXT_SIZE_KEY)
  return textSizeOptions().some(t => t.id === stored) ? stored : defaultTextSize()
}

/** AUTO in the apps, M on the web. */
export function defaultTextSize(native = isNative) {
  return native ? TEXT_SIZE_AUTO.id : 'm'
}

/**
 * Called by the native shell with the system's preferred text zoom, at boot
 * and on every return to the app. Re-applies the size when the player is on
 * AUTO.
 * @param {number} zoom
 */
export function setSystemTextZoom(zoom) {
  systemTextSize = textSizeForZoom(zoom)
  if (getStoredTextSize() === TEXT_SIZE_AUTO.id) applyTextSize(TEXT_SIZE_AUTO.id)
}

export function getWinFx() {
  return read(WIN_FX_KEY) !== 'off'
}

export function applyCrt(on) {
  document.documentElement.dataset.crt = on ? 'on' : 'off'
  write(CRT_KEY, on ? 'on' : 'off')
}

export function applyMotion(mode) {
  const next = mode === 'reduced' ? 'reduced' : 'full'
  document.documentElement.dataset.motion = next
  write(MOTION_KEY, next)
}

export function applyTextSize(id) {
  const auto = id === TEXT_SIZE_AUTO.id && isNative
  const size = TEXT_SIZES.find(t => t.id === (auto ? systemTextSize : id)) || TEXT_SIZES[1]
  document.documentElement.dataset.textsize = size.id
  // Whole-UI zoom: every text-* utility in the app is px-based, so root
  // font-size scaling would miss the text. Zoom keeps boards, text, and
  // touch targets proportional.
  document.documentElement.style.zoom = size.zoom
  const chosen = auto ? TEXT_SIZE_AUTO.id : size.id
  write(TEXT_SIZE_KEY, chosen)
  return chosen
}

export function applyWinFx(on) {
  write(WIN_FX_KEY, on ? 'on' : 'off')
}

// Settings → Theme "PREVIEW" toggle: shows the mini game screen beside the
// theme picker. Off by default so the sheet stays compact.
export function getThemePreview() {
  return read(THEME_PREVIEW_KEY) === 'on'
}

export function applyThemePreview(on) {
  write(THEME_PREVIEW_KEY, on ? 'on' : 'off')
}

export function applyStoredDisplayPrefs() {
  applyCrt(getStoredCrt())
  applyMotion(getStoredMotion())
  applyTextSize(getStoredTextSize())
}

export function resetDisplayPrefs() {
  applyCrt(true)
  applyMotion(getDefaultMotion())
  applyTextSize(defaultTextSize())
  applyWinFx(true)
  applyThemePreview(false)
}
