import {
  ref, push, update, onValue, query, orderByChild, limitToLast, serverTimestamp,
} from 'firebase/database'
import { db } from './firebase'
import { getUid } from './auth'
import { defaultAvatarForId } from './avatars'

// feedback/{id}: { type, message, page, by, name, avatar, status, createdAt,
//   updatedAt } plus, for type 'report' (a player reporting a chat message):
//   { gameId, targetUid, targetName, text }.
// Every submission also stamps users/{uid}/lastFeedbackAt in the same
// multi-path update, so the database rules can enforce the 30 s cooldown
// server-side; the client-side cooldown below is the friendly first line.

export const FEEDBACK_TYPES = ['bug', 'feature', 'report']
export const FEEDBACK_STATUSES = ['open', 'planned', 'done', 'closed']
export const FEEDBACK_COOLDOWN_MS = 30_000
export const FEEDBACK_MIN_LENGTH = 10
export const FEEDBACK_MAX_LENGTH = 1000
const REPORT_TEXT_MAX = 200
// How many of the newest items the admin view loads.
export const FEEDBACK_ADMIN_LIMIT = 200

const COOLDOWN_KEY = 'gn-feedback-last-at'
const DRAFT_KEY = 'gn-feedback-draft'

export function normalizeFeedbackType(type) {
  return FEEDBACK_TYPES.includes(type) ? type : 'bug'
}

export function normalizeFeedbackStatus(status) {
  return FEEDBACK_STATUSES.includes(status) ? status : 'open'
}

// Tolerant read of one feedback/{id} snapshot entry for the admin list:
// unknown type/status fall back to their defaults, non-numeric timestamps
// to 0, and non-string text fields to ''. Null for a non-object entry.
export function normalizeFeedbackItem(id, raw) {
  if (!raw || typeof raw !== 'object') return null
  const str = (v) => (typeof v === 'string' ? v : '')
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const item = {
    id,
    type: normalizeFeedbackType(raw.type),
    status: normalizeFeedbackStatus(raw.status),
    message: str(raw.message),
    page: str(raw.page),
    by: str(raw.by),
    name: str(raw.name),
    avatar: str(raw.avatar),
    createdAt: num(raw.createdAt),
    updatedAt: num(raw.updatedAt),
  }
  if (item.type === 'report') {
    item.gameId = str(raw.gameId)
    item.targetUid = str(raw.targetUid)
    item.targetName = str(raw.targetName)
    item.text = str(raw.text)
  }
  return item
}

// Snapshot value → newest-first list of normalized items.
export function normalizeFeedbackList(val) {
  if (!val || typeof val !== 'object') return []
  return Object.entries(val)
    .map(([id, raw]) => normalizeFeedbackItem(id, raw))
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt)
}

// Counts for the admin filter chips: { all, bug, feature, report, open }.
export function countFeedback(items) {
  const counts = { all: 0, open: 0 }
  for (const t of FEEDBACK_TYPES) counts[t] = 0
  for (const item of items || []) {
    counts.all += 1
    counts[item.type] = (counts[item.type] || 0) + 1
    if (item.status === 'open') counts.open += 1
  }
  return counts
}

// Milliseconds until another submission is allowed (0 = now).
export function feedbackCooldownLeft(lastAt, now = Date.now(), windowMs = FEEDBACK_COOLDOWN_MS) {
  if (typeof lastAt !== 'number' || !Number.isFinite(lastAt) || lastAt > now) return 0
  return Math.max(0, lastAt + windowMs - now)
}

export function getFeedbackCooldownLeft(now = Date.now()) {
  let lastAt = null
  try { lastAt = Number(localStorage.getItem(COOLDOWN_KEY)) || null } catch { /* blocked */ }
  return feedbackCooldownLeft(lastAt, now)
}

function markSubmitted(now) {
  try { localStorage.setItem(COOLDOWN_KEY, String(now)) } catch { /* blocked */ }
}

// Pre-filled bug text for ErrorBoundary's REPORT THIS PROBLEM button.
export function buildErrorFeedbackMessage({ message, route } = {}) {
  const where = route ? ` on ${route}` : ''
  const err = String(message || 'unknown error').replace(/\s+/g, ' ').trim().slice(0, 300)
  return `The app crashed${where}.\nError: ${err}\n\nWhat I was doing: `.slice(0, FEEDBACK_MAX_LENGTH)
}

// Draft handed from another screen (ErrorBoundary) to /notes. sessionStorage,
// so it survives the full-page navigation.
export function saveFeedbackDraft({ type, message } = {}) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
      type: normalizeFeedbackType(type),
      message: String(message || '').slice(0, FEEDBACK_MAX_LENGTH),
    }))
  } catch { /* blocked — the form just starts empty */ }
}

// Non-destructive so a StrictMode double-invoked state initializer sees the
// same draft both times; the page calls clearFeedbackDraft after mounting.
export function readFeedbackDraft() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null')
    if (!parsed || typeof parsed.message !== 'string') return null
    const type = normalizeFeedbackType(parsed.type)
    return { type: type === 'report' ? 'bug' : type, message: parsed.message.slice(0, FEEDBACK_MAX_LENGTH) }
  } catch {
    return null
  }
}

export function clearFeedbackDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* blocked */ }
}

function authorFields(uid, profile) {
  return {
    by: uid,
    name: String(profile?.displayName || localStorage.getItem('playerName') || `Guest-${uid.slice(0, 4).toUpperCase()}`).slice(0, 40),
    avatar: String(profile?.avatar || defaultAvatarForId(uid)).slice(0, 160),
  }
}

// One multi-path write: the item plus the rules-visible cooldown stamp.
async function writeFeedback(uid, item, now) {
  const id = push(ref(db, 'feedback')).key
  await update(ref(db), {
    [`feedback/${id}`]: item,
    [`users/${uid}/lastFeedbackAt`]: serverTimestamp(),
  })
  markSubmitted(now)
  return id
}

// Returns { ok: true, id } or { ok: false, reason: 'invalid' | 'cooldown',
// retryInMs? }. Throws on a failed write (callers toast via useBusy).
export async function submitFeedback({ type, message, page, profile } = {}) {
  const uid = getUid()
  const text = String(message || '').trim().slice(0, FEEDBACK_MAX_LENGTH)
  if (!db || !uid || text.length < FEEDBACK_MIN_LENGTH) return { ok: false, reason: 'invalid' }
  const now = Date.now()
  const wait = getFeedbackCooldownLeft(now)
  if (wait > 0) return { ok: false, reason: 'cooldown', retryInMs: wait }
  const kind = normalizeFeedbackType(type)
  const id = await writeFeedback(uid, {
    type: kind === 'report' ? 'bug' : kind, // reports go through submitReport
    message: text,
    page: String(page || '').slice(0, 300),
    ...authorFields(uid, profile),
    status: 'open',
    createdAt: now,
    updatedAt: now,
  }, now)
  return { ok: true, id }
}

// Report a chat message to the admins. Same result shape as submitFeedback.
export async function submitReport({ gameId, targetUid, targetName, text, profile } = {}) {
  const uid = getUid()
  const quoted = String(text || '').trim().slice(0, REPORT_TEXT_MAX)
  if (!db || !uid || !gameId || !targetUid || targetUid === uid) return { ok: false, reason: 'invalid' }
  const now = Date.now()
  const wait = getFeedbackCooldownLeft(now)
  if (wait > 0) return { ok: false, reason: 'cooldown', retryInMs: wait }
  const who = String(targetName || 'a player').slice(0, 40)
  const id = await writeFeedback(uid, {
    type: 'report',
    message: `Chat report — ${who}: "${quoted}"`.slice(0, FEEDBACK_MAX_LENGTH),
    page: `/game/${gameId}`.slice(0, 300),
    gameId: String(gameId).slice(0, 40),
    targetUid: String(targetUid).slice(0, 128),
    targetName: who,
    text: quoted,
    ...authorFields(uid, profile),
    status: 'open',
    createdAt: now,
    updatedAt: now,
  }, now)
  return { ok: true, id }
}

// Admin list: the newest FEEDBACK_ADMIN_LIMIT items, newest first. cb(null)
// when the read is denied (not an admin).
export function subscribeFeedback(cb) {
  if (!db) { cb([]); return () => {} }
  return onValue(
    query(ref(db, 'feedback'), orderByChild('createdAt'), limitToLast(FEEDBACK_ADMIN_LIMIT)),
    snap => cb(normalizeFeedbackList(snap.val())),
    () => cb(null),
  )
}

export async function updateFeedbackStatus(id, status) {
  if (!db || !id) return
  await update(ref(db, `feedback/${id}`), {
    status: normalizeFeedbackStatus(status),
    updatedAt: Date.now(),
  })
}
