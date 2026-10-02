// Room chat and reactions, two players on two contexts (phone-sized Alice,
// desktop Bob): reactions sent at the same moment both arrive (they used to
// overwrite one slot), reactions stay visible with reduced motion (they used
// to end on an invisible frame), the one-row dock fits a 390px phone, chat
// lives in a sheet with an unread badge, the picker is opaque, party lobbies
// can chat, and the Sketch artist cannot type in room chat mid-round.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

async function phonePlayer(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (err) => errors.push(err))
  return { context, page, errors }
}

const dock = (page) => page.getByTestId('reaction-dock')
const floats = (page, kind) => page.locator(`[data-float-kind="${kind}"]`)

test('reactions and chat between two players', async ({ browser }) => {
  const alice = await phonePlayer(browser)
  const bob = await newPlayer(browser)
  await onboard(alice.page, 'Alice')
  const roomUrl = await createRoom(alice.page, 'CONNECT FOUR')
  await joinViaInvite(bob.page, roomUrl, 'Bob')
  await expect(alice.page.getByText('YOUR TURN')).toBeVisible()

  await test.step('the one-row dock fits a 390px phone', async () => {
    await expect(dock(alice.page)).toBeVisible()
    for (const name of ['More reactions', 'Open chat']) {
      const box = await alice.page.getByRole('button', { name }).boundingBox()
      expect(box, name).toBeTruthy()
      expect(box.x, name).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, name).toBeLessThanOrEqual(390)
    }
  })

  await test.step('two reactions sent at the same moment both arrive', async () => {
    const click = (page, glyph) => page.getByRole('button', { name: `Send ${glyph} reaction` }).click()
    await Promise.all([click(alice.page, '💀'), click(bob.page, '😂')])
    for (const p of [alice.page, bob.page]) {
      await expect(floats(p, 'emote')).toHaveCount(2)
      // Alice is X, Bob is O; each float pops from its sender's card.
      await expect(p.locator('[data-float-kind="emote"][data-float-by="X"]')).toHaveCount(1)
      await expect(p.locator('[data-float-kind="emote"][data-float-by="O"]')).toHaveCount(1)
    }
  })

  await test.step('with reduced motion a received reaction is shown, not faded out', async () => {
    await expect(floats(alice.page, 'emote')).toHaveCount(0, { timeout: 5_000 })
    await bob.page.getByRole('button', { name: 'Send 🔥 reaction' }).click()
    const float = floats(alice.page, 'emote').first()
    await expect(float).toBeVisible()
    const opacity = await float.locator('.emote-float').evaluate(el => getComputedStyle(el).opacity)
    expect(Number(opacity)).toBe(1)
  })

  await test.step('chat goes through the sheet; the other player gets a float and an unread badge', async () => {
    await bob.page.getByRole('button', { name: /^Open chat/ }).click()
    const sheet = bob.page.getByRole('dialog', { name: 'Chat' })
    await sheet.getByRole('textbox', { name: 'Chat message' }).fill('watch the left column')
    await sheet.getByRole('button', { name: 'SEND', exact: true }).click()
    await expect(sheet.getByText('watch the left column')).toBeVisible()
    await sheet.getByRole('button', { name: 'Close chat' }).click()

    await expect(floats(alice.page, 'chat').filter({ hasText: 'watch the left column' })).toBeVisible()
    await expect(alice.page.getByTestId('chat-unread')).toHaveText('1')
    await alice.page.getByRole('button', { name: 'Open chat, 1 unread' }).click()
    const aliceSheet = alice.page.getByRole('dialog', { name: 'Chat' })
    await expect(aliceSheet.getByText('watch the left column')).toBeVisible()
    await expect(aliceSheet.getByRole('button', { name: /Bob — block or report/ })).toBeVisible()
    await aliceSheet.getByRole('button', { name: 'Close chat' }).click()
    await expect(alice.page.getByTestId('chat-unread')).toHaveCount(0)
  })

  await test.step('a quick phrase lands in the history like typed chat', async () => {
    await alice.page.getByRole('button', { name: /^Open chat/ }).click()
    const aliceSheet = alice.page.getByRole('dialog', { name: 'Chat' })
    await aliceSheet.getByRole('button', { name: 'Send GG' }).click()
    await expect(aliceSheet.getByLabel('Chat history').getByText('GG', { exact: true })).toBeVisible()
    await aliceSheet.getByRole('button', { name: 'Close chat' }).click()
    await expect(bob.page.getByTestId('chat-unread')).toHaveText('1')
  })

  await test.step('the reaction picker is opaque', async () => {
    await alice.page.getByRole('button', { name: 'More reactions' }).click()
    const picker = alice.page.getByRole('dialog', { name: 'Choose a reaction' })
    await expect(picker).toBeVisible()
    const bg = await picker.evaluate(el => getComputedStyle(el).backgroundColor)
    expect(bg).toMatch(/^rgb\(/)
    await expect(picker.getByText('RECENT')).toBeVisible()
    await alice.page.keyboard.press('Escape')
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})

test('party lobby chat, and the Sketch artist cannot type mid-round', async ({ browser }) => {
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)
  await onboard(alice.page, 'Alice')
  const roomUrl = await createRoom(alice.page, 'SKETCH')
  await joinViaInvite(bob.page, roomUrl, 'Bob')

  await test.step('two players in the lobby can already chat', async () => {
    await expect(alice.page.getByRole('button', { name: 'START ROUND' })).toBeVisible()
    await bob.page.getByRole('button', { name: /^Open chat/ }).click()
    const sheet = bob.page.getByRole('dialog', { name: 'Chat' })
    await sheet.getByRole('textbox', { name: 'Chat message' }).fill('ready when you are')
    await sheet.getByRole('button', { name: 'SEND', exact: true }).click()
    await expect(alice.page.getByTestId('chat-unread')).toHaveText('1')
    await sheet.getByRole('button', { name: 'Close chat' }).click()
  })

  await test.step('the artist sees the lock instead of an input; the guesser can still type', async () => {
    await alice.page.getByRole('button', { name: 'START ROUND' }).click()
    const pick = (p) => p.getByText('PICK A WORD')
    await expect.poll(async () => (await pick(alice.page).isVisible()) || (await pick(bob.page).isVisible())).toBe(true)
    const aliceArtist = await pick(alice.page).isVisible()
    const [artist, guesser] = aliceArtist ? [alice, bob] : [bob, alice]

    await artist.page.getByRole('button', { name: /^Open chat/ }).click()
    const artistSheet = artist.page.getByRole('dialog', { name: 'Chat' })
    await expect(artistSheet.getByText(/YOU'RE DRAWING/)).toBeVisible()
    await expect(artistSheet.getByRole('textbox', { name: 'Chat message' })).toHaveCount(0)

    await guesser.page.getByRole('button', { name: /^Open chat/ }).click()
    await expect(guesser.page.getByRole('dialog', { name: 'Chat' }).getByRole('textbox', { name: 'Chat message' })).toBeVisible()
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})
