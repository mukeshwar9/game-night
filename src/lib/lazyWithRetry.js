import { lazy } from 'react'

// Code-split chunks carry content hashes, and every deploy deletes the old
// ones. A tab opened before a deploy still runs the old entry chunk, so its
// next lazy import asks for a file that no longer exists and the import
// rejects. Reloading once fetches the new index.html and the new chunk names.
// The sessionStorage timestamp stops a reload loop when the failure is real
// (offline, or a chunk that is genuinely broken): a second failure inside the
// window is rethrown so the ErrorBoundary shows its RELOAD screen instead.

const RELOAD_KEY = 'chunk-reload-at'
export const RELOAD_WINDOW_MS = 30_000

const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i, // Chromium
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
  /Unable to preload CSS/i, // Vite's CSS preload helper
  /Loading (CSS )?chunk [\w-]+ failed/i, // webpack-style wording, kept for safety
]

export function isChunkLoadError(err) {
  if (!err) return false
  if (err.name === 'ChunkLoadError') return true
  const message = String(err.message ?? err)
  return CHUNK_ERROR_PATTERNS.some(re => re.test(message))
}

function browserEnv() {
  return {
    now: () => Date.now(),
    read: () => {
      try { return sessionStorage.getItem(RELOAD_KEY) } catch { return null }
    },
    write: (value) => {
      try { sessionStorage.setItem(RELOAD_KEY, value) } catch { /* private mode */ }
    },
    reload: () => window.location.reload(),
  }
}

// Runs `importer`; on a chunk-load failure, reloads the page at most once per
// RELOAD_WINDOW_MS and returns a promise that never settles, so Suspense keeps
// showing its fallback until the reload replaces the page. Any other error, or
// a repeat failure inside the window, is rethrown. `env` is injectable for tests.
export function importWithRetry(importer, env = browserEnv()) {
  return importer().catch((err) => {
    if (!isChunkLoadError(err)) throw err
    const last = Number(env.read()) || 0
    const now = env.now()
    if (now - last < RELOAD_WINDOW_MS) throw err
    env.write(String(now))
    env.reload()
    return new Promise(() => {})
  })
}

// React.lazy with the reload-once recovery above.
export function lazyWithRetry(importer) {
  return lazy(() => importWithRetry(importer))
}
