// The Content-Security-Policy Firebase Hosting sends (firebase.json is the one
// source), plus helpers for checking it against a build and for serving it in
// the e2e run.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

export const CSP_HEADER = 'Content-Security-Policy'

// Every header entry of the catch-all `**` rule.
function catchAllHeaders(firebaseJson) {
  return firebaseJson.hosting.headers.find(rule => rule.source === '**')?.headers ?? []
}

// { header, value } for the CSP in firebase.json (either the enforcing or the
// Report-Only name), or null when there is none.
export function readHostingCsp(file = 'firebase.json') {
  const found = catchAllHeaders(JSON.parse(readFileSync(file, 'utf8')))
    .find(h => h.key === CSP_HEADER || h.key === `${CSP_HEADER}-Report-Only`)
  return found ? { header: found.key, value: found.value } : null
}

// 'sha256-…' source for one inline script body.
export const scriptHash = (body) => `'sha256-${createHash('sha256').update(body).digest('base64')}'`

// The inline (no src) <script> bodies of a built index.html.
export function inlineScripts(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1])
}

// The e2e app talks to the local emulators on 127.0.0.1, which the production
// policy (rightly) does not allow: add them for that run only.
export function withEmulatorOrigins(csp) {
  return csp.replace(/connect-src /, "connect-src http://127.0.0.1:* ws://127.0.0.1:* ")
}
