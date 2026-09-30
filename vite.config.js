import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'node:fs'
import { buildIdFromFiles } from './src/lib/sourcemapLogic.js'

// Vite writes the entry <script> and its ~18 <link rel="modulepreload">s
// before the stylesheet. The stylesheet is the only render-blocking request
// (the pre-JS splash needs it), so on a slow connection it queued behind the
// scripts and delayed first paint. Move it to the front of the injected tags.
function stylesheetFirst() {
  return {
    name: 'stylesheet-first',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const css = html.match(/\s*<link rel="stylesheet"[^>]*>/g)
        const firstScript = html.search(/<script type="module"/)
        if (!css || firstScript < 0) return html
        let out = html
        for (const tag of css) out = out.replace(tag, '')
        const at = out.search(/<script type="module"/)
        return out.slice(0, at) + css.map(t => t.trim()).join('\n    ') + '\n    ' + out.slice(at)
      },
    },
  }
}

// Source maps are for us, not for visitors: `build.sourcemap: 'hidden'` writes
// them without a sourceMappingURL in the bundles, and this moves every .map out
// of the deploy directory into sourcemaps/<build id>/ (git-ignored), the id
// being the one error reports carry (src/lib/sourcemapLogic.js). Keep that
// folder per release; scripts/symbolicate.mjs reads it. firebase.json also
// ignores **/*.map, so a map can never reach Hosting even if this is skipped.
function privateSourcemaps() {
  let outDir = 'dist'
  let root = process.cwd()
  return {
    name: 'private-sourcemaps',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
      root = config.root
    },
    // After the PWA plugin has written the service worker, so nothing it emits
    // is left behind.
    closeBundle: {
      order: 'post',
      sequential: true,
      handler() {
        const maps = []
        const walk = (dir) => {
          for (const entry of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) walk(full)
            else if (entry.name.endsWith('.map')) maps.push(full)
          }
        }
        walk(outDir)
        if (!maps.length) return
        const rels = maps.map(f => path.relative(outDir, f).split(path.sep).join('/'))
        const buildId = buildIdFromFiles(rels) || 'unknown'
        const target = path.join(root, 'sourcemaps', buildId)
        fs.rmSync(target, { recursive: true, force: true })
        maps.forEach((file, i) => {
          const dest = path.join(target, rels[i])
          fs.mkdirSync(path.dirname(dest), { recursive: true })
          fs.renameSync(file, dest)
        })
      },
    },
  }
}

// The service worker precaches the app shell only: the entry, its CSS and
// every route page in App.jsx (plus first-run onboarding), each with its
// static-import closure. Per-game pages, boards and decks (~2.4 MB across
// ~180 chunks) are cached at runtime the first time they load instead of all
// being downloaded in the background on the first visit and after every
// deploy. Filled in generateBundle, read by workbox's manifestTransforms.
const SHELL_CHUNKS = /^(index|Games|OnlineLobby|Game|Demo|DailyGame|Profile|Friends|Notes|EmojiLab|Leaderboard|Playground|Onboarding)$/
const shellFiles = new Set()

function collectShell() {
  return {
    name: 'collect-shell',
    apply: 'build',
    generateBundle(_, bundle) {
      shellFiles.clear()
      const visit = (file) => {
        const chunk = bundle[file]
        if (!chunk || chunk.type !== 'chunk' || shellFiles.has(file)) return
        shellFiles.add(file)
        chunk.viteMetadata?.importedCss?.forEach(css => shellFiles.add(css))
        chunk.imports.forEach(visit)
      }
      for (const [file, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' && (chunk.isEntry || SHELL_CHUNKS.test(chunk.name))) visit(file)
      }
    },
  }
}

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    sourcemap: 'hidden',
    rolldownOptions: {
      output: {
        // Modules the entry imports statically are needed before first render
        // anyway, but the default splitter scatters the ones lazy chunks also
        // use into ~20 tiny shared chunks, each a separate high-priority
        // modulepreload competing with the render-blocking stylesheet. Pull
        // them into two initial chunks: Firebase (big, changes rarely) and the
        // rest. Lazy-only modules split as before.
        codeSplitting: {
          groups: [
            { name: 'firebase', tags: ['$initial'], test: /node_modules[\\/](@firebase|firebase)[\\/]/, priority: 2 },
            { name: 'initial', tags: ['$initial'], priority: 1 },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    stylesheetFirst(),
    collectShell(),
    privateSourcemaps(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Game Night',
        short_name: 'Game Night',
        description: 'Play games with friends online — no account needed',
        // Mirror the default theme (MATCHA): theme_color matches --c-cta and the
        // index.html theme-color meta, background_color matches --c-bg, so an
        // installed app's splash is the same light ground the app paints.
        theme_color: '#8b6612',
        background_color: '#eef0e2',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // The static legal pages (public/privacy.html, terms.html) are served by
        // Hosting via redirects; without this the worker answers /privacy and
        // /terms navigations with the app shell, which shows NOT FOUND.
        // No public map for the worker either (nothing to symbolicate there).
        sourcemap: false,
        navigateFallbackDenylist: [/^\/(privacy|terms)(\.html)?$/, /^\/__\//],
        // No Firebase runtime rule: RTDB/Auth traffic is live and has its own
        // offline handling; caching it here only stored opaque responses with
        // no expiry.
        manifestTransforms: [
          async (entries) => ({
            manifest: entries.filter(e => !/^assets\/.+\.(js|css)$/.test(e.url) || shellFiles.has(e.url)),
            warnings: [],
          }),
        ],
        runtimeCaching: [
          {
            // Everything under /assets/ is content-hashed, so a cached copy
            // never goes stale; a game opened once keeps working offline.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/assets/') && /\.(js|css)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'assets',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 60 },
            },
          },
          {
            // Word Hunt's ~1MB dictionary lives in public/ (not the JS module
            // graph — see src/lib/wordhuntDictionary.js) and isn't precached:
            // only players who open Word Hunt fetch it, once.
            urlPattern: ({ url }) => url.pathname.endsWith('/wordhunt-dict.txt'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'wordhunt-dict',
              expiration: { maxEntries: 1 },
            },
          },
          {
            // HOW TO PLAY carousel stills (scripts/rule-media.mjs): not
            // precached, fetched when a rules sheet opens, then kept.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('/rule-media/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'rule-media',
              expiration: { maxEntries: 512 },
            },
          },
        ],
      },
    }),
  ],
})
