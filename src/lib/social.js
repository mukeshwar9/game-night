// The social layer: persistent profiles, friend codes, friends, game invites,
// and presence — all in Firebase Realtime DB, keyed by the auth uid
// (getUid()/getPlayerId()). Pure helpers (friend-code gen/validation) are
// unit-tested in social.test.js; the rest are thin DB wrappers reusing the
// transaction / multi-path-update / onValue patterns from Game.jsx.
//
// A profile is split three ways by who may read it (database.rules.json):
//   users/{uid}     private — friend code, stats, matches, admin, theme…; owner only
//   profiles/{uid}  public  — { displayName, nameLower, avatar, updatedAt }; any signed-in user
//   presence/{uid}  { online, lastSeen }; the owner and their friends
// ensureProfile mirrors the public half on every boot, so accounts created
// before the split migrate the first time they open the app.

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
// The public half of a profile (profiles/{uid}) — exactly the fields the rules
// accept there.
export function publicProfile(p, now = Date.now()) {
  const displayName = String(p?.displayName || '').trim().slice(0, 40)
  if (!displayName) return null
  const out = { displayName, nameLower: displayName.toLowerCase(), updatedAt: now }
  if (typeof p?.avatar === 'string' && p.avatar) out.avatar = p.avatar.slice(0, 200)
  return out
}

// What callers of subscribeProfile see for someone else: the public profile
// plus online/lastSeen when their presence is readable (friends only).
export function mergeFriendProfile(pub, presence) {
  if (!pub && !presence) return null
  return { ...(pub || {}), online: presence?.online === true, lastSeen: presence?.lastSeen ?? null }
}

export function guestName(uid) {
  return `Guest-${String(uid || '').slice(0, 4).toUpperCase() || 'XXXX'}`
}

// Placeholder names (`Guest-AB12`) that nobody chose. The invite screen asks
// for a real name while the stored one still looks like this.
export function isGuestStyleName(name) {
  return !name || /^Guest-[0-9A-Z]{4}$/i.test(String(name).trim())
}

function localName() {
  try { return localStorage.getItem('playerName') || '' } catch { return '' }
}

// Never downgrades a chosen local name to a placeholder: a profile read that
// started before the player typed their name must not overwrite it.
function mirrorLocal({ displayName, avatar } = {}) {
  try {
    if (displayName && !(isGuestStyleName(displayName) && !isGuestStyleName(localName()))) {
      localStorage.setItem('playerName', displayName)
    }
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

  // Google account name wins over a guest-style placeholder — without this an
  // upgraded (linked) account keeps showing Guest-XXXX forever, since the
  // stored profile never adopts auth.currentUser.displayName. A name typed on
  // this device (the invite screen, an older client that only kept it in
  // localStorage) wins next, so a placeholder never overwrites a chosen name.
  const googleName = auth?.currentUser?.displayName?.trim() || ''
  const chosenLocal = isGuestStyleName(localName()) ? '' : localName().trim()

  if (snap.exists()) {
    const p = snap.val()
    const patch = { isAnonymous: anon, updatedAt: Date.now() }
    if (!p.code) patch.code = await allocateCode(uid)
    if (!p.avatar) patch.avatar = defaultAvatarForId(uid)
    const betterName = googleName || chosenLocal
    if (betterName && isGuestStyleName(p.displayName)) {
      patch.displayName = betterName.slice(0, 20)
      patch.nameLower = patch.displayName.toLowerCase()
    }
    await update(userRef, patch)
    const merged = { ...p, ...patch }
    mirrorPublic(uid, merged)
    mirrorLocal(merged)
    return merged
  }

  const displayName = googleName || chosenLocal || guestName(uid)
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
  // A transaction, not a blind set: the invite screen can save a typed name
  // (saveDisplayName) while this first-boot create is still allocating a code,
  // and that name must survive — fields already on the node win.
  const { snapshot } = await runTransaction(userRef, cur => {
    if (!cur) return profile
    const merged = { ...profile, ...cur }
    if (isGuestStyleName(cur.displayName) && !isGuestStyleName(displayName)) {
      merged.displayName = displayName
      merged.nameLower = profile.nameLower
    }
    return merged
  })
  const saved = snapshot?.val() || profile
  mirrorPublic(uid, saved)
  mirrorLocal(saved)
  return saved
}

// Publish the public half (profiles/{uid}). Best effort and never rejects: a
// failure must not block boot — the private profile is already saved, and the
// next boot retries.
async function mirrorPublic(uid, p) {
  const pub = publicProfile(p)
  if (!pub) return
  try { await set(ref(db, `profiles/${uid}`), pub) } catch { /* retried next boot */ }
}

// Save a name chosen outside the Profile page (the invite screen). Mirrors to
// localStorage first so this room join reads it synchronously, then persists
// it to users/{uid} so ensureProfile never swaps it back for Guest-XXXX.
export async function saveDisplayName(name) {
  const trimmed = String(name || '').trim().slice(0, 20)
  if (!trimmed) return
  try { localStorage.setItem('playerName', trimmed) } catch { /* quota — ignore */ }
  await setProfile({ displayName: trimmed })
}

export async function setProfile({ displayName, avatar, theme, fontFamily } = {}) {
  const uid = getUid()
  if (!db || !uid) return
  const patch = { updatedAt: Date.now() }
  if (typeof displayName === 'string' && displayName.trim()) {
    patch.displayName = displayName.trim().slice(0, 20)
    patch.nameLower = patch.displayName.toLowerCase()
  }
  if (avatar) patch.avatar = avatar
  // Theme is not mirrored to localStorage here — theme.js (applyTheme) owns
  // that mirror; this patch only carries the choice cross-device via the profile.
  if (typeof theme === 'string' && theme) patch.theme = theme
  if (typeof fontFamily === 'string' && fontFamily) patch.fontFamily = fontFamily
  await update(ref(db, `users/${uid}`), patch)
  if (patch.displayName || patch.avatar) {
    const snap = await get(ref(db, `users/${uid}`))
    await mirrorPublic(uid, snap.val())
  }
  mirrorLocal({ displayName: patch.displayName, avatar: patch.avatar })
}

// Your own profile is the full private node; anyone else's is their public
// profile plus, for friends, their presence.
export function subscribeProfile(uid, cb) {
  if (!db || !uid) { cb(null); return () => {} }
  if (uid === getUid()) return onValue(ref(db, `users/${uid}`), snap => cb(snap.val()))
  let pub = null
  let presence = null
  let pubLoaded = false
  const emit = () => { if (pubLoaded) cb(mergeFriendProfile(pub, presence)) }
  const unsubPub = onValue(ref(db, `profiles/${uid}`), snap => { pub = snap.val(); pubLoaded = true; emit() }, () => { pubLoaded = true; emit() })
  // Not a friend (yet): the read is denied and they simply show as offline.
  const unsubPresence = onValue(ref(db, `presence/${uid}`), snap => { presence = snap.val(); emit() }, () => { presence = null; emit() })
  return () => { unsubPub(); unsubPresence() }
}

export async function getProfile(uid) {
  if (!db || !uid) return null
  const snap = await get(ref(db, uid === getUid() ? `users/${uid}` : `profiles/${uid}`))
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

// "Invite all online friends": one invite per uid, written as a single
// multi-path update so the whole batch lands (or fails) together.
export async function inviteFriendsToGame(friendUids, { gameId, gameType } = {}) {
  const me = getUid()
  const uids = [...new Set((friendUids || []).filter(Boolean))].filter(uid => uid !== me)
  if (!db || !me || !gameId || uids.length === 0) return 0
  const myProfile = await getProfile(me)
  const invite = {
    gameId,
    gameType: gameType || null,
    fromUid: me,
    fromName: myProfile?.displayName || guestName(me),
    fromAvatar: myProfile?.avatar || defaultAvatarForId(me),
    at: Date.now(),
  }
  const updates = {}
  for (const uid of uids) updates[`invites/${uid}/${push(ref(db, `invites/${uid}`)).key}`] = invite
  await update(ref(db), updates)
  return uids.length
}

export async function dismissInvite(inviteId) {
  const me = getUid()
  if (!db || !me || !inviteId) return
  await set(ref(db, `invites/${me}/${inviteId}`), null)
}

// Rooms expire after 24 h of inactivity, so an older invite only leads to
// GAME NOT FOUND — hide it (the cleanup function deletes it server-side).
export const INVITE_TTL_MS = 24 * 60 * 60 * 1000

export function freshInvites(val, now = Date.now()) {
  return Object.entries(val || {})
    .map(([id, inv]) => ({ id, ...inv }))
    .filter(inv => typeof inv.at === 'number' && inv.at >= now - INVITE_TTL_MS)
    .sort((a, b) => (b.at || 0) - (a.at || 0))
}

export function subscribeInvites(cb) {
  const me = getUid()
  if (!db || !me) { cb([]); return () => {} }
  return onValue(ref(db, `invites/${me}`), snap => cb(freshInvites(snap.val())))
}

// ---- Presence ----
// Mark presence/{uid}/online true while connected, false on disconnect (only
// the player and their friends can read it). Mirrors the per-game presence
// pattern in Game.jsx. Returns an unsubscribe.
export function setupPresence(uid) {
  if (!db || !uid) return () => {}
  const statusRef = ref(db, `presence/${uid}/online`)
  const seenRef = ref(db, `presence/${uid}/lastSeen`)
  return onValue(ref(db, '.info/connected'), snap => {
    if (!snap.val()) return
    onDisconnect(statusRef).set(false)
    set(statusRef, true)
    set(seenRef, Date.now())
  })
}
