// @ts-check
// Pure entitlement logic: no Firebase, no DOM. The app reads one record,
// entitlements/{uid} (written only by Cloud Functions), and asks isUnlocked().
//
//   entitlements/{uid} = {
//     pass:      { status, plan, currentPeriodEnd, subscriptionId },  // Game Night Pass
//     packs:     { [packId]: true },                                  // one-time cosmetic packs
//     supporter: true,
//     admin:     true,                                                // admin allowlist (set server-side)
//     updatedAt
//   }
//
// Registry items opt in with `premium: true` and an optional `pack` (see
// premiumCatalog.js); an item key is `${kind}:${id}`.

/** @typedef {{ status?: string, plan?: string, currentPeriodEnd?: number, subscriptionId?: string }} PassRecord */
/** @typedef {{ pass?: PassRecord | null, packs?: Record<string, boolean> | null, supporter?: boolean, admin?: boolean }} Entitlements */
/** @typedef {{ kind: string, id: string, premium?: boolean, pack?: string }} PremiumItem */

/** @param {string} kind @param {string} id */
export function itemKey(kind, id) {
  return `${kind}:${id}`
}

/** True when the item is a paid one. Anything without the flag is free forever. */
export function isPremiumItem(item) {
  return item?.premium === true
}

/**
 * Pass is active while its paid period has not ended. A cancelled subscription
 * keeps working until the period it already paid for runs out.
 * @param {Entitlements | null | undefined} ent
 * @param {number} [now]
 */
export function hasActivePass(ent, now = Date.now()) {
  const pass = ent?.pass
  if (!pass || typeof pass !== 'object') return false
  if (pass.status === 'expired' || pass.status === 'paused') return false
  return typeof pass.currentPeriodEnd === 'number' && pass.currentPeriodEnd > now
}

/** @param {Entitlements | null | undefined} ent @param {string} packId */
export function hasPack(ent, packId) {
  return !!packId && ent?.packs?.[packId] === true
}

/**
 * Whether the viewer can use `item`.
 *  - free items: always
 *  - `bypass`: local development / emulator, every premium item is open
 *  - admin allowlist, an active Pass, or the item's pack: open
 * @param {PremiumItem} item
 * @param {{ ent?: Entitlements | null, bypass?: boolean, now?: number }} [ctx]
 */
export function isUnlocked(item, { ent = null, bypass = false, now = Date.now() } = {}) {
  if (!isPremiumItem(item)) return true
  if (bypass || ent?.admin === true) return true
  if (hasActivePass(ent, now)) return true
  return hasPack(ent, item.pack ?? '')
}

/** Why an item is open, for the UI's small label. */
export function unlockReason(item, { ent = null, bypass = false, now = Date.now() } = {}) {
  if (!isPremiumItem(item)) return 'free'
  if (bypass) return 'dev'
  if (ent?.admin === true) return 'admin'
  if (hasActivePass(ent, now)) return 'pass'
  if (hasPack(ent, item.pack ?? '')) return 'pack'
  return 'locked'
}

/**
 * Read-model for the UI: everything a component needs from one record.
 * @param {Entitlements | null | undefined} ent
 * @param {{ bypass?: boolean, now?: number }} [opts]
 */
export function accessFor(ent, { bypass = false, now = Date.now() } = {}) {
  return {
    pass: hasActivePass(ent, now),
    supporter: ent?.supporter === true,
    admin: ent?.admin === true,
    bypass,
    plan: ent?.pass?.plan ?? null,
    renewsAt: ent?.pass?.currentPeriodEnd ?? null,
    cancelling: ent?.pass?.status === 'canceled',
    /** @param {PremiumItem} item */
    isUnlocked: item => isUnlocked(item, { ent, bypass, now }),
  }
}

/**
 * Splits a premium list into the pack ids a viewer is missing, for the
 * "BUY THIS PACK" button.
 * @param {PremiumItem[]} items
 * @param {Entitlements | null | undefined} ent
 */
export function missingPacks(items, ent) {
  const ids = new Set()
  for (const item of items) {
    if (isPremiumItem(item) && item.pack && !hasPack(ent, item.pack)) ids.add(item.pack)
  }
  return [...ids]
}

/**
 * Local-development bypass: every premium item is open on a dev server or the
 * emulators, never in a production build. `override` is the stored 'off' switch
 * used to look at the locked UI while developing; it can only ever turn the
 * bypass off, so it cannot unlock anything in production.
 * @param {{ dev?: boolean, emulator?: boolean, override?: string | null }} env
 */
export function bypassActive({ dev = false, emulator = false, override = null } = {}) {
  if (!dev && !emulator) return false
  return override !== 'off'
}

/**
 * Whether a purchase can start: guests sign in with Google first, then the
 * neutral age question, under-13s can never buy.
 * @param {{ isAnonymous: boolean, birthYear: number | null | undefined, now?: Date }} s
 * @returns {'sign-in' | 'age' | 'under-age' | 'ok'}
 */
export function purchaseGate({ isAnonymous, birthYear, now = new Date() }) {
  if (isAnonymous) return 'sign-in'
  if (!Number.isInteger(birthYear)) return 'age'
  const age = now.getUTCFullYear() - /** @type {number} */ (birthYear)
  return age < 13 ? 'under-age' : 'ok'
}

/** Birth years offered by the age question: a neutral list, oldest last, no hint. */
export function birthYearOptions(now = new Date()) {
  const top = now.getUTCFullYear()
  const years = []
  for (let y = top; y >= top - 100; y--) years.push(y)
  return years
}
