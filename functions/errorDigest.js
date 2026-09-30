// Daily error digest. The app reports uncaught errors to errors/{UTC day}/...
// (src/lib/telemetry.js); nothing tells anyone when they pile up. Once a day
// this reads yesterday's bucket, writes a summary to errorDigests/{day}
// (admin-readable, server-written) and raises an alert when it looks bad:
//  - logger.error with `alert: true`, which a Cloud Logging log-based alert
//    can email (see the runbook in docs/LAUNCH.md), and
//  - a POST to ERROR_DIGEST_WEBHOOK_URL when that is set in functions/.env
//    (a Slack or Discord incoming webhook: the body carries both `text` and
//    `content`). No email is sent from here; nothing is configured by default.
// An alert means: at least ALERT_TOTAL reports in the day, or a message that
// was not in the previous day's digest and was reported at least NEW_MIN times.
const { onSchedule } = require('firebase-functions/v2/scheduler')
const logger = require('firebase-functions/logger')
const { getDatabase } = require('firebase-admin/database')

const DAY_MS = 24 * 60 * 60 * 1000
const TOP = 10
const ALERT_TOTAL = Number(process.env.ERROR_DIGEST_ALERT_TOTAL) || 50
const NEW_MIN = 3

const utcDay = (ts) => new Date(ts).toISOString().slice(0, 10)

// Rolls one day's reports ({ [id]: report }) into the digest. `knownMessages`
// are the messages of the previous digest, to flag new ones. Pure.
function buildDigest(day, reports, knownMessages = [], now = Date.now()) {
  const rows = Object.values(reports || {}).filter(r => r && typeof r === 'object' && typeof r.msg === 'string')
  const group = (keyOf) => {
    const map = new Map()
    for (const r of rows) {
      const key = keyOf(r)
      const cur = map.get(key) || { key, count: 0, sample: r, builds: new Set() }
      cur.count += 1
      if (typeof r.build === 'string') cur.builds.add(r.build)
      map.set(key, cur)
    }
    return [...map.values()].sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : 1))
  }
  const known = new Set(knownMessages)
  const byMessage = group(r => r.msg).map(({ key, count, sample, builds }) => ({
    msg: key.slice(0, 300),
    count,
    route: String(sample.route || '').slice(0, 100),
    gameType: String(sample.gameType || '').slice(0, 40),
    builds: [...builds].sort().slice(0, 5),
    isNew: !known.has(key),
  }))
  const digest = {
    day,
    generatedAt: now,
    total: rows.length,
    users: new Set(rows.map(r => r.uid).filter(Boolean)).size,
    byGame: group(r => r.gameType || 'none').slice(0, TOP).map(({ key, count }) => ({ gameType: key, count })),
    byBuild: group(r => r.build || 'unknown').slice(0, TOP).map(({ key, count }) => ({ build: key, count })),
    top: byMessage.slice(0, TOP),
    // Every message of the day, so tomorrow's digest can tell what is new.
    messages: byMessage.slice(0, 50).map(m => m.msg),
  }
  digest.newMessages = byMessage.filter(m => m.isNew && m.count >= NEW_MIN).length
  digest.alert = digest.total >= ALERT_TOTAL || digest.newMessages > 0
  return digest
}

// The plain-text summary sent to the webhook and logged.
function formatDigest(d) {
  const lines = [`Game Night errors ${d.day}: ${d.total} reports from ${d.users} accounts${d.alert ? ' (ALERT)' : ''}`]
  for (const m of d.top.slice(0, 5)) {
    lines.push(`${m.count}x${m.isNew ? ' NEW' : ''} ${m.msg.slice(0, 120)} [${m.route}${m.gameType ? ` ${m.gameType}` : ''} build ${m.builds.join(',')}]`)
  }
  return lines.join('\n')
}

async function postWebhook(url, text) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, content: text }),
  })
  if (!res.ok) throw new Error(`webhook answered ${res.status}`)
}

async function runDigest(db, now = Date.now(), webhookUrl = process.env.ERROR_DIGEST_WEBHOOK_URL) {
  const day = utcDay(now - DAY_MS)
  const [reports, previous] = await Promise.all([
    db.ref(`errors/${day}`).get(),
    db.ref(`errorDigests/${utcDay(now - 2 * DAY_MS)}/messages`).get(),
  ])
  const digest = buildDigest(day, reports.val(), previous.val() || [], now)
  await db.ref(`errorDigests/${day}`).set(digest)
  const text = formatDigest(digest)
  if (digest.alert) {
    logger.error('error digest alert', { alert: true, day, total: digest.total, newMessages: digest.newMessages, summary: text })
    if (webhookUrl) {
      try { await postWebhook(webhookUrl, text) } catch (err) { logger.warn('digest webhook failed', { message: String(err.message || err) }) }
    }
  } else {
    logger.info('error digest', { day, total: digest.total })
  }
  return digest
}

// Old digests are tiny; keep 60 days. Day keys sort as dates.
async function pruneDigests(db, now = Date.now()) {
  const cutoff = utcDay(now - 60 * DAY_MS)
  const old = await db.ref('errorDigests').orderByKey().endAt(cutoff).limitToFirst(100).get()
  const updates = {}
  old.forEach(child => { if (child.key < cutoff) updates[child.key] = null })
  if (Object.keys(updates).length) await db.ref('errorDigests').update(updates)
}

exports.errorDigest = onSchedule(
  { schedule: 'every day 07:00', timeZone: 'Etc/UTC', timeoutSeconds: 120, memory: '256MiB', maxInstances: 1 },
  async () => {
    const db = getDatabase()
    await runDigest(db)
    await pruneDigests(db)
  },
)

exports._test = { buildDigest, formatDigest, runDigest, utcDay, ALERT_TOTAL, NEW_MIN }
