// R1: a friend arriving. The host sees SOMEONE OPENED YOUR LINK while the
// guest is still on the invite screen, then NAME IS HERE! and a shared 3·2·1
// when the guest joins; moves wait for the countdown on both phones, which read
// one server timestamp. Two browser contexts = two uids.
import { test, expect } from '@playwright/test'
import { completeOnboarding, createRoom, expectNoPageErrors, newPlayer, onboard, ROOM_URL } from './helpers.js'
import { DB_ORIGIN } from './emulator.js'

const NS = 'demo-game-night-default-rtdb'

async function readNode(request, path) {
  const res = await request.get(`${DB_ORIGIN}/${path}.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' } })
  expect(res.ok()).toBe(true)
  return res.json()
}

const cell = (page, row, col) => page.getByRole('button', { name: new RegExp(`^Row ${row}, column ${col}, `) })
const occupiedBy = (symbol) => new RegExp(`^Row \\d, column \\d, ${symbol}(,|$)`)

test('a friend arrives: link-opened signal, IS HERE banner, shared countdown', async ({ browser, request }) => {
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)
  let roomUrl, gameId

  await test.step('the host waits with a seat saved for a friend', async () => {
    await onboard(alice.page, 'Alice')
    roomUrl = await createRoom(alice.page, 'TIC TAC TOE')
    gameId = roomUrl.split('/').pop()
    await expect(alice.page.getByText('SAVING THIS SEAT')).toBeVisible()
    await expect(alice.page.getByTestId('waiting-status')).toHaveText('WAITING FOR OPPONENT')
  })

  await test.step('the guest opens the link: the host hears someone is on the way, with no name', async () => {
    await bob.page.goto(roomUrl)
    await expect(bob.page.getByRole('heading', { name: /YOU.RE INVITED/ })).toBeVisible()
    await expect(bob.page.getByTestId('invite-host-waiting')).toHaveText('ALICE IS WAITING · PICKED TIC TAC TOE')
    await expect(alice.page.getByTestId('waiting-status')).toHaveText('SOMEONE OPENED YOUR LINK…')
    const arriving = await readNode(request, `games/${gameId}/arriving`)
    expect(Object.keys(arriving)).toHaveLength(1)
    expect(typeof Object.values(arriving)[0]).toBe('number')
  })

  await test.step('the guest joins: both phones show the banner and the same countdown', async () => {
    await completeOnboarding(bob.page, 'Bob', 'JOIN GAME')
    await expect(alice.page.getByTestId('arrival-title')).toHaveText('BOB IS HERE!')
    await expect(bob.page.getByTestId('arrival-title')).toHaveText("YOU'RE IN!")
    await expect(alice.page.getByTestId('arrival-count')).toBeVisible()
    await expect(bob.page.getByTestId('arrival-count')).toBeVisible()
    // The stamp is gone and one server timestamp starts the match.
    await expect.poll(async () => readNode(request, `games/${gameId}/arriving`)).toBeNull()
    expect(typeof (await readNode(request, `games/${gameId}/startsAt`))).toBe('number')
    // Moves wait: the host's board is idle while the numbers run.
    await expect(cell(alice.page, 2, 2)).toBeDisabled()
  })

  await test.step('after 3·2·1 the first turn is playable and the board still works', async () => {
    await expect(alice.page.getByTestId('arrival-moment')).toBeHidden({ timeout: 8000 })
    await expect(bob.page.getByTestId('arrival-moment')).toBeHidden({ timeout: 8000 })
    await expect(alice.page.getByText('YOUR TURN')).toBeVisible()
    await cell(alice.page, 2, 2).click()
    await expect(cell(alice.page, 2, 2)).toHaveAccessibleName(occupiedBy('X'))
    await expect(cell(bob.page, 2, 2)).toHaveAccessibleName(occupiedBy('X'))
  })

  await test.step('a reload after the countdown does not replay it', async () => {
    await bob.page.reload()
    await expect(cell(bob.page, 2, 2)).toHaveAccessibleName(occupiedBy('X'))
    await expect(bob.page.getByTestId('arrival-moment')).toHaveCount(0)
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})

test('alone in a party: a warm-up while friends arrive, and a clear cue when one does', async ({ browser, request }) => {
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)
  let url

  await test.step('the host alone sees the waiting panel, not an empty game list', async () => {
    await onboard(alice.page, 'Alice')
    await alice.page.getByTestId('start-party').click()
    await alice.page.waitForURL(ROOM_URL)
    url = alice.page.url()
    await expect(alice.page.getByTestId('party-alone')).toContainText('WHILE YOUR FRIENDS ARRIVE')
    await expect(alice.page.getByTestId('party-progress')).toHaveText('1 OF 2 · WAITING FOR A FRIEND')
    await expect(alice.page.getByRole('button', { name: 'INVITE FRIENDS' })).toBeVisible()
    // The game list is still reachable, just tucked away.
    await expect(alice.page.getByTestId('party-group-all')).toBeHidden()
    await alice.page.getByTestId('party-browse').getByText('BROWSE GAMES ANYWAY').click()
    await expect(alice.page.getByTestId('party-group-all')).toBeVisible()
  })

  await test.step('a solo warm-up opens in a sheet without leaving the room', async () => {
    await alice.page.getByRole('button', { name: /^WARM UP SOLO/ }).click()
    const sheet = alice.page.getByRole('dialog', { name: 'Solo warm-up' })
    await expect(sheet).toBeVisible()
    await expect(alice.page).toHaveURL(url)
  })

  await test.step('a friend opens the link: the host hears about it, anonymously', async () => {
    await bob.page.goto(url)
    await expect(bob.page.getByRole('heading', { name: /YOU.RE INVITED/ })).toBeVisible()
    // The sheet covers the panel, so look at the data the panel reads.
    const gameId = url.split('/').pop()
    await expect.poll(async () => readNode(request, `games/${gameId}/arriving`)).not.toBeNull()
  })

  await test.step('the friend joins: the warm-up closes and the host is told who is here', async () => {
    await completeOnboarding(bob.page, 'Bob', 'JOIN GAME')
    await expect(alice.page.getByRole('dialog', { name: 'Solo warm-up' })).toBeHidden()
    await expect(alice.page.getByTestId('party-arrived')).toHaveText('BOB IS HERE!')
    await expect(alice.page.getByTestId('party-count')).toHaveText('2 / 4')
    await expect(alice.page.getByTestId('party-alone')).toHaveCount(0)
    await expect(alice.page.getByTestId('party-progress')).toHaveCount(0)
    await expect(alice.page.getByTestId('party-group-all')).toBeVisible()
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})
