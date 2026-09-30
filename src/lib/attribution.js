// First-touch attribution for ad traffic, kept in-house: nothing here calls a
// third party, sets a cookie, or leaves the device except as the anonymous
// funnelDaily counters and the once-written users/{uid}/attribution row
// (analytics.js). Pure parsing lives in parseTouch so it is unit-tested;
// captureFirstTouch/firstTouch are the thin localStorage wrappers.

const KEY = 'gn-first-touch'
const CLICK_IDS = ['gclid', 'fbclid', 'ttclid', 'msclkid']
const CLICK_SOURCES = { gclid: 'google', fbclid: 'meta', ttclid: 'tiktok', msclkid: 'bing' }

const slug = (value, max = 40) => String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, max)

// A visit's first-touch record from its URL and referrer. Every string is
// lowercased and reduced to [a-z0-9_-] so it is safe as an RTDB key segment
// (the funnelDaily rules accept exactly ^[a-z0-9_-]{1,40}$).
export function parseTouch(href, referrer = '', now = Date.now()) {
  let url
  try { url = new URL(href) } catch { return null }
  const param = name => slug(url.searchParams.get(name))
  const click = CLICK_IDS.find(name => url.searchParams.has(name)) || ''
  let refHost = ''
  try {
    const host = referrer ? new URL(referrer).hostname : ''
    // Our own pages are not a referral.
    refHost = host && host !== url.hostname ? host.slice(0, 60) : ''
  } catch { /* unparseable referrer */ }
  const source = param('utm_source') || (click && CLICK_SOURCES[click]) || (refHost ? 'referral' : 'direct')
  return {
    source,
    medium: param('utm_medium'),
    campaign: param('utm_campaign'),
    content: param('utm_content'),
    click,
    refHost,
    landing: url.pathname.slice(0, 60),
    at: now,
  }
}

// Remembers the first touch on this device and returns it (later visits and
// later campaigns never overwrite it). Null when storage is unavailable.
export function captureFirstTouch(loc = globalThis.location, referrer = globalThis.document?.referrer) {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored) return JSON.parse(stored)
    const touch = parseTouch(loc.href, referrer)
    if (!touch) return null
    localStorage.setItem(KEY, JSON.stringify(touch))
    return touch
  } catch { return null }
}

export function firstTouch() {
  try {
    const touch = JSON.parse(localStorage.getItem(KEY) || 'null')
    return touch && typeof touch.source === 'string' ? touch : null
  } catch { return null }
}

// The record stored once on users/{uid} (empty strings dropped: RTDB would
// delete them anyway and the rules only require source and at).
export function attributionRecord(touch) {
  if (!touch) return null
  return Object.fromEntries(Object.entries({ ...touch }).filter(([, v]) => v !== ''))
}
