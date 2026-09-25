import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Game Night',
        short_name: 'Game Night',
        description: 'Play games with friends online — no account needed',
        theme_color: '#080810',
        background_color: '#080810',
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
        // Safety margin, not a target: the entry chunk is ~2 MB today and the
        // default 2 MiB limit fails the build outright once it's crossed. The
        // real fix is code-splitting + the CI size budget
        // (scripts/check-bundle-size.mjs).
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
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
