// @ts-check
// Opens invite and share links inside the native shell. A tapped
// https://<host>/game/abc (Universal Link / App Link) or gamenight://game/abc
// arrives as an `appUrlOpen` event; pathFromAppUrl decides whether it is ours
// and requestNavigate hands the path to the router (buffered until it mounts).
//
// Cold start: iOS retains the launch event until a listener is added, so the
// listener below receives it; Android only delivers appUrlOpen for links that
// arrive while the app is running, so the launch intent is read with
// getLaunchUrl(). Both can fire for one link on iOS (getLaunchUrl reports the
// same URL), hence the duplicate guard.
import { isNative, PUBLIC_ORIGIN } from '../platform'
import { requestNavigate } from './navigation'
import { isDuplicateOpen, linkOrigins, pathFromAppUrl } from '../deepLinkLogic'

// VITE_LINK_ORIGINS: extra https origins (comma separated), e.g. the custom
// domain once it is live. The Firebase Hosting twins come from the project config.
/** @type {Record<string, string | undefined>} */
const env = import.meta.env || {}
export const APP_LINK_ORIGINS = linkOrigins({
  publicOrigin: PUBLIC_ORIGIN,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  extra: env.VITE_LINK_ORIGINS,
})

let started = false

/**
 * Start listening for opened links. Native only, idempotent, never throws.
 * Resolves to a function that stops listening.
 *
 * @param {{
 *   native?: boolean,
 *   origins?: readonly string[],
 *   loadApp?: () => Promise<any>,
 *   navigate?: (path: string) => void,
 *   now?: () => number,
 * }} [opts] injected by tests
 * @returns {Promise<() => void>}
 */
export async function initDeepLinks({
  native = isNative,
  origins = APP_LINK_ORIGINS,
  loadApp = () => import('@capacitor/app'),
  navigate = requestNavigate,
  now = Date.now,
} = {}) {
  if (!native || started) return () => {}
  started = true
  /** @type {{ path: string, at: number } | null} */
  let last = null
  /** @param {unknown} url */
  const handle = (url) => {
    const path = pathFromAppUrl(url, origins)
    if (!path) return
    const at = now()
    if (isDuplicateOpen(last, path, at)) return
    last = { path, at }
    navigate(path)
  }
  /** @type {{ remove?: () => Promise<void> | void } | null} */
  let listener = null
  /** @type {any} */
  let App
  try {
    ;({ App } = await loadApp())
    listener = await App.addListener('appUrlOpen', (/** @type {{ url?: string }} */ event) => handle(event?.url))
  } catch (err) {
    console.warn('Deep links unavailable:', err)
    started = false
    return () => {}
  }
  try {
    const launch = await App.getLaunchUrl()
    handle(launch?.url)
  } catch (err) {
    console.warn('Launch URL unavailable:', err)
  }
  return () => {
    started = false
    try { Promise.resolve(listener?.remove?.()).catch(() => {}) } catch { /* already gone */ }
  }
}
