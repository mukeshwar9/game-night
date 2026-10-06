// @ts-check
// The header's BACK control on screens off the tab bar (solo games, pass &
// play, shop, notes...). Native iOS has no browser back button, so without it
// the logo was the only way out of those screens. Pure, no router imports.

/**
 * @param {string} pathname
 * @param {{ tabRoutes: readonly string[] }} opts
 */
export function showBackControl(pathname, { tabRoutes }) {
  return !tabRoutes.includes(pathname)
}

/**
 * Where BACK goes: one step back when this tab has an in-app history entry
 * (react-router gives the very first entry the key 'default'), home when the
 * screen was opened directly (a deep link, a reload, a shared URL).
 * @param {{ key?: string }} location
 * @returns {'history' | 'home'}
 */
export function backDestination({ key } = {}) {
  return key && key !== 'default' ? 'history' : 'home'
}
