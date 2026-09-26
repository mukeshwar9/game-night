// Two-player co-op flows for LANTERNS and DOCKING: two anonymous players on
// the emulators open a room, deal, and take turns through the shared round —
// each move written by one client must reach the other.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

async function openPair(browser, label) {
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)
  await onboard(alice.page, 'Alice')
  await createRoom(alice.page, label)
  await joinViaInvite(bob.page, alice.page.url(), 'Bob')
  await expect(bob.page).toHaveURL(alice.page.url())
  return { alice, bob }
}

test('Lanterns: deal, clue and play reach both players', async ({ browser }) => {
  const { alice, bob } = await openPair(browser, 'LANTERNS')

  await test.step('either player deals the full deck', async () => {
    await expect(bob.page.getByText('PICK A DECK')).toBeVisible()
    await alice.page.getByRole('button', { name: /^FULL/ }).click()
    await expect(alice.page.getByText('YOUR TURN')).toBeVisible()
    await expect(bob.page.getByText('PARTNER THINKING…')).toBeVisible()
  })

  await test.step('Alice sees Bob\'s cards and clues one', async () => {
    const bobCards = alice.page.getByRole('button', { name: /^Bob card \d/ })
    await expect(bobCards).toHaveCount(5)
    await bobCards.first().click()
    await alice.page.getByRole('button', { name: /^CLUE ALL \ds/ }).click()
    await expect(bob.page.getByText(/^Alice CLUED \ds · \d CARDS?$/)).toBeVisible()
    await expect(bob.page.getByText('YOUR TURN')).toBeVisible()
    // Bob only ever sees his own cards as backs.
    await expect(bob.page.getByRole('button', { name: /^Your card \d$/ })).toHaveCount(5)
  })

  await test.step('Bob plays a card and Alice sees the result', async () => {
    await bob.page.getByRole('button', { name: 'Your card 1' }).click()
    await bob.page.getByRole('button', { name: 'PLAY', exact: true }).click()
    await expect(alice.page.getByText(/^Bob (LIT|MISFIRED) /)).toBeVisible()
    await expect(alice.page.getByText('YOUR TURN')).toBeVisible()
    await expect(alice.page.getByText('DECK 39')).toBeVisible()
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})

test('Docking: launch, ready up, and place dice in turn', async ({ browser }) => {
  const { alice, bob } = await openPair(browser, 'DOCKING')

  await test.step('launch a cadet approach', async () => {
    await expect(bob.page.getByText('PICK AN APPROACH')).toBeVisible()
    await alice.page.getByRole('button', { name: /^CADET/ }).click()
    await expect(alice.page.getByText('TALK NOW — SILENCE ONCE THE DICE ROLL')).toBeVisible()
    await expect(bob.page.getByText('TALK NOW — SILENCE ONCE THE DICE ROLL')).toBeVisible()
  })

  await test.step('both ready: the dice roll and the silent run starts', async () => {
    await alice.page.getByRole('button', { name: 'READY TO ROLL' }).click()
    await expect(bob.page.getByText('CMD ✓ · ENG …')).toBeVisible()
    await bob.page.getByRole('button', { name: 'READY TO ROLL' }).click()
    await expect(alice.page.getByText(/SILENT RUN/)).toBeVisible()
    await expect(alice.page.getByRole('button', { name: /^Die \d: \d$/ })).toHaveCount(4)
    await expect(bob.page.getByText('COMMANDER: 4 HIDDEN')).toBeVisible()
  })

  await test.step('Commander places attitude, Engineer answers', async () => {
    await expect(alice.page.getByText('PLACE A DIE')).toBeVisible()
    await alice.page.getByRole('button', { name: /^Die 1: \d$/ }).click()
    await alice.page.getByRole('button', { name: 'Attitude commander, place here' }).click()
    await expect(bob.page.getByLabel(/^Attitude commander: \d$/)).toBeVisible()
    await expect(bob.page.getByText('COMMANDER: 3 HIDDEN')).toBeVisible()
    await bob.page.getByRole('button', { name: /^Die 1: \d$/ }).click()
    await bob.page.getByRole('button', { name: 'Attitude engineer, place here' }).click()
    await expect(alice.page.getByLabel(/^Attitude engineer: \d$/)).toBeVisible()
    await expect(alice.page.getByText(/^tilt → -?\d$/)).toBeVisible()
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})
