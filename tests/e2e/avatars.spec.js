// The character avatar kit end to end: pick a look in onboarding (a premium item is
// selectable), see both players' avatars drawn in a room, and confirm that avatar
// strings saved before the redesign still render, never blank.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, newPlayer } from './helpers.js'
import { DB_ORIGIN } from './emulator.js'
import { decodeAvatar } from '../../src/lib/avatarKit/catalog.js'

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

  await test.step('Alice builds a look with a premium headwear item (open while monetization is off)', async () => {
    const { page } = alice
    await page.goto('/')
    await page.getByRole('textbox', { name: 'Your name' }).fill('Alice')
    await page.getByRole('button', { name: /^NEXT: PICK A LOOK/ }).click()
    await expect(page.getByRole('heading', { name: 'PICK YOUR LOOK' })).toBeVisible()
    await page.getByRole('tab', { name: 'STYLE' }).click()
    await page.getByRole('tab', { name: 'HEADWEAR' }).click()
    const halo = page.getByRole('radio', { name: /^HALO/ })
    // Monetization is off by default (docs/MONETIZATION.md): paid items are plain, unbadged and open.
    await expect(halo).not.toHaveAccessibleName(/PASS ITEM|locked/)
    await halo.click()
    await expect(halo).toBeChecked()
    await page.getByRole('button', { name: 'Show full body' }).click()
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

test('the pet has its own picker and saving it keeps the rest of the look', async ({ browser, request }) => {
  const player = await newPlayer(browser)
  const { page } = player

  await page.goto('/')
  await page.getByRole('textbox', { name: 'Your name' }).fill('Petra')
  await page.getByRole('button', { name: /^NEXT: PICK A LOOK/ }).click()
  await page.getByRole('button', { name: "LET'S PLAY", exact: true }).click()
  await expect(page.getByRole('heading', { name: 'PICK YOUR LOOK' })).toBeHidden()
  const me = await page.evaluate(async () => (await import('/src/lib/auth.js')).getUid())
  const before = decodeAvatar(await readNode(request, `users/${me}/avatar`))

  await test.step('the look editor has no pet tab', async () => {
    await page.goto('/profile')
    await page.getByRole('button', { name: 'EDIT AVATAR' }).click()
    const studio = page.getByRole('dialog', { name: 'EDIT AVATAR' })
    await expect(studio).toBeVisible()
    for (const group of ['FACE', 'HAIR', 'STYLE', 'SCENE']) {
      await studio.getByRole('tab', { name: group, exact: true }).click()
      await expect(studio.getByRole('tab', { name: 'PET' })).toHaveCount(0)
    }
    await studio.getByRole('button', { name: 'CANCEL' }).click()
    await expect(studio).toBeHidden()
  })

  // A new guest's seeded look sometimes already has a pet.
  const want = before.pet === 'kitten' ? { id: 'duck', label: 'DUCK' } : { id: 'kitten', label: 'KITTEN' }

  await test.step('the profile pet button opens the pet sheet, and a pet saves', async () => {
    await page.getByRole('button', { name: /^(Pick a pet|Pet: )/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Pick a pet' })
    await sheet.getByRole('radio', { name: new RegExp(`^${want.label}`) }).click()
    await sheet.getByRole('button', { name: 'SAVE', exact: true }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByRole('button', { name: new RegExp(`^Pet: ${want.label}`) })).toBeVisible()
  })

  await test.step('only the pet changed in the saved string', async () => {
    await expect.poll(async () => decodeAvatar(await readNode(request, `users/${me}/avatar`)).pet).toBe(want.id)
    const after = decodeAvatar(await readNode(request, `users/${me}/avatar`))
    expect({ ...after, pet: before.pet }).toEqual(before)
  })

  expectNoPageErrors(player)
  await player.context.close()
})
