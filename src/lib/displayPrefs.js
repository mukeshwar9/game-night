// Look-and-feel + celebration prefs. Local-only (device-specific needs like
// motion sickness and text size don't follow the account), mirrored to
// `data-*` attrs / inline style on <html> so CSS and canvas-free components
// react instantly with no re-render. Same shape as lib/font.js.

export const TEXT_SIZES = [
  { id: 's', label: 'S', zoom: '0.9' },
  { id: 'm', label: 'M', zoom: '' },
  { id: 'l', label: 'L', zoom: '1.125' },
]

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
  return TEXT_SIZES.some(t => t.id === stored) ? stored : 'm'
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
  const size = TEXT_SIZES.find(t => t.id === id) || TEXT_SIZES[1]
  document.documentElement.dataset.textsize = size.id
  // Whole-UI zoom: every text-* utility in the app is px-based, so root
  // font-size scaling would miss the text. Zoom keeps boards, text, and
  // touch targets proportional.
  document.documentElement.style.zoom = size.zoom
  write(TEXT_SIZE_KEY, size.id)
  return size.id
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
  applyTextSize('m')
  applyWinFx(true)
  applyThemePreview(false)
}
