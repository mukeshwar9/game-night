// Party rooms must survive the host leaving. The host-only controls (START,
// NEW MATCH, phase advances) follow the first ONLINE seat in join order
// (src/lib/coordinator.js isRoomCoordinator), and Chain Reaction 4P skips a
// player who drops on their own turn (src/lib/chainReaction4Logic.js). Closing
// a browser context drops its socket, so the emulator fires the seat's
// onDisconnect (`players/{uid}/online: false`) exactly as a closed tab would.
import { test, expect } from '@playwright/test'
import { completeOnboarding, createRoom, expectNoPageErrors, newPlayer, onboard } from './helpers.js'

// Guests onboard with a name first, then open the invite link, so every seat
// carries a known name whichever invite-screen variant the room shows.
async function joinNamed(page, roomUrl, name) {
  await onboard(page, name)
  await page.goto(roomUrl)
  const invited = page.getByRole('heading', { name: /YOU.RE INVITED/ })
  const lobby = page.getByText(/^PLAYERS \(/)
  await expect(invited.or(lobby).first()).toBeVisible()
  if (await invited.isVisible()) {
    await completeOnboarding(page, name, 'JOIN GAME')
  }
  await expect(page.getByText(new RegExp(`^${name} \\(YOU\\)$`, 'i'))).toBeVisible()
}

async function openRoom(browser, gameLabel, hostName, guestNames) {
  const host = await newPlayer(browser)
  await onboard(host.page, hostName)
  const roomUrl = await createRoom(host.page, gameLabel)
  const guests = []
  for (const name of guestNames) {
    const guest = await newPlayer(browser)
    await joinNamed(guest.page, roomUrl, name)
    guests.push(guest)
  }
  return { host, guests }
}

test('Wavelength: the next player can start when the host leaves the lobby', async ({ browser }) => {
  const { host, guests } = await openRoom(browser, 'WAVELENGTH', 'Hana', ['Gus', 'Gia', 'Gil'])
  const [gus, gia, gil] = guests

  await test.step('only the host can start while they are here', async () => {
    await expect(host.page.getByText(/^PLAYERS \(4\)/)).toBeVisible()
    await expect(host.page.getByRole('button', { name: 'START GAME' })).toBeVisible()
    for (const { page } of guests) {
      await expect(page.getByText(/^PLAYERS \(4\)/)).toBeVisible()
      await expect(page.getByRole('button', { name: 'START GAME' })).toHaveCount(0)
    }
  })

  await test.step('the host closes their tab', async () => {
    expectNoPageErrors(host)
    await host.context.close()
  })

  await test.step('the next player to have joined takes over START', async () => {
    await expect(gus.page.getByRole('button', { name: 'START GAME' })).toBeEnabled()
    for (const { page } of [gia, gil]) {
      await expect(page.getByRole('button', { name: 'START GAME' })).toHaveCount(0)
    }
    await gus.page.getByRole('button', { name: 'START GAME' }).click()
  })

  await test.step('the round starts for everyone, with an online clue-giver', async () => {
    await expect(gus.page.getByText('YOU ARE THE CLUE-GIVER')).toBeVisible()
    for (const { page } of [gia, gil]) {
      await expect(page.getByText(/WAITING FOR GUS/)).toBeVisible()
    }
  })

  expectNoPageErrors(...guests)
  for (const { context } of guests) await context.close()
})

test('Chain Reaction 4P: the next player can start when the host leaves the lobby', async ({ browser }) => {
  const { host, guests } = await openRoom(browser, 'CHAIN REACTION 4P', 'Hana', ['Gus', 'Gia'])
  const [gus, gia] = guests

  await expect(host.page.getByRole('button', { name: 'START MATCH' })).toBeVisible()
  await expect(gus.page.getByText(/^PLAYERS \(3\/4\)/)).toBeVisible()
  await expect(gus.page.getByRole('button', { name: 'START MATCH' })).toHaveCount(0)

  expectNoPageErrors(host)
  await host.context.close()

  await expect(gus.page.getByRole('button', { name: 'START MATCH' })).toBeVisible()
  await expect(gia.page.getByRole('button', { name: 'START MATCH' })).toHaveCount(0)
  await gus.page.getByRole('button', { name: 'START MATCH' }).click()

  // The departed host isn't dealt a colour, so Gus (first remaining seat) moves first.
  await expect(gus.page.getByText(/^YOUR TURN — PLACE ● P1$/)).toBeVisible()
  await expect(gia.page.getByText(/^GUS'S TURN…$/)).toBeVisible()

  expectNoPageErrors(...guests)
  for (const { context } of guests) await context.close()
})

test('Chain Reaction 4P: a player who drops on their turn is skipped', async ({ browser }) => {
  test.setTimeout(120_000)
  const { host, guests } = await openRoom(browser, 'CHAIN REACTION 4P', 'Hana', ['Gus', 'Gia'])
  const [gus, gia] = guests

  await expect(host.page.getByText(/^PLAYERS \(3\/4\)/)).toBeVisible()
  await host.page.getByRole('button', { name: 'START MATCH' }).click()
  await expect(host.page.getByText(/^YOUR TURN — PLACE ● P1$/)).toBeVisible()
  await expect(gus.page.getByText(/^HANA'S TURN…$/)).toBeVisible()

  // Hana drops before her first move: after the grace period the turn passes on.
  expectNoPageErrors(host)
  await host.context.close()

  await expect(gus.page.getByText(/^HANA IS OFFLINE — SKIPPING IN/)).toBeVisible()
  await expect(gus.page.getByText(/^YOUR TURN — PLACE ● P2$/)).toBeVisible({ timeout: 40_000 })
  await expect(gia.page.getByText(/^GUS'S TURN…$/)).toBeVisible()

  // The room keeps going: Gus's move hands the turn to Gia.
  await gus.page.getByTestId('cr-cell-0-0').click()
  await expect(gia.page.getByText(/^YOUR TURN — PLACE ● P3$/)).toBeVisible()

  expectNoPageErrors(...guests)
  for (const { context } of guests) await context.close()
})
