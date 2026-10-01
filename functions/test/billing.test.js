const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { _test: t } = require('../billing')

const PRICES = {
  'pass-monthly': 'pri_m', 'pass-yearly': 'pri_y', supporter: 'pri_s', 'pack-themes-seasonal': 'pri_t', 'pack-emotes-pixel': 'pri_e',
}
const inv = t.invertPrices(PRICES)
const NOW = 1_800_000_000_000

// A tiny in-memory stand-in for the slice of firebase-admin Database used here.
function fakeDb(seed = {}) {
  const data = { ...seed }
  const ref = (path) => ({
    get: async () => ({ val: () => data[path] ?? null }),
    transaction: async (fn) => {
      const next = fn(data[path] ?? null)
      if (next === undefined) return { committed: false }
      data[path] = next
      return { committed: true }
    },
    remove: async () => { delete data[path] },
    update: async (updates) => { for (const [k, v] of Object.entries(updates)) setPath(k, v) },
  })
  const setPath = (k, v) => {
    // A write below an existing object (…/txn_1/refunded) edits that object.
    const parts = k.split('/')
    for (let i = parts.length - 1; i > 0; i--) {
      const parent = data[parts.slice(0, i).join('/')]
      if (parent && typeof parent === 'object') { parent[parts.slice(i).join('/')] = v; return }
    }
    if (v === null) delete data[k]; else data[k] = v
  }
  return { data, ref: (p) => (p ? ref(p) : { update: async (u) => { for (const [k, v] of Object.entries(u)) setPath(k, v) } }) }
}

const sign = (body, secret, ts) => `ts=${ts};h1=${crypto.createHmac('sha256', secret).update(`${ts}:${body}`).digest('hex')}`

describe('verifyPaddleSignature', () => {
  const body = '{"event_id":"evt_1"}'
  const nowSec = 1_800_000_000
  test('accepts a correct, fresh signature', () => {
    assert.equal(t.verifyPaddleSignature(body, sign(body, 's3cret', nowSec), 's3cret', nowSec + 10), true)
  })
  test('rejects a wrong secret, a tampered body and a missing header', () => {
    const header = sign(body, 's3cret', nowSec)
    assert.equal(t.verifyPaddleSignature(body, header, 'other', nowSec), false)
    assert.equal(t.verifyPaddleSignature(body + ' ', header, 's3cret', nowSec), false)
    assert.equal(t.verifyPaddleSignature(body, undefined, 's3cret', nowSec), false)
    assert.equal(t.verifyPaddleSignature(body, 'garbage', 's3cret', nowSec), false)
    assert.equal(t.verifyPaddleSignature(body, header, '', nowSec), false)
  })
  test('rejects a replay outside the five-minute window', () => {
    assert.equal(t.verifyPaddleSignature(body, sign(body, 's3cret', nowSec), 's3cret', nowSec + 301), false)
    assert.equal(t.verifyPaddleSignature(body, sign(body, 's3cret', nowSec), 's3cret', nowSec - 301), false)
  })
  test('accepts when any of several h1 values matches (secret rotation)', () => {
    const good = sign(body, 's3cret', nowSec)
    assert.equal(t.verifyPaddleSignature(body, `${good};h1=${'0'.repeat(64)}`, 's3cret', nowSec), true)
  })
})

describe('monetization switch', () => {
  test('is off unless explicitly 1', () => {
    assert.equal(t.monetizationEnabled(undefined), false)
    assert.equal(t.monetizationEnabled(''), false)
    assert.equal(t.monetizationEnabled('true'), false)
    assert.equal(t.monetizationEnabled('0'), false)
    assert.equal(t.monetizationEnabled('1'), true)
    assert.equal(t.monetizationEnabled(' 1 '), true)
  })
  test('billing entry points refuse while it is off and pass while it is on', () => {
    assert.throws(() => t.assertEnabled(undefined), /monetization-disabled/)
    assert.throws(() => t.assertEnabled('0'), /monetization-disabled/)
    assert.doesNotThrow(() => t.assertEnabled('1'))
  })
})

describe('config parsing', () => {
  test('uses the sandbox unless production is explicit', () => {
    assert.match(t.paddleBase(undefined), /sandbox-api/)
    assert.match(t.paddleBase('staging'), /sandbox-api/)
    assert.equal(t.paddleBase('production'), 'https://api.paddle.com')
  })
  test('parses prices and survives junk', () => {
    assert.deepEqual(t.parsePrices('{"supporter":"pri_s"}'), { supporter: 'pri_s' })
    assert.deepEqual(t.parsePrices('nope'), {})
    assert.deepEqual(t.parsePrices('[1]'), {})
    assert.deepEqual(t.invertPrices({ a: 'p1', b: '' }), { p1: 'a' })
  })
  test('admin emails match case-insensitively and only when verified', () => {
    const allow = t.parseAdminEmails(' Boss@Example.com, other@x.io ')
    assert.equal(t.isAdminEmail('boss@example.COM', true, allow), true)
    assert.equal(t.isAdminEmail('boss@example.com', false, allow), false)
    assert.equal(t.isAdminEmail('nobody@example.com', true, allow), false)
    assert.equal(t.isAdminEmail('boss@example.com', true, t.parseAdminEmails('')), false)
  })
  test('age from birth year', () => {
    const now = new Date('2026-10-01T00:00:00Z')
    assert.equal(t.ageFromBirthYear(2000, now), 26)
    assert.equal(t.ageFromBirthYear(2014, now), 12)
    assert.equal(t.ageFromBirthYear(2027, now), null)
    assert.equal(t.ageFromBirthYear('2000', now), null)
    assert.equal(t.ageFromBirthYear(undefined, now), null)
  })
})

describe('planEvent', () => {
  const sub = (over = {}) => ({
    event_type: 'subscription.activated',
    data: {
      id: 'sub_1', status: 'active', customer_id: 'ctm_1', custom_data: { uid: 'alice' },
      items: [{ price: { id: 'pri_y' } }], current_billing_period: { ends_at: '2027-01-01T00:00:00Z' }, ...over,
    },
  })

  test('subscription -> active yearly pass with the period end', () => {
    const plan = t.planEvent(sub(), inv)
    assert.equal(plan.kind, 'pass')
    assert.equal(plan.uid, 'alice')
    assert.deepEqual(plan.pass, { status: 'active', plan: 'yearly', currentPeriodEnd: Date.parse('2027-01-01T00:00:00Z'), subscriptionId: 'sub_1', customerId: 'ctm_1' })
  })
  test('a trial counts as a pass until the trial ends', () => {
    const plan = t.planEvent(sub({ status: 'trialing', items: [{ price: { id: 'pri_m' } }] }), inv)
    assert.equal(plan.pass.status, 'trialing')
    assert.equal(plan.pass.plan, 'monthly')
  })
  test('a scheduled cancel keeps access to the period end but shows as cancelling', () => {
    const plan = t.planEvent(sub({ scheduled_change: { action: 'cancel', effective_at: '2027-01-01T00:00:00Z' } }), inv)
    assert.equal(plan.pass.status, 'canceled')
    assert.equal(plan.pass.currentPeriodEnd, Date.parse('2027-01-01T00:00:00Z'))
  })
  test('an immediate cancel ends access now', () => {
    const plan = t.planEvent(sub({ status: 'canceled', current_billing_period: null }), inv)
    assert.equal(plan.pass.status, 'expired')
    assert.equal(plan.pass.currentPeriodEnd, 0)
  })
  test('a one-time purchase grants its pack and supporter', () => {
    const plan = t.planEvent({ event_type: 'transaction.completed', data: { id: 'txn_1', custom_data: { uid: 'alice' }, items: [{ price: { id: 'pri_t' } }, { price: { id: 'pri_s' } }] } }, inv)
    assert.deepEqual(plan, { kind: 'grant', uid: 'alice', txnId: 'txn_1', grants: { packs: ['themes-seasonal'], supporter: true } })
  })
  test('a subscription transaction and unknown prices grant nothing', () => {
    assert.equal(t.planEvent({ event_type: 'transaction.completed', data: { id: 't', subscription_id: 'sub_1', custom_data: { uid: 'a' }, items: [{ price: { id: 'pri_y' } }] } }, inv).kind, 'ignore')
    assert.equal(t.planEvent({ event_type: 'transaction.completed', data: { id: 't', custom_data: { uid: 'a' }, items: [{ price: { id: 'pri_zzz' } }] } }, inv).kind, 'ignore')
  })
  test('events without a uid, and unrelated events, are ignored', () => {
    assert.equal(t.planEvent(sub({ custom_data: {} }), inv).reason, 'no-uid')
    assert.equal(t.planEvent({ event_type: 'customer.created', data: {} }, inv).reason, 'event-type')
  })
  test('only an approved full refund revokes', () => {
    const adj = (over) => ({ event_type: 'adjustment.updated', data: { action: 'refund', status: 'approved', type: 'full', transaction_id: 'txn_1', ...over } })
    assert.deepEqual(t.planEvent(adj({}), inv), { kind: 'refund', txnId: 'txn_1' })
    assert.equal(t.planEvent(adj({ type: 'partial' }), inv).kind, 'ignore')
    assert.equal(t.planEvent(adj({ status: 'pending_approval' }), inv).kind, 'ignore')
    assert.equal(t.planEvent(adj({ action: 'credit' }), inv).kind, 'ignore')
  })
})

describe('applyPlan', () => {
  const grant = { kind: 'grant', uid: 'alice', txnId: 'txn_1', grants: { packs: ['themes-seasonal'], supporter: true } }
  const pass = { kind: 'pass', uid: 'alice', pass: { status: 'active', plan: 'monthly', currentPeriodEnd: NOW + 1000, subscriptionId: 'sub_1' } }

  test('writes a pass to entitlements and the public badge', async () => {
    const db = fakeDb()
    const r = await t.applyPlan(db, pass, 'evt_1', { now: NOW })
    assert.equal(r.applied, true)
    assert.equal(db.data['entitlements/alice/pass'].plan, 'monthly')
    assert.equal(db.data['entitlementsPublic/alice/pass'], true)
  })
  test('a replayed event id changes nothing the second time', async () => {
    const db = fakeDb()
    await t.applyPlan(db, grant, 'evt_2', { now: NOW })
    delete db.data['entitlements/alice/packs/themes-seasonal']
    const again = await t.applyPlan(db, grant, 'evt_2', { now: NOW + 5 })
    assert.deepEqual(again, { applied: false, reason: 'duplicate' })
    assert.equal(db.data['entitlements/alice/packs/themes-seasonal'], undefined)
  })
  test('grants packs and supporter and records the purchase for refunds', async () => {
    const db = fakeDb()
    await t.applyPlan(db, grant, 'evt_3', { now: NOW })
    assert.equal(db.data['entitlements/alice/packs/themes-seasonal'], true)
    assert.equal(db.data['entitlements/alice/supporter'], true)
    assert.equal(db.data['entitlementsPublic/alice/supporter'], true)
    assert.deepEqual(db.data['entitlementPurchases/txn_1'], { uid: 'alice', packs: ['themes-seasonal'], supporter: true, at: NOW })
  })
  test('a refund takes the purchase back, once', async () => {
    const db = fakeDb()
    await t.applyPlan(db, grant, 'evt_4', { now: NOW })
    const r = await t.applyPlan(db, { kind: 'refund', txnId: 'txn_1' }, 'evt_5', { now: NOW + 1 })
    assert.equal(r.applied, true)
    assert.equal(db.data['entitlements/alice/packs/themes-seasonal'], undefined)
    assert.equal(db.data['entitlements/alice/supporter'], undefined)
    assert.equal(db.data['entitlementPurchases/txn_1'].uid, 'alice')
    const again = await t.applyPlan(db, { kind: 'refund', txnId: 'txn_1' }, 'evt_6', { now: NOW + 2 })
    assert.equal(again.applied, false)
  })
  test('does not resurrect a deleted account', async () => {
    const db = fakeDb()
    const r = await t.applyPlan(db, pass, 'evt_7', { now: NOW, userExists: async () => false })
    assert.deepEqual(r, { applied: false, reason: 'unknown-user' })
    assert.equal(db.data['entitlements/alice/pass'], undefined)
  })
  test('an expired pass clears the public badge', async () => {
    const db = fakeDb()
    await t.applyPlan(db, { ...pass, pass: { ...pass.pass, status: 'expired', currentPeriodEnd: 0 } }, 'evt_8', { now: NOW })
    assert.equal(db.data['entitlementsPublic/alice/pass'], false)
  })
  test('an ignored plan writes nothing', async () => {
    const db = fakeDb()
    assert.equal((await t.applyPlan(db, { kind: 'ignore', reason: 'x' }, 'evt_9')).applied, false)
    assert.deepEqual(db.data, {})
  })
})

describe('payments not configured (no secrets bound)', () => {
  const billing = require('../billing')
  const google = { uid: 'alice', token: { firebase: { sign_in_provider: 'google.com' } } }
  const withMonetization = async (fn) => {
    const prev = process.env.MONETIZATION_ENABLED
    process.env.MONETIZATION_ENABLED = '1'
    try { return await fn() } finally {
      if (prev === undefined) delete process.env.MONETIZATION_ENABLED; else process.env.MONETIZATION_ENABLED = prev
    }
  }

  test('secret binding is opt-in through PAYMENTS_SECRETS=1', () => {
    assert.equal(t.paymentsSecretsEnabled(undefined), false)
    assert.equal(t.paymentsSecretsEnabled('0'), false)
    assert.equal(t.paymentsSecretsEnabled(' 1 '), true)
    assert.equal(billing.PADDLE_API_KEY, null)
    assert.deepEqual(t.bindSecrets(null, null), {})
    assert.deepEqual(t.bindSecrets(null, 'k'), { secrets: ['k'] })
    assert.equal(t.secretValue(null), '')
  })
  test('the deployed functions declare no secrets', () => {
    for (const name of ['createCheckout', 'createPortalSession', 'paddleWebhook']) {
      const env = billing[name].__endpoint.secretEnvironmentVariables
      assert.ok(!env || env.length === 0, name)
    }
    // The v1 auth trigger needs a project id to build its endpoint.
    const prev = process.env.GCLOUD_PROJECT
    process.env.GCLOUD_PROJECT = 'demo-test'
    try {
      const deletion = require('../deleteAccount').cleanupDeletedAccount.__endpoint.secretEnvironmentVariables
      assert.ok(!deletion || deletion.length === 0)
    } finally {
      if (prev === undefined) delete process.env.GCLOUD_PROJECT; else process.env.GCLOUD_PROJECT = prev
    }
  })
  test('callables answer failed-precondition payments-not-configured', async () => {
    await withMonetization(async () => {
      for (const name of ['createCheckout', 'createPortalSession']) {
        await assert.rejects(billing[name].run({ auth: google, data: { product: 'supporter' } }),
          (e) => e.code === 'failed-precondition' && e.message === 'payments-not-configured', name)
      }
    })
  })
  test('the webhook answers 503 payments-not-configured', async () => {
    const res = { code: 0, body: '', status(c) { this.code = c; return this }, send(b) { this.body = b } }
    await withMonetization(() => billing.paddleWebhook({ method: 'POST', rawBody: Buffer.from('{}'), get: () => '' }, res))
    assert.equal(res.code, 503)
    assert.equal(res.body, 'payments-not-configured')
  })
  test('cancelSubscription skips without an API key instead of calling Paddle', async () => {
    const realFetch = global.fetch
    let called = false
    global.fetch = async () => { called = true; return { ok: true, json: async () => ({}) } }
    try {
      assert.equal(await billing.cancelSubscription('sub_1', ''), false)
      assert.equal(called, false)
    } finally { global.fetch = realFetch }
  })
})

describe('payments secrets bound (PAYMENTS_SECRETS=1)', () => {
  test('binds PADDLE_API_KEY and PADDLE_WEBHOOK_SECRET as before', () => {
    const path = require.resolve('../billing')
    const saved = require.cache[path]
    delete require.cache[path]
    process.env.PAYMENTS_SECRETS = '1'
    try {
      const bound = require('../billing')
      const keys = (fn) => (bound[fn].__endpoint.secretEnvironmentVariables || []).map(s => s.key)
      assert.deepEqual(keys('createCheckout'), ['PADDLE_API_KEY'])
      assert.deepEqual(keys('createPortalSession'), ['PADDLE_API_KEY'])
      assert.deepEqual(keys('paddleWebhook'), ['PADDLE_WEBHOOK_SECRET'])
    } finally {
      delete process.env.PAYMENTS_SECRETS
      require.cache[path] = saved
    }
  })
})
