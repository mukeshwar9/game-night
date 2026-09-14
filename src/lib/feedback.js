import {
  ref, push, set, update, onValue, query, orderByChild,
} from 'firebase/database'
import { db } from './firebase'
import { getUid } from './auth'
import { defaultAvatarForId } from './avatars'

export const FEEDBACK_TYPES = ['bug', 'feature']
export const FEEDBACK_STATUSES = ['open', 'planned', 'done', 'closed']

export function normalizeFeedbackType(type) {
  return FEEDBACK_TYPES.includes(type) ? type : 'bug'
}

export function normalizeFeedbackStatus(status) {
  return FEEDBACK_STATUSES.includes(status) ? status : 'open'
}

export async function submitFeedback({ type, message, page, profile } = {}) {
  const uid = getUid()
  const text = String(message || '').trim().slice(0, 1000)
  if (!db || !uid || text.length < 10) return { ok: false }
  const now = Date.now()
  const itemRef = push(ref(db, 'feedback'))
  await set(itemRef, {
    type: normalizeFeedbackType(type),
    message: text,
    page: String(page || '').slice(0, 300),
    by: uid,
    name: String(profile?.displayName || `Guest-${uid.slice(0, 4).toUpperCase()}`).slice(0, 40),
    avatar: String(profile?.avatar || defaultAvatarForId(uid)).slice(0, 160),
    status: 'open',
    createdAt: now,
    updatedAt: now,
  })
  return { ok: true, id: itemRef.key }
}

export function subscribeFeedback(cb) {
  if (!db) { cb([]); return () => {} }
  return onValue(query(ref(db, 'feedback'), orderByChild('createdAt')), snap => {
    const val = snap.val() || {}
    cb(Object.entries(val)
      .map(([id, item]) => ({ id, ...item }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)))
  }, () => cb(null))
}

export async function updateFeedbackStatus(id, status) {
  if (!db || !id) return
  await update(ref(db, `feedback/${id}`), {
    status: normalizeFeedbackStatus(status),
    updatedAt: Date.now(),
  })
}
