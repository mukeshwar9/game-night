// SKETCH MATCH SETUP (S2): the lobby shows everyone one summary line; the host
// edits it in a sheet (each tap saves at once), the guest's line follows
// live, and START copies the setup into the round.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'
import { DB_ORIGIN } from './emulator.js'

const NS = 'ns=demo-game-night-default-rtdb'
const rest = (path) => fetch(`${DB_ORIGIN}/games/${path}.json?${NS}`, { headers: { Authorization: 'Bearer owner' } })

test('the host sets draws, draw time and hints; START locks them into the round', async ({ browser }) => {
  const host = await newPlayer(browser)
  const guest = await newPlayer(browser)
  await onboard(host.page, 'Ivy')
  await createRoom(host.page, 'SKETCH')
  const gameId = host.page.url().split('/').pop()
  await joinViaInvite(guest.page, host.page.url(), 'Gus')
  await expect(host.page.getByText(/^PLAYERS \(2\)/)).toBeVisible()

  await test.step('defaults: everyone sees the line, only the host can edit', async () => {
    await expect(host.page.getByTestId('sketch-setup-line')).toContainText('3 DRAWS · 75 S · 2 HINTS')
    await expect(guest.page.getByTestId('sketch-setup-line')).toContainText('3 DRAWS · 75 S · 2 HINTS')
    await expect(guest.page.getByTestId('sketch-setup-line').getByRole('button', { name: 'EDIT' })).toHaveCount(0)
  })

  await test.step('the host edits in the sheet; the guest\'s line follows', async () => {
    await host.page.getByTestId('sketch-setup-line').getByRole('button', { name: 'EDIT' }).click()
    const sheet = host.page.getByTestId('sketch-setup-sheet')
    await expect(sheet).toContainText('HOST ONLY · LOCKS AT START')
    await sheet.getByRole('group', { name: 'DRAWS EACH' }).getByRole('button', { name: '1', exact: true }).click()
    await expect(sheet).toContainText('EVERYONE DRAWS ONCE')
    await sheet.getByRole('group', { name: 'DRAW TIME' }).getByRole('button', { name: '45', exact: true }).click()
    await sheet.getByRole('group', { name: 'LETTER HINTS' }).getByRole('button', { name: '1', exact: true }).click()
    await expect(sheet).toContainText('AT HALF TIME')
    await expect(sheet.getByTestId('sketch-setup-estimate')).toHaveText('ABOUT 2 MIN WITH 2 PLAYERS')
    await sheet.getByRole('button', { name: 'DONE' }).click()
    await expect(guest.page.getByTestId('sketch-setup-line')).toContainText('1 DRAW · 45 S · 1 HINT')
  })

  await test.step('START copies the setup into the round', async () => {
    await host.page.getByRole('button', { name: 'START ROUND' }).click()
    await expect(host.page.getByText('CYCLE 1/1')).toBeVisible()
    const r = await (await rest(`${gameId}/round`)).json()
    expect({ cycles: r.cycles, drawBase: r.drawBase, hintCount: r.hintCount }).toEqual({ cycles: 1, drawBase: 45000, hintCount: 1 })
    await host.page.getByRole('button').filter({ hasText: /(EASY|MEDIUM|HARD) ·/ }).first().click()
    await expect(host.page.getByRole('timer')).toHaveAttribute('aria-label', /^(4[0-5]) seconds left$/)
  })

  expectNoPageErrors(host, guest)
  await host.context.close()
  await guest.context.close()
})
