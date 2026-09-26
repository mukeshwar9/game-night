import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Unit tests only: pure logic under src/. Mirrors vite.config.js's alias and
// JSX handling (games.js pulls in .jsx components) but deliberately leaves out
// the PWA plugin, which has nothing to do with tests. Rules tests
// (vitest.rules.config.js) and Playwright specs (playwright.config.js) live
// under tests/ and need running emulators, so they are excluded here.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [react()],
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    exclude: ['node_modules/**', 'dist/**', 'tests/**'],
    // Some search-heavy suites (e.g. chompLogic's solver) exceed the 5 s
    // default when the machine is busy running the full suite in parallel.
    testTimeout: 15000,
  },
})
