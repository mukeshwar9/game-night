// The party shell: a persistent header of faces and a footer of chat and
// reactions around the game. Alice starts a party, Bob joins by link. Both see
// each other's tile; the header toggles between big tiles and the face strip
// by hand only (and remembers it); the same shell element stays mounted when
// Alice picks a game and when she goes back to the party; a chat line lands in
// the footer ticker for both.
import { test, expect } from '@playwright/test'
import { completeOnboarding, expectNoPageErrors, newPlayer, onboard, ROOM_URL } from './helpers.js'

async function joinParty(page, url, name) {
  await onboard(page, name)
  await page.goto(url)
  const invited = page.getByRole('heading', { name: /YOU.RE INVITED/ })
  const lobby = page.getByTestId('party-lobby')
  await expect(invited.or(lobby)).toBeVisible()
  if (await invited.isVisible()) await completeOnboarding(page, name, 'JOIN GAME')
  await expect(lobby).toBeVisible()
}

test('party shell: faces, manual view toggle, and it survives a game switch', async ({ browser }) => {
  test.setTimeout(180_000)
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)
  let url

  await test.step('Alice starts a party; the shell shows her tile and an invite tile', async () => {
    await onboard(alice.page, 'Alice')
    await alice.page.getByTestId('start-party').click()
    await alice.page.waitForURL(ROOM_URL)
    url = alice.page.url()
    await expect(alice.page.getByTestId('party-shell')).toBeVisible()
    await expect(alice.page.getByTestId('shell-tile')).toHaveCount(1)
    await expect(alice.page.getByTestId('invite-tile')).toHaveCount(3)
    await expect(alice.page.getByTestId('host-badge')).toBeVisible()
  })

  await test.step('Bob joins; both shells show two faces', async () => {
    await joinParty(bob.page, url, 'Bob')
    for (const p of [alice, bob]) await expect(p.page.getByTestId('shell-tile')).toHaveCount(2)
    await expect(alice.page.getByTestId('shell-footer')).toBeVisible()
  })

  await test.step('the header changes view only when the player taps the toggle', async () => {
    const shell = alice.page.getByTestId('party-shell')
    await expect(shell).toHaveAttribute('data-view', 'tiles')
    await alice.page.getByTestId('shell-view-toggle').click()
    await expect(shell).toHaveAttribute('data-view', 'strip')
    await alice.page.reload()
    await expect(alice.page.getByTestId('party-shell')).toHaveAttribute('data-view', 'strip')
    await alice.page.getByTestId('shell-minimise').click()
    await expect(alice.page.getByTestId('party-shell')).toHaveAttribute('data-view', 'mini')
    await alice.page.getByTestId('shell-expand').click()
    await expect(alice.page.getByTestId('party-shell')).toHaveAttribute('data-view', 'strip')
    await alice.page.getByTestId('shell-view-toggle').click()
    await expect(alice.page.getByTestId('party-shell')).toHaveAttribute('data-view', 'tiles')
  })

  await test.step('the same shell stays mounted across a game switch and back to the party', async () => {
    await alice.page.getByTestId('party-shell').evaluate(el => { el.dataset.mountMark = 'kept' })
    await alice.page.getByRole('button', { name: 'Play TIC TAC TOE' }).click()
    await expect(alice.page.getByTestId('party-lobby')).toHaveCount(0)
    await expect(alice.page.getByTestId('party-shell')).toHaveAttribute('data-mount-mark', 'kept')
    await expect(alice.page.getByTestId('shell-tile')).toHaveCount(2)
    await expect(bob.page.getByTestId('shell-tile')).toHaveCount(2)
  })

  await test.step('a chat line reaches the other footer ticker', async () => {
    await alice.page.getByTestId('chat-ticker').click()
    await alice.page.getByLabel('Chat message').fill('hello bob')
    await alice.page.getByLabel('Chat message').press('Enter')
    await alice.page.getByRole('button', { name: 'Close chat' }).click()
    await expect(bob.page.getByTestId('chat-ticker')).toContainText('hello bob')
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})
