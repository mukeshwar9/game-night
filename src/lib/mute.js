// Block list: players whose chat and reactions this device hides, and who can
// no longer send this account friend requests or invites (blocks/{uid} in
// Firebase, see social.js blockUser). The list lives in localStorage for
// synchronous reads and is mirrored to the account: toggleMute writes through,
// and startBlockSync (run once signed in) pulls the account's list down, so a
// block survives a reinstall and follows the account to another device. The map
// logic is pure and tested in moderationLogic.js; this file is the storage +
// change-notification wrapper, the sync, and a hook for components.

import { useSyncExternalStore } from 'react'
import { parseMutedMap, toggleMutedMap, mutedList, unsyncedMutes } from './moderationLogic'
import { blockUser, unblockUser, subscribeBlocks } from './social'

const KEY = 'gn-muted-players'
const EVENT = 'gn-mute-change'
const EMPTY = Object.freeze({})

let cachedRaw
let cachedMap = EMPTY

// Same raw string → same object, so useSyncExternalStore sees a stable
// snapshot between changes.
export function getMutedMap() {
  let raw
  try { raw = localStorage.getItem(KEY) } catch { return cachedMap } // storage blocked: memory only
  if (raw === cachedRaw) return cachedMap
  cachedRaw = raw
  cachedMap = raw ? parseMutedMap(raw) : EMPTY
  return cachedMap
}

function write(map) {
  const raw = Object.keys(map).length === 0 ? null : JSON.stringify(map)
  try {
    if (raw === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, raw)
    cachedRaw = raw
  } catch { /* storage blocked or full: the mute lasts in memory until reload */ }
  cachedMap = raw === null ? EMPTY : map
  try { window.dispatchEvent(new Event(EVENT)) } catch { /* no window */ }
}

export function isMuted(uid) {
  return !!uid && !!getMutedMap()[uid]
}

// Mutes `uid` (remembering `name` for the Profile list) or unmutes it.
// Returns true when the player is now muted.
export function toggleMute(uid, name) {
  if (!uid) return false
  const next = toggleMutedMap(getMutedMap(), uid, name)
  write(next)
  const nowMuted = !!next[uid]
  // Fire and forget: the local hide already applies; if the write fails (offline,
  // rules) the next sync pass re-uploads it.
  const sync = nowMuted ? blockUser(uid, next[uid].name) : unblockUser(uid)
  sync.catch(() => { /* retried by the next startBlockSync */ })
  return nowMuted
}

// Blocks `uid` and waits for the account write, so a caller can toast a failure.
// Also drops the friendship and any pending requests (social.js blockUser).
export async function blockPlayer(uid, name) {
  if (!uid) return
  if (!isMuted(uid)) write(toggleMutedMap(getMutedMap(), uid, name))
  await blockUser(uid, name)
}

export function unmute(uid) {
  if (isMuted(uid)) toggleMute(uid)
}

// Mirrors blocks/{uid} into the local list while signed in. The first snapshot
// also uploads mutes that only exist on this device. Returns the unsubscribe.
export function startBlockSync() {
  let first = true
  return subscribeBlocks(remote => {
    const parsed = parseMutedMap(remote)
    if (first) {
      first = false
      const local = getMutedMap()
      for (const [uid, entry] of Object.entries(unsyncedMutes(local, parsed))) {
        blockUser(uid, entry.name).catch(() => { /* retried next boot */ })
        parsed[uid] = entry
      }
    }
    if (JSON.stringify(parsed) !== JSON.stringify(getMutedMap())) write(parsed)
  })
}

export function getMutedList() {
  return mutedList(getMutedMap())
}

// Fires on changes from this tab (EVENT) and other tabs ('storage').
export function subscribeMuted(cb) {
  const onStorage = (e) => { if (e.key === null || e.key === KEY) cb() }
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener('storage', onStorage)
  }
}

// The current mute map; re-renders the caller whenever it changes.
export function useMutedMap() {
  return useSyncExternalStore(subscribeMuted, getMutedMap, () => EMPTY)
}
