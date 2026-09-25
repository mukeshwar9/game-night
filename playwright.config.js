import { defineConfig, devices } from '@playwright/test'

// Browser smoke tests against the local Firebase emulators. Run them with
// `npm run test:e2e`, which starts the Auth + Realtime Database emulators via
// `firebase emulators:exec` and then runs `playwright test`. The web server is
// a Vite dev server in `--mode emulator` (.env.emulator), so no test can ever
// reach the live project. tests/e2e/global-setup.js fails fast when the
// emulators are not running.
const PORT = 5190

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
    command: `npx vite --mode emulator --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
