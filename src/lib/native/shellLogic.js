// @ts-check
// Decisions for the native shell (shell.js), kept pure so they are tested
// without a device: what the Android back button should do, and whether the
// system bars need light or dark content for the active theme.

/** @typedef {'history' | 'escape' | 'home' | 'exit'} BackAction */

/**
 * What Android's back button does. Order matters:
 *  1. An overlay wired into history (useModalHistory pushes a marker) closes
 *     through its own popstate handler, exactly like the browser back gesture,
 *     including a sheet's "back one step" handler.
 *  2. A modal dialog with no history marker closes the way keyboard users close
 *     it: an Escape keydown.
 *  3. Otherwise go back in history (the in-match leave guard listens for that).
 *  4. No history left: go to the home page, and from home leave the app.
 * @param {{ hasModalMarker?: boolean, hasOpenDialog?: boolean, canGoBack?: boolean, pathname?: string }} s
 * @returns {BackAction}
 */
export function chooseBackAction({ hasModalMarker = false, hasOpenDialog = false, canGoBack = false, pathname = '/' } = {}) {
  if (hasModalMarker) return 'history'
  if (hasOpenDialog) return 'escape'
  if (canGoBack) return 'history'
  if (pathname && pathname !== '/') return 'home'
  return 'exit'
}

/**
 * Parse a colour into [r, g, b] (0-255). Accepts the theme tokens' space
 * separated channels ("238 240 226", also with commas or inside rgb(...)) and
 * #rgb / #rrggbb. Returns null when it cannot.
 * @param {unknown} value
 * @returns {[number, number, number] | null}
 */
export function parseColor(value) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, c => c + c) : hex[1]
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  const nums = text.match(/\d+(?:\.\d+)?/g)
  if (!nums || nums.length < 3) return null
  const rgb = nums.slice(0, 3).map(Number)
  if (rgb.some(n => !Number.isFinite(n) || n < 0 || n > 255)) return null
  return /** @type {[number, number, number]} */ (rgb)
}

/**
 * WCAG relative luminance, 0 (black) to 1 (white).
 * @param {[number, number, number]} rgb
 */
export function relativeLuminance([r, g, b]) {
  const lin = (/** @type {number} */ c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

// Luminance where black and white content contrast equally with the ground:
// brighter grounds read better with dark icons, darker ones with light icons.
const CROSSOVER = 0.179

/**
 * System-bar style for a page background, in @capacitor/core SystemBars terms:
 * 'LIGHT' = dark icons for a light ground, 'DARK' = light icons for a dark
 * ground. An unreadable colour falls back to the default theme (light).
 * @param {unknown} background
 * @returns {'LIGHT' | 'DARK'}
 */
export function systemBarStyleForBackground(background) {
  const rgb = parseColor(background)
  if (!rgb) return 'LIGHT'
  return relativeLuminance(rgb) > CROSSOVER ? 'LIGHT' : 'DARK'
}
