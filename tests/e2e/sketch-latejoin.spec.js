// SKETCH join mid-match (S10), three real players: a visitor opens the link
// while a match plays, watches with a JOIN bar, joins, sits the current round
// out ("YOU'RE IN"), guesses and scores from the next round, and is added to
// the drawing order at the cycle wrap.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard, uidOf } from './helpers.js'
import { DB_ORIGIN } from './emulator.js'

const NS = 'ns=demo-game-night-default-rtdb'
const rest = (path) => fetch(`${DB_ORIGIN}/games/${path}.json?${NS}`, { headers: { Authorization: 'Bearer owner' } })
const stage = (page, phase) => page.locator(`[data-testid="sketch-stage"][data-phase="${phase}"]`)
const pick = page => page.getByRole('button').filter({ hasText: /(EASY|MEDIUM|HARD) ·/ }).first()

async function guess(page, text) {
  await page.getByRole('textbox', { name: 'Your guess' }).fill(text)
  await page.getByRole('button', { name: 'GO', exact: true }).click()
}

test('a visitor joins a match in play, guesses from the next round and draws from the next cycle', async ({ browser }) => {
  test.setTimeout(150_000)
  const ivy = await newPlayer(browser)
  const gus = await newPlayer(browser)
  const dee = await newPlayer(browser)
  let gameId = ''
  let word = ''

  await test.step('two players start a match', async () => {
    await onboard(ivy.page, 'Ivy')
    await createRoom(ivy.page, 'SKETCH')
    gameId = ivy.page.url().split('/').pop()
    await joinViaInvite(gus.page, ivy.page.url(), 'Gus')
    await expect(ivy.page.getByText(/^PLAYERS \(2\)/)).toBeVisible()
    await ivy.page.getByRole('button', { name: 'START ROUND' }).click()
    await pick(ivy.page).click()
    await expect(stage(ivy.page, 'drawing')).toBeVisible()
    word = (await ivy.page.getByTestId('sketch-word').innerText()).trim()
  })

  await test.step('a visitor opens the link mid-match: the invite says they can join as a guesser', async () => {
    await dee.page.goto(ivy.page.url())
    await expect(dee.page.getByText('MATCH IN PROGRESS — JOIN AS A GUESSER NEXT ROUND')).toBeVisible()
    await joinViaInvite(dee.page, ivy.page.url(), 'Dee')
    const bar = dee.page.getByTestId('sketch-join-bar')
    await expect(bar).toContainText('Join as a guesser — you start next round with 0 points.')
    await expect(dee.page.getByRole('textbox', { name: 'Your guess' })).toHaveCount(0)
  })

  await test.step('JOIN takes a seat; this round they watch', async () => {
    await dee.page.getByTestId('sketch-join-bar').getByRole('button', { name: 'JOIN' }).click()
    await expect(dee.page.getByTestId('sketch-late-notice')).toHaveText("YOU'RE IN · You guess from the next round and draw from cycle 2.")
    await expect(dee.page.getByRole('textbox', { name: 'Your guess' })).toHaveCount(0)
    await expect(ivy.page.getByRole('group', { name: /^Dee, 0 points, new/ })).toBeVisible()
    // Still Gus alone decides this round: his right guess ends it.
    await guess(gus.page, word)
    await expect(stage(ivy.page, 'reveal')).toBeVisible()
  })

  await test.step('next round they guess and score like anyone', async () => {
    await pick(gus.page).click({ timeout: 20_000 })
    await expect(stage(gus.page, 'drawing')).toBeVisible()
    const w = (await gus.page.getByTestId('sketch-word').innerText()).trim()
    await expect(dee.page.getByRole('textbox', { name: 'Your guess' })).toBeVisible()
    await guess(dee.page, w)
    await guess(ivy.page, w)
    await expect(stage(dee.page, 'reveal')).toBeVisible()
    const deeUid = await uidOf(dee.page)
    await expect.poll(async () => (await (await rest(`${gameId}/scores`)).json())?.[deeUid] ?? 0).toBeGreaterThan(0)
  })

  await test.step('at the cycle wrap they join the drawing order', async () => {
    const deeUid = await uidOf(dee.page)
    await expect.poll(async () => {
      const r = await (await rest(`${gameId}/round`)).json()
      return r?.cycle === 2 ? r.order : null
    }, { timeout: 20_000 }).toEqual([await uidOf(ivy.page), await uidOf(gus.page), deeUid])
    await expect(ivy.page.getByText('CYCLE 2/3')).toBeVisible()
  })

  expectNoPageErrors(ivy, gus, dee)
  for (const p of [ivy, gus, dee]) await p.context.close()
})
