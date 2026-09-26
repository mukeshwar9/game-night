// Herd Mind commit-reveal (README #2): three players answer; while the answer
// window is open the room node holds only salted commitments — no plaintext —
// and once everyone is locked in the answers are revealed, verified against
// their commitments and scored for everyone.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, newPlayer, onboard } from './helpers.js'

// Same emulator + namespace as .env.emulator. `Bearer owner` is the RTDB
// emulator's admin token, so the spec can read the raw node like a snooper.
const DB_URL = 'http://127.0.0.1:9000'
const NS = 'demo-game-night-default-rtdb'

async function readRound(request, roomUrl) {
  const gameId = roomUrl.split('/').pop()
  const res = await request.get(`${DB_URL}/games/${gameId}/round.json?ns=${NS}`, {
    headers: { Authorization: 'Bearer owner' },
  })
  expect(res.ok()).toBe(true)
  return res.json()
}

// Onboard with a name first, then open the invite: works whether the room shows
// the YOU'RE INVITED name prompt or seats a named visitor straight away.
async function joinNamed(page, roomUrl, name) {
  await onboard(page, name)
  await page.goto(roomUrl)
  const invited = page.getByRole('heading', { name: /YOU.RE INVITED/ })
  const lobby = page.getByText(/^PLAYERS \(\d\)/)
  await expect(invited.or(lobby)).toBeVisible()
  if (await invited.isVisible()) {
    await page.getByRole('textbox', { name: 'Your name' }).fill(name)
    await page.getByRole('button', { name: 'JOIN GAME' }).click()
  }
  await expect(lobby).toBeVisible()
}

// The last answer can flip the room straight to the reveal, so "locked in"
// also accepts the reveal header.
async function answer(page, text) {
  await page.getByPlaceholder('YOUR ANSWER').fill(text)
  await page.getByRole('button', { name: 'LOCK IT IN' }).click()
  await expect(page.getByText(/^LOCKED IN ✓/).or(page.getByText('THE HERD SAID'))).toBeVisible()
}

test('Herd Mind hides answers until the reveal, then verifies and scores them', async ({ browser, request }) => {
  const host = await newPlayer(browser)
  const guests = [await newPlayer(browser), await newPlayer(browser)]
  const everyone = [host, ...guests]
  let roomUrl

  await test.step('three players fill the room and the host starts', async () => {
    await onboard(host.page, 'Hana')
    roomUrl = await createRoom(host.page, 'HERD MIND')
    await joinNamed(guests[0].page, roomUrl, 'Gus')
    await joinNamed(guests[1].page, roomUrl, 'Gia')
    await expect(host.page.getByText(/^PLAYERS \(3\)/)).toBeVisible()
    await host.page.getByRole('button', { name: 'START ROUND' }).click()
    for (const { page } of everyone) {
      await expect(page.getByPlaceholder('YOUR ANSWER')).toBeVisible()
    }
  })

  await test.step('locked-in answers are commitments only — no plaintext in the room', async () => {
    await answer(host.page, 'Pizza')
    await answer(guests[0].page, 'pizzas')
    await expect(host.page.getByText('2/3 ANSWERED…')).toBeVisible()

    const round = await readRound(request, roomUrl)
    expect(round.phase).toBe('answering')
    const answers = Object.values(round.answers || {})
    expect(answers).toHaveLength(2)
    for (const a of answers) expect(Object.keys(a)).toEqual(['commit'])
    expect(round.reveals ?? null).toBeNull()
    expect(JSON.stringify(round).toLowerCase()).not.toContain('pizza')
  })

  await test.step('the last answer closes the window; everyone sees the verified tally', async () => {
    await answer(guests[1].page, 'Sushi')
    for (const { page } of everyone) {
      await expect(page.getByText('THE HERD SAID')).toBeVisible()
      await expect(page.getByText('+1 EACH')).toBeVisible()
      await expect(page.getByText('pizza', { exact: true })).toBeVisible()
      await expect(page.getByText('GIA MATCHED NOBODY')).toBeVisible()
    }
    const round = await readRound(request, roomUrl)
    expect(round.phase).toBe('reveal')
    expect(round.scored).toBe(true)
    expect(Object.values(round.tally).sort()).toEqual(['Pizza', 'Sushi', 'pizzas'])
    expect(round.cheats ?? null).toBeNull()
  })

  await test.step('any player moves on to the next prompt', async () => {
    await guests[1].page.getByRole('button', { name: 'NEXT PROMPT' }).click()
    for (const { page } of everyone) {
      await expect(page.getByText('NAME IT LIKE THE HERD')).toBeVisible()
      await expect(page.getByPlaceholder('YOUR ANSWER')).toBeVisible()
    }
  })

  expectNoPageErrors(...everyone)
  for (const { context } of everyone) await context.close()
})
