// @ts-check
// Pure rules for the third-party monitoring layer (Sentry errors, PostHog
// journeys): which events exist and what properties they may carry, who is
// opted out, and how an outgoing error event is scrubbed. No DOM, Firebase or
// network here; track.js and monitoring.js apply these.
//
// Privacy defaults (docs/ANALYTICS.md): events carry a game id, a mode and a
// handful of numbers, never a name, chat text, room id or e-mail. The person is
// the Firebase uid, nothing else.

const STR_MAX = 40

/** @typedef {'str' | 'int' | 'bool'} PropKind */

/**
 * Event name -> the only properties it may carry. Anything else is dropped, so
 * a call site cannot leak a field by accident.
 * @type {Record<string, Record<string, PropKind>>}
 */
export const EVENTS = {
  app_opened: { platform: 'str', first_open: 'bool' },
  game_selected: { game: 'str', surface: 'str' },
  game_started: { game: 'str', mode: 'str' },
  game_finished: { game: 'str', mode: 'str', result: 'str', duration_s: 'int' },
  room_created: { game: 'str', mode: 'str', visibility: 'str' },
  invite_shared: { surface: 'str', method: 'str' },
  room_joined: { game: 'str', mode: 'str', via: 'str' },
  sign_in_started: { provider: 'str' },
  sign_in_completed: { provider: 'str' },
  account_saved: { source: 'str', provider: 'str' },
  arrows_level_cleared: { level: 'int', stars: 'int', kind: 'str' },
  theme_changed: { theme: 'str' },
  error_shown: { surface: 'str', code: 'str' },
}

export const EVENT_NAMES = Object.keys(EVENTS)

export const MODES = ['solo', 'online', 'party', 'local']
export const RESULTS = ['win', 'loss', 'draw', 'abandoned', 'finished']

/**
 * The play mode as the product thinks of it. Call sites say 'multi' for any
 * live room; a party game (registry nPlayer) is 'party', the rest 'online'.
 * @param {string} mode 'multi' | 'solo' | 'local'
 * @param {boolean} [party]
 */
export function normalizeMode(mode, party = false) {
  if (mode === 'multi') return party ? 'party' : 'online'
  return mode === 'solo' || mode === 'local' ? mode : 'online'
}

/**
 * @param {unknown} value
 * @param {PropKind} kind
 * @returns {string | number | boolean | undefined}
 */
function coerce(value, kind) {
  if (kind === 'bool') return typeof value === 'boolean' ? value : undefined
  if (kind === 'int') {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : undefined
  }
  if (typeof value !== 'string' || !value) return undefined
  // Identifiers only: a stray sentence or room id cannot pass as a property.
  return /^[a-zA-Z0-9_.:-]+$/.test(value) ? value.slice(0, STR_MAX) : undefined
}

/**
 * Validates one event against EVENTS. Returns null for an unknown name;
 * otherwise the name and only the allowed, well-typed properties.
 * @param {string} name
 * @param {Record<string, unknown>} [props]
 * @returns {{ name: string, props: Record<string, string | number | boolean> } | null}
 */
export function buildEvent(name, props = {}) {
  const schema = Object.prototype.hasOwnProperty.call(EVENTS, name) ? EVENTS[name] : null
  if (!schema) return null
  /** @type {Record<string, string | number | boolean>} */
  const out = {}
  for (const [key, kind] of Object.entries(schema)) {
    const value = coerce(props?.[key], kind)
    if (value !== undefined) out[key] = value
  }
  return { name, props: out }
}

/**
 * Whole seconds between two timestamps, or undefined when either is missing or
 * the span is negative.
 * @param {number | undefined} startedAt
 * @param {number} now
 */
export function durationSeconds(startedAt, now) {
  if (typeof startedAt !== 'number' || !(now >= startedAt)) return undefined
  return Math.round((now - startedAt) / 1000)
}

/**
 * Do Not Track, as the browser or the OS reports it.
 * @param {{ doNotTrack?: string | null, msDoNotTrack?: string | null, globalPrivacyControl?: boolean } | null | undefined} nav
 * @param {{ doNotTrack?: string | null } | null | undefined} [win]
 */
export function doNotTrack(nav, win) {
  const flags = [nav?.doNotTrack, nav?.msDoNotTrack, win?.doNotTrack]
  return flags.some(v => v === '1' || v === 'yes') || nav?.globalPrivacyControl === true
}

/** The localStorage flag the Settings switch writes: '0' = opted out. */
export const OPT_OUT_KEY = 'gn-analytics'

/**
 * Tracking runs only with a key, no Do Not Track signal and no opt-out.
 * @param {{ key?: string, dnt?: boolean, flag?: string | null }} state
 */
export function trackingAllowed({ key, dnt = false, flag = null }) {
  return !!key && !dnt && flag !== '0'
}

/** @param {string | null | undefined} platform 'ios' | 'android' | null (web) */
export function sentryEnvironment(platform) {
  return platform === 'ios' || platform === 'android' ? platform : 'web'
}

// Noise that says nothing about our code. Mirrors shouldIgnoreError in
// telemetry.js (kept apart because that module pulls in Firebase).
export const SENTRY_IGNORE_ERRORS = [
  'Script error.',
  'Script error',
  /ResizeObserver loop/,
  /^AbortError\b/,
  /^Non-Error promise rejection captured/,
]

/**
 * Sentry beforeSend: keep the uid as the only identity, drop cookies, headers
 * and the query string (invite and room ids ride in URLs).
 * @param {any} event a Sentry event
 * @returns {any}
 */
export function scrubSentryEvent(event) {
  const next = { ...event }
  const uid = event.user?.id
  next.user = uid ? { id: String(uid) } : undefined
  if (event.request) {
    const { url } = event.request
    next.request = { url: typeof url === 'string' ? url.split(/[?#]/)[0] : undefined }
  }
  return next
}

/**
 * PostHog init options. Autocapture, page-view capture and heatmaps are off:
 * only the explicit events in EVENTS go out. Replay is on with every input
 * masked; the chat log and the dock are excluded by class (`ph-no-capture`).
 * @param {{ host?: string }} cfg
 */
export function posthogOptions({ host } = {}) {
  return {
    api_host: host || 'https://us.i.posthog.com',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    disable_surveys: true,
    // Guests are identified by their anonymous uid; nothing is stored until then.
    person_profiles: 'identified_only',
    persistence: 'localStorage',
    respect_dnt: true,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '[data-ph-mask]',
      blockSelector: '.ph-no-capture',
    },
  }
}
