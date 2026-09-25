// Local mute list: players whose chat (and, once wired, reactions) this
// device hides. Stored only in localStorage — muting is private to the muter
// and never touches Firebase. The map logic is pure and tested in
// moderationLogic.js; this file is just the storage + change-notification
// wrapper, plus a hook for components.

import { useSyncExternalStore } from 'react'
import { parseMutedMap, toggleMutedMap, mutedList } from './moderationLogic'

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
  return !!next[uid]
}

export function unmute(uid) {
  if (isMuted(uid)) toggleMute(uid)
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
