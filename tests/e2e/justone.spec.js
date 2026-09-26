// Just One: three players; the two clue-givers write matching clues, which
// cancel each other, and the guesser (who never sees the word) still gets it.
// Also checks the mystery word never sits in the room node in plaintext
// before the result, and that the guesser rotates.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

// Reads the room straight from the Database emulator ("owner" bypasses rules).
async function readRoom(roomUrl) {
  const id = roomUrl.split('/').pop()
  const res = await fetch(`http://127.0.0.1:9000/games/${id}.json?ns=demo-game-night-default-rtdb`, {
    headers: { Authorization: 'Bearer owner' },
  })
  return res.json()
}

test('three players cancel duplicate clues and guess a Just One card', async ({ browser }) => {
  const hana = await newPlayer(browser) // host → first guesser
  const gus = await newPlayer(browser)
  const gia = await newPlayer(browser)
  const everyone = [hana, gus, gia]
  const givers = [gus, gia]

  await test.step('host creates the room, two friends join, host starts', async () => {
    await onboard(hana.page, 'Hana')
    await createRoom(hana.page, 'JUST ONE')
    await expect(hana.page.getByText(/NEED 2 MORE PLAYERS/)).toBeVisible()
    await joinViaInvite(gus.page, hana.page.url(), 'Gus')
    await joinViaInvite(gia.page, hana.page.url(), 'Gia')
    for (const { page } of everyone) await expect(page.getByText(/^PLAYERS \(3\)/)).toBeVisible()
    await expect(gus.page.getByRole('button', { name: 'START GAME' })).toHaveCount(0)
    await hana.page.getByRole('button', { name: 'START GAME' }).click()
  })

  let word = ''
  await test.step('clue-givers see the word; the guesser does not', async () => {
    await expect(hana.page.getByText('YOU ARE THE GUESSER')).toBeVisible()
    for (const { page } of givers) await expect(page.getByTestId('jo-word')).toBeVisible()
    word = (await gus.page.getByTestId('jo-word').innerText()).trim()
    await expect(gia.page.getByTestId('jo-word')).toHaveText(word)
    await expect(hana.page.getByTestId('jo-word')).toHaveCount(0)
    const room = await readRoom(hana.page.url())
    expect(room.round.phase).toBe('clues')
    expect(Object.keys(room.round.sealed)).toHaveLength(2)
    expect(JSON.stringify(room)).not.toContain(`"${word.toLowerCase()}"`)
  })

  await test.step('both clue-givers lock in near-identical clues', async () => {
    await gus.page.getByRole('textbox', { name: 'Your one-word clue' }).fill('Qwertyx')
    await gus.page.getByRole('button', { name: 'LOCK IN CLUE' }).click()
    await expect(gus.page.getByText(/LOCKED IN ✓/)).toBeVisible()
    // Committed clues are hashes only.
    const room = await readRoom(hana.page.url())
    expect(JSON.stringify(room.round.clues)).not.toMatch(/qwertyx/i)
    await gia.page.getByRole('textbox', { name: 'Your one-word clue' }).fill('qwertyxes')
    await gia.page.getByRole('button', { name: 'LOCK IN CLUE' }).click()
  })

  await test.step('the duplicates cancel before the guesser sees them', async () => {
    for (const { page } of everyone) {
      await expect(page.getByTestId('jo-cancelled')).toHaveText('2 CLUES CANCELLED')
      await expect(page.getByText('EVERY CLUE WAS CANCELLED')).toBeVisible()
    }
    await expect(hana.page.getByText(/QWERTYX/)).toHaveCount(0)
    await expect(gus.page.getByText(/Cancelled \(hidden from the guesser\)/)).toBeVisible()
  })

  await test.step('the guesser still gets it', async () => {
    await hana.page.getByRole('textbox', { name: 'Your guess' }).fill(word.toLowerCase())
    await hana.page.getByRole('button', { name: 'GUESS', exact: true }).click()
    for (const { page } of everyone) {
      await expect(page.getByTestId('jo-outcome')).toHaveText('CORRECT!')
      await expect(page.getByTestId('jo-score')).toHaveText('SCORE 1')
    }
  })

  await test.step('the next card rotates the guesser', async () => {
    await gia.page.getByRole('button', { name: 'NEXT CARD' }).click()
    await expect(gus.page.getByText('YOU ARE THE GUESSER')).toBeVisible()
    await expect(hana.page.getByTestId('jo-word')).toBeVisible()
    await expect(gus.page.getByTestId('jo-word')).toHaveCount(0)
  })

  expectNoPageErrors(...everyone)
  for (const { context } of everyone) await context.close()
})
