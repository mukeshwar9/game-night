// Anonymized play-count instrumentation. Fire-and-forget atomic increments in
// RTDB — never awaited by callers, never allowed to break the game they're
// instrumenting.
//
//   plays/{gameType}/{mode}                          lifetime "started" total
//   playsDaily/{day}/{gameType}/{mode}/{counter}     per UTC day (see dayKey)
//
// counter is 'started' | 'finished' | 'abandoned':
//   started   — a room was created or switched to this game, or a solo/local
//               demo was opened (recordPlay). One per session, not per round.
//   finished  — a round ended normally (recordRoundEnd).
//   abandoned — a round ended because a player left (CLAIM WIN after the
//               opponent went away) (recordRoundEnd).
// finished/abandoned count rounds, so finished can exceed started when a room
// plays several rematches. abandoned ÷ (finished + abandoned) is the abandon
// rate; a game with many starts and few finishes gets opened and dropped.
//
// The daily counters live in their own node, not under plays/{type}/{mode}:
// that path is a number, and writing a child under it would replace the
// lifetime total. The two writes are also separate (not one multi-path
// update) so a rules rejection on one can't drop the other.

import { ref, set, get, increment } from 'firebase/database'
import { db } from './firebase'
import { dayKey, lastDayKeys } from './telemetry'

const SAFE_GAME_TYPE = /^[a-zA-Z0-9]+$/
export const PLAY_MODES = ['multi', 'solo', 'local']
export const PLAY_COUNTERS = ['started', 'finished', 'abandoned']

// RTDB path for one daily counter, or null when any part is invalid (so a
// bad gameType can never write outside the counter tree).
export function playsDailyPath(day, gameType, mode, counter) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return null
  if (!SAFE_GAME_TYPE.test(gameType || '')) return null
  if (!PLAY_MODES.includes(mode) || !PLAY_COUNTERS.includes(counter)) return null
  return `playsDaily/${day}/${gameType}/${mode}/${counter}`
}

function bump(path) {
  if (!db || !path) return
  set(ref(db, path), increment(1)).catch(() => {})
}

export function recordPlay(gameType, mode) {
  if (!db) return
  if (!SAFE_GAME_TYPE.test(gameType || '')) return
  if (!PLAY_MODES.includes(mode)) return
  bump(`plays/${gameType}/${mode}`)
  bump(playsDailyPath(dayKey(), gameType, mode, 'started'))
}

// In-memory dedupe for recordRoundEnd's `onceKey` (see below).
const recordedRounds = new Set()

// outcome: 'finished' | 'abandoned'. Pass `onceKey` (e.g.
// `${gameId}:${gameType}:${roundNumber}`) when the calling effect could fire
// more than once for the same round; each key counts once per page load.
export function recordRoundEnd(gameType, mode, outcome, { onceKey } = {}) {
  if (outcome !== 'finished' && outcome !== 'abandoned') return
  const path = playsDailyPath(dayKey(), gameType, mode, outcome)
  if (!path) return
  if (onceKey) {
    if (recordedRounds.has(onceKey)) return
    recordedRounds.add(onceKey)
  }
  bump(path)
}

// Sums playsDaily day snapshots ({ [day]: { [type]: { [mode]: counters } } })
// into one row per game, most-started first — for the /notes admin view.
export function summarizePlays(byDay) {
  const rows = new Map()
  for (const day of Object.values(byDay || {})) {
    if (!day || typeof day !== 'object') continue
    for (const [type, modes] of Object.entries(day)) {
      if (!modes || typeof modes !== 'object') continue
      const row = rows.get(type) || { type, started: 0, finished: 0, abandoned: 0 }
      for (const counters of Object.values(modes)) {
        for (const c of PLAY_COUNTERS) {
          const n = counters?.[c]
          if (typeof n === 'number' && Number.isFinite(n)) row[c] += n
        }
      }
      rows.set(type, row)
    }
  }
  return [...rows.values()].sort((a, b) => b.started - a.started || b.finished - a.finished || a.type.localeCompare(b.type))
}

// Admin read (rules: admins only): { [day]: playsDaily/{day} value } for the
// last `days` UTC days. Rejects when the read is denied.
export async function fetchRecentPlays(days = 3) {
  if (!db) return {}
  const keys = lastDayKeys(days)
  const snaps = await Promise.all(keys.map(day => get(ref(db, `playsDaily/${day}`))))
  return Object.fromEntries(keys.map((day, i) => [day, snaps[i].val()]))
}
