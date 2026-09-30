// User-agent sniffing for embedded "in-app" browsers (Instagram, TikTok,
// Facebook, ...). Most social-ad clicks open inside one of these. They run the
// app fine, but Google refuses OAuth in embedded webviews
// (`disallowed_useragent`), and they cannot install a PWA or receive web push,
// so those entry points show a hint to open the page in the real browser.

const IN_APP = [
  ['Instagram', /Instagram/i],
  ['Facebook', /FBAN|FBAV|FB_IAB|FBIOS/i],
  ['TikTok', /TikTok|musical_ly|Bytedance|BytedanceWebview/i],
  ['Snapchat', /Snapchat/i],
  ['Twitter', /Twitter/i],
  ['LINE', /\bLine\//i],
  ['Pinterest', /Pinterest/i],
  ['LinkedIn', /LinkedInApp/i],
]

function currentUa() {
  try { return globalThis.navigator?.userAgent || '' } catch { return '' }
}

// Name of the embedding app, or null in a regular browser.
export function inAppBrowserName(ua = currentUa()) {
  const s = String(ua || '')
  for (const [name, re] of IN_APP) if (re.test(s)) return name
  return null
}

export function isInAppBrowser(ua = currentUa()) {
  return inAppBrowserName(ua) !== null
}

export function isAndroidUa(ua = currentUa()) {
  return /Android/i.test(String(ua || ''))
}

export function isIosUa(ua = currentUa()) {
  return /iPhone|iPad|iPod/i.test(String(ua || ''))
}

// Android Chrome deep link that opens `href` outside the webview. Other
// platforms have no reliable equivalent (iOS blocks it), so they get null and
// the hint falls back to copying the link.
export function openInBrowserUrl(href, ua = currentUa()) {
  if (!isAndroidUa(ua)) return null
  let url
  try { url = new URL(href) } catch { return null }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const scheme = url.protocol.slice(0, -1)
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${scheme};package=com.android.chrome;end`
}
