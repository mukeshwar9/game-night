// Hangwoman rooms (word games audit, 2026-10-02): SUGGEST fills the setter's
// blank page, and while the guesser plays the word-keeper can see their own
// word again — hidden behind a tap so a shoulder-surfer can't read it — as the
// solo game shows "Your word: CRORE".
// The keeper's word lives only in their tab, never in the room.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

test.describe.configure({ timeout: 120_000 })

const PHONE = { viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }

test('the word-keeper can reveal their own word while the guesser plays', async ({ browser }) => {
  const keeper = await newPlayer(browser, PHONE)
  const guesser = await newPlayer(browser, PHONE)
  await onboard(keeper.page, 'Asha')
  const url = await createRoom(keeper.page, 'HANGWOMAN')
  await joinViaInvite(guesser.page, url, 'Ben')

  // The creator keeps the first word. SUGGEST fills a word and its category
  // hint, so the setter never faces a blank page.
  const secret = keeper.page.getByRole('textbox', { name: 'Secret word' })
  await keeper.page.getByRole('button', { name: 'SUGGEST' }).click()
  await expect(secret).toHaveValue(/^[A-Z]{4,}$/)
  await expect(keeper.page.getByRole('textbox', { name: /hint/i })).not.toHaveValue('')
  await secret.fill('biryani')
  const lock = keeper.page.getByRole('button', { name: 'LOCK IT IN' })
  await expect(lock).toBeEnabled()
  await lock.click()
  await expect(guesser.page.getByText('YOUR TURN — GUESS A LETTER')).toBeVisible()

  const show = keeper.page.getByRole('button', { name: 'Show your word' })
  await expect(show).toBeVisible()
  // Hidden by default: the word is not on the page until tapped.
  await expect(keeper.page.getByText('BIRYANI')).toHaveCount(0)
  await show.click()
  await expect(keeper.page.getByRole('button', { name: /Your word: BIRYANI/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(keeper.page.getByText('BIRYANI', { exact: true })).toBeVisible()
  // The guesser never sees it.
  await expect(guesser.page.getByText('BIRYANI')).toHaveCount(0)

  expectNoPageErrors(keeper, guesser)
  await keeper.context.close()
  await guesser.context.close()
})
