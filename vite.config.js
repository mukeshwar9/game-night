import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

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

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
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
        // No Firebase runtime rule: RTDB/Auth traffic is live and has its own
        // offline handling; caching it here only stored opaque responses with
        // no expiry.
        runtimeCaching: [
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
        ],
      },
    }),
  ],
})
