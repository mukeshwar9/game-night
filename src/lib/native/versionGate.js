// @ts-check
// Minimum-version gate for the store builds. The binary carries its own web
// assets, so a server-side change that old binaries cannot survive is handled
// by raising `config/minNativeVersion/{ios,android}` in the Realtime Database
// console: builds older than that show the blocking screen
// (src/components/NativeUpdateGate.jsx). Reads happen once per launch and on
// resume; every failure (offline, rules, junk value, no plugin) means "do not
// block" — the gate is a safety net, never a reason to lock players out.
import { get, ref } from 'firebase/database'
import { db } from '../firebase'
import { authReady } from '../auth'
import { isNative, nativePlatform } from '../platform'
import { isUpdateRequired, storeUrlFor } from '../versionGateLogic'

export const VERSION_CONFIG_PATH = 'config/minNativeVersion'
const CHECK_TIMEOUT_MS = 6000
// A player who resumes the app often should not cost a read every time.
const RECHECK_INTERVAL_MS = 60_000

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

// Reads the node once, after auth has settled (the rules need auth != null).
async function readMinVersionConfig() {
  await authReady()
  if (!db) throw new Error('database unavailable')
  const snap = await get(ref(db, VERSION_CONFIG_PATH))
  return snap.val()
}

/**
 * Whether this installed build is older than the configured minimum.
 * Resolves false on the web and on any failure.
 *
 * @param {{
 *   native?: boolean,
 *   platform?: string | null,
 *   loadApp?: () => Promise<any>,
 *   readConfig?: () => Promise<unknown>,
 *   timeoutMs?: number,
 * }} [opts] injected by tests
 */
export async function checkMinVersion({
  native = isNative,
  platform = nativePlatform,
  loadApp = () => import('@capacitor/app'),
  readConfig = readMinVersionConfig,
  timeoutMs = CHECK_TIMEOUT_MS,
} = {}) {
  if (!native || !platform) return false
  try {
    const { App } = await loadApp()
    const info = await App.getInfo()
    const config = await withTimeout(readConfig(), timeoutMs)
    return isUpdateRequired({ current: info?.version, config, platform })
  } catch {
    return false
  }
}

/**
 * Runs the check now and again when the app returns to the foreground (at most
 * once a minute), calling `onRequired` the first time a check says the build
 * is too old. Returns a function that stops watching.
 *
 * @param {() => void} onRequired
 * @param {{
 *   native?: boolean,
 *   check?: () => Promise<boolean>,
 *   loadApp?: () => Promise<any>,
 *   now?: () => number,
 *   minIntervalMs?: number,
 * }} [opts]
 * @returns {Promise<() => void>}
 */
export async function watchMinVersion(onRequired, {
  native = isNative,
  check = checkMinVersion,
  loadApp = () => import('@capacitor/app'),
  now = Date.now,
  minIntervalMs = RECHECK_INTERVAL_MS,
} = {}) {
  if (!native) return () => {}
  let stopped = false
  let running = false
  let lastAt = -Infinity
  /** @type {{ remove?: () => Promise<void> | void } | null} */
  let listener = null

  const stop = () => {
    stopped = true
    try { Promise.resolve(listener?.remove?.()).catch(() => {}) } catch { /* already gone */ }
    listener = null
  }
  const run = async () => {
    if (stopped || running || now() - lastAt < minIntervalMs) return
    running = true
    lastAt = now()
    try {
      if (await check() && !stopped) {
        onRequired()
        stop()
      }
    } finally {
      running = false
    }
  }

  void run()
  try {
    const { App } = await loadApp()
    if (stopped) return stop
    listener = await App.addListener('resume', () => { void run() })
    // Stopped while the listener was being added.
    if (stopped) stop()
  } catch {
    // No resume events: the launch-time check still ran.
  }
  return stop
}

/**
 * Sends the player to this platform's store listing.
 *
 * No plugin is needed. Inside the shell, a top-level navigation to an https
 * URL off the app's own origin is not loaded by the web view: on iOS
 * Capacitor's WKNavigationDelegate cancels it and calls
 * UIApplication.open(url) (an apps.apple.com link opens the App Store app);
 * on Android Bridge.launchIntent() fires an ACTION_VIEW intent (a
 * play.google.com link opens the Play Store app). The update screen stays as
 * it was, so coming back without updating still shows it. window.open()
 * is not used: Android's web view has no handler for new windows.
 * Synchronous on purpose (no busy flag): nothing is awaited.
 *
 * @param {string | null | undefined} [platform]
 * @param {(url: string) => void} [assign]
 * @returns {boolean} whether a listing URL existed
 */
export function openStoreListing(platform = nativePlatform, assign = (url) => window.location.assign(url)) {
  const url = storeUrlFor(platform)
  if (!url) return false
  assign(url)
  return true
}
