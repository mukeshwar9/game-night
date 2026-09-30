#!/usr/bin/env node
// Fails when the Content-Security-Policy Hosting sends would block the built
// app: it must be the enforcing header, and every inline <script> in
// dist/index.html must have its hash in script-src (the theme bootstrap is
// inline; changing it changes the hash).
//
//   npm run build && node scripts/check-csp.mjs [distDir]
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { CSP_HEADER, inlineScripts, readHostingCsp, scriptHash } from './csp.mjs'

const dist = resolve(process.argv[2] ?? 'dist')
const csp = readHostingCsp()
const problems = []
if (!csp) problems.push('firebase.json sends no Content-Security-Policy')
else {
  if (csp.header !== CSP_HEADER) problems.push(`the policy is sent as ${csp.header}: it is not enforced`)
  const scriptSrc = /(?:^|;)\s*script-src ([^;]*)/.exec(csp.value)?.[1] ?? ''
  const html = readFileSync(join(dist, 'index.html'), 'utf8')
  for (const body of inlineScripts(html)) {
    const hash = scriptHash(body)
    if (!scriptSrc.includes(hash)) problems.push(`inline script ${hash} is not in script-src (update firebase.json)`)
  }
  for (const needed of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'"]) {
    if (!csp.value.includes(needed)) problems.push(`policy lacks ${needed}`)
  }
  if (/script-src[^;]*'unsafe-(inline|eval)'/.test(csp.value)) problems.push("script-src must not allow 'unsafe-inline' or 'unsafe-eval'")
}
if (problems.length) {
  console.error(`CSP check failed:\n - ${problems.join('\n - ')}`)
  process.exit(1)
}
console.log(`CSP OK: ${CSP_HEADER} covers every inline script in ${join(dist, 'index.html')}`)
