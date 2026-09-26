import { defineConfig, devices } from '@playwright/test'

// Browser smoke tests against the local Firebase emulators. Run them with
// `npm run test:e2e`, which starts the Auth + Realtime Database emulators via
// `firebase emulators:exec` and then runs `playwright test`. The web server is
// a Vite dev server in `--mode emulator` (.env.emulator), so no test can ever
// reach the live project. tests/e2e/global-setup.js fails fast when the
// emulators are not running.
//
// E2E_PREVIEW=1 serves a production build (still --mode emulator) instead of
// the dev server: closer to what players run, immune to hot reloads from
// concurrent edits, and fast enough to expose timing races the dev server
// hides. CI uses it.
const PORT = 5190
const PREVIEW = process.env.E2E_PREVIEW === '1'

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.js',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: PREVIEW
      ? `npx vite build --mode emulator --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`
      : `npx vite --mode emulator --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: PREVIEW ? 300_000 : 120_000,
  },
})
