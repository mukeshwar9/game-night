// Arrows solo levels 21–40 and the new-arrow lessons: the first board with a
// kind the player has not been taught opens a three-tap practice lesson
// (playable, skippable, shown once), and the "?" in the level header reopens
// any reached kind's lesson from the arrow types list.
import { test, expect } from '@playwright/test'

const PROGRESS_KEY = 'arrows-solo-v1'
const SEEN_KEY = 'arrows-twists-seen'

// Cleared through `upTo` with three stars each, and taught `seen`.
async function seed(page, upTo, seen) {
  await page.evaluate(({ upTo, seen, PROGRESS_KEY, SEEN_KEY }) => {
    const levels = {}
    for (let n = 1; n <= upTo; n += 1) levels[`l${n}`] = 3
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ levels, endless: { easy: 0, medium: 0, hard: 0 } }))
    localStorage.setItem(SEEN_KEY, JSON.stringify(Object.fromEntries(seen.map((k) => [k, true]))))
  }, { upTo, seen, PROGRESS_KEY, SEEN_KEY })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'PLAY SOLO' })).toBeVisible()
}

const tapArrow = (scope, n) => scope.getByRole('button', { name: new RegExp(`^Arrow ${n},`) }).press('Enter')

test('level 21 opens the sleeping-arrow lesson once; it plays through to the level', async ({ page }) => {
  const errors = []
  page.on('pageerror', (err) => errors.push(err.message))
  await page.goto('/solo/arrows')
  await expect(page.getByRole('heading', { name: 'PLAY SOLO' })).toBeVisible()
  await seed(page, 20, ['diag', 'bend', 'curve'])

  await expect(page.getByText('3 · DOUBLE ARROWS')).toBeVisible()
  await page.getByRole('button', { name: 'Level 21, new arrow type' }).click()
  const lesson = page.getByRole('dialog', { name: 'SLEEPING ARROWS lesson' })
  await expect(lesson).toBeVisible()
  await expect(lesson.getByText(/A HOLLOW ARROW IS ASLEEP/)).toBeVisible()
  await lesson.getByRole('button', { name: 'SHOW ME · 3 TAPS' }).click()

  // An off-target tap only nudges.
  await expect(lesson.getByText('TAP THE HOLLOW ARROW')).toBeVisible()
  await tapArrow(lesson, 3)
  await expect(lesson.getByText('TRY THE GLOWING ARROW')).toBeVisible()
  // 1: the sleeper is blocked although its path is clear.
  await tapArrow(lesson, 1)
  await expect(lesson.getByText(/^ASLEEP — /)).toBeVisible()
  // 2: the arrow touching it leaves and wakes it.
  await expect(lesson.getByText('SEND OFF THE ARROW TOUCHING IT')).toBeVisible()
  await tapArrow(lesson, 2)
  await expect(lesson.getByText('IT WAKES UP AND FILLS IN.')).toBeVisible()
  // 3: it leaves.
  await expect(lesson.getByText('NOW SEND IT')).toBeVisible()
  await tapArrow(lesson, 1)
  await expect(lesson.getByText('GOT IT!')).toBeVisible()
  await lesson.getByRole('button', { name: 'PLAY LEVEL 21' }).click()

  await expect(lesson).toHaveCount(0)
  await expect(page.getByText('LEVEL 21 / 40')).toBeVisible()
  await expect(page.getByRole('button', { name: /asleep until an arrow touching it leaves/ }).first()).toBeAttached()
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).sleep, SEEN_KEY)).toBe(true)

  // Shown once: reopening the level goes straight to the board.
  await page.reload()
  await page.getByRole('button', { name: 'Level 21, new arrow type' }).click()
  await expect(page.getByText('LEVEL 21 / 40')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // "?" lists the arrow types; reached kinds replay their lesson, later ones stay hidden.
  await page.getByRole('button', { name: 'Arrow types' }).click()
  const types = page.getByRole('dialog', { name: 'Arrow types' })
  await expect(types.getByText('ARROW TYPES')).toBeVisible()
  await expect(types.getByText('MEET IT AT LEVEL 31')).toBeVisible()
  await types.getByRole('button', { name: 'Try the sleeping arrows lesson' }).click()
  await expect(types.getByRole('button', { name: 'SHOW ME · 3 TAPS' })).toBeVisible()
  await types.getByRole('button', { name: '‹ ARROW TYPES' }).click()
  await types.getByRole('button', { name: 'BACK TO THE BOARD' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('level 31 opens the double-arrow lesson, and SKIP goes straight to the board', async ({ page }) => {
  const errors = []
  page.on('pageerror', (err) => errors.push(err.message))
  await page.goto('/solo/arrows')
  await expect(page.getByRole('heading', { name: 'PLAY SOLO' })).toBeVisible()
  await seed(page, 30, ['diag', 'bend', 'curve', 'sleep'])

  await page.getByRole('button', { name: 'Level 31, new arrow type' }).click()
  const lesson = page.getByRole('dialog', { name: 'DOUBLE ARROWS lesson' })
  await expect(lesson.getByText(/ONE CURVED BODY, TWO HEADS/)).toBeVisible()
  await lesson.getByRole('button', { name: 'SKIP', exact: true }).click()
  await expect(lesson).toHaveCount(0)
  await expect(page.getByText('LEVEL 31 / 40')).toBeVisible()
  await expect(page.getByRole('button', { name: /double, two heads pointing/ }).first()).toBeAttached()
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).double, SEEN_KEY)).toBe(true)
  expect(errors).toEqual([])
})

test('HOW TO PLAY lists the arrow types and replays a reached lesson', async ({ page }) => {
  const errors = []
  page.on('pageerror', (err) => errors.push(err.message))
  await page.addInitScript(() => {
    localStorage.setItem('onboarded', '1')
    localStorage.setItem('music', 'off')
  })
  await page.goto('/games?game=arrows')
  await page.evaluate((k) => {
    const levels = {}
    for (let n = 1; n <= 12; n += 1) levels[`l${n}`] = 2
    localStorage.setItem(k, JSON.stringify({ levels, endless: { easy: 0, medium: 0, hard: 0 } }))
  }, PROGRESS_KEY)
  await page.reload()
  await page.getByRole('button', { name: 'HOW TO PLAY', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: / rules$/ })
  await expect(sheet.getByText('ARROW TYPES')).toBeVisible()
  await expect(sheet.getByText('HOOKED ARROWS', { exact: true })).toBeVisible()
  await expect(sheet.getByText('MEET IT AT LEVEL 21')).toBeVisible()
  await expect(sheet.getByText('MEET IT AT LEVEL 31')).toBeVisible()
  await sheet.getByRole('button', { name: 'Try the hooked arrows lesson' }).click()
  await sheet.getByRole('button', { name: 'SHOW ME · 3 TAPS' }).click()
  await tapArrow(sheet, 1)
  await expect(sheet.getByText(/^BLOCKED AFTER THE TURN/)).toBeVisible()
  expect(errors).toEqual([])
})
