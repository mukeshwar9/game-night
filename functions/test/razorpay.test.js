const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { _test: t } = require('../razorpay')
const { _test: billing } = require('../billing')
const { PRODUCTS, PREPAID_PASS_DAYS } = require('../lib/core.cjs')

const NOW = 1_800_000_000_000
const DAY = 24 * 60 * 60 * 1000

// The same in-memory stand-in for firebase-admin Database as billing.test.js.
function fakeDb(seed = {}) {
  const data = { ...seed }
  const read = (path) => {
    if (path in data) return data[path]
    // A read of …/pass inside an object stored at a parent path.
    const parts = path.split('/')
    for (let i = parts.length - 1; i > 0; i--) {
      const parent = data[parts.slice(0, i).join('/')]
      if (parent && typeof parent === 'object') return parts.slice(i).reduce((o, k) => (o == null ? o : o[k]), parent) ?? null
    }
    return null
  }
  const setPath = (k, v) => {
    if (v === null) delete data[k]; else data[k] = v
  }
  const ref = (path) => ({
    get: async () => ({ val: () => read(path) ?? null }),
    transaction: async (fn) => {
      const next = fn(data[path] ?? null)
      if (next === undefined) return { committed: false }
      data[path] = next
      return { committed: true }
    },
    remove: async () => { delete data[path] },
  })
  return { data, ref: (p) => (p ? ref(p) : { update: async (u) => { for (const [k, v] of Object.entries(u)) setPath(k, v) } }) }
}

const hex = (secret, s) => crypto.createHmac('sha256', secret).update(s).digest('hex')

describe('razorpayConfig', () => {
  test('lists the missing keys per endpoint, so the endpoints can answer 503', () => {
    assert.deepEqual(t.razorpayConfig('order', {}, {}).missing, ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'])
    assert.equal(t.razorpayConfig('order', {}, {}).ok, false)
    assert.deepEqual(t.razorpayConfig('webhook', { RAZORPAY_KEY_ID: 'rzp_test_x' }, { keySecret: 's' }).missing, ['RAZORPAY_WEBHOOK_SECRET'])
    const cfg = t.razorpayConfig('order', { RAZORPAY_KEY_ID: ' rzp_test_abc ' }, { keySecret: 'sec' })
    assert.equal(cfg.ok, true)
    assert.equal(cfg.mode, 'test')
    assert.equal(cfg.keyId, 'rzp_test_abc')
  })
  test('refuses live keys unless RAZORPAY_ENV=production', () => {
    const env = { RAZORPAY_KEY_ID: 'rzp_live_abc' }
    const secrets = { keySecret: 'sec' }
    assert.equal(t.razorpayConfig('order', env, secrets).ok, false)
    assert.equal(t.razorpayConfig('order', env, secrets).liveBlocked, true)
    assert.equal(t.razorpayConfig('order', { ...env, RAZORPAY_ENV: 'production' }, secrets).ok, true)
  })
  test('with secret binding off (no PAYMENTS_SECRETS) nothing is bound and the endpoints are not configured', () => {
    assert.deepEqual(t.boundSecrets(), { keySecret: '', webhookSecret: '' })
    const cfg = t.razorpayConfig('order', { RAZORPAY_KEY_ID: 'rzp_test_abc', RAZORPAY_KEY_SECRET: 'plain-env-is-ignored' })
    assert.equal(cfg.ok, false)
    assert.deepEqual(cfg.missing, ['RAZORPAY_KEY_SECRET'])
  })
})

describe('signatures', () => {
  test('payment signature is HMAC of "order|payment" with the key secret', () => {
    const signature = hex('ksec', 'order_1|pay_1')
    assert.equal(t.verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature }, 'ksec'), true)
    assert.equal(t.verifyPaymentSignature({ orderId: 'order_2', paymentId: 'pay_1', signature }, 'ksec'), false)
    assert.equal(t.verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature }, 'other'), false)
    assert.equal(t.verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: 'zz' }, 'ksec'), false)
    assert.equal(t.verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature }, ''), false)
    assert.equal(t.verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1' }, 'ksec'), false)
  })
  test('webhook signature is HMAC of the raw body with the webhook secret', () => {
    const body = '{"event":"payment.captured"}'
    assert.equal(t.verifyWebhookSignature(body, hex('wsec', body), 'wsec'), true)
    assert.equal(t.verifyWebhookSignature(body + ' ', hex('wsec', body), 'wsec'), false)
    assert.equal(t.verifyWebhookSignature(body, hex('other', body), 'wsec'), false)
    assert.equal(t.verifyWebhookSignature(body, undefined, 'wsec'), false)
    assert.equal(t.verifyWebhookSignature(body, hex('wsec', body), ''), false)
  })
})

describe('orderRequest', () => {
  test('charges the catalog INR price in paise and tags the buyer', () => {
    const body = t.orderRequest('pack-emotes-pixel', 'uid_1', NOW)
    assert.equal(body.amount, PRODUCTS['pack-emotes-pixel'].paise)
    assert.equal(body.currency, 'INR')
    assert.deepEqual(body.notes, { uid: 'uid_1', product: 'pack-emotes-pixel' })
    assert.ok(body.receipt.length <= 40)
  })
  test('every product has an INR price Razorpay accepts (at least ₹1)', () => {
    for (const id of Object.keys(PRODUCTS)) assert.ok(t.orderRequest(id, 'u', NOW)?.amount >= 100, id)
  })
  test('unknown products get no order', () => {
    assert.equal(t.orderRequest('nope', 'u', NOW), null)
    assert.equal(t.orderRequest(undefined, 'u', NOW), null)
  })
  test('the receipt stays within 40 characters for a long uid', () => {
    assert.ok(t.orderRequest('supporter', 'x'.repeat(128), NOW).receipt.length <= 40)
  })
})

describe('planRazorpayEvent', () => {
  const order = { uid: 'u1', product: 'pack-themes-seasonal', amount: PRODUCTS['pack-themes-seasonal'].paise }
  const payment = { id: 'pay_1', order_id: 'order_1', status: 'captured', currency: 'INR', amount: order.amount }
  const ev = (event, p = payment) => ({ event, payload: { payment: { entity: p } } })

  test('payment.captured and order.paid grant what the order bought, keyed by payment id', () => {
    for (const type of ['payment.captured', 'order.paid']) {
      const { plan, key } = t.planRazorpayEvent(ev(type), order)
      assert.deepEqual(plan, { kind: 'grant', uid: 'u1', txnId: 'pay_1', grants: { packs: ['themes-seasonal'], supporter: false }, provider: 'razorpay' })
      assert.equal(key, 'rzp-paid-pay_1')
    }
  })
  test('the order record, not the payment notes, decides the buyer', () => {
    const { plan } = t.planRazorpayEvent(ev('payment.captured', { ...payment, notes: { uid: 'attacker' } }), order)
    assert.equal(plan.uid, 'u1')
  })
  test('ignores unknown orders, wrong amounts, other currencies and uncaptured payments', () => {
    assert.equal(t.planRazorpayEvent(ev('payment.captured'), null).plan.reason, 'unknown-order')
    assert.equal(t.planRazorpayEvent(ev('payment.captured', { ...payment, amount: 100 }), order).plan.reason, 'amount-mismatch')
    assert.equal(t.planRazorpayEvent(ev('payment.captured', { ...payment, currency: 'USD' }), order).plan.reason, 'amount-mismatch')
    assert.equal(t.planRazorpayEvent(ev('payment.captured', { ...payment, status: 'authorized' }), order).plan.reason, 'not-captured')
    assert.equal(t.planRazorpayEvent(ev('payment.failed'), order).plan.reason, 'event-type')
    assert.equal(t.planRazorpayEvent(ev('payment.captured'), order).key, 'rzp-paid-pay_1')
    assert.equal(t.planRazorpayEvent(ev('payment.captured', { ...payment, id: 'pay/../x' }), order).plan.kind, 'ignore')
  })
  test('a full refund revokes; a partial one does not', () => {
    const full = t.planRazorpayEvent(ev('refund.processed', { ...payment, amount_refunded: payment.amount, refund_status: 'full' }), order)
    assert.deepEqual(full, { plan: { kind: 'refund', txnId: 'pay_1' }, key: 'rzp-refund-pay_1' })
    const partial = t.planRazorpayEvent(ev('refund.processed', { ...payment, amount_refunded: 100, refund_status: 'partial' }), order)
    assert.equal(partial.plan.reason, 'partial-refund')
    assert.equal(partial.key, null)
  })
  test('grantsForProduct maps the Pass to a prepaid period', () => {
    assert.deepEqual(t.grantsForProduct(PRODUCTS['pass-monthly']), { packs: [], supporter: false, pass: { plan: 'monthly', days: PREPAID_PASS_DAYS.month } })
    assert.deepEqual(t.grantsForProduct(PRODUCTS['pass-yearly']).pass, { plan: 'yearly', days: PREPAID_PASS_DAYS.year })
    assert.deepEqual(t.grantsForProduct(PRODUCTS.supporter), { packs: [], supporter: true })
  })
})

describe('applyPlan with Razorpay plans (grant, idempotency, refund)', () => {
  const grantPack = { kind: 'grant', uid: 'u1', txnId: 'pay_1', grants: { packs: ['emotes-pixel'], supporter: false }, provider: 'razorpay' }

  test('grants a pack once per payment, whether the verify call or the webhook comes first', async () => {
    const db = fakeDb()
    const first = await billing.applyPlan(db, grantPack, t.paidKey('pay_1'), { now: NOW })
    assert.equal(first.applied, true)
    assert.equal(db.data['entitlements/u1/packs/emotes-pixel'], true)
    assert.equal(db.data['entitlementPurchases/pay_1'].provider, 'razorpay')
    const second = await billing.applyPlan(db, grantPack, t.paidKey('pay_1'), { now: NOW })
    assert.deepEqual(second, { applied: false, reason: 'duplicate' })
  })

  test('a full refund takes the pack and Supporter back, once', async () => {
    const db = fakeDb()
    await billing.applyPlan(db, { ...grantPack, grants: { packs: ['emotes-pixel'], supporter: true } }, t.paidKey('pay_1'), { now: NOW })
    const refund = { kind: 'refund', txnId: 'pay_1' }
    assert.equal((await billing.applyPlan(db, refund, t.refundKey('pay_1'), { now: NOW })).applied, true)
    assert.equal(db.data['entitlements/u1/packs/emotes-pixel'], undefined)
    assert.equal(db.data['entitlements/u1/supporter'], undefined)
    assert.equal(db.data['entitlementsPublic/u1/supporter'], undefined)
    assert.equal((await billing.applyPlan(db, refund, t.refundKey('pay_1'), { now: NOW })).reason, 'duplicate')
  })

  test('a prepaid Pass starts now, stacks on an earlier one and a refund takes its days back', async () => {
    const db = fakeDb()
    const pass = (txnId, days, plan = 'monthly') => ({ kind: 'grant', uid: 'u1', txnId, grants: { packs: [], supporter: false, pass: { plan, days } }, provider: 'razorpay' })
    await billing.applyPlan(db, pass('pay_1', 30), t.paidKey('pay_1'), { now: NOW })
    assert.deepEqual(db.data['entitlements/u1/pass'], { status: 'canceled', plan: 'monthly', currentPeriodEnd: NOW + 30 * DAY, provider: 'razorpay', paymentId: 'pay_1' })
    assert.equal(db.data['entitlementsPublic/u1/pass'], true)

    await billing.applyPlan(db, pass('pay_2', 365, 'yearly'), t.paidKey('pay_2'), { now: NOW + DAY })
    assert.equal(db.data['entitlements/u1/pass'].currentPeriodEnd, NOW + 395 * DAY)

    await billing.applyPlan(db, { kind: 'refund', txnId: 'pay_2' }, t.refundKey('pay_2'), { now: NOW + 2 * DAY })
    assert.equal(db.data['entitlements/u1/pass'].currentPeriodEnd, NOW + 30 * DAY)
    assert.equal(db.data['entitlementsPublic/u1/pass'], true)

    await billing.applyPlan(db, { kind: 'refund', txnId: 'pay_1' }, t.refundKey('pay_1'), { now: NOW + 2 * DAY })
    assert.equal(db.data['entitlements/u1/pass'].status, 'expired')
    assert.equal(db.data['entitlementsPublic/u1/pass'], false)
  })

  test('never overwrites a live Paddle subscription', async () => {
    const sub = { status: 'active', plan: 'monthly', currentPeriodEnd: NOW + 10 * DAY, subscriptionId: 'sub_1', customerId: 'ctm_1' }
    const db = fakeDb({ 'entitlements/u1/pass': sub })
    const plan = { kind: 'grant', uid: 'u1', txnId: 'pay_9', grants: { packs: [], supporter: false, pass: { plan: 'monthly', days: 30 } }, provider: 'razorpay' }
    await billing.applyPlan(db, plan, t.paidKey('pay_9'), { now: NOW })
    assert.deepEqual(db.data['entitlements/u1/pass'], sub)
    assert.equal(db.data['entitlementPurchases/pay_9'].passConflict, true)
  })

  test('a failure after the claim releases it so the retry applies', async () => {
    const db = fakeDb()
    const broken = { ...db, ref: (p) => (p ? db.ref(p) : { update: async () => { throw new Error('db down') } }) }
    await assert.rejects(billing.applyPlan(broken, grantPack, t.paidKey('pay_1'), { now: NOW }), /db down/)
    assert.equal(db.data['entitlementEvents/rzp-paid-pay_1'], undefined)
    assert.equal((await billing.applyPlan(db, grantPack, t.paidKey('pay_1'), { now: NOW })).applied, true)
  })
})

describe('prepaid pass helpers', () => {
  test('hasLiveSubscription is true only for a running Paddle subscription', () => {
    assert.equal(billing.hasLiveSubscription({ status: 'active', subscriptionId: 's', currentPeriodEnd: NOW + 1 }, NOW), true)
    assert.equal(billing.hasLiveSubscription({ status: 'expired', subscriptionId: 's', currentPeriodEnd: NOW + 1 }, NOW), false)
    assert.equal(billing.hasLiveSubscription({ status: 'canceled', provider: 'razorpay', currentPeriodEnd: NOW + 1 }, NOW), false)
    assert.equal(billing.hasLiveSubscription(null, NOW), false)
  })
  test('an expired prepaid Pass does not carry time over', () => {
    const old = { status: 'expired', provider: 'razorpay', currentPeriodEnd: 0 }
    assert.equal(billing.extendPrepaidPass(old, { plan: 'monthly', days: 30, paymentId: 'p' }, NOW).currentPeriodEnd, NOW + 30 * DAY)
  })
  test('shortenPrepaidPass leaves a Paddle pass alone', () => {
    assert.equal(billing.shortenPrepaidPass({ status: 'active', subscriptionId: 's', currentPeriodEnd: NOW + DAY }, 30, NOW), null)
  })
})

describe('Razorpay secret binding follows PAYMENTS_SECRETS', () => {
  const keys = (mod, fn) => (mod[fn].__endpoint.secretEnvironmentVariables || []).map(s => s.key)

  test('unset: no Razorpay function binds a secret', () => {
    const mod = require('../razorpay')
    for (const fn of ['createRazorpayOrder', 'verifyRazorpayPayment', 'razorpayWebhook']) assert.deepEqual(keys(mod, fn), [], fn)
  })

  test('PAYMENTS_SECRETS=1: binds the key secret and the webhook secret', () => {
    const paths = [require.resolve('../billing'), require.resolve('../razorpay')]
    const saved = paths.map(p => require.cache[p])
    paths.forEach(p => delete require.cache[p])
    process.env.PAYMENTS_SECRETS = '1'
    try {
      const mod = require('../razorpay')
      assert.deepEqual(keys(mod, 'createRazorpayOrder'), ['RAZORPAY_KEY_SECRET'])
      assert.deepEqual(keys(mod, 'verifyRazorpayPayment'), ['RAZORPAY_KEY_SECRET'])
      assert.deepEqual(keys(mod, 'razorpayWebhook'), ['RAZORPAY_WEBHOOK_SECRET'])
    } finally {
      delete process.env.PAYMENTS_SECRETS
      paths.forEach((p, i) => { require.cache[p] = saved[i] })
    }
  })
})
