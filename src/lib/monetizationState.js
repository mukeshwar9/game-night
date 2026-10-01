import { usingEmulators } from './firebase'
import { monetizationActive } from './monetization'

/** True when the shop, Pass, paywall and locks are live (see monetization.js). */
export function monetizationEnabled() {
  let override = null
  try { override = localStorage.getItem('gn-monetization') } catch { /* blocked */ }
  return monetizationActive({
    flag: import.meta.env.VITE_MONETIZATION_ENABLED === '1',
    devLike: import.meta.env.DEV || usingEmulators,
    override,
  })
}
