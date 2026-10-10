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

import { ref, set, get, increment, update } from 'firebase/database'
import { db } from './firebase'
import { authReady, getUid } from './auth'
import { attributionRecord, firstTouch } from './attribution'
import { dayKey, lastDayKeys } from './telemetry'
import { trackGameStarted } from './track'

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
  recordFunnel('started')
  trackGameStarted(gameType, mode)
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
  if (outcome === 'finished') recordFunnel('finished')
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

// ---------------------------------------------------------------------------
// Ad-traffic funnel (in-house, anonymous; no third party, no cookies)
//
//   funnelDaily/{day}/{source}/{campaign|-}/{step}   count of accounts
//   funnelSeen/{uid}/{step}                          the once-per-account mark
//
// source/campaign come from the visit's first touch (attribution.js). The mark
// and the counter go out in ONE multi-path update, and the rules only accept
// the counter bump when the mark is written with it and did not exist before,
// so an account counts at most once per step and a script cannot inflate a
// counter by replaying it. New accounts can still be scripted; App Check is the
// mitigation for that, and the admin view is meant to be cross-checked against
// the ad platform's click counts.
// ---------------------------------------------------------------------------

export const FUNNEL_STEPS = ['landed', 'named', 'started', 'finished', 'shared', 'saved']

export function funnelUpdate({ day, touch, uid, step }) {
  if (!touch || !uid || !FUNNEL_STEPS.includes(step)) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return null
  if (!/^[a-z0-9_-]{1,40}$/.test(touch.source || '')) return null
  const campaign = /^[a-z0-9_-]{1,40}$/.test(touch.campaign || '') ? touch.campaign : '-'
  return {
    [`funnelDaily/${day}/${touch.source}/${campaign}/${step}`]: increment(1),
    [`funnelSeen/${uid}/${step}`]: true,
  }
}

// Fire-and-forget; safe to call from anywhere, any number of times. The local
// flag saves the write on repeat calls, the rules make replays harmless.
export function recordFunnel(step) {
  if (!db || !FUNNEL_STEPS.includes(step)) return
  const touch = firstTouch()
  if (!touch) return
  const flag = `gn-funnel-${step}`
  try {
    if (localStorage.getItem(flag)) return
    localStorage.setItem(flag, '1')
  } catch { return }
  authReady().then(() => {
    const patch = funnelUpdate({ day: dayKey(), touch, uid: getUid(), step })
    if (patch) return update(ref(db), patch)
  }).catch(() => {})
}

// Writes the first touch once onto users/{uid}/attribution (rules: create-once).
// Call after ensureProfile so the profile node exists first.
export async function recordAttribution() {
  if (!db) return
  const record = attributionRecord(firstTouch())
  const uid = getUid()
  if (!record || !uid) return
  const flag = 'gn-attribution-saved'
  try { if (localStorage.getItem(flag)) return } catch { return }
  try {
    await set(ref(db, `users/${uid}/attribution`), record)
    localStorage.setItem(flag, '1')
  } catch { /* already recorded by another device, or offline: try next boot */ }
}

// Admin: funnelDaily day snapshots -> one row per source/campaign with a count
// per step, most landings first. Conversions are step / landed.
export function summarizeFunnel(byDay) {
  const rows = new Map()
  for (const day of Object.values(byDay || {})) {
    if (!day || typeof day !== 'object') continue
    for (const [source, campaigns] of Object.entries(day)) {
      if (!campaigns || typeof campaigns !== 'object') continue
      for (const [campaign, steps] of Object.entries(campaigns)) {
        const key = `${source}/${campaign}`
        const row = rows.get(key) || { source, campaign: campaign === '-' ? '' : campaign, landed: 0, named: 0, started: 0, finished: 0, shared: 0, saved: 0 }
        for (const step of FUNNEL_STEPS) {
          const n = steps?.[step]
          if (typeof n === 'number' && Number.isFinite(n)) row[step] += n
        }
        rows.set(key, row)
      }
    }
  }
  return [...rows.values()].sort((a, b) => b.landed - a.landed || a.source.localeCompare(b.source) || a.campaign.localeCompare(b.campaign))
}

export async function fetchRecentFunnel(days = 3) {
  if (!db) return {}
  const keys = lastDayKeys(days)
  const snaps = await Promise.all(keys.map(day => get(ref(db, `funnelDaily/${day}`))))
  return Object.fromEntries(keys.map((day, i) => [day, snaps[i].val()]))
}

// Native cold start, splash to first screen, as counts per time bucket:
//   bootDaily/{day}/{ios|android}/{lt1s|lt2s|lt4s|lt6s|slow}
// The only boot timing from real phones (the emulators are not representative),
// to decide whether the entry chunk needs splitting. One bump per launch.
export const BOOT_BUCKETS = [[1000, 'lt1s'], [2000, 'lt2s'], [4000, 'lt4s'], [6000, 'lt6s']]

/** @param {number} ms */
export function bootBucket(ms) {
  if (!(ms >= 0)) return null
  for (const [limit, name] of BOOT_BUCKETS) if (ms < limit) return name
  return 'slow'
}

export function bootDailyPath(day, platform, ms) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return null
  if (platform !== 'ios' && platform !== 'android') return null
  const bucket = bootBucket(ms)
  return bucket ? `bootDaily/${day}/${platform}/${bucket}` : null
}

export function recordBootTime(platform, ms) {
  bump(bootDailyPath(dayKey(), platform, ms))
}
