import { cleanContactEmail } from './contactLogic'

// Where the legal pages and the support address live. The pages themselves are
// static files (public/privacy.html, public/terms.html) so ad reviewers and
// crawlers can read them without running the app.
export const PRIVACY_URL = '/privacy.html'
export const TERMS_URL = '/terms.html'
// Set VITE_CONTACT_EMAIL to publish a support address; empty means the pages say
// "Support email coming soon". The static pages get it at build time
// (contactLogic.js), the app reads it here.
export const CONTACT_EMAIL = cleanContactEmail(import.meta.env.VITE_CONTACT_EMAIL)
export const CONTACT_URL = CONTACT_EMAIL ? `mailto:${CONTACT_EMAIL}` : null
