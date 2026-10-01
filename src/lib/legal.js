import { cleanContactEmail } from './contactLogic'
import { isNative, PUBLIC_ORIGIN } from './platform'

// Where the legal pages and the support address live. The pages themselves are
// static files (public/privacy.html, public/terms.html) so ad reviewers and
// crawlers can read them without running the app.
export const SUPPORT_PATH = '/support.html'
export const PRIVACY_PATH = '/privacy.html'
export const TERMS_PATH = '/terms.html'

// Inside the iOS shell the page is capacitor://localhost, and Capacitor hands
// target="_blank" links to the system, which cannot open that scheme: the tap
// does nothing. So the shell links to the public https copy (it opens in the
// system browser); the web keeps the relative path.
export function legalHref(path, { native = isNative, origin = PUBLIC_ORIGIN } = {}) {
  return native ? `${origin}${path}` : path
}

export const PRIVACY_URL = legalHref(PRIVACY_PATH)
export const TERMS_URL = legalHref(TERMS_PATH)
export const SUPPORT_URL = legalHref(SUPPORT_PATH)
// Set VITE_CONTACT_EMAIL to publish a support address; empty means the pages say
// "Support email coming soon". The static pages get it at build time
// (contactLogic.js), the app reads it here.
export const CONTACT_EMAIL = cleanContactEmail(import.meta.env.VITE_CONTACT_EMAIL)
export const CONTACT_URL = CONTACT_EMAIL ? `mailto:${CONTACT_EMAIL}` : null
