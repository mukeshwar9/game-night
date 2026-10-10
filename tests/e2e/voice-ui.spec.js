// Party voice controls, without a Cloudflare app: the voice panel shows only
// to party members, the first JOIN VOICE asks once (mic or listen only), the
// 13+ age check comes first for an account with no birth year on file, and a
// voiceSfu that is not reachable (no Functions emulator here) leaves a clear
// error instead of a stuck button. A real SFU session needs a Cloudflare test
// app and runs as a manual device check (see the voice report).
//
// Runs only when the app is built with the voice switch:
//   VITE_VOICE_ENABLED=1 npm run test:e2e -- tests/e2e/voice-ui.spec.js
import { test, expect } from '@playwright/test'
import { completeOnboarding, expectNoPageErrors, newPlayer, onboard, ROOM_URL } from './helpers.js'

test.skip(process.env.VITE_VOICE_ENABLED !== '1', 'voice UI is behind VITE_VOICE_ENABLED=1')

test('voice panel, first-use sheet and the 13+ age check in a party', async ({ browser }) => {
  test.setTimeout(120_000)
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await onboard(alice.page, 'Alice')
  await alice.page.getByTestId('start-party').click()
  await alice.page.waitForURL(ROOM_URL)
  const url = alice.page.url()

  await onboard(bob.page, 'Bob')
  await bob.page.goto(url)
  const invited = bob.page.getByRole('heading', { name: /YOU.RE INVITED/ })
  await expect(invited.or(bob.page.getByTestId('party-lobby'))).toBeVisible()
  if (await invited.isVisible()) await completeOnboarding(bob.page, 'Bob', 'JOIN GAME')

  await test.step('members see the voice panel; JOIN VOICE asks once', async () => {
    await expect(alice.page.getByTestId('voice-panel')).toBeVisible()
    await expect(bob.page.getByTestId('voice-panel')).toBeVisible()
    await alice.page.getByTestId('voice-join').click()
    const sheet = alice.page.getByRole('dialog', { name: 'Join voice?' })
    await expect(sheet).toContainText('Nothing is recorded')
    // LISTEN ONLY: a headless browser on a desktop OS may never answer a
    // microphone request; the mic path is covered by the controller tests.
    await sheet.getByRole('button', { name: 'LISTEN ONLY' }).click()
  })

  await test.step('no birth year on file: the age check comes first', async () => {
    await expect(alice.page.getByTestId('voice-age')).toBeVisible()
    await alice.page.getByTestId('voice-age').getByRole('button', { name: 'CHECK' }).click()
    const age = alice.page.getByRole('dialog', { name: 'Age check' })
    await age.getByLabel(/What year were you born/).selectOption('2000')
    await age.getByRole('button', { name: 'CONTINUE' }).click()
  })

  await test.step('with no voice service reachable, the panel says so and stays usable', async () => {
    const panel = alice.page.getByTestId('voice-panel')
    await expect.poll(async () => `${await panel.getAttribute('data-status')}|${await panel.getAttribute('data-error')}`, { timeout: 45_000 }).toMatch(/^off\|(?!null)/)
    await expect(alice.page.getByTestId('voice-error').or(alice.page.getByTestId('voice-mic-blocked'))).toBeVisible()
    await expect(alice.page.getByTestId('voice-join')).toBeEnabled()
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})
