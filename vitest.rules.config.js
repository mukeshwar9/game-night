import { defineConfig } from 'vitest/config'

// Security-rules tests for database.rules.json. They talk to the Realtime
// Database emulator, so run them through `npm run test:rules`, which wraps
// vitest in `firebase emulators:exec`. Files share one emulator namespace and
// clear it between tests, so they must never run in parallel.
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.js'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
})
