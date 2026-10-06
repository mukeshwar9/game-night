// @ts-check
// Store listings once the apps are live, for the web's "get the app" hand-off
// (Home) and the Smart App Banner (vite.config.js). Both stay dark until the
// listings exist: VITE_APPSTORE_ID is the numeric App Store id, VITE_PLAY_LIVE
// turns on the Google Play badge. Pure, no DOM.

export const PLAY_PACKAGE = 'app.gamenight'
export const PLAY_URL = `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`

/**
 * The App Store id from the build environment, or null when it is unset or
 * not a plain number (the placeholder, a typo).
 * @param {unknown} value
 */
export function parseAppStoreId(value) {
  const id = typeof value === 'string' ? value.trim() : ''
  return /^\d{6,12}$/.test(id) ? id : null
}

/** @param {string | null} id */
export function appStoreUrl(id) {
  return id ? `https://apps.apple.com/app/id${id}` : null
}

/** @param {unknown} value */
export function playLiveFrom(value) {
  return value === '1' || value === 'true'
}

/**
 * Which store badge the web should show this visitor, if any: the App Store
 * on an iPhone or iPad, Google Play on Android, nothing on a desktop, inside
 * the apps themselves, in an installed PWA, or before the listing exists.
 * @param {{ ua?: string, appStoreId?: string | null, playLive?: boolean, native?: boolean, standalone?: boolean }} env
 * @returns {{ store: 'ios' | 'android', url: string } | null}
 */
export function storeBadgeFor({ ua = '', appStoreId = null, playLive = false, native = false, standalone = false }) {
  if (native || standalone) return null
  if (/iPhone|iPad|iPod/.test(ua) && appStoreId) return { store: 'ios', url: /** @type {string} */ (appStoreUrl(appStoreId)) }
  if (/Android/.test(ua) && playLive) return { store: 'android', url: PLAY_URL }
  return null
}

/**
 * Safari's Smart App Banner content. app-argument hands the page (an invite
 * link) to the app when it opens from the banner.
 * @param {string | null} appStoreId
 * @param {string} [pageUrl]
 */
export function smartBannerContent(appStoreId, pageUrl) {
  if (!appStoreId) return null
  return pageUrl ? `app-id=${appStoreId}, app-argument=${pageUrl}` : `app-id=${appStoreId}`
}
