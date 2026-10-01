// @ts-check
// The launch switch for everything that sells: VITE_MONETIZATION_ENABLED=1 turns it
// on, anything else (the default) leaves it off. The server mirrors it with the
// MONETIZATION_ENABLED function config (functions/billing.js).
//
//   OFF  every premium theme, font, avatar item, buddy and emote is open to everyone;
//        no lock, paywall, shop or Pass entry point shows; billing functions refuse.
//   ON   the entitlement gating applies (Pass, packs, admin allowlist, local bypass).
//
// On a dev server or the emulators the stored 'gn-monetization' = 'on' | 'off' flips
// it for a session (the e2e specs and screenshots use it). A production build ignores
// that override, so it can never change what a real visitor sees.

/**
 * @param {{ flag?: boolean, devLike?: boolean, override?: string | null }} env
 */
export function monetizationActive({ flag = false, devLike = false, override = null } = {}) {
  if (devLike && (override === 'on' || override === 'off')) return override === 'on'
  return flag === true
}
