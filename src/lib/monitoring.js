// Error and crash monitoring (Sentry). A no-op until VITE_SENTRY_DSN is set.
//
//   web          @sentry/react in the page
//   ios/android  @sentry/capacitor: the same JS errors plus native crashes
//                (the native SDK starts with the JS init; `npx cap sync` links it)
//
// The SDK is a lazy chunk so a build without a DSN carries none of it, and a
// build with one keeps it out of the entry bundle. Errors raised before it has
// loaded wait in a small queue and are sent once it is up. Release = the git
// sha baked in by vite.config.js; environment = web | ios | android.
//
// The in-house reporter (telemetry.js) keeps running next to this one: it feeds
// the /notes admin view, this feeds Sentry.

import { OPT_OUT_KEY, SENTRY_IGNORE_ERRORS, doNotTrack, scrubSentryEvent, sentryEnvironment } from './trackLogic'
import { nativePlatform } from './platform'

const DSN = import.meta.env?.VITE_SENTRY_DSN || ''
/** True when this build was given a DSN. */
export const monitoringConfigured = !!DSN
const QUEUE_MAX = 20
const TRACES_RATE = 0.1

/** @type {any} */
let sentry = null
let started = false
let optedOut = false
/** @type {Array<(s: any) => void>} */
let queue = []

/** @param {boolean} value Mirrors the Settings switch (track.js owns the flag). */
export function setMonitoringOptOut(value) {
  optedOut = value
  if (value) queue = []
  else initMonitoring()
}

/** @param {(s: any) => void} job */
function run(job) {
  if (optedOut || !DSN) return
  if (sentry) { job(sentry); return }
  if (queue.length < QUEUE_MAX) queue.push(job)
}

/**
 * Start Sentry. Call first thing in main, before the first render, so early
 * errors are caught. Respects Do Not Track and the usage-data switch.
 */
export function initMonitoring() {
  if (started || !DSN) return
  let flag = null
  try { flag = localStorage.getItem(OPT_OUT_KEY) } catch { /* storage unavailable */ }
  const nav = /** @type {any} */ (typeof navigator === 'undefined' ? null : navigator)
  const win = /** @type {any} */ (typeof window === 'undefined' ? null : window)
  if (flag === '0' || doNotTrack(nav, win)) { optedOut = true; return }
  optedOut = false
  started = true

  Promise.all([import('@sentry/capacitor'), import('@sentry/react')]).then(([Capacitor, React]) => {
    Capacitor.init({
      dsn: DSN,
      release: import.meta.env?.VITE_SENTRY_RELEASE || undefined,
      environment: sentryEnvironment(nativePlatform),
      sendDefaultPii: false,
      ignoreErrors: SENTRY_IGNORE_ERRORS,
      beforeSend: event => (optedOut ? null : scrubSentryEvent(event)),
      integrations: [React.browserTracingIntegration()],
      tracesSampleRate: TRACES_RATE,
      // Firebase and PostHog requests are cross-origin: never add trace headers to them.
      tracePropagationTargets: [],
    }, React.init)
    sentry = React
    const jobs = queue
    queue = []
    for (const job of jobs) { try { job(sentry) } catch { /* never break the app */ } }
  }).catch(() => { started = false; queue = [] })
}

/**
 * Report a caught error (the ErrorBoundary and telemetry.reportError call this).
 * @param {unknown} err
 * @param {{ kind?: string, componentStack?: string, gameType?: string }} [extra]
 */
export function captureError(err, extra = {}) {
  // Once Sentry is up its own window handlers see uncaught errors and rejections;
  // forwarding them too would report each twice. Only the boundary needs us.
  if (sentry && extra.kind && extra.kind !== 'boundary') return
  run(s => s.captureException(err, {
    tags: { kind: extra.kind || 'error', ...(extra.gameType ? { game: extra.gameType } : {}) },
    ...(extra.componentStack ? { contexts: { react: { componentStack: extra.componentStack } } } : {}),
  }))
}

/**
 * The Firebase uid is the only identity Sentry sees.
 * @param {string | null} uid
 */
export function setMonitoringUser(uid) {
  run(s => s.setUser(uid ? { id: uid } : null))
}
