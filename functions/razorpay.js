// Payments for Indian buyers: the same products as Paddle, priced in rupees
// (PRICES_INR in src/lib/premiumCatalog.js) and paid through Razorpay Checkout
// (UPI, Indian cards, netbanking, wallets). Razorpay is a payment gateway, not a
// merchant of record: for these sales the seller is the operator (docs/MONETIZATION.md).
//
//  createRazorpayOrder    callable  signed-in Google account + age gate -> a Razorpay order for Checkout
//  verifyRazorpayPayment  callable  checks Checkout's signature, confirms the payment is captured, grants
//  razorpayWebhook        HTTPS     verifies X-Razorpay-Signature; payment.captured / order.paid grant,
//                                   a full refund.processed revokes
//
// Entitlements are written by billing.js's applyPlan, so a Razorpay purchase
// unlocks exactly what the same Paddle purchase would. The verify callable and the
// webhook claim the same key (entitlementEvents/rzp-paid-<payment id>), so a
// payment is granted once whichever arrives first. The Pass is sold as a prepaid
// period (PREPAID_PASS_DAYS) that does not renew.
//
// Keys are read from the environment, not bound with defineSecret: a missing
// Razorpay key must not stop the other functions from deploying. Without them the
// three endpoints answer 503 (`razorpay-not-configured`). Live keys (rzp_live_…)
// are refused unless RAZORPAY_ENV=production is set on purpose.
const crypto = require('node:crypto')
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https')
const logger = require('firebase-functions/logger')
const { getDatabase } = require('firebase-admin/database')
const { getAuth } = require('firebase-admin/auth')
const { PRODUCTS, PREPAID_PASS_DAYS } = require('./lib/core.cjs')
const { shared } = require('./billing')

const RAZORPAY_API = 'https://api.razorpay.com/v1'
const ID_RE = /^[A-Za-z0-9_]{1,64}$/

// ---- Pure helpers -----------------------------------------------------------

/**
 * Reads the Razorpay keys. `missing` lists what the given endpoint needs but
 * lacks; `ok` is true when it can run.
 *   need: 'order' (key id + secret), 'verify' (key id + secret), 'webhook' (webhook secret)
 */
function razorpayConfig(need, env = process.env) {
  const keyId = String(env.RAZORPAY_KEY_ID || '').trim()
  const keySecret = String(env.RAZORPAY_KEY_SECRET || '').trim()
  const webhookSecret = String(env.RAZORPAY_WEBHOOK_SECRET || '').trim()
  const missing = []
  if (need === 'webhook') {
    if (!webhookSecret) missing.push('RAZORPAY_WEBHOOK_SECRET')
  } else {
    if (!keyId) missing.push('RAZORPAY_KEY_ID')
    if (!keySecret) missing.push('RAZORPAY_KEY_SECRET')
  }
  const live = keyId.startsWith('rzp_live_')
  const liveBlocked = live && env.RAZORPAY_ENV !== 'production'
  return { ok: !missing.length && !liveBlocked, missing, liveBlocked, mode: live ? 'live' : 'test', keyId, keySecret, webhookSecret }
}

function hmacHex(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex')
}

function safeEqualHex(given, expectedHex) {
  if (typeof given !== 'string' || !/^[0-9a-f]+$/i.test(given)) return false
  const a = Buffer.from(given, 'hex')
  const b = Buffer.from(expectedHex, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/** Checkout's handler signature: hex HMAC-SHA256 of "<order id>|<payment id>" with the key secret. */
function verifyPaymentSignature({ orderId, paymentId, signature }, keySecret) {
  if (!keySecret || typeof orderId !== 'string' || typeof paymentId !== 'string' || !orderId || !paymentId) return false
  return safeEqualHex(signature, hmacHex(keySecret, `${orderId}|${paymentId}`))
}

/** X-Razorpay-Signature: hex HMAC-SHA256 of the raw request body with the webhook secret. */
function verifyWebhookSignature(rawBody, header, secret) {
  if (!secret || !rawBody) return false
  return safeEqualHex(header, hmacHex(secret, rawBody))
}

/** The Orders API body for a product, or null for an unknown one. Amount is in paise. */
function orderRequest(productId, uid, now = Date.now()) {
  const product = PRODUCTS[productId]
  if (!product || !Number.isInteger(product.paise) || product.paise < 100) return null
  return {
    amount: product.paise,
    currency: 'INR',
    // At most 40 characters; it shows in the Razorpay dashboard.
    receipt: `gn_${now.toString(36)}_${uid.slice(0, 20)}`,
    notes: { uid, product: product.id },
  }
}

/** What a product unlocks, in applyPlan's grant shape. */
function grantsForProduct(product) {
  const grants = { packs: [], supporter: false }
  if (product?.type === 'pack') grants.packs.push(product.packId)
  else if (product?.type === 'supporter') grants.supporter = true
  else if (product?.type === 'pass') {
    grants.pass = { plan: product.interval === 'year' ? 'yearly' : 'monthly', days: PREPAID_PASS_DAYS[product.interval] }
  }
  return grants
}

/** The claim key that makes a grant happen once per payment. */
const paidKey = (paymentId) => `rzp-paid-${paymentId}`
const refundKey = (paymentId) => `rzp-refund-${paymentId}`

/**
 * A captured payment against one of our orders -> an applyPlan grant. `order` is
 * the razorpayOrders/{id} record written when the order was created; it, not the
 * payment's notes, says who bought what, and the amounts must agree.
 */
function planCapture(payment, order) {
  if (!payment || !ID_RE.test(String(payment.id || ''))) return { kind: 'ignore', reason: 'no-payment' }
  if (!order) return { kind: 'ignore', reason: 'unknown-order' }
  if (payment.status !== 'captured') return { kind: 'ignore', reason: 'not-captured' }
  if (payment.currency !== 'INR' || payment.amount !== order.amount) return { kind: 'ignore', reason: 'amount-mismatch' }
  const product = PRODUCTS[order.product]
  if (!product || typeof order.uid !== 'string' || !order.uid) return { kind: 'ignore', reason: 'unknown-product' }
  return { kind: 'grant', uid: order.uid, txnId: payment.id, grants: grantsForProduct(product), provider: 'razorpay' }
}

/**
 * One verified webhook event -> { plan, key }. Only a full refund revokes; a
 * partial one (a goodwill credit) leaves the purchase in place.
 */
function planRazorpayEvent(event, order) {
  const type = event?.event
  const payment = event?.payload?.payment?.entity
  if (type === 'payment.captured' || type === 'order.paid') {
    const plan = planCapture(payment, order)
    return { plan, key: plan.kind === 'grant' ? paidKey(payment.id) : null }
  }
  if (type === 'refund.processed') {
    if (!payment || !ID_RE.test(String(payment.id || ''))) return { plan: { kind: 'ignore', reason: 'no-payment' }, key: null }
    const full = payment.refund_status === 'full' || (Number(payment.amount_refunded) >= Number(payment.amount) && payment.amount > 0)
    if (!full) return { plan: { kind: 'ignore', reason: 'partial-refund' }, key: null }
    return { plan: { kind: 'refund', txnId: payment.id }, key: refundKey(payment.id) }
  }
  return { plan: { kind: 'ignore', reason: 'event-type' }, key: null }
}

// ---- Razorpay API -----------------------------------------------------------

async function razorpayFetch(path, cfg, { method = 'GET', body } = {}) {
  const res = await fetch(`${RAZORPAY_API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    logger.error('razorpay api error', { path, status: res.status, error: json?.error?.code })
    throw new HttpsError('internal', 'The payment provider rejected the request.')
  }
  return json
}

// ---- Functions --------------------------------------------------------------

function requireConfig(need) {
  const cfg = razorpayConfig(need)
  if (!cfg.ok) {
    logger.warn('razorpay not configured', { need, missing: cfg.missing, liveBlocked: cfg.liveBlocked })
    // 'unavailable' is HTTP 503 for a callable.
    throw new HttpsError('unavailable', 'razorpay-not-configured')
  }
  return cfg
}

exports.createRazorpayOrder = onCall({ maxInstances: 5 }, async (request) => {
  const uid = shared.requireGoogleUser(request)
  const cfg = requireConfig('order')
  const now = Date.now()
  const body = orderRequest(request.data?.product, uid, now)
  if (!body) throw new HttpsError('invalid-argument', 'Unknown product.')

  const db = getDatabase()
  const age = shared.ageFromBirthYear((await db.ref(`ageGate/${uid}/year`).get()).val())
  if (age === null) throw new HttpsError('failed-precondition', 'age-required')
  if (age < shared.MIN_AGE) throw new HttpsError('permission-denied', 'under-age')
  if (PRODUCTS[body.notes.product].type === 'pass') {
    const pass = (await db.ref(`entitlements/${uid}/pass`).get()).val()
    if (shared.hasLiveSubscription(pass, now)) throw new HttpsError('failed-precondition', 'has-subscription')
  }

  const order = await razorpayFetch('/orders', cfg, { method: 'POST', body })
  if (!ID_RE.test(String(order?.id || ''))) throw new HttpsError('internal', 'No order was returned.')
  await db.ref(`razorpayOrders/${order.id}`).set({ uid, product: body.notes.product, amount: body.amount, currency: 'INR', at: now })
  return { orderId: order.id, keyId: cfg.keyId, amount: body.amount, currency: 'INR', product: body.notes.product }
})

exports.verifyRazorpayPayment = onCall({ maxInstances: 5 }, async (request) => {
  const uid = shared.requireGoogleUser(request)
  const cfg = requireConfig('verify')
  const { orderId, paymentId, signature } = request.data || {}
  if (!ID_RE.test(String(orderId || '')) || !ID_RE.test(String(paymentId || ''))) throw new HttpsError('invalid-argument', 'Bad payment reference.')
  if (!verifyPaymentSignature({ orderId, paymentId, signature }, cfg.keySecret)) throw new HttpsError('permission-denied', 'bad-signature')

  const db = getDatabase()
  const order = (await db.ref(`razorpayOrders/${orderId}`).get()).val()
  if (!order || order.uid !== uid) throw new HttpsError('permission-denied', 'not-your-order')
  // The signature proves the payment was authorised; only a captured one is granted.
  const payment = await razorpayFetch(`/payments/${paymentId}`, cfg)
  if (payment?.order_id !== orderId) throw new HttpsError('permission-denied', 'not-your-order')
  if (payment.status === 'authorized') return { status: 'pending' }
  const plan = planCapture(payment, order)
  if (plan.kind !== 'grant') throw new HttpsError('failed-precondition', plan.reason)
  const result = await shared.applyPlan(db, plan, paidKey(paymentId))
  logger.info('razorpay verify', { uid, paymentId, ...result })
  return { status: 'granted' }
})

exports.razorpayWebhook = onRequest({ maxInstances: 5 }, async (req, res) => {
  if (!shared.monetizationEnabled()) { res.status(503).send('monetization-disabled'); return }
  const cfg = razorpayConfig('webhook')
  if (!cfg.ok) { res.status(503).send('razorpay-not-configured'); return }
  if (req.method !== 'POST') { res.status(405).send('POST only'); return }
  const raw = req.rawBody ? req.rawBody.toString('utf8') : ''
  if (!verifyWebhookSignature(raw, req.get('X-Razorpay-Signature'), cfg.webhookSecret)) {
    logger.warn('razorpay webhook: bad signature')
    res.status(400).send('bad signature')
    return
  }
  let event
  try { event = JSON.parse(raw) } catch { res.status(400).send('bad json'); return }
  const db = getDatabase()
  const orderId = event?.payload?.payment?.entity?.order_id
  try {
    const order = ID_RE.test(String(orderId || '')) ? (await db.ref(`razorpayOrders/${orderId}`).get()).val() : null
    const planned = planRazorpayEvent(event, order)
    const result = planned.key
      ? await shared.applyPlan(db, planned.plan, planned.key, {
        userExists: async (uid) => getAuth().getUser(uid).then(() => true, () => false),
      })
      : { applied: false, reason: planned.plan.reason }
    logger.info('razorpay webhook', { type: event.event, kind: planned.plan.kind, ...result })
    res.status(200).send('ok')
  } catch (e) {
    // 5xx makes Razorpay retry; applyPlan has released its claim so the retry applies.
    logger.error('razorpay webhook failed', { type: event?.event, message: e?.message })
    res.status(500).send('retry')
  }
})

exports._test = {
  razorpayConfig, verifyPaymentSignature, verifyWebhookSignature, orderRequest, grantsForProduct,
  planCapture, planRazorpayEvent, paidKey, refundKey,
}
