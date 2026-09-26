// Heads Up: three players; the guesser's client never receives the prompt
// (not on screen, not in the room node), the describers both see the same
// card, GOT IT advances the card and scores for the guesser.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

// Emulator REST access as the owner (bypasses rules) — test setup/inspection only.
const DB = 'http://127.0.0.1:9000'
const NS = 'demo-game-night-default-rtdb'
const roomIdOf = (url) => url.split('/game/')[1]
async function readRoom(id) {
  const res = await fetch(`${DB}/games/${id}.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' } })
  return res.json()
}
// The room as JSON minus the sealed-box crypto fields (ciphertext, keys, IVs):
// those are random base64, which a short prompt like "OWL" can appear inside
// by chance, case-insensitively.
const CRYPTO_KEYS = new Set(['ct', 'epk', 'iv', 'kid', 'pub'])
const plainJson = (room) => JSON.stringify(room, (k, v) => (CRYPTO_KEYS.has(k) ? undefined : v))
async function patchRoom(id, patch) {
  await fetch(`${DB}/games/${id}.json?ns=${NS}`, {
    method: 'PATCH', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(patch),
  })
}

test('the guesser never sees the prompt; describers do; GOT IT scores', async ({ browser }) => {
  const host = await newPlayer(browser)
  const guests = [await newPlayer(browser), await newPlayer(browser)]
  const everyone = [host, ...guests]
  let roomId

  await test.step('three players fill the lobby', async () => {
    await onboard(host.page, 'Hana')
    await createRoom(host.page, 'HEADS UP')
    roomId = roomIdOf(host.page.url())
    await joinViaInvite(guests[0].page, host.page.url(), 'Gus')
    await joinViaInvite(guests[1].page, host.page.url(), 'Gia')
    for (const { page } of everyone) await expect(page.getByText(/^PLAYERS \(3\)/)).toBeVisible()
    // Timers off: the turn ends by hand instead of after 60 s.
    await patchRoom(roomId, { timerScale: 0 })
  })

  await test.step('host starts; the host guesses first', async () => {
    await host.page.getByRole('button', { name: 'START MATCH' }).click()
    await expect(host.page.getByText('FACE THE CAMERA')).toBeVisible()
    for (const { page } of guests) await expect(page.getByText('Hana GUESSES')).toBeVisible()
    await host.page.getByRole('button', { name: 'START TURN' }).click()
  })

  let prompt
  await test.step('describers see the same card; the guesser sees none', async () => {
    const [a, b] = guests.map(g => g.page.getByTestId('headsup-prompt'))
    await expect(a).toBeVisible()
    prompt = (await a.textContent()).trim()
    expect(prompt.length).toBeGreaterThan(0)
    await expect(b).toHaveText(prompt)

    await expect(host.page.getByText('YOU’RE GUESSING').or(host.page.getByText("YOU'RE GUESSING"))).toBeVisible()
    await expect(host.page.getByTestId('headsup-card')).toHaveCount(0)
    const hostText = (await host.page.locator('body').innerText()).toUpperCase()
    expect(hostText).not.toContain(prompt.toUpperCase())

    // Nothing in the room node spells the prompt out, and nothing is sealed to the guesser.
    const room = await readRoom(roomId)
    expect(plainJson(room).toUpperCase()).not.toContain(prompt.toUpperCase())
    const hostUid = Object.values(room.players).find(p => p.name === 'Hana').playerId
    const sealedTo = Object.keys(room.round.turn.sealed)
    expect(sealedTo).toHaveLength(2)
    expect(sealedTo).not.toContain(hostUid)
  })

  await test.step('GOT IT advances the card for everyone', async () => {
    await guests[0].page.getByRole('button', { name: '✓ GOT IT' }).click()
    for (const { page } of everyone) await expect(page.getByText('GOT 1 · PASSED 0')).toBeVisible()
    await expect(guests[1].page.getByTestId('headsup-prompt')).not.toHaveText(prompt)
  })

  await test.step('ending the turn scores the guesser and reveals the words', async () => {
    await host.page.getByRole('button', { name: 'END TURN' }).click()
    await expect(host.page.getByText('YOU GOT 1')).toBeVisible()
    for (const { page } of guests) await expect(page.getByText('Hana GOT 1')).toBeVisible()
    // The recap now shows the guesser what the word was.
    await expect(host.page.getByText(new RegExp(`^${prompt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'))).toBeVisible()
    const room = await readRoom(roomId)
    const hostUid = Object.values(room.players).find(p => p.name === 'Hana').playerId
    expect(room.scores[hostUid]).toBe(1)
  })

  await test.step('next turn: the guesser rotates and the old guesser now describes', async () => {
    await host.page.getByRole('button', { name: 'NEXT TURN' }).click()
    await expect(guests[0].page.getByText('FACE THE CAMERA')).toBeVisible()
    await guests[0].page.getByRole('button', { name: 'START TURN' }).click()
    const hostPrompt = host.page.getByTestId('headsup-prompt')
    await expect(hostPrompt).toBeVisible()
    const next = (await hostPrompt.textContent()).trim()
    await expect(guests[1].page.getByTestId('headsup-prompt')).toHaveText(next)
    await expect(guests[0].page.getByTestId('headsup-card')).toHaveCount(0)
    expect((await guests[0].page.locator('body').innerText()).toUpperCase()).not.toContain(next.toUpperCase())
  })

  expectNoPageErrors(...everyone)
  for (const { context } of everyone) await context.close()
})
