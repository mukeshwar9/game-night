// Where the legal pages and the support address live. The pages themselves are
// static files (public/privacy.html, public/terms.html) so ad reviewers and
// crawlers can read them without running the app.
export const PRIVACY_URL = '/privacy.html'
export const TERMS_URL = '/terms.html'
// Placeholder until the captain picks the support address. The same string is
// in public/privacy.html, public/terms.html and public/.well-known/security.txt.
export const CONTACT_EMAIL = 'CONTACT_EMAIL_TBD'
export const CONTACT_URL = `mailto:${CONTACT_EMAIL}`
