// @ts-check
// The launch switch for everything that sells: VITE_MONETIZATION_ENABLED=1 turns it
// on for a production build, anything else (the default) leaves it off. The server
// mirrors it with the MONETIZATION_ENABLED function config (functions/billing.js).
//
//   OFF  every premium theme, font, avatar item, buddy and emote is open to everyone;
//        no lock, paywall, shop or Pass entry point shows (except the admin preview,
//        see shopVisible); billing functions refuse.
//   ON   the entitlement gating applies (Pass, packs, admin allowlist, local bypass).
//
// A dev server or the emulators default to ON, so the shop can be looked at locally;
// the stored 'gn-monetization' = 'on' | 'off' flips it for a session (the e2e specs
// and screenshots use it). A production build ignores that override, so it can never
// change what a real visitor sees.
//
// Inside the iOS/Android shell it is always OFF, whatever the flag says: Paddle
// checkout breaks Apple 3.1.1 and Play Billing rules, so the apps stay free
// until store in-app purchase exists.

/**
 * @param {{ flag?: boolean, devLike?: boolean, override?: string | null, native?: boolean }} env
 */
export function monetizationActive({ flag = false, devLike = false, override = null, native = false } = {}) {
  if (native) return false
  if (devLike) return override !== 'off'
  return flag === true
}

/**
 * Whether the shop, Pass and paywall entry points show for this viewer: always
 * while monetization is on, and otherwise only to an admin, as a preview of how
 * they look (the server still refuses every payment, so a checkout fails safely).
 * "View as regular player" drops the preview like every other admin privilege,
 * and the native shell never shows any of it.
 * @param {{ monetization?: boolean, admin?: boolean, viewAsPlayer?: boolean, native?: boolean }} env
 */
export function shopVisible({ monetization = false, admin = false, viewAsPlayer = false, native = false } = {}) {
  if (native) return false
  if (monetization) return true
  return admin && !viewAsPlayer
}

/**
 * Whether the dev-only "preview monetization ON/OFF" control can show: a dev
 * server or the emulators, never a production build (which ignores the override)
 * and never the native shell (always off).
 * @param {{ devLike?: boolean, native?: boolean }} env
 */
export function monetizationPreviewAvailable({ devLike = false, native = false } = {}) {
  return devLike && !native
}
