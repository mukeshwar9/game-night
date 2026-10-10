// @ts-check
// Pure rules for finishing a Paddle checkout on our own site. createCheckout
// (functions/billing.js) makes a Paddle Billing transaction whose checkout link is
// the account's default payment link plus `?_ptxn=<transaction id>`. That page has
// to load Paddle.js and open the checkout for that transaction (paddleCheckout.js
// does the loading; docs/MONETIZATION.md has the setup).

const TXN_RE = /^txn_[a-z0-9]{10,64}$/

/** The transaction id from a `?_ptxn=` query string, or null when absent or malformed. */
export function transactionFromSearch(search) {
  if (typeof search !== 'string' || !search) return null
  let id
  try { id = new URLSearchParams(search).get('_ptxn') } catch { return null }
  return id && TXN_RE.test(id) ? id : null
}

/** The query string with `_ptxn` removed ('' when nothing is left), so a reload does not reopen the checkout. */
export function searchWithoutTransaction(search) {
  const params = new URLSearchParams(search || '')
  params.delete('_ptxn')
  const rest = params.toString()
  return rest ? `?${rest}` : ''
}

/**
 * Which Paddle environment Paddle.js runs in, and whether it can run at all.
 * The sandbox is the default; production only when VITE_PADDLE_ENV=production.
 * A client-side token belongs to one environment (test_… sandbox, live_…
 * production), so a mismatch is refused rather than failing inside Paddle.
 * @param {{ token?: string | null, env?: string | null }} config
 * @returns {{ ok: true, environment: 'sandbox' | 'production', token: string } | { ok: false, reason: 'no-token' | 'token-env-mismatch' }}
 */
export function paddleSetup({ token = null, env = null } = {}) {
  const t = String(token || '').trim()
  if (!t) return { ok: false, reason: 'no-token' }
  const environment = env === 'production' ? 'production' : 'sandbox'
  if (environment === 'sandbox' && t.startsWith('live_')) return { ok: false, reason: 'token-env-mismatch' }
  if (environment === 'production' && t.startsWith('test_')) return { ok: false, reason: 'token-env-mismatch' }
  return { ok: true, environment, token: t }
}

/** Where to send the buyer after the checkout: the Pass page for a Pass, else the shop. */
export function returnPathFor(product) {
  return typeof product === 'string' && product.startsWith('pass-') ? '/pass' : '/shop'
}
