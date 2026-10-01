// Client side of purchases: a live subscription to entitlements/{uid} (written
// only by Cloud Functions), the one access check the UI uses, and the calls that
// start a checkout. Pure rules are in premium.js; prices in premiumCatalog.js.
import { ref, onValue, get, set } from 'firebase/database'
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions'
import { app, db, usingEmulators } from './firebase'
import { getUid } from './auth'
import { accessFor, bypassActive } from './premium'

const OVERRIDE_KEY = 'gn-premium-bypass'

function readOverride() {
  try { return localStorage.getItem(OVERRIDE_KEY) } catch { return null }
}

/** Every premium item is open on a dev server / the emulators (see bypassActive). */
export function localBypass() {
  return bypassActive({ dev: import.meta.env.DEV, emulator: usingEmulators, override: readOverride() })
}

let ent = null
let loaded = false
let snapshot = { ...accessFor(null, { bypass: localBypass() }), loaded: false, ent: null }
const listeners = new Set()
let stop = () => {}
let watching = null

function publish() {
  snapshot = { ...accessFor(ent, { bypass: localBypass() }), loaded, ent }
  listeners.forEach(l => l())
}

/** Subscribes to the signed-in account's entitlements. Safe to call repeatedly. */
export function startEntitlements(uid) {
  if (watching === uid) return
  stop()
  watching = uid
  ent = null
  loaded = false
  publish()
  if (!db || !uid) { loaded = true; publish(); return }
  stop = onValue(ref(db, `entitlements/${uid}`), snap => {
    ent = snap.val()
    loaded = true
    publish()
  }, () => { loaded = true; publish() })
}

export function stopEntitlements() {
  stop()
  stop = () => {}
  watching = null
  ent = null
  loaded = false
  publish()
}

export function subscribeAccess(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Stable snapshot for useSyncExternalStore: { pass, supporter, admin, bypass, isUnlocked, loaded, … }. */
export function getAccess() {
  return snapshot
}

/** Non-React check, for code that runs outside a component. */
export function isUnlockedNow(item) {
  return snapshot.isUnlocked(item)
}

/** Re-reads the bypass (call after changing the override, dev only). */
export function refreshAccess() {
  publish()
}

// ---- Admin allowlist --------------------------------------------------------

let functions = null
function fns() {
  if (!app) throw new Error('Firebase is not configured')
  if (!functions) {
    functions = getFunctions(app)
    if (usingEmulators) connectFunctionsEmulator(functions, '127.0.0.1', Number(import.meta.env.VITE_EMULATOR_FUNCTIONS_PORT) || 5001)
  }
  return functions
}

/**
 * Asks the server whether this Google account is on the admin allowlist; it sets
 * entitlements/{uid}/admin, which the live subscription above picks up. Never
 * throws: a missing function (emulators, undeployed) just means "not admin".
 */
export async function syncAdminAccess() {
  if (usingEmulators) return false
  try {
    const res = await httpsCallable(fns(), 'syncAdminAccess')()
    return res.data?.admin === true
  } catch {
    return false
  }
}

// ---- Age question -----------------------------------------------------------

export async function getBirthYear() {
  const uid = getUid()
  if (!db || !uid) return null
  const year = (await get(ref(db, `ageGate/${uid}/year`))).val()
  return Number.isInteger(year) ? year : null
}

/** Write-once (database rules): the first answer sticks. */
export async function saveBirthYear(year) {
  const uid = getUid()
  if (!db || !uid) throw new Error('not-signed-in')
  await set(ref(db, `ageGate/${uid}`), { year, at: Date.now() })
}

// ---- Checkout ---------------------------------------------------------------

/** Creates a sandbox checkout for a product id and returns its URL. */
export async function createCheckoutUrl(product) {
  const res = await httpsCallable(fns(), 'createCheckout')({ product })
  const url = res.data?.url
  if (typeof url !== 'string') throw new Error('No checkout link')
  return url
}

/** A link to Paddle's customer portal: cancel, change card, receipts. */
export async function createPortalUrl() {
  const res = await httpsCallable(fns(), 'createPortalSession')()
  const url = res.data?.url
  if (typeof url !== 'string') throw new Error('No portal link')
  return url
}
