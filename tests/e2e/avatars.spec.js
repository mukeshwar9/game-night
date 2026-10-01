// The character avatar kit end to end: pick a look in onboarding (a premium item is
// selectable), see both players' avatars drawn in a room, and confirm that avatar
// strings saved before the redesign still render, never blank.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, newPlayer } from './helpers.js'
import { DB_ORIGIN } from './emulator.js'

const NS = 'demo-game-night-default-rtdb'
const headers = { Authorization: 'Bearer owner' }

async function readNode(request, path) {
  const res = await request.get(`${DB_ORIGIN}/${path}.json?ns=${NS}`, { headers })
  expect(res.ok()).toBe(true)
  return res.json()
}

// A drawn avatar is a canvas with painted pixels, or an SVG for the classic critters.
async function paintedCanvases(page) {
  return page.evaluate(() => [...document.querySelectorAll('canvas[aria-label="avatar"]')].map((c) => {
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let painted = 0
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted++
    return { painted, total: c.width * c.height, width: c.width, cssWidth: c.getBoundingClientRect().width }
  }))
}

test('players pick a character, a premium item is selectable, and rooms draw both avatars', async ({ browser, request }) => {
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)
  let roomUrl

  await test.step('Alice builds a look with a PASS headwear item', async () => {
    const { page } = alice
    await page.goto('/')
    await page.getByRole('textbox', { name: 'Your name' }).fill('Alice')
    await page.getByRole('button', { name: /^NEXT: PICK A LOOK/ }).click()
    await expect(page.getByRole('heading', { name: 'PICK YOUR LOOK' })).toBeVisible()
    await page.getByRole('tab', { name: 'HEADWEAR' }).click()
    const halo = page.getByRole('radio', { name: /^HALO/ })
    await expect(halo).toHaveAccessibleName(/PASS ITEM/)
    await halo.click()
    await expect(halo).toBeChecked()
    await page.getByRole('radio', { name: 'FULL BODY' }).click()
    await page.getByRole('button', { name: "LET'S PLAY", exact: true }).click()
    await expect(page.getByRole('heading', { name: 'PICK YOUR LOOK' })).toBeHidden()
    roomUrl = await createRoom(page, 'CONNECT FOUR')
  })

  await test.step('Bob shuffles his look and joins', async () => {
    const { page } = bob
    await page.goto(roomUrl)
    await page.getByRole('textbox', { name: 'Your name' }).fill('Bobby')
    await page.getByRole('button', { name: /^NEXT: PICK A LOOK/ }).click()
    await page.getByRole('button', { name: /^Shuffle/ }).click()
    await page.getByRole('button', { name: 'JOIN GAME', exact: true }).click()
    await expect(page.getByRole('heading', { name: /YOU.RE INVITED/ })).toBeHidden()
    await expect(alice.page.getByText('Bobby', { exact: true })).toBeVisible()
  })

  const gameId = roomUrl.split('/').pop()

  await test.step('both seats store a compact kit string and Alice kept her halo', async () => {
    const x = await readNode(request, `games/${gameId}/players/X/avatar`)
    const o = await readNode(request, `games/${gameId}/players/O/avatar`)
    expect(x).toMatch(/^K1[0-9a-z]{23}$/)
    expect(o).toMatch(/^K1[0-9a-z]{23}$/)
    expect(x).not.toBe(o)
    const uid = await readNode(request, `games/${gameId}/players/X/playerId`)
    expect(await readNode(request, `users/${uid}/avatar`)).toBe(x)
  })

  await test.step('each page draws both avatars, on whole-pixel sizes, with ink on them', async () => {
    for (const { page } of [alice, bob]) {
      await expect.poll(async () => (await paintedCanvases(page)).filter((c) => c.painted > c.total * 0.4).length).toBeGreaterThanOrEqual(2)
      for (const c of await paintedCanvases(page)) expect([24, 48, 72, 96]).toContain(Math.round(c.cssWidth))
    }
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})

test('avatars saved before the redesign still render', async ({ browser, request }) => {
  const alice = await newPlayer(browser)
  const { page } = alice
  const legacyPerson = 'girl.cta-p2-dim-text-s2-curly-av4-crown'

  await test.step('a returning player has an old person avatar', async () => {
    await page.goto('/')
    await page.getByRole('textbox', { name: 'Your name' }).fill('Oldie')
    await page.getByRole('button', { name: /^NEXT: PICK A LOOK/ }).click()
    await page.getByRole('button', { name: "LET'S PLAY", exact: true }).click()
    await expect(page.getByRole('heading', { name: 'PICK YOUR LOOK' })).toBeHidden()
  })

  await test.step('the profile draws the migrated person as a character, not a blank', async () => {
    const me = await page.evaluate(async () => (await import('/src/lib/auth.js')).getUid())
    for (const p of ['users', 'profiles']) {
      const res = await request.put(`${DB_ORIGIN}/${p}/${me}/avatar.json?ns=${NS}`, { headers, data: JSON.stringify(legacyPerson) })
      expect(res.ok()).toBe(true)
    }
    await page.evaluate((id) => localStorage.setItem('playerAvatar', id), legacyPerson)
    await page.goto('/profile')
    await expect.poll(async () => (await paintedCanvases(page)).some((c) => c.painted > c.total * 0.4)).toBe(true)
  })

  await test.step('a classic critter keeps its sprite', async () => {
    const me = await page.evaluate(async () => (await import('/src/lib/auth.js')).getUid())
    for (const p of ['users', 'profiles']) {
      const res = await request.put(`${DB_ORIGIN}/${p}/${me}/avatar.json?ns=${NS}`, { headers, data: JSON.stringify('ghost.p2') })
      expect(res.ok()).toBe(true)
    }
    await page.evaluate(() => localStorage.setItem('playerAvatar', 'ghost.p2'))
    await page.reload()
    await expect(page.getByRole('img', { name: 'ghost avatar' }).first()).toBeVisible()
  })

  expectNoPageErrors(alice)
  await alice.context.close()
})
