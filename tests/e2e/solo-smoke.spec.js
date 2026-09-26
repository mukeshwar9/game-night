// Render smoke test for every game the registry advertises as solo-capable
// (`solo: true` in src/lib/games.js, which drives the Games page's SOLO OK
// filter and the PRACTICE VS AI button). Each /solo/<type> page must render
// without tripping ErrorBoundary or throwing an uncaught error.
import { test, expect } from '@playwright/test'
import { ERROR_BOUNDARY_TEXT } from './helpers.js'
import { soloGameTypes } from './registry.js'

const SOLO_TYPES = soloGameTypes()

// Each page load is independent, so spread them across workers.
test.describe.configure({ mode: 'parallel' })

// BUG (found by this suite): these are `solo: true` in games.js, so the Games
// page offers PRACTICE VS AI, but Demo.jsx's DEMOS list has no entry for
// them and /solo/<type> dead-ends on "NO SOLO DEMO". Remove a type from this
// set once it gets a demo (or loses the flag).
const MISSING_SOLO_DEMO = new Set(['wordrace', 'password', 'anagrams'])

test('the registry scan found the solo games', () => {
  // Guards against the text scan in registry.js silently matching nothing.
  expect(SOLO_TYPES.length).toBeGreaterThan(40)
  expect(SOLO_TYPES).toContain('tictactoe')
})

for (const type of SOLO_TYPES) {
  test(`/solo/${type} renders without errors`, async ({ page }) => {
    const errors = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto(`/solo/${type}`)
    // Demo cards are titled "<SHORT> DEMO" (or "<SHORT> SOLO RUN" for the memory
    // solo runs); the fallback page says "NO SOLO DEMO".
    await expect(page.getByText(/(DEMO|SOLO RUN)$/).or(page.getByText(ERROR_BOUNDARY_TEXT)).first()).toBeVisible()

    await expect(page.getByText(ERROR_BOUNDARY_TEXT)).toHaveCount(0)
    if (!MISSING_SOLO_DEMO.has(type)) {
      await expect(page.getByText('NO SOLO DEMO')).toHaveCount(0)
    }
    expect(errors).toEqual([])
  })
}

for (const type of MISSING_SOLO_DEMO) {
  test.fixme(`/solo/${type} offers a solo demo — registry has solo: true but Demo.jsx DEMOS has no entry, so PRACTICE VS AI lands on NO SOLO DEMO`, async ({ page }) => {
    await page.goto(`/solo/${type}`)
    await expect(page.getByText(/DEMO$/).first()).toBeVisible()
    await expect(page.getByText('NO SOLO DEMO')).toHaveCount(0)
  })
}
