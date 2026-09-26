#!/usr/bin/env node
// CI size budget for the entry bundle: reads the built dist/index.html, finds
// the entry <script type="module" src> (plus any <link rel="modulepreload">
// chunks the browser fetches up front), gzips each one and fails when the
// total exceeds BUDGET_GZIP_BYTES. Lazy chunks are not counted — splitting
// code out of the entry is exactly what the budget is meant to reward.
//
//   npm run build && node scripts/check-bundle-size.mjs [distDir]
//
// Tighten BUDGET_GZIP_BYTES as code-splitting lands; never loosen it to make a
// PR pass without saying why in the PR.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const BUDGET_GZIP_BYTES = 320 * 1024

const dist = resolve(process.argv[2] ?? 'dist')
const html = readFileSync(join(dist, 'index.html'), 'utf8')

const entryScripts = [...html.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/g)].map(m => m[1])
const preloads = [...html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"/g)].map(m => m[1])
const files = [...new Set([...entryScripts, ...preloads])]
if (!entryScripts.length) {
  console.error(`No <script type="module" src> found in ${join(dist, 'index.html')} — did the build run?`)
  process.exit(1)
}

const kb = bytes => `${(bytes / 1024).toFixed(1)} KB`
let totalGzip = 0
console.log('Entry JS (loaded before first render):')
for (const src of files) {
  const path = join(dist, src.replace(/^\//, ''))
  const raw = readFileSync(path)
  const gz = gzipSync(raw, { level: 9 }).length
  totalGzip += gz
  console.log(`  ${src}  ${kb(raw.length)} raw, ${kb(gz)} gzip${preloads.includes(src) && !entryScripts.includes(src) ? ' (modulepreload)' : ''}`)
}

// Context only (not budgeted): how much JS the build emits in total.
const assetsDir = join(dist, 'assets')
const allJs = readdirSync(assetsDir).filter(f => f.endsWith('.js'))
const allJsBytes = allJs.reduce((sum, f) => sum + statSync(join(assetsDir, f)).size, 0)
console.log(`All JS chunks: ${allJs.length} files, ${kb(allJsBytes)} raw`)

console.log(`Entry total: ${kb(totalGzip)} gzip / budget ${kb(BUDGET_GZIP_BYTES)}`)
if (totalGzip > BUDGET_GZIP_BYTES) {
  console.error(`✖ Entry bundle is ${kb(totalGzip - BUDGET_GZIP_BYTES)} over budget. Code-split (lazy routes/pages) or raise the budget deliberately.`)
  process.exit(1)
}
console.log('✔ Within budget')
