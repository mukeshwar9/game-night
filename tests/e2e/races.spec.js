// N-player race smoke tests: three distinct anonymous players race the same
// Reaction Time and Typing Race rounds and all see one identical ranking; a
// two-player room still plays and rematches (PLAY AGAIN = both ready up).
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

test.describe.configure({ timeout: 180_000 })

const ROUNDS = 4

// Ready-up from the lobby: every seated player taps READY; the last tap starts
// the race.
async function everyoneReady(players) {
  for (const { page } of players) {
    await page.getByRole('button', { name: 'READY', exact: true }).click()
    await expect(page.getByRole('button', { name: '✓ READY' })).toBeVisible()
      .catch(() => { /* the last tap starts the race straight away */ })
  }
}

// Plays every tap-round of Reaction Time: wait for GREEN, then tap. (The
// last racer's final tap ends the round at once, so there's no stable
// "ALL DONE!" to wait for — callers wait for the results list instead.)
async function playReaction(page) {
  for (let i = 0; i < ROUNDS; i++) {
    await page.getByRole('button', { name: 'Tap to start the next round' }).click()
    await page.getByRole('button', { name: 'Tap now' }).click({ timeout: 10_000 })
  }
}

async function resultOrder(page) {
  const list = page.getByRole('list', { name: 'Race results' })
  await expect(list).toBeVisible({ timeout: 30_000 })
  return list.getByRole('listitem').evaluateAll(items => items.map(li => li.getAttribute('aria-label')))
}

async function joinRoom(player, url, name) {
  if (name) await joinViaInvite(player.page, url, name)
  else await player.page.goto(url)
}

test('three players race Reaction Time and Typing Race and see the same ranking', async ({ browser }) => {
  const host = await newPlayer(browser)
  const guests = [await newPlayer(browser), await newPlayer(browser)]
  const everyone = [host, ...guests]

  await test.step('host creates a Reaction Time room; two guests join', async () => {
    await onboard(host.page, 'Hana')
    await createRoom(host.page, 'REACTION TIME')
    await expect(host.page.getByText(/^PLAYERS \(1\)/)).toBeVisible()
    await expect(host.page.getByText(/NEED 2\+ PLAYERS/)).toBeVisible()
    await joinRoom(guests[0], host.page.url(), 'Gus')
    await joinRoom(guests[1], host.page.url(), 'Gia')
    for (const { page } of everyone) {
      await expect(page.getByText(/^PLAYERS \(3\)/)).toBeVisible()
    }
  })

  await test.step('everyone readies up and races the same waits', async () => {
    await everyoneReady(everyone)
    for (const { page } of everyone) {
      await expect(page.getByText('LIVE', { exact: true })).toBeVisible()
    }
    await Promise.all(everyone.map(({ page }) => playReaction(page)))
  })

  await test.step('all three see one identical 3-racer ranking', async () => {
    const orders = await Promise.all(everyone.map(({ page }) => resultOrder(page)))
    expect(orders[0]).toHaveLength(3)
    // Labels differ only by the "(you)" marker.
    const strip = (o) => o.map(l => l.replace(' (you)', ''))
    expect(strip(orders[1])).toEqual(strip(orders[0]))
    expect(strip(orders[2])).toEqual(strip(orders[0]))
    // Equal times share a place ("=1ST"), which automated taps can produce.
    expect(orders[0][0]).toMatch(/^=?1ST /)
  })

  let typingUrl
  await test.step('host opens a Typing Race room; the same three join', async () => {
    await host.page.goto('/')
    typingUrl = await createRoom(host.page, 'TYPING RACE')
    for (const g of guests) await joinRoom(g, typingUrl)
    for (const { page } of everyone) {
      await expect(page.getByText(/^PLAYERS \(3\)/)).toBeVisible()
    }
  })

  await test.step('the host starts; everyone types the same passage', async () => {
    await host.page.getByRole('button', { name: 'START NOW' }).click()
    const passages = await Promise.all(everyone.map(async ({ page }) => {
      const p = page.getByTestId('typing-passage')
      await expect(p).toBeVisible({ timeout: 10_000 })
      return p.textContent()
    }))
    expect(passages[1]).toBe(passages[0])
    expect(passages[2]).toBe(passages[0])
    await Promise.all(everyone.map(({ page }, i) =>
      page.keyboard.type(passages[0], { delay: 15 + i * 10 })))
  })

  await test.step('all three see one identical typing ranking', async () => {
    const orders = await Promise.all(everyone.map(({ page }) => resultOrder(page)))
    const strip = (o) => o.map(l => l.replace(' (you)', ''))
    expect(orders[0]).toHaveLength(3)
    expect(strip(orders[1])).toEqual(strip(orders[0]))
    expect(strip(orders[2])).toEqual(strip(orders[0]))
  })

  expectNoPageErrors(...everyone)
  for (const { context } of everyone) await context.close()
})

test('a two-player race room plays and rematches by mutual PLAY AGAIN', async ({ browser }) => {
  const a = await newPlayer(browser)
  const b = await newPlayer(browser)

  await onboard(a.page, 'Ana')
  await createRoom(a.page, 'REACTION TIME')
  await joinRoom(b, a.page.url(), 'Ben')
  for (const { page } of [a, b]) await expect(page.getByText(/^PLAYERS \(2\)/)).toBeVisible()

  await everyoneReady([a, b])
  await Promise.all([a, b].map(({ page }) => playReaction(page)))
  const orders = await Promise.all([a, b].map(({ page }) => resultOrder(page)))
  expect(orders[0]).toHaveLength(2)
  expect(orders[1].map(l => l.replace(' (you)', ''))).toEqual(orders[0].map(l => l.replace(' (you)', '')))

  // A proposes the rematch; B sees it and accepts; the next round starts.
  await a.page.getByRole('button', { name: /^PLAY AGAIN/ }).click()
  await expect(b.page.getByText(/ANA WANTS A REMATCH/)).toBeVisible()
  await b.page.getByRole('button', { name: /^PLAY AGAIN/ }).click()
  for (const { page } of [a, b]) {
    await expect(page.getByRole('button', { name: 'Tap to start the next round' })).toBeVisible({ timeout: 10_000 })
  }

  expectNoPageErrors(a, b)
  await a.context.close()
  await b.context.close()
})
