// @ts-check
// Minimum native app version: the store build can be told to show a blocking
// "update required" screen when a server-side change (a rules change, a
// breaking data shape) would break old binaries. Pure; the reading and the UI
// are src/lib/native/versionGate.js and src/components/NativeUpdateGate.jsx.
//
// The limit lives at RTDB `config/minNativeVersion` as { ios?: '1.2.0',
// android?: '1.2.0' }, edited from the Firebase console. Anything that cannot
// be understood means "no gate": a typo in the console must never lock every
// player out of the app.

/**
 * Store listings the update screen opens. APPSTORE_ID_PLACEHOLDER is replaced
 * with the numeric App Store id once the app record exists (docs/MOBILE.md);
 * the Play package name is the Capacitor appId.
 */
export const STORE_URLS = {
  ios: 'https://apps.apple.com/app/idAPPSTORE_ID_PLACEHOLDER',
  android: 'https://play.google.com/store/apps/details?id=app.gamenight',
}

/** @param {unknown} platform */
export function storeUrlFor(platform) {
  return platform === 'ios' || platform === 'android' ? STORE_URLS[platform] : null
}

/**
 * Numeric dot-separated parts of a version: '1.2.3' -> [1, 2, 3]. A leading
 * 'v' and a pre-release or build suffix ('1.2.0-beta.1', '1.2.0+45') are
 * ignored. Returns null for anything else (empty, words, negative, 'x.y').
 * @param {unknown} value
 * @returns {number[] | null}
 */
export function parseVersion(value) {
  if (typeof value !== 'string') return null
  const core = value.trim().replace(/^v/i, '').split(/[-+]/)[0]
  if (!/^\d{1,9}(\.\d{1,9}){0,3}$/.test(core)) return null
  return core.split('.').map(Number)
}

/**
 * -1 when a < b, 0 when equal, 1 when a > b; missing parts count as 0
 * ('1.2' equals '1.2.0'). null when either side is not a version.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {-1 | 0 | 1 | null}
 */
export function compareVersions(a, b) {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return null
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

/**
 * True only when both versions parse and `current` is older than `min`.
 * @param {unknown} current
 * @param {unknown} min
 */
export function isBelowMinimum(current, min) {
  return compareVersions(current, min) === -1
}

/**
 * The minimum version configured for one platform, or null (no gate).
 * @param {unknown} config the `config/minNativeVersion` node
 * @param {unknown} platform 'ios' | 'android'
 * @returns {string | null}
 */
export function minVersionFor(config, platform) {
  if (!config || typeof config !== 'object' || (platform !== 'ios' && platform !== 'android')) return null
  const v = /** @type {Record<string, unknown>} */ (config)[platform]
  return parseVersion(v) ? /** @type {string} */ (v) : null
}

/**
 * Whether the installed build must update.
 * @param {{ current: unknown, config: unknown, platform: unknown }} args
 */
export function isUpdateRequired({ current, config, platform }) {
  const min = minVersionFor(config, platform)
  return min !== null && isBelowMinimum(current, min)
}
