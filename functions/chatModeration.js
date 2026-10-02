// Room chat upkeep and moderation, and player-report triage.
//
// moderateChatMessage — on every new games/{gameId}/chatLog/{msgId}:
//   1. Always: prunes the room's log back to CHAT_LOG_CAP. Clients prune too,
//      but a modified client could skip it; this keeps the log bounded.
//   2. Only when a TypeSafe API key is configured: asks Jev (TypeSafe's System
//      One model) for a typed judgment of the line in context — category,
//      severity and whether it is aimed at a player — and applies the policy in
//      src/lib/chatModerationLogic.js. A confident serious call sets `hidden`
//      on the line (clients stop showing it) and counts a strike in
//      moderation/{uid}; an uncertain one is queued in feedback/ for an admin.
//
// triageReport — on every new player report in feedback/: when the key is
//   configured, asks Jev for category, severity and whether the conversation
//   supports the report, and stores the result on the report as `triage` so
//   the admin inbox can sort by it.
//
// With no key both Jev steps are skipped, so nothing changes until the key
// exists. The key is a Secret Manager secret bound only when
// TYPESAFE_SECRETS=1 (like PAYMENTS_SECRETS in billing.js), or a plain
// TYPESAFE_API_KEY in functions/.env for the emulator.
const { onValueWritten } = require('firebase-functions/v2/database')
const { defineSecret } = require('firebase-functions/params')
const logger = require('firebase-functions/logger')
const { getDatabase } = require('firebase-admin/database')
const core = require('./lib/core.cjs')

function typesafeSecretsEnabled(raw = process.env.TYPESAFE_SECRETS) {
  return String(raw || '').trim() === '1'
}

const TYPESAFE_API_KEY = typesafeSecretsEnabled() ? defineSecret('TYPESAFE_API_KEY') : null
const bindOptions = TYPESAFE_API_KEY ? { secrets: [TYPESAFE_API_KEY] } : {}

/** The configured key, or '' when moderation is off. */
function jevKey(env = process.env, secret = TYPESAFE_API_KEY) {
  const bound = secret ? secret.value() || '' : ''
  return String(bound || env.TYPESAFE_API_KEY || '').trim()
}

const JEV_TIMEOUT_MS = 5000
const AUTO_MOD_BY = 'auto-moderation'

/** POSTs one System One request and returns its `answers`. Throws on any failure. */
async function callJev(body, key, fetchImpl = fetch, timeoutMs = JEV_TIMEOUT_MS) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(core.JEV_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`jev ${res.status}`)
    const json = await res.json()
    if (!json || typeof json.answers !== 'object') throw new Error('jev: no answers')
    return json.answers
  } finally {
    clearTimeout(timer)
  }
}

function isSeated(room, uid) {
  const players = room?.players || {}
  if (players[uid]) return true
  return ['X', 'O'].some(s => players[s]?.playerId === uid)
}

/**
 * One new chat line. `deps` are injectable for tests.
 * Returns what happened: { pruned, action }.
 */
async function moderateMessage({ gameId, msgId, msg }, deps = {}) {
  const database = deps.database || getDatabase()
  const key = deps.key ?? jevKey()
  const fetchImpl = deps.fetchImpl || fetch
  const now = deps.now ?? Date.now()

  const roomSnap = await database.ref(`games/${gameId}`).get()
  const room = roomSnap.val()
  if (!room) return { pruned: 0, action: 'none' }
  const entries = core.normalizeChatLog(room.chatLog)
  const prune = core.chatKeysToPrune(entries, core.CHAT_LOG_CAP).filter(k => k !== msgId)
  if (prune.length) {
    const updates = {}
    for (const k of prune) updates[`games/${gameId}/chatLog/${k}`] = null
    await database.ref().update(updates)
  }
  if (!key) return { pruned: prune.length, action: 'off' }

  const at = entries.findIndex(([k]) => k === msgId)
  const recent = (at >= 0 ? entries.slice(Math.max(0, at - 6), at) : []).map(([, m]) => m)
  const request = core.buildModerationRequest({
    message: msg,
    recent,
    room: { gameType: room.gameType, public: room.visibility === 'public', spectator: !isSeated(room, msg.by) },
  })
  const answers = await callJev(request, key, fetchImpl)
  const decision = core.moderationDecision(answers)
  if (decision.action === 'none') return { pruned: prune.length, action: 'none' }

  const updates = {}
  if (decision.action === 'hide') {
    updates[`games/${gameId}/chatLog/${msgId}/hidden`] = true
    updates[`games/${gameId}/chatLog/${msgId}/modReason`] = String(decision.category).slice(0, 40)
  }
  // Admin queue: hidden lines are logged for review too, so a wrong call can
  // be spotted; uncertain ones wait there with the line still visible.
  const reportId = database.ref('feedback').push().key
  const name = String(msg.name || 'PLAYER').slice(0, 40)
  const text = String(msg.text || '').slice(0, 200)
  const contextLines = [...recent, msg].map(m => `${String(m.name || 'PLAYER').slice(0, 20)}: ${String(m.text || '')}`).join('\n').slice(-1000)
  updates[`feedback/${reportId}`] = {
    type: 'report',
    message: `Auto-moderation (${decision.action === 'hide' ? 'hidden' : 'needs review'}): ${decision.category} — ${name}: "${text}"`.slice(0, 1000),
    page: `/game/${gameId}`.slice(0, 300),
    gameId: String(gameId).slice(0, 40),
    targetUid: String(msg.by || '').slice(0, 128),
    targetName: name,
    text,
    chatContext: contextLines,
    by: AUTO_MOD_BY,
    name: 'AUTO-MOD',
    status: 'open',
    createdAt: now,
    updatedAt: now,
    triage: core.triageSummary(answers, now),
  }
  await database.ref().update(updates)
  if (decision.action === 'hide' && msg.by) {
    await database.ref(`moderation/${msg.by}`).transaction(cur => {
      const strikes = (cur?.strikes || 0) + 1
      return { strikes, lastAt: now, lastCategory: decision.category }
    })
  }
  return { pruned: prune.length, action: decision.action }
}

/** One new player report. Returns the stored triage, or null when skipped. */
async function triage({ reportId, report }, deps = {}) {
  const database = deps.database || getDatabase()
  const key = deps.key ?? jevKey()
  const fetchImpl = deps.fetchImpl || fetch
  const now = deps.now ?? Date.now()
  if (!key || report?.type !== 'report' || report.by === AUTO_MOD_BY || report.triage) return null
  const answers = await callJev(core.buildTriageRequest(report), key, fetchImpl)
  const summary = core.triageSummary(answers, now)
  await database.ref(`feedback/${reportId}/triage`).set(summary)
  return summary
}

exports.moderateChatMessage = onValueWritten({ ref: 'games/{gameId}/chatLog/{msgId}', maxInstances: 10, ...bindOptions }, async (event) => {
  const after = event.data?.after?.val()
  // Create only: prunes, edits and deletes carry no new line.
  if (!after || event.data?.before?.exists() || typeof after.text !== 'string') return null
  try {
    await moderateMessage({ gameId: event.params.gameId, msgId: event.params.msgId, msg: after })
  } catch (e) {
    logger.warn('chat moderation failed', { gameId: event.params.gameId, error: e?.message || e })
  }
  return null
})

exports.triageReport = onValueWritten({ ref: 'feedback/{reportId}', maxInstances: 5, ...bindOptions }, async (event) => {
  const after = event.data?.after?.val()
  if (!after || event.data?.before?.exists()) return null
  try {
    await triage({ reportId: event.params.reportId, report: after })
  } catch (e) {
    logger.warn('report triage failed', { reportId: event.params.reportId, error: e?.message || e })
  }
  return null
})

// Exported for unit tests without an emulator.
exports._test = { jevKey, typesafeSecretsEnabled, callJev, moderateMessage, triage, AUTO_MOD_BY }
