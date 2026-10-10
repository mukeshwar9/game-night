// @ts-check
// Which links the native shell opens inside the app, and where they land.
// Pure: no DOM, no Capacitor, no router (src/lib/native/deepLinks.js wires it).
//
// Two kinds of link arrive through @capacitor/app's `appUrlOpen`:
//   - https links on the public web origin (Universal Links on iOS, App Links
//     on Android): https://<host>/game/abc123?x=1
//   - the custom-scheme fallback, for environments where verified links are
//     not set up yet or were turned off by the user: gamenight://game/abc123
// Everything else is refused, so a hostile link can only ever open an in-app
// route, never load another origin into the web view.

/** The custom URL scheme registered in Info.plist (CFBundleURLSchemes) and AndroidManifest.xml. */
export const CUSTOM_SCHEME = 'gamenight'

// Static pages Hosting serves outside the SPA (public/privacy.html, terms.html,
// support.html, the Firebase auth handler under /__/). They 404 inside the app router, so
// they open in the browser instead. Keep in step with the excludes in
// public/.well-known/apple-app-site-association (a test checks it).
const STATIC_PREFIXES = ['/privacy', '/terms', '/support', '/__/', '/.well-known/']

/**
 * The in-app path (pathname + search + hash) for an opened URL, or null when
 * the link is not ours or should open in the browser.
 *
 * @param {unknown} url
 * @param {readonly string[]} [allowedOrigins] https origins that count as
 *   "this app's website" (PUBLIC_ORIGIN, the firebaseapp.com twin, a custom domain)
 * @returns {string | null}
 */
export function pathFromAppUrl(url, allowedOrigins = []) {
  if (typeof url !== 'string') return null
  const raw = url.trim()
  // Control characters and backslashes are how `/\evil.com` style tricks slip
  // past prefix checks; no real link needs them.
  if (!raw || raw.length > 2048 || hasUnsafeChar(raw)) return null

  /** @type {string | null} */
  let path = null
  if (/^https:\/\//i.test(raw)) path = pathFromWebUrl(raw, allowedOrigins)
  else if (new RegExp(`^${CUSTOM_SCHEME}://`, 'i').test(raw)) path = pathFromSchemeUrl(raw)
  if (path === null) return null
  return isOpenableInApp(path) ? path : null
}

/** @param {string} raw */
function hasUnsafeChar(raw) {
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i)
    if (c <= 0x1f || c === 0x7f || c === 0x5c) return true
  }
  return false
}

/**
 * @param {string} raw
 * @param {readonly string[]} allowedOrigins
 */
function pathFromWebUrl(raw, allowedOrigins) {
  let u
  try { u = new URL(raw) } catch { return null }
  // userinfo (https://good.com@evil.com) is never a legitimate app link.
  if (u.username || u.password) return null
  const allowed = new Set(allowedOrigins.map(originOf).filter(Boolean))
  if (!allowed.has(u.origin)) return null
  return `${u.pathname}${u.search}${u.hash}`
}

/** @param {string} raw */
function pathFromSchemeUrl(raw) {
  // gamenight://game/abc?x=1#y -> /game/abc?x=1#y ; gamenight:/// and
  // gamenight:// -> /. Parsed by hand: non-special schemes are treated as
  // host + path by URL, which would split `game` off as a hostname.
  const rest = raw.slice(CUSTOM_SCHEME.length + 3)
  const path = rest.startsWith('/') ? rest : `/${rest}`
  // Re-parse against a dummy origin to normalize dot segments and encoding
  // the same way a router would, and to be sure it stays on that origin.
  try {
    const u = new URL(path, 'https://app.invalid')
    if (u.origin !== 'https://app.invalid') return null
    return `${u.pathname}${u.search}${u.hash}`
  } catch {
    return null
  }
}

/** @param {string} origin */
function originOf(origin) {
  try {
    const u = new URL(origin)
    return u.protocol === 'https:' ? u.origin : ''
  } catch {
    return ''
  }
}

/** @param {string} path */
function isOpenableInApp(path) {
  if (!path.startsWith('/') || path.startsWith('//')) return false
  const pathname = path.split(/[?#]/)[0].toLowerCase()
  if (pathname.includes('//')) return false
  for (const prefix of STATIC_PREFIXES) {
    // '/privacy' matches /privacy, /privacy.html and /privacy/x, not /privacypolicy-game.
    if (prefix.endsWith('/') ? pathname.startsWith(prefix) : (pathname === prefix || pathname.startsWith(`${prefix}.`) || pathname.startsWith(`${prefix}/`))) return false
  }
  // A file (robots.txt, sitemap.xml, sw.js): Hosting serves it, the router has
  // no route for it. The SPA rewrite only covers dot-free paths, too.
  const last = pathname.split('/').pop() || ''
  if (last.includes('.')) return false
  return true
}

/**
 * The same link can arrive twice on a cold start (the launch URL and the
 * retained appUrlOpen event). Skip a repeat of the path just handled.
 * @param {{ path: string, at: number } | null} last
 * @param {string} path
 * @param {number} now
 * @param {number} [windowMs]
 */
export function isDuplicateOpen(last, path, now, windowMs = 2000) {
  return !!last && last.path === path && now - last.at >= 0 && now - last.at < windowMs
}

/**
 * The https origins that count as this app's website: the public origin, the
 * Firebase Hosting twins of the project (<project>.web.app and the auth
 * domain, usually <project>.firebaseapp.com), and any extra origins (a custom
 * domain, before or after it becomes the public one). Deduplicated, https only.
 *
 * @param {{ publicOrigin?: string, authDomain?: string, projectId?: string, extra?: string }} [sources]
 *   `extra` is a comma- or space-separated list of origins (VITE_LINK_ORIGINS)
 * @returns {string[]}
 */
export function linkOrigins({ publicOrigin = '', authDomain = '', projectId = '', extra = '' } = {}) {
  const candidates = [
    publicOrigin,
    authDomain && `https://${authDomain}`,
    projectId && `https://${projectId}.web.app`,
    projectId && `https://${projectId}.firebaseapp.com`,
    ...String(extra || '').split(/[\s,]+/),
  ]
  /** @type {string[]} */
  const out = []
  for (const c of candidates) {
    const o = typeof c === 'string' && c ? originOf(c) : ''
    if (o && !out.includes(o)) out.push(o)
  }
  return out
}
