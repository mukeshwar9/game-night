// Product analytics (PostHog): explicit events, session replay, one identity.
// Every export is a no-op until VITE_POSTHOG_KEY is set, so a build without the
// key (CI, forks, local dev) carries no tracking and loads nothing.
//
// PostHog itself is a lazy chunk: initTracking() waits for an idle moment after
// the first render, then imports it. Events fired before it is ready wait in a
// small queue. The "no-external" build is used on purpose: the default one
// fetches the replay recorder from PostHog's CDN, which Hosting's CSP forbids
// and the store build should not depend on.
//
// Events and their allowed properties: trackLogic.js (EVENTS). The in-house
// play counters (analytics.js) are separate and unchanged.

import { OPT_OUT_KEY, buildEvent, doNotTrack, durationSeconds, normalizeMode, posthogOptions, trackingAllowed } from './trackLogic'
import { nativePlatform } from './platform'
import { monitoringConfigured, setMonitoringOptOut } from './monitoring'

const KEY = import.meta.env?.VITE_POSTHOG_KEY || ''
const HOST = import.meta.env?.VITE_POSTHOG_HOST || ''
const QUEUE_MAX = 50

/** @type {any} */
let client = null
let started = false
/** @type {Array<(ph: any) => void>} */
let queue = []
/** @type {{ uid: string, isAnonymous: boolean } | null} */
let pendingIdentity = null

function readFlag() {
  try { return localStorage.getItem(OPT_OUT_KEY) } catch { return null }
}

function allowed() {
  const nav = typeof navigator === 'undefined' ? null : /** @type {any} */ (navigator)
  const win = typeof window === 'undefined' ? null : /** @type {any} */ (window)
  return trackingAllowed({ key: KEY, dnt: doNotTrack(nav, win), flag: readFlag() })
}

/** True when this build has a PostHog key or a Sentry DSN: shows the Settings switch. */
export const trackingConfigured = !!KEY || monitoringConfigured

/** True when events are (or would be) sent: a key, no DNT, no opt-out. */
export function trackingActive() {
  return allowed()
}

/** The Settings switch: false stops events, replay and error reports on this device. */
export function trackingOptedOut() {
  return readFlag() === '0'
}

/** @param {boolean} optOut */
export function setTrackingOptOut(optOut) {
  try { localStorage.setItem(OPT_OUT_KEY, optOut ? '0' : '1') } catch { /* storage unavailable */ }
  setMonitoringOptOut(optOut)
  if (optOut) {
    queue = []
    client?.opt_out_capturing()
    client?.stopSessionRecording?.()
  } else if (client) {
    client.opt_in_capturing()
    client.startSessionRecording?.()
  } else {
    initTracking()
  }
}

/** @param {(ph: any) => void} job */
function run(job) {
  if (client) { job(client); return }
  if (queue.length < QUEUE_MAX) queue.push(job)
}

function whenIdle(fn) {
  if (typeof window === 'undefined') return
  const ric = /** @type {any} */ (window).requestIdleCallback
  if (ric) ric(fn, { timeout: 4000 })
  else setTimeout(fn, 1500)
}

/** Start PostHog once, after the first render. Safe to call repeatedly. */
export function initTracking() {
  if (started || !allowed()) return
  started = true
  whenIdle(() => {
    import('posthog-js/dist/module.full.no-external.js').then(({ default: posthog }) => {
      posthog.init(KEY, { ...posthogOptions({ host: HOST }), loaded: (ph) => { if (trackingOptedOut()) ph.opt_out_capturing() } })
      client = posthog
      if (pendingIdentity) identify(pendingIdentity)
      const jobs = queue
      queue = []
      for (const job of jobs) { try { job(posthog) } catch { /* never break the app */ } }
    }).catch(() => { started = false; queue = [] })
  })
}

/** @param {{ uid: string, isAnonymous: boolean }} who */
function identify({ uid, isAnonymous }) {
  client.identify(uid, { is_anonymous: isAnonymous, platform: nativePlatform ?? 'web' })
}

/**
 * Tie events to the Firebase uid (guests too, flagged anonymous). Never an
 * e-mail or a name. Call whenever the signed-in user changes; null resets.
 * @param {{ uid: string, isAnonymous: boolean } | null} who
 */
export function identifyUser(who) {
  if (!KEY) return
  if (!who?.uid) { pendingIdentity = null; client?.reset(); return }
  if (pendingIdentity?.uid === who.uid && pendingIdentity.isAnonymous === who.isAnonymous) return
  pendingIdentity = who
  if (client) identify(who)
}

/**
 * Send one event. Unknown names and properties outside the schema are dropped
 * (trackLogic.js). Never throws.
 * @param {string} name
 * @param {Record<string, unknown>} [props]
 */
export function track(name, props) {
  if (!KEY) return
  try {
    const event = buildEvent(name, props)
    if (!event || !allowed()) return
    run(ph => ph.capture(event.name, event.props))
  } catch { /* analytics must never break a game */ }
}

// ---------------------------------------------------------------------------
// Helpers that fill in what a call site does not know
// ---------------------------------------------------------------------------

/** gameType -> is it a party (N-player) game? Looked up lazily; false if unknown. */
async function isParty(gameType) {
  try {
    const { getGameConfig } = await import('./games')
    return !!getGameConfig(gameType)?.nPlayer
  } catch { return false }
}

/** @type {Map<string, number>} when the current round of a game began */
const roundStart = new Map()

/**
 * A game began: a room was created or switched to this game, or a solo/local
 * game opened. `mode` is the in-house counter's: 'multi' | 'solo' | 'local'.
 * @param {string} game
 * @param {string} mode
 */
export function trackGameStarted(game, mode) {
  if (!KEY) return
  roundStart.set(game, Date.now())
  isParty(game).then(party => track('game_started', { game, mode: normalizeMode(mode, party) }))
}

/**
 * A round ended. `result` is win | loss | draw | abandoned (from the player's
 * side) or 'finished' when the caller cannot tell. Duration runs from the
 * start of the game or the previous round, whichever is later.
 * @param {string} game
 * @param {string} mode 'multi' | 'solo' | 'local'
 * @param {string} result
 */
export function trackGameFinished(game, mode, result) {
  if (!KEY) return
  const now = Date.now()
  const duration_s = durationSeconds(roundStart.get(game), now)
  roundStart.set(game, now)
  isParty(game).then(party => track('game_finished', { game, mode: normalizeMode(mode, party), result, duration_s }))
}

/**
 * A room was created. `mode` as in trackGameStarted.
 * @param {string} game
 * @param {'private' | 'public'} visibility
 */
export function trackRoomCreated(game, visibility) {
  if (!KEY) return
  isParty(game).then(party => track('room_created', { game, mode: party ? 'party' : 'online', visibility }))
}

/**
 * A seat in someone else's room was taken.
 * @param {string} game
 * @param {'link' | 'public'} via
 */
export function trackRoomJoined(game, via) {
  if (!KEY) return
  isParty(game).then(party => track('room_joined', { game, mode: party ? 'party' : 'online', via }))
}
