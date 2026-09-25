// In-house error telemetry. Uncaught errors, unhandled promise rejections and
// ErrorBoundary crashes are reported to RTDB at errors/{day}/{pushId} (UTC
// day, see dayKey) so the admin view in /notes can show what breaks, where,
// and on which build. No third-party service.
//
// Guard rails: identical messages are reported once per browser-tab session,
// at most MAX_REPORTS_PER_SESSION reports go out per session (both survive a
// reload via sessionStorage, so a crash → reload loop can't flood the node),
// known noise is dropped (shouldIgnoreError), and nothing is sent from dev or
// emulator builds unless explicitly enabled (isTelemetryEnabled). The
// reporter never throws and never awaits in the caller's path.
//
// The helpers above the Firebase section are pure and unit-tested in
// telemetry.test.js.

import { ref, push, set, get } from 'firebase/database'
import { db, usingEmulators } from './firebase'
import { authReady, getUid } from './auth'

export const MAX_REPORTS_PER_SESSION = 5
export const MSG_MAX = 300
export const STACK_MAX = 1500
const ROUTE_MAX = 100
const UA_MAX = 60

// UTC calendar day, e.g. '2026-09-26'. Shared with analytics.js so errors and
// play counters bucket on the same boundary.
export function dayKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10)
}

// The last `n` day keys, newest first (today, yesterday, …).
export function lastDayKeys(n, now = Date.now()) {
  const out = []
  for (let i = 0; i < n; i++) out.push(dayKey(now - i * 86_400_000))
  return out
}

// Build id = the content hash Vite puts in the entry chunk's file name
// (/assets/index-AbC12_-9.js → 'AbC12_-9'), so reports group by deploy.
// 'dev' for unbundled modules (dev server, tests).
export function buildIdFromUrl(url) {
  const m = /\/assets\/.+-([\w-]{8})\.js(?:$|[?#])/.exec(String(url || ''))
  return m ? m[1] : 'dev'
}

// Room ids are random, so /game/ABC123 → /game/:id to keep routes groupable.
export function routeKey(pathname) {
  return String(pathname || '/').replace(/^\/game\/[^/]+/, '/game/:id').slice(0, ROUTE_MAX)
}

// "Chrome 128 · macOS" — enough to spot a browser-specific break without
// storing the full fingerprintable UA string.
export function shortUserAgent(ua) {
  const s = String(ua || '')
  const pick = (re, label) => { const m = re.exec(s); return m ? `${label} ${m[1]}` : null }
  const browser = pick(/Edg(?:A|iOS)?\/(\d+)/, 'Edge')
    || pick(/SamsungBrowser\/(\d+)/, 'Samsung')
    || pick(/Firefox\/(\d+)/, 'Firefox')
    || pick(/FxiOS\/(\d+)/, 'Firefox')
    || pick(/(?:Chrome|CriOS)\/(\d+)/, 'Chrome')
    || pick(/Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari/, 'Safari')
    || 'Other'
  const os = /iPhone|iPad|iPod/.test(s) ? 'iOS'
    : /Android/.test(s) ? 'Android'
      : /CrOS/.test(s) ? 'ChromeOS'
        : /Mac OS X|Macintosh/.test(s) ? 'macOS'
          : /Windows/.test(s) ? 'Windows'
            : /Linux/.test(s) ? 'Linux'
              : 'Other'
  return `${browser} · ${os}`.slice(0, UA_MAX)
}

// Normalizes whatever was thrown or rejected (Error, string, plain object,
// undefined) into { msg, stack }.
export function describeError(err) {
  if (err instanceof Error || (err && typeof err === 'object' && 'message' in err)) {
    const name = err.name && err.name !== 'Error' ? `${err.name}: ` : ''
    return { msg: `${name}${String(err.message ?? '')}`, stack: typeof err.stack === 'string' ? err.stack : '' }
  }
  if (err === undefined || err === null) return { msg: '', stack: '' }
  if (typeof err === 'object') {
    try { return { msg: JSON.stringify(err), stack: '' } } catch { return { msg: String(err), stack: '' } }
  }
  return { msg: String(err), stack: '' }
}

// Noise that says nothing about our code: opaque cross-origin errors,
// benign ResizeObserver warnings, browser-extension frames, user aborts.
export function shouldIgnoreError(msg, stack = '') {
  const m = String(msg || '').trim()
  if (!m || m === 'Script error.' || m === 'Script error') return true
  if (/ResizeObserver loop/.test(m)) return true
  if (/^AbortError\b/.test(m)) return true
  if (/(?:chrome|moz|safari(?:-web)?)-extension:\/\//.test(String(stack || ''))) return true
  return false
}

// The RTDB record. Truncates every free-text field and omits empty optional
// keys (Firebase rejects undefined).
export function buildErrorReport({ msg, stack, kind, route, gameType, build, ua, uid, at }) {
  const report = {
    at,
    kind: kind === 'rejection' || kind === 'boundary' ? kind : 'error',
    msg: String(msg || '').slice(0, MSG_MAX),
    route: String(route || '/').slice(0, ROUTE_MAX),
    build: String(build || 'dev').slice(0, 20),
    ua: String(ua || '').slice(0, UA_MAX),
  }
  if (stack) report.stack = String(stack).slice(0, STACK_MAX)
  if (gameType) report.gameType = String(gameType).slice(0, 40)
  if (uid) report.uid = uid
  return report
}

// Off in dev and emulator builds unless `override` is '1'; '0' forces it off
// in production. `override` comes from VITE_TELEMETRY or localStorage
// 'gn-telemetry' (see resolveEnabled below).
export function isTelemetryEnabled({ prod, emulator, override } = {}) {
  if (override === '1') return true
  if (override === '0') return false
  return !!prod && !emulator
}

// Dedupe + per-session cap in front of `send`. `storage` is a
// sessionStorage-like object (getItem/setItem) so the budget survives a
// reload; any storage failure falls back to memory.
export function createReporter({ send, enabled = true, storage = null, max = MAX_REPORTS_PER_SESSION, key = 'gn-telemetry-session' }) {
  let memory = { count: 0, seen: [] }
  const load = () => {
    try {
      const parsed = JSON.parse(storage?.getItem(key) || 'null')
      if (parsed && typeof parsed.count === 'number' && Array.isArray(parsed.seen)) memory = parsed
    } catch { /* keep memory */ }
    return memory
  }
  const save = (state) => {
    memory = state
    try { storage?.setItem(key, JSON.stringify(state)) } catch { /* memory only */ }
  }

  return {
    // Returns true when a report was handed to `send`.
    report(err, extra = {}) {
      try {
        if (!enabled) return false
        const { msg, stack } = describeError(err)
        const fullStack = [stack, extra.componentStack].filter(Boolean).join('\n')
        if (shouldIgnoreError(msg, fullStack)) return false
        const state = load()
        if (state.count >= max) return false
        const signature = `${extra.kind || 'error'}|${msg.slice(0, MSG_MAX)}`
        if (state.seen.includes(signature)) return false
        save({ count: state.count + 1, seen: [...state.seen, signature].slice(-max * 4) })
        Promise.resolve()
          .then(() => send({ msg, stack: fullStack, ...extra }))
          .catch(() => {})
        return true
      } catch {
        return false
      }
    },
  }
}

// Rolls errors/{day} snapshots ({ [day]: { [pushId]: report } }) up for the
// /notes admin view: total, counts per game (reports with no gameType count
// as 'none'), distinct messages by frequency, and the newest `recentLimit`.
export function summarizeErrors(byDay, recentLimit = 20) {
  const all = []
  for (const day of Object.values(byDay || {})) {
    if (!day || typeof day !== 'object') continue
    for (const [id, r] of Object.entries(day)) {
      if (!r || typeof r !== 'object' || typeof r.msg !== 'string') continue
      all.push({ id, ...r, at: typeof r.at === 'number' ? r.at : 0 })
    }
  }
  all.sort((a, b) => b.at - a.at)
  const count = (keyOf) => {
    const map = new Map()
    for (const r of all) {
      const k = keyOf(r)
      const cur = map.get(k) || { key: k, count: 0, lastAt: 0, sample: r }
      cur.count += 1
      if (r.at > cur.lastAt) { cur.lastAt = r.at; cur.sample = r }
      map.set(k, cur)
    }
    return [...map.values()].sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
  }
  return {
    total: all.length,
    byGame: count(r => r.gameType || 'none').map(({ key, count }) => ({ gameType: key, count })),
    byMessage: count(r => r.msg).map(({ key, count, lastAt, sample }) => ({
      msg: key, count, lastAt, route: sample.route || '', build: sample.build || '',
      gameType: sample.gameType || '', stack: sample.stack || '',
    })),
    recent: all.slice(0, recentLimit),
  }
}

// ---------------------------------------------------------------------------
// Firebase-bound instance
// ---------------------------------------------------------------------------

// Extra context set by the page (Game.jsx sets gameType), attached to every
// report while it's set.
let context = {}
export function setTelemetryContext(next) {
  context = next && typeof next === 'object' ? { ...next } : {}
}

function safeStorage(name) {
  try { return typeof window !== 'undefined' ? window[name] : null } catch { return null }
}

function resolveEnabled() {
  let override = import.meta.env.VITE_TELEMETRY
  try { override = safeStorage('localStorage')?.getItem('gn-telemetry') ?? override } catch { /* blocked */ }
  return isTelemetryEnabled({ prod: import.meta.env.PROD, emulator: usingEmulators, override })
}

async function sendToFirebase({ msg, stack, kind, gameType }) {
  if (!db) return
  await authReady()
  const uid = getUid()
  if (!uid) return // rules require auth; nothing useful to do without it
  const at = Date.now()
  const report = buildErrorReport({
    msg,
    stack,
    kind,
    at,
    uid,
    route: routeKey(typeof location !== 'undefined' ? location.pathname : '/'),
    gameType: gameType ?? context.gameType,
    build: buildIdFromUrl(import.meta.url),
    ua: shortUserAgent(typeof navigator !== 'undefined' ? navigator.userAgent : ''),
  })
  await set(push(ref(db, `errors/${dayKey(at)}`)), report)
}

let reporter = null
function getReporter() {
  if (!reporter) {
    reporter = createReporter({
      send: sendToFirebase,
      enabled: resolveEnabled(),
      storage: safeStorage('sessionStorage'),
    })
  }
  return reporter
}

// Report one error. `extra` may carry { kind: 'error'|'rejection'|'boundary',
// componentStack, gameType }. Safe to call from anywhere; never throws.
export function reportError(err, extra = {}) {
  try { return getReporter().report(err, extra) } catch { return false }
}

// Admin read (rules: admins only): { [day]: errors/{day} value } for the
// last `days` UTC days. Rejects when the read is denied.
export async function fetchRecentErrors(days = 3) {
  if (!db) return {}
  const keys = lastDayKeys(days)
  const snaps = await Promise.all(keys.map(day => get(ref(db, `errors/${day}`))))
  return Object.fromEntries(keys.map((day, i) => [day, snaps[i].val()]))
}

let installed = false
// Window-level hooks for everything React's ErrorBoundary can't see: errors
// in event handlers, timers and async code, and unhandled rejections.
export function installGlobalErrorHandlers() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', (e) => {
    reportError(e.error ?? e.message, { kind: 'error' })
  })
  window.addEventListener('unhandledrejection', (e) => {
    reportError(e.reason, { kind: 'rejection' })
  })
}
