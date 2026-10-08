// Client calls to the account-merge Cloud Functions (functions/). Both are
// best-effort: callers must never block sign-in on them.
import { getApps, getApp } from 'firebase/app'
import { usingEmulators } from './firebase'

let functionsPromise = null
async function callable(name) {
  if (!getApps().length) throw new Error('Firebase is not configured')
  functionsPromise ||= import('firebase/functions').then(m => {
    const fns = m.getFunctions(getApp())
    if (usingEmulators) m.connectFunctionsEmulator(fns, '127.0.0.1', Number(import.meta.env.VITE_EMULATOR_FUNCTIONS_PORT) || 5001)
    return { fns, httpsCallable: m.httpsCallable }
  })
  const { fns, httpsCallable } = await functionsPromise
  return httpsCallable(fns, name)
}

// Merges the guest's safe progress into the signed-in permanent account.
export async function mergeGuestAccount(guestIdToken) {
  const res = await (await callable('mergeGuestAccount'))({ guestIdToken })
  return { merged: res.data?.merged === true, reason: res.data?.reason }
}

// Grants the one-time SAVED badge (idempotent server-side).
export async function claimSavedBadge() {
  const res = await (await callable('claimSavedBadge'))()
  return res.data?.granted === true
}
