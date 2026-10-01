import { usingEmulators } from './firebase'
import { monetizationActive, monetizationPreviewAvailable } from './monetization'
import { isNative } from './platform'

const OVERRIDE_KEY = 'gn-monetization'
const devLike = () => import.meta.env.DEV || usingEmulators

/** True when the shop, Pass, paywall and locks are live (see monetization.js). */
export function monetizationEnabled() {
  let override = null
  try { override = localStorage.getItem(OVERRIDE_KEY) } catch { /* blocked */ }
  return monetizationActive({
    flag: import.meta.env.VITE_MONETIZATION_ENABLED === '1',
    devLike: devLike(),
    override,
    native: isNative,
  })
}

/** True where the dev-only monetization preview control may show. */
export function canPreviewMonetization() {
  return monetizationPreviewAvailable({ devLike: devLike(), native: isNative })
}

/**
 * Dev only: stores the 'gn-monetization' override and reloads, since the shop
 * routes and the entitlement subscription are decided once at boot. A production
 * build never reaches this (the control is hidden and the override is ignored).
 */
export function setMonetizationPreview(on) {
  if (!canPreviewMonetization()) return
  try { localStorage.setItem(OVERRIDE_KEY, on ? 'on' : 'off') } catch { return }
  window.location.reload()
}
