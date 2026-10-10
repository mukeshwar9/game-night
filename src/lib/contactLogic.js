// The support address is one setting, VITE_CONTACT_EMAIL. The app reads it
// through legal.js; the static pages (public/privacy.html, terms.html and
// .well-known/security.txt) hold tokens that the build (and the dev server)
// fill in with renderContactTokens, so changing the address is a one-line
// swap in the environment. Empty means "not chosen yet".

export const CONTACT_PENDING_TEXT = 'Support email coming soon'
// Where security.txt points until there is an address: the site itself.
export const SECURITY_FALLBACK_URL = 'https://game-night-91464.web.app/'

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// A plausible address, nothing that could break out of an attribute.
export function cleanContactEmail(value) {
  const email = String(value || '').trim()
  return /^[^\s@<>"'&]+@[^\s@<>"'&]+\.[^\s@<>"'&]+$/.test(email) ? email : ''
}

// %CONTACT% -> a mailto link (or the pending text); %CONTACT_URL% -> mailto:
// address (or the site URL).
export function renderContactTokens(text, email) {
  const clean = cleanContactEmail(email)
  const link = clean ? `<a href="mailto:${escapeHtml(clean)}">${escapeHtml(clean)}</a>` : CONTACT_PENDING_TEXT
  return String(text)
    .replaceAll('%CONTACT_URL%', clean ? `mailto:${clean}` : SECURITY_FALLBACK_URL)
    .replaceAll('%CONTACT%', link)
}
