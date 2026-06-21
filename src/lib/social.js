// The social layer: persistent profiles, friend codes, friends, game invites,
// and presence — all in Firebase Realtime DB, keyed by the auth uid
// (getUid()/getPlayerId()). Pure helpers (friend-code gen/validation) are
// unit-tested in social.test.js; the rest are thin DB wrappers reusing the
// transaction / multi-path-update / onValue patterns from Game.jsx.

import {
  ref, get, set, update, onValue, runTransaction, push, onDisconnect,
} from 'firebase/database'
import { db, auth } from './firebase'
import { getUid } from './auth'
import { defaultAvatarForId } from './avatars'

// ---- Friend codes (pure) ----
// Unambiguous alphabet — no 0/O, 1/I/L.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6

export function randomFriendCode(rand = Math.random) {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)]
  }
  return code
}

export function normalizeFriendCode(input) {
  return String(input || '')
    .toUpperCase()
    .split('')
    .filter(ch => CODE_ALPHABET.includes(ch))
    .join('')
    .slice(0, CODE_LENGTH)
}

export function isValidFriendCode(code) {
  const c = String(code || '')
  if (c.length !== CODE_LENGTH) return false
  for (const ch of c) if (!CODE_ALPHABET.includes(ch)) return false
  return true
}

// ---- Profile ----
function guestName(uid) {
  return `Guest-${String(uid || '').slice(0, 4).toUpperCase() || 'XXXX'}`
}

function mirrorLocal({ displayName, avatar } = {}) {
  try {
    if (displayName) localStorage.setItem('playerName', displayName)
    if (avatar) localStorage.setItem('playerAvatar', avatar)
  } catch { /* quota — ignore */ }
}

async function allocateCode(uid) {
  for (let i = 0; i < 8; i++) {
    const code = randomFriendCode()
    const { committed } = await runTransaction(
      ref(db, `codes/${code}`),
      cur => (cur === null ? uid : undefined),
    )
    if (committed) return code
  }
  // 8 collisions in a row is astronomically unlikely; fall back to a longer code.
  const code = randomFriendCode() + randomFriendCode()
  await set(ref(db, `codes/${code}`), uid)
  return code
}

// Create users/{uid} if missing; otherwise refresh volatile fields and heal any
// missing ones. Mirrors name/avatar to localStorage so the existing synchronous
// reads in Home/Game keep working. Safe to call on every boot.
export async function ensureProfile() {
  const uid = getUid()
  if (!db || !uid) return null
  const userRef = ref(db, `users/${uid}`)
  const snap = await get(userRef)
  const anon = auth?.currentUser?.isAnonymous ?? true

  if (snap.exists()) {
    const p = snap.val()
    const patch = { isAnonymous: anon, updatedAt: Date.now() }
    if (!p.code) patch.code = await allocateCode(uid)
    if (!p.avatar) patch.avatar = defaultAvatarForId(uid)
    await update(userRef, patch)
    const merged = { ...p, ...patch }
    mirrorLocal(merged)
    return merged
  }

  const displayName = localStorage.getItem('playerName') || guestName(uid)
  const avatar = localStorage.getItem('playerAvatar') || defaultAvatarForId(uid)
  const code = await allocateCode(uid)
  const profile = {
    displayName,
    nameLower: displayName.toLowerCase(),
    avatar,
    code,
    isAnonymous: anon,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await set(userRef, profile)
  mirrorLocal(profile)
  return profile
}

export async function setProfile({ displayName, avatar } = {}) {
  const uid = getUid()
  if (!db || !uid) return
  const patch = { updatedAt: Date.now() }
  if (typeof displayName === 'string' && displayName.trim()) {
    patch.displayName = displayName.trim().slice(0, 20)
    patch.nameLower = patch.displayName.toLowerCase()
  }
  if (avatar) patch.avatar = avatar
  await update(ref(db, `users/${uid}`), patch)
  mirrorLocal({ displayName: patch.displayName, avatar: patch.avatar })
}

export function subscribeProfile(uid, cb) {
  if (!db || !uid) { cb(null); return () => {} }
  return onValue(ref(db, `users/${uid}`), snap => cb(snap.val()))
}

export async function getProfile(uid) {
  if (!db || !uid) return null
  const snap = await get(ref(db, `users/${uid}`))
  return snap.val()
}

// ---- Friends ----
export async function lookupByCode(code) {
  const norm = normalizeFriendCode(code)
  if (!isValidFriendCode(norm) || !db) return null
  const snap = await get(ref(db, `codes/${norm}`))
  const uid = snap.val()
  if (!uid) return null
  return { uid, profile: await getProfile(uid) }
}

// Returns { ok, ... } or { ok:false, error } with error in
// 'invalid' | 'notfound' | 'self' | 'already'.
export async function sendFriendRequestByCode(code) {
  const me = getUid()
  if (!db || !me) return { ok: false, error: 'invalid' }
  if (!isValidFriendCode(normalizeFriendCode(code))) return { ok: false, error: 'invalid' }
  const found = await lookupByCode(code)
  if (!found) return { ok: false, error: 'notfound' }
  if (found.uid === me) return { ok: false, error: 'self' }
  const already = await get(ref(db, `friends/${me}/${found.uid}`))
  if (already.exists()) return { ok: false, error: 'already' }
  const myProfile = await getProfile(me)
  await set(ref(db, `friendRequests/${found.uid}/${me}`), {
    name: myProfile?.displayName || guestName(me),
    avatar: myProfile?.avatar || defaultAvatarForId(me),
    code: myProfile?.code || null,
    at: Date.now(),
  })
  return { ok: true, to: found.profile?.displayName || 'player' }
}

export async function acceptRequest(fromUid) {
  const me = getUid()
  if (!db || !me || !fromUid) return
  const now = Date.now()
  // Bidirectional friendship + clear the pending request, atomically.
  await update(ref(db), {
    [`friends/${me}/${fromUid}`]: { since: now },
    [`friends/${fromUid}/${me}`]: { since: now },
    [`friendRequests/${me}/${fromUid}`]: null,
  })
}

export async function declineRequest(fromUid) {
  const me = getUid()
  if (!db || !me || !fromUid) return
  await set(ref(db, `friendRequests/${me}/${fromUid}`), null)
}

export async function removeFriend(friendUid) {
  const me = getUid()
  if (!db || !me || !friendUid) return
  await update(ref(db), {
    [`friends/${me}/${friendUid}`]: null,
    [`friends/${friendUid}/${me}`]: null,
  })
}

export function subscribeFriends(cb) {
  const me = getUid()
  if (!db || !me) { cb([]); return () => {} }
  return onValue(ref(db, `friends/${me}`), snap => {
    const val = snap.val() || {}
    cb(Object.keys(val).map(uid => ({ uid, since: val[uid]?.since || 0 })))
  })
}

export function subscribeRequests(cb) {
  const me = getUid()
  if (!db || !me) { cb([]); return () => {} }
  return onValue(ref(db, `friendRequests/${me}`), snap => {
    const val = snap.val() || {}
    cb(Object.entries(val).map(([uid, r]) => ({ uid, ...r })))
  })
}

// ---- Game invites ----
export async function inviteFriendToGame(friendUid, { gameId, gameType } = {}) {
  const me = getUid()
  if (!db || !me || !friendUid || !gameId) return
  const myProfile = await getProfile(me)
  await push(ref(db, `invites/${friendUid}`), {
    gameId,
    gameType: gameType || null,
    fromUid: me,
    fromName: myProfile?.displayName || guestName(me),
    fromAvatar: myProfile?.avatar || defaultAvatarForId(me),
    at: Date.now(),
  })
}

export async function dismissInvite(inviteId) {
  const me = getUid()
  if (!db || !me || !inviteId) return
  await set(ref(db, `invites/${me}/${inviteId}`), null)
}

export function subscribeInvites(cb) {
  const me = getUid()
  if (!db || !me) { cb([]); return () => {} }
  return onValue(ref(db, `invites/${me}`), snap => {
    const val = snap.val() || {}
    cb(Object.entries(val)
      .map(([id, inv]) => ({ id, ...inv }))
      .sort((a, b) => (b.at || 0) - (a.at || 0)))
  })
}

// ---- Presence ----
// Mark users/{uid}/online true while connected, false on disconnect. Mirrors the
// per-game presence pattern in Game.jsx. Returns an unsubscribe.
export function setupPresence(uid) {
  if (!db || !uid) return () => {}
  const statusRef = ref(db, `users/${uid}/online`)
  const seenRef = ref(db, `users/${uid}/lastSeen`)
  return onValue(ref(db, '.info/connected'), snap => {
    if (!snap.val()) return
    onDisconnect(statusRef).set(false)
    set(statusRef, true)
    set(seenRef, Date.now())
  })
}
