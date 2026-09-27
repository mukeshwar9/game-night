// Host-owned race setup: the coordinator's Typing Race quote options and
// Mental Math operations/duration/difficulty are written to the room while it
// is waiting, both racers see the same locked summary, and the round starts
// with identical shared content.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

test.describe.configure({ timeout: 180_000 })

test('the host locks the shared Typing Race quote setup for every racer', async ({ browser }) => {
  const host = await newPlayer(browser)
  const guest = await newPlayer(browser)

  await onboard(host.page, 'Hana')
  const url = await createRoom(host.page, 'TYPING RACE')
  await joinViaInvite(guest.page, url, 'Gus')
  for (const { page } of [host, guest]) await expect(page.getByText(/^PLAYERS \(2\)/)).toBeVisible()

  await test.step('the host picks a short quoted passage with punctuation', async () => {
    await host.page.getByRole('button', { name: 'Short' }).click()
    await host.page.getByRole('button', { name: /^Punctuation/ }).click()
    // The guest's panel follows the same room config (it is not editable).
    await expect(guest.page.getByRole('button', { name: 'Short' })).toHaveAttribute('aria-pressed', 'true')
    await expect(guest.page.getByRole('button', { name: /^Punctuation/ })).toHaveAttribute('aria-pressed', 'true')
  })

  await test.step('both racers see the locked config and the exact same quote', async () => {
    await host.page.getByRole('button', { name: 'START NOW' }).click()
    const passages = await Promise.all([host.page, guest.page].map(async page => {
      await expect(page.getByText(/SHORT QUOTE · PUNCTUATION ON/)).toBeVisible({ timeout: 10_000 })
      const p = page.getByTestId('typing-passage')
      await expect(p).toBeVisible()
      return p.textContent()
    }))
    expect(passages[1]).toBe(passages[0])
    expect(passages[0]).toMatch(/[.,!?]/)

    await Promise.all([host.page, guest.page].map(page => page.getByTestId('typing-input').click()))
    await Promise.all([host.page, guest.page].map(page => page.keyboard.type(passages[0])))
    await expect(host.page.getByRole('list', { name: 'Race results' })).toBeVisible({ timeout: 30_000 })
  })

  expectNoPageErrors(host, guest)
  await host.context.close()
  await guest.context.close()
})

test('the host locks the shared Mental Math operations, duration and difficulty', async ({ browser }) => {
  const host = await newPlayer(browser)
  const guest = await newPlayer(browser)

  await onboard(host.page, 'Ivy')
  const url = await createRoom(host.page, 'MENTAL MATH')
  await joinViaInvite(guest.page, url, 'Jon')
  for (const { page } of [host, guest]) await expect(page.getByText(/^PLAYERS \(2\)/)).toBeVisible()

  await test.step('the host picks 60 seconds and hard difficulty', async () => {
    await host.page.getByRole('button', { name: '60 seconds' }).click()
    await host.page.getByRole('button', { name: 'Hard' }).click()
    await expect(guest.page.getByRole('button', { name: '60 seconds' })).toHaveAttribute('aria-pressed', 'true')
    await expect(guest.page.getByRole('button', { name: 'Hard' })).toHaveAttribute('aria-pressed', 'true')
  })

  await test.step('both racers see the locked config and the same first question', async () => {
    await host.page.getByRole('button', { name: 'START NOW' }).click()
    const questions = await Promise.all([host.page, guest.page].map(async page => {
      await expect(page.getByText(/60s · HARD · 1–99/)).toBeVisible({ timeout: 10_000 })
      const q = page.getByTestId('math-question')
      await expect(q).toBeVisible()
      return q.textContent()
    }))
    expect(questions[1]).toBe(questions[0])
  })

  expectNoPageErrors(host, guest)
  await host.context.close()
  await guest.context.close()
})
