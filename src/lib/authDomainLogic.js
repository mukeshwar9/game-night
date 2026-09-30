// Which host Firebase Auth should run its redirect/popup handler on.
//
// Firebase Hosting serves `/__/auth/*` on every hosting domain, so when the app
// itself is served from `<project>.web.app`, pointing `authDomain` at that same
// host keeps the OAuth round trip first-party. With the default
// `<project>.firebaseapp.com` authDomain, browsers that partition third-party
// storage (iOS Safari, and so installed iOS PWAs) lose the redirect result and
// Google sign-in "succeeds" without signing anyone in.
//
// Off by default: it needs `https://<host>/__/auth/handler` added as an
// authorised redirect URI on the project's OAuth web client first, otherwise
// Google answers `redirect_uri_mismatch`. Turn it on with VITE_AUTH_SAME_ORIGIN=1.
const HOSTING_HOST = /\.(web\.app|firebaseapp\.com)$/i

export function resolveAuthDomain(configured, host, enabled) {
  if (!enabled || typeof host !== 'string') return configured
  return HOSTING_HOST.test(host) ? host : configured
}
