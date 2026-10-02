// Word Co-op "suggest a letter" (word games audit, 2026-10-02): on the
// partner's turn the waiting player was idle. Now a key tap suggests a
// letter, which glows on the partner's keyboard until the next guess locks.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

test.describe.configure({ timeout: 120_000 })

test('the waiting partner suggests a letter that glows on the active keyboard', async ({ browser }) => {
  const asha = await newPlayer(browser)
  const ben = await newPlayer(browser)
  await onboard(asha.page, 'Asha')
  const url = await createRoom(asha.page, 'WORD CO-OP')
  await joinViaInvite(ben.page, url, 'Ben')

  // Whoever is waiting suggests; whoever is up sees it.
  await expect(asha.page.getByText(/YOUR TURN|PARTNER THINKING/).first()).toBeVisible()
  const ashaFirst = await asha.page.getByText('YOUR TURN', { exact: true }).isVisible()
  const [active, waiting, waitingName] = ashaFirst ? [asha, ben, 'Ben'] : [ben, asha, 'Asha']
  const keys = (p) => p.page.getByRole('group', { name: 'Keyboard' })

  await expect(waiting.page.getByText(/tap a key to suggest a letter/)).toBeVisible()
  await keys(waiting).getByRole('button', { name: 'R', exact: true }).click()
  await expect(keys(waiting).getByRole('button', { name: 'R, your suggestion' })).toBeVisible()
  await expect(keys(active).getByRole('button', { name: `R, suggested by ${waitingName}` })).toBeVisible()
  await expect(active.page.getByText(`${waitingName} suggests R.`)).toBeVisible()

  // The suggestion is spent when the guess locks.
  await active.page.keyboard.type('crane')
  await active.page.keyboard.press('Enter')
  await expect(keys(active).getByRole('button', { name: /suggested by/ })).toHaveCount(0)

  expectNoPageErrors(asha, ben)
  await asha.context.close()
  await ben.context.close()
})
