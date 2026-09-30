// Pure helpers for the private source maps. `vite build` writes hidden maps
// (no sourceMappingURL in the bundles), the build moves them out of dist/ so
// Hosting never serves them, and scripts/symbolicate.mjs turns a minified
// stack from the error telemetry back into source positions with them.
//
// Reports carry the build id telemetry.js derives from the entry chunk's file
// name (/assets/index-AbC12_-9.js -> 'AbC12_-9'), and the maps are kept under
// sourcemaps/<build id>/ so a report points at its own maps.

// Same rule as telemetry.js buildIdFromUrl, on a bare file name.
export function buildIdFromEntryFile(file) {
  const m = /(?:^|\/)index-([\w-]{8})\.js$/.exec(String(file || ''))
  return m ? m[1] : null
}

// The build id of a build, from its emitted file names (any of them may be a
// map or a chunk). Null when there is no entry chunk.
export function buildIdFromFiles(files) {
  for (const file of files || []) {
    const id = buildIdFromEntryFile(String(file).replace(/\.map$/, ''))
    if (id) return id
  }
  return null
}

// Frames of a V8 ("at fn (url:line:col)") or Safari/Firefox ("fn@url:line:col")
// stack. `file` is the path under the site root (assets/x-HASH.js), which is
// where the matching map sits in the archive. Lines that are not frames are
// kept with file = null so the output can still be printed in order.
export function parseStackFrames(stack) {
  return String(stack || '').split('\n').map((raw) => {
    const m = /(https?:\/\/[^\s)]+?\/(assets\/[^\s):]+\.js)):(\d+):(\d+)\)?\s*$/.exec(raw.trim())
    if (!m) return { raw, file: null, line: 0, col: 0 }
    return { raw, file: m[2], line: Number(m[3]), col: Number(m[4]) }
  })
}
