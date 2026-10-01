// Payments: Game Night Pass, cosmetic packs and Supporter, sold through Paddle
// (a merchant of record) everywhere except India; Indian buyers pay in rupees
// through Razorpay (razorpay.js), which reuses applyPlan below. SANDBOX ONLY until PADDLE_ENV=production is set on
// purpose; every key here is a placeholder the captain fills in (README.md).
//
//  createCheckout       callable   signed-in Google account + age gate -> a Paddle checkout URL
//  createPortalSession  callable   a link to Paddle's customer portal (cancel, card, receipts)
//  paddleWebhook        HTTPS      verifies the Paddle-Signature, then writes entitlements
//  syncAdminAccess      callable   admin email allowlist -> entitlements/{uid}/admin + a custom claim
//
// The client can never write entitlements/{uid} (database.rules.json); only the
// code below can. The pure parts (signature check, event planning, the
// idempotent apply) take their collaborators as arguments and are unit-tested in
// test/billing.test.js.
const crypto = require('node:crypto')
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const logger = require('firebase-functions/logger')
const { getDatabase } = require('firebase-admin/database')
const { getAuth } = require('firebase-admin/auth')
const { PRODUCTS } = require('./lib/core.cjs')

// Secret binding is opt-in: PAYMENTS_SECRETS=1 in functions/.env (read at deploy
// time too) declares the Paddle secrets, which needs Secret Manager on the project.
// Unset, nothing is bound, so the functions deploy on a project without Secret
// Manager and answer "payments-not-configured" until the keys exist.
function paymentsSecretsEnabled(raw = process.env.PAYMENTS_SECRETS) {
  return String(raw || '').trim() === '1'
}

const SECRETS_ON = paymentsSecretsEnabled()
const PADDLE_API_KEY = SECRETS_ON ? defineSecret('PADDLE_API_KEY') : null
const PADDLE_WEBHOOK_SECRET = SECRETS_ON ? defineSecret('PADDLE_WEBHOOK_SECRET') : null

/** `{ secrets: [...] }` for the bound ones, or {} when secret binding is off. */
function bindSecrets(...params) {
  const bound = params.filter(Boolean)
  return bound.length ? { secrets: bound } : {}
}

/** A bound secret's value, or '' when it is not bound or not set. */
function secretValue(param) {
  return param ? param.value() || '' : ''
}

function requireConfigured(value) {
  if (!value) throw new HttpsError('failed-precondition', 'payments-not-configured')
  return value
}

// Launch switch, mirroring VITE_MONETIZATION_ENABLED in the client: MONETIZATION_ENABLED=1
// turns billing on. Off (the default) every billing entry point refuses, so a stray
// request or webhook cannot create entitlements before Paddle is live.
function monetizationEnabled(raw = process.env.MONETIZATION_ENABLED) {
  return String(raw || '').trim() === '1'
}

function assertEnabled(raw) {
  if (!monetizationEnabled(raw)) throw new HttpsError('failed-precondition', 'monetization-disabled')
}

const SIGNATURE_TOLERANCE_SEC = 300
const MIN_AGE = 13

// ---- Pure helpers -----------------------------------------------------------

/** 'production' only when set explicitly; anything else is the sandbox. */
function paddleBase(env = process.env.PADDLE_ENV) {
  return env === 'production' ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com'
}

/** PADDLE_PRICES is JSON { productId: paddlePriceId }. Returns {} on a bad value. */
function parsePrices(raw = process.env.PADDLE_PRICES) {
  try {
    const parsed = JSON.parse(raw || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/** { paddlePriceId: productId } */
function invertPrices(map) {
  const out = {}
  for (const [product, price] of Object.entries(map)) if (typeof price === 'string' && price) out[price] = product
  return out
}

/** Lower-cased set of allowed admin emails from "a@x.com, B@y.com". */
function parseAdminEmails(raw = process.env.ADMIN_EMAILS) {
  return new Set(String(raw || '').split(/[,\s]+/).map(e => e.trim().toLowerCase()).filter(Boolean))
}

function isAdminEmail(email, verified, allow) {
  return verified === true && typeof email === 'string' && allow.has(email.toLowerCase())
}

/**
 * Paddle-Signature is `ts=<unix>;h1=<hex hmac-sha256 of "<ts>:<raw body>">`.
 * Accepts any h1 (Paddle sends two while a secret is rotating) and rejects a
 * timestamp outside the tolerance, so a captured request cannot be replayed later.
 */
function verifyPaddleSignature(rawBody, header, secret, nowSec = Math.floor(Date.now() / 1000)) {
  if (!secret || typeof header !== 'string' || !rawBody) return false
  let ts = null
  const hashes = []
  for (const part of header.split(';')) {
    const [k, v] = part.split('=')
    if (k === 'ts') ts = v
    else if (k === 'h1' && v) hashes.push(v)
  }
  if (!ts || !hashes.length || !/^\d+$/.test(ts)) return false
  if (Math.abs(nowSec - Number(ts)) > SIGNATURE_TOLERANCE_SEC) return false
  const expected = crypto.createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest()
  return hashes.some(h => {
    const given = Buffer.from(h, 'hex')
    return given.length === expected.length && crypto.timingSafeEqual(given, expected)
  })
}

/** Age in whole years from a birth year (the app asks only for the year). */
function ageFromBirthYear(year, now = new Date()) {
  if (!Number.isInteger(year) || year < 1900 || year > now.getUTCFullYear()) return null
  return now.getUTCFullYear() - year
}

/** Maps a Paddle subscription to the stored pass record. */
function passFromSubscription(sub, priceToProduct) {
  const item = (sub.items || [])[0]
  const product = item?.price?.id ? priceToProduct[item.price.id] : null
  const plan = PRODUCTS[product]?.interval === 'year' ? 'yearly' : 'monthly'
  const endsAt = sub.current_billing_period?.ends_at
  const periodEnd = endsAt ? Date.parse(endsAt) : 0
  let status = sub.status
  if (status === 'canceled') return { status: 'expired', plan, currentPeriodEnd: 0, subscriptionId: sub.id, customerId: sub.customer_id || null }
  if ((status === 'active' || status === 'trialing') && sub.scheduled_change?.action === 'cancel') status = 'canceled'
  return { status, plan, currentPeriodEnd: Number.isFinite(periodEnd) ? periodEnd : 0, subscriptionId: sub.id, customerId: sub.customer_id || null }
}

/** What a completed one-time transaction unlocks. Subscription items are skipped. */
function grantsFromTransaction(txn, priceToProduct) {
  const grants = { packs: [], supporter: false }
  for (const item of txn.items || []) {
    const product = PRODUCTS[priceToProduct[item.price?.id]]
    if (product?.type === 'pack') grants.packs.push(product.packId)
    else if (product?.type === 'supporter') grants.supporter = true
  }
  return grants
}

const DAY_MS = 24 * 60 * 60 * 1000

/** True while a Paddle subscription (anything with a subscription id) still runs. */
function hasLiveSubscription(pass, now = Date.now()) {
  return !!pass && pass.provider !== 'razorpay' && !!pass.subscriptionId
    && pass.status !== 'expired' && pass.status !== 'paused' && Number(pass.currentPeriodEnd) > now
}

/**
 * A prepaid Pass record after buying `days` more: time left on an earlier
 * prepaid Pass carries over. status 'canceled' means "does not renew", which the
 * UI shows as "Ends <date>". Returns null when a Paddle subscription is live, so
 * a prepaid purchase never overwrites (and orphans) a subscription that bills.
 */
function extendPrepaidPass(current, { plan, days, paymentId }, now = Date.now()) {
  if (hasLiveSubscription(current, now)) return null
  const carried = current?.provider === 'razorpay' && current.status !== 'expired' ? Number(current.currentPeriodEnd) || 0 : 0
  const from = Math.max(now, carried)
  return { status: 'canceled', plan, currentPeriodEnd: from + days * DAY_MS, provider: 'razorpay', paymentId }
}

/** A prepaid Pass record after refunding `days` of it; null when there is no prepaid Pass to shorten. */
function shortenPrepaidPass(current, days, now = Date.now()) {
  if (!current || current.provider !== 'razorpay' || current.status === 'expired') return null
  const end = (Number(current.currentPeriodEnd) || 0) - days * DAY_MS
  if (end <= now) return { ...current, status: 'expired', currentPeriodEnd: 0 }
  return { ...current, currentPeriodEnd: end }
}

/**
 * Turns one verified Paddle event into a plan the DB layer applies:
 *   { kind:'pass', uid, pass } | { kind:'grant', uid, txnId, grants } |
 *   { kind:'refund', txnId } | { kind:'ignore', reason }
 */
function planEvent(event, priceToProduct) {
  const type = event?.event_type
  const data = event?.data || {}
  const uid = data.custom_data?.uid
  if (type && type.startsWith('subscription.')) {
    if (typeof uid !== 'string' || !uid) return { kind: 'ignore', reason: 'no-uid' }
    return { kind: 'pass', uid, pass: passFromSubscription(data, priceToProduct) }
  }
  if (type === 'transaction.completed') {
    if (typeof uid !== 'string' || !uid) return { kind: 'ignore', reason: 'no-uid' }
    if (data.subscription_id) return { kind: 'ignore', reason: 'subscription-transaction' }
    const grants = grantsFromTransaction(data, priceToProduct)
    if (!grants.packs.length && !grants.supporter) return { kind: 'ignore', reason: 'nothing-to-grant' }
    return { kind: 'grant', uid, txnId: data.id, grants }
  }
  if (type === 'adjustment.updated' || type === 'adjustment.created') {
    if (data.action === 'refund' && data.status === 'approved' && data.type === 'full' && data.transaction_id) {
      return { kind: 'refund', txnId: data.transaction_id }
    }
    return { kind: 'ignore', reason: 'adjustment' }
  }
  return { kind: 'ignore', reason: 'event-type' }
}

/**
 * Applies a plan once. `db` is a firebase-admin Database; `userExists(uid)` stops a
 * late webhook from re-creating the record of a deleted account. Replaying the same
 * event id is a no-op (transaction on entitlementEvents/{eventId}).
 */
async function applyPlan(db, plan, eventId, { userExists = async () => true, now = Date.now() } = {}) {
  if (plan.kind === 'ignore') return { applied: false, reason: plan.reason }
  const claim = await db.ref(`entitlementEvents/${eventId}`).transaction(cur => (cur ? undefined : now))
  if (!claim.committed) return { applied: false, reason: 'duplicate' }
  try {
    return await applyClaimed(db, plan, { userExists, now })
  } catch (e) {
    // Release only a claim this call made, so the provider's retry applies it.
    await db.ref(`entitlementEvents/${eventId}`).remove().catch(() => {})
    throw e
  }
}

async function applyClaimed(db, plan, { userExists, now }) {
  if (plan.kind === 'refund') {
    const snap = await db.ref(`entitlementPurchases/${plan.txnId}`).get()
    const purchase = snap.val()
    if (!purchase || purchase.refunded) return { applied: false, reason: 'unknown-purchase' }
    const updates = { [`entitlementPurchases/${plan.txnId}/refunded`]: true, [`entitlements/${purchase.uid}/updatedAt`]: now }
    for (const packId of purchase.packs || []) updates[`entitlements/${purchase.uid}/packs/${packId}`] = null
    if (purchase.supporter) {
      updates[`entitlements/${purchase.uid}/supporter`] = null
      updates[`entitlementsPublic/${purchase.uid}/supporter`] = null
    }
    if (purchase.passDays) {
      const current = (await db.ref(`entitlements/${purchase.uid}/pass`).get()).val()
      const pass = shortenPrepaidPass(current, purchase.passDays, now)
      if (pass) {
        updates[`entitlements/${purchase.uid}/pass`] = pass
        updates[`entitlementsPublic/${purchase.uid}/pass`] = pass.status !== 'expired' && pass.currentPeriodEnd > now
      }
    }
    await db.ref().update(updates)
    return { applied: true, uid: purchase.uid }
  }

  if (!(await userExists(plan.uid))) return { applied: false, reason: 'unknown-user' }
  const { uid } = plan
  const updates = { [`entitlements/${uid}/updatedAt`]: now }
  if (plan.kind === 'pass') {
    updates[`entitlements/${uid}/pass`] = plan.pass
    updates[`entitlementsPublic/${uid}/pass`] = plan.pass.status !== 'expired' && plan.pass.status !== 'paused' && plan.pass.currentPeriodEnd > now
  } else {
    for (const packId of plan.grants.packs) updates[`entitlements/${uid}/packs/${packId}`] = true
    if (plan.grants.supporter) {
      updates[`entitlements/${uid}/supporter`] = true
      updates[`entitlementsPublic/${uid}/supporter`] = true
    }
    const purchase = { uid, packs: plan.grants.packs, supporter: plan.grants.supporter, at: now }
    if (plan.provider) purchase.provider = plan.provider
    if (plan.grants.pass) {
      // A prepaid Pass (Razorpay) adds its days; refund takes the same days back.
      const current = (await db.ref(`entitlements/${uid}/pass`).get()).val()
      const pass = extendPrepaidPass(current, { ...plan.grants.pass, paymentId: plan.txnId }, now)
      if (pass) {
        updates[`entitlements/${uid}/pass`] = pass
        updates[`entitlementsPublic/${uid}/pass`] = true
        purchase.passDays = plan.grants.pass.days
        purchase.plan = plan.grants.pass.plan
      } else {
        logger.warn('prepaid pass not applied: a subscription is live', { uid, txnId: plan.txnId })
        purchase.passConflict = true
      }
    }
    updates[`entitlementPurchases/${plan.txnId}`] = purchase
  }
  await db.ref().update(updates)
  return { applied: true, uid }
}

// ---- Paddle API -------------------------------------------------------------

async function paddleFetch(path, apiKey, body) {
  const res = await fetch(`${paddleBase()}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    logger.error('paddle api error', { path, status: res.status, error: json?.error })
    throw new HttpsError('internal', 'The payment provider rejected the request.')
  }
  return json.data
}

/** Cancels a subscription immediately (account deletion). Errors are logged, not thrown. */
async function cancelSubscription(subscriptionId, apiKey) {
  if (!apiKey) {
    logger.warn('payments not configured; subscription not cancelled', { subscriptionId })
    return false
  }
  try {
    await paddleFetch(`/subscriptions/${subscriptionId}/cancel`, apiKey, { effective_from: 'immediately' })
    return true
  } catch (e) {
    logger.error('could not cancel subscription', { subscriptionId, message: e?.message })
    return false
  }
}

// ---- Functions --------------------------------------------------------------

function requireGoogleUser(request) {
  assertEnabled()
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
  if (request.auth.token.firebase?.sign_in_provider === 'anonymous') {
    throw new HttpsError('failed-precondition', 'sign-in-required')
  }
  return request.auth.uid
}

exports.createCheckout = onCall({ ...bindSecrets(PADDLE_API_KEY), maxInstances: 5 }, async (request) => {
  const uid = requireGoogleUser(request)
  const apiKey = requireConfigured(secretValue(PADDLE_API_KEY))
  const product = PRODUCTS[request.data?.product]
  if (!product) throw new HttpsError('invalid-argument', 'Unknown product.')
  const priceId = parsePrices()[product.id]
  if (!priceId) throw new HttpsError('failed-precondition', 'This item is not on sale yet.')
  if (product.type === 'pass') {
    // A subscription would replace the record of a prepaid (Razorpay) Pass and lose its days.
    const pass = (await getDatabase().ref(`entitlements/${uid}/pass`).get()).val()
    if (pass?.provider === 'razorpay' && pass.status !== 'expired' && Number(pass.currentPeriodEnd) > Date.now()) {
      throw new HttpsError('failed-precondition', 'has-prepaid-pass')
    }
  }

  const birth = (await getDatabase().ref(`ageGate/${uid}/year`).get()).val()
  const age = ageFromBirthYear(birth)
  if (age === null) throw new HttpsError('failed-precondition', 'age-required')
  if (age < MIN_AGE) throw new HttpsError('permission-denied', 'under-age')

  const txn = await paddleFetch('/transactions', apiKey, {
    items: [{ price_id: priceId, quantity: 1 }],
    custom_data: { uid, product: product.id },
    collection_mode: 'automatic',
  })
  const url = txn?.checkout?.url
  if (!url) throw new HttpsError('internal', 'No checkout link was returned.')
  return { url }
})

exports.createPortalSession = onCall({ ...bindSecrets(PADDLE_API_KEY), maxInstances: 5 }, async (request) => {
  const uid = requireGoogleUser(request)
  const apiKey = requireConfigured(secretValue(PADDLE_API_KEY))
  const pass = (await getDatabase().ref(`entitlements/${uid}/pass`).get()).val()
  if (!pass?.customerId) throw new HttpsError('failed-precondition', 'no-subscription')
  const body = pass.subscriptionId ? { subscription_ids: [pass.subscriptionId] } : {}
  const portal = await paddleFetch(`/customers/${pass.customerId}/portal-sessions`, apiKey, body)
  const url = portal?.urls?.general?.overview
  if (!url) throw new HttpsError('internal', 'No portal link was returned.')
  return { url }
})

exports.paddleWebhook = onRequest({ ...bindSecrets(PADDLE_WEBHOOK_SECRET), maxInstances: 5 }, async (req, res) => {
  if (!monetizationEnabled()) { res.status(503).send('monetization-disabled'); return }
  const webhookSecret = secretValue(PADDLE_WEBHOOK_SECRET)
  if (!webhookSecret) { res.status(503).send('payments-not-configured'); return }
  if (req.method !== 'POST') { res.status(405).send('POST only'); return }
  const raw = req.rawBody ? req.rawBody.toString('utf8') : ''
  if (!verifyPaddleSignature(raw, req.get('Paddle-Signature'), webhookSecret)) {
    logger.warn('paddle webhook: bad signature')
    res.status(400).send('bad signature')
    return
  }
  let event
  try { event = JSON.parse(raw) } catch { res.status(400).send('bad json'); return }
  if (typeof event.event_id !== 'string' || !event.event_id) { res.status(400).send('no event id'); return }
  const plan = planEvent(event, invertPrices(parsePrices()))
  try {
    const result = await applyPlan(getDatabase(), plan, event.event_id, {
      userExists: async (uid) => getAuth().getUser(uid).then(() => true, () => false),
    })
    logger.info('paddle webhook', { type: event.event_type, kind: plan.kind, ...result })
    res.status(200).send('ok')
  } catch (e) {
    // 5xx makes Paddle retry; applyPlan has released its event claim so the retry applies.
    logger.error('paddle webhook failed', { type: event.event_type, message: e?.message })
    res.status(500).send('retry')
  }
})

exports.syncAdminAccess = onCall({ maxInstances: 5 }, async (request) => {
  assertEnabled()
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
  const { uid, token } = request.auth
  const db = getDatabase()
  const allowed = isAdminEmail(token.email, token.email_verified, parseAdminEmails())
    || (await db.ref(`users/${uid}/admin`).get()).val() === true
  const has = (await db.ref(`entitlements/${uid}/admin`).get()).val() === true
  if (allowed !== has) {
    await db.ref().update({ [`entitlements/${uid}/admin`]: allowed ? true : null, [`entitlements/${uid}/updatedAt`]: Date.now() })
    const user = await getAuth().getUser(uid)
    const claims = { ...(user.customClaims || {}) }
    if (allowed) claims.premiumAdmin = true
    else delete claims.premiumAdmin
    await getAuth().setCustomUserClaims(uid, claims)
  }
  return { admin: allowed }
})

exports.PADDLE_API_KEY = PADDLE_API_KEY
exports.bindSecrets = bindSecrets
exports.secretValue = secretValue
exports.cancelSubscription = cancelSubscription
// Shared with razorpay.js, the second processor (Indian buyers).
exports.shared = { monetizationEnabled, requireGoogleUser, ageFromBirthYear, applyPlan, hasLiveSubscription, MIN_AGE }
exports._test = {
  monetizationEnabled, assertEnabled, paymentsSecretsEnabled, bindSecrets, secretValue, requireConfigured, paddleBase, parsePrices, invertPrices, parseAdminEmails, isAdminEmail, verifyPaddleSignature,
  ageFromBirthYear, passFromSubscription, grantsFromTransaction, planEvent, applyPlan,
  hasLiveSubscription, extendPrepaidPass, shortenPrepaidPass,
}
