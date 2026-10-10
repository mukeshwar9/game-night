// Account side of the memory solo runs, same pattern as arrowsProgress.js:
// localStorage (soloBest.js) stays the synchronous source and works signed out;
// signed-in players also get users/{uid}/memoryBests so bests follow them across
// devices. Both sides only ever merge upward.
//
// DAILY MEMORY results live at dailyMemory/{date}/{uid}: written once (the rules
// refuse a second write, so one attempt a day), readable by signed-in players, so
// the page can show how friends did today.
import { ref, get, set as dbSet, runTransaction, serverTimestamp } from 'firebase/database'
import { db } from './firebase'
import { getUid } from './auth'
import { cacheBelongsTo } from './playerCache'
import { readSoloBest, recordSoloBest } from './soloBest'
import { DAILY_MEMORY_GAMES, mergeBests } from './memoryDailyLogic'

// Every memory solo run with a personal best (database.rules.json allows these keys).
export const MEMORY_TYPES = [...DAILY_MEMORY_GAMES, 'cupshuffle', 'whatchanged', 'kimsgame', 'nametags', 'verbalmemory', 'nback']

// Raise the account copy of one best (fire and forget; never lowers it).
export function mirrorMemoryBest(type, score) {
  const uid = getUid()
  if (!db || !uid || !cacheBelongsTo(uid) || !MEMORY_TYPES.includes(type)) return
  runTransaction(ref(db, `users/${uid}/memoryBests/${type}`), cur => (typeof cur === 'number' && cur >= score ? undefined : score)).catch(() => {})
}

// Pull the account copy, merge both ways, and return the merged bests.
export async function syncMemoryBests() {
  const local = Object.fromEntries(MEMORY_TYPES.map(t => [t, readSoloBest(t)]))
  const uid = getUid()
  if (!db || !uid) return local
  try {
    const snap = await get(ref(db, `users/${uid}/memoryBests`))
    const remote = snap.exists() ? snap.val() : null
    const merged = mergeBests(local, remote)
    for (const t of MEMORY_TYPES) if ((merged[t] ?? 0) > local[t]) recordSoloBest(t, merged[t])
    const behind = MEMORY_TYPES.some(t => (merged[t] ?? 0) > (remote?.[t] ?? 0))
    if (behind && cacheBelongsTo(uid)) await dbSet(ref(db, `users/${uid}/memoryBests`), Object.fromEntries(MEMORY_TYPES.filter(t => merged[t] > 0).map(t => [t, merged[t]])))
    return merged
  } catch {
    return local
  }
}

// ── DAILY MEMORY ──

const dayKey = date => `gn-daily-memory-${date}`

// This device's record of today's attempt: { started: true } once a run begins
// (a reload cannot buy a second try), { started, score } once it ends.
export function readDailyAttempt(date) {
  try { return JSON.parse(localStorage.getItem(dayKey(date))) || null } catch { return null }
}

export function markDailyStarted(date) {
  try { localStorage.setItem(dayKey(date), JSON.stringify({ started: true })) } catch { /* private mode */ }
}

export async function submitDailyMemory(date, { game, score, name, avatar }) {
  try { localStorage.setItem(dayKey(date), JSON.stringify({ started: true, score })) } catch { /* private mode */ }
  const uid = getUid()
  if (!db || !uid) return false
  try {
    await dbSet(ref(db, `dailyMemory/${date}/${uid}`), {
      game, score, at: serverTimestamp(),
      name: String(name || 'PLAYER').slice(0, 20),
      ...(avatar ? { avatar: String(avatar).slice(0, 64) } : {}),
    })
    return true
  } catch {
    return false // already played on another device, or offline
  }
}

// My entry plus my friends' entries for `date` (point reads: no list of everyone).
export async function readDailyBoard(date) {
  const me = getUid()
  if (!db || !me) return []
  try {
    const friendsSnap = await get(ref(db, `friends/${me}`))
    const uids = [me, ...Object.keys(friendsSnap.val() || {})]
    const snaps = await Promise.all(uids.map(u => get(ref(db, `dailyMemory/${date}/${u}`)).catch(() => null)))
    return snaps.map((s, i) => (s?.exists() ? { uid: uids[i], ...s.val() } : null)).filter(Boolean)
  } catch {
    return []
  }
}
