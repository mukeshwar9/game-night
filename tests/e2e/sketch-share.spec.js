// SKETCH sharing at the end of a match (S4): each drawing has SHARE, the
// gallery has SHARE ALL with PICTURES (collage PNGs) or a PDF. A browser that
// can share files gets them in the system share sheet (stubbed here: the real
// sheet with WhatsApp in it needs a phone); one that can't downloads them and
// offers SEND ON WHATSAPP (a wa.me link with the caption).
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard, uidOf } from './helpers.js'
import { DB_ORIGIN } from './emulator.js'

const NS = 'ns=demo-game-night-default-rtdb'
const rest = (path, init = {}) => fetch(`${DB_ORIGIN}/games/${path}.json?${NS}`, { ...init, headers: { Authorization: 'Bearer owner' } })
const stage = (page, phase) => page.locator(`[data-testid="sketch-stage"][data-phase="${phase}"]`)

// Records what the page hands to navigator.share instead of opening a sheet.
const stubShare = () => {
  window.__shared = []
  navigator.canShare = (data) => Array.isArray(data?.files) && data.files.length > 0
  navigator.share = async (data) => {
    window.__shared.push({ text: data.text, files: (data.files || []).map(f => ({ name: f.name, type: f.type, size: f.size })) })
  }
}

test('a finished match\'s drawings can be shared one at a time or all together', async ({ browser }) => {
  test.setTimeout(120_000)
  const ivy = await newPlayer(browser, { acceptDownloads: true })
  const gus = await newPlayer(browser)
  await gus.context.addInitScript(stubShare)
  let gameId = ''
  let word = ''

  await test.step('a one-drawing match: Ivy draws, Gus guesses, the match ends', async () => {
    await onboard(ivy.page, 'Ivy')
    await createRoom(ivy.page, 'SKETCH')
    gameId = ivy.page.url().split('/').pop()
    await joinViaInvite(gus.page, ivy.page.url(), 'Gus')
    await expect(ivy.page.getByText(/^PLAYERS \(2\)/)).toBeVisible()
    await ivy.page.getByRole('button', { name: 'START ROUND' }).click()
    const option = ivy.page.getByRole('button').filter({ hasText: /(EASY|MEDIUM|HARD) ·/ }).first()
    await expect(option).toBeVisible()
    // Test data only: this is the match's last drawing.
    const [ivyUid, gusUid] = [await uidOf(ivy.page), await uidOf(gus.page)]
    expect((await rest(`${gameId}/round`, { method: 'PATCH', body: JSON.stringify({ cycle: 3, order: [gusUid, ivyUid] }) })).ok).toBe(true)
    await expect(ivy.page.getByText('CYCLE 3/3')).toBeVisible()
    await option.click()
    await expect(stage(ivy.page, 'drawing')).toBeVisible()
    word = (await ivy.page.getByTestId('sketch-word').innerText()).trim()
    const box = await ivy.page.getByTestId('sketch-canvas').boundingBox()
    await ivy.page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3)
    await ivy.page.mouse.down()
    await ivy.page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 10 })
    await ivy.page.mouse.up()
    await expect(gus.page.locator('[data-testid="sketch-canvas"] polyline').first()).toBeVisible()
    await gus.page.getByRole('textbox', { name: 'Your guess' }).fill(word)
    await gus.page.getByRole('button', { name: 'GO', exact: true }).click()
    for (const p of [ivy, gus]) await expect(p.page.getByTestId('sketch-gallery')).toBeVisible({ timeout: 20_000 })
    await expect(ivy.page.getByTestId('sketch-gallery')).toContainText('THEY STAY ON THIS PHONE UNTIL YOU CLOSE THE TAB')
    // One drawing: SHARE on the card, no SHARE ALL.
    await expect(ivy.page.getByRole('button', { name: /^SHARE ALL/ })).toHaveCount(0)
  })

  await test.step('with file sharing, SHARE hands one PNG and its caption to the share sheet', async () => {
    await gus.page.getByTestId('sketch-gallery-card').getByRole('button', { name: 'SHARE', exact: true }).click()
    await expect.poll(() => gus.page.evaluate(() => window.__shared.length)).toBe(1)
    const [shared] = await gus.page.evaluate(() => window.__shared)
    expect(shared.files).toHaveLength(1)
    expect(shared.files[0].type).toBe('image/png')
    expect(shared.files[0].size).toBeGreaterThan(5000)
    expect(shared.text).toContain(`"${word.toUpperCase()}" BY IVY — DRAWN IN SKETCH ON GAME NIGHT. PLAY: `)
    expect(shared.text).toContain('/play/sketch')
  })

  await test.step('without file sharing, SHARE downloads the PNG and offers SEND ON WHATSAPP', async () => {
    const download = ivy.page.waitForEvent('download')
    await ivy.page.getByTestId('sketch-gallery-card').getByRole('button', { name: 'SHARE', exact: true }).click()
    expect((await download).suggestedFilename()).toMatch(/^sketch-.+\.png$/)
    const viewer = ivy.page.getByTestId('sketch-viewer')
    await expect(viewer.getByTestId('sketch-share-saved')).toBeVisible()
    const wa = viewer.getByRole('link', { name: 'SEND ON WHATSAPP' })
    expect(await wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=%22/)
  })

  await test.step('the viewer can leave the name off and replay the drawing', async () => {
    const viewer = ivy.page.getByTestId('sketch-viewer')
    await viewer.getByRole('checkbox', { name: /PUT IVY'S NAME ON THE IMAGE/ }).uncheck()
    await viewer.getByRole('button', { name: 'REPLAY' }).click()
    await expect(viewer.locator('polyline').first()).toBeVisible({ timeout: 6_000 })
    const download = ivy.page.waitForEvent('download')
    await viewer.getByRole('button', { name: 'SHARE', exact: true }).click()
    await download
    expect(await viewer.getByRole('link', { name: 'SEND ON WHATSAPP' }).getAttribute('href')).not.toContain('BY%20IVY')
    await viewer.getByRole('button', { name: 'CLOSE' }).click()
    await expect(viewer).toBeHidden()
  })

  expectNoPageErrors(ivy, gus)
  for (const p of [ivy, gus]) await p.context.close()
})

test('SHARE ALL makes collage pictures or a PDF of every drawing', async ({ browser }) => {
  test.setTimeout(150_000)
  const ivy = await newPlayer(browser, { acceptDownloads: true })
  const gus = await newPlayer(browser)
  await gus.context.addInitScript(stubShare)
  let gameId = ''

  await test.step('a two-drawing match', async () => {
    await onboard(ivy.page, 'Ivy')
    await createRoom(ivy.page, 'SKETCH')
    gameId = ivy.page.url().split('/').pop()
    await joinViaInvite(gus.page, ivy.page.url(), 'Gus')
    await expect(ivy.page.getByText(/^PLAYERS \(2\)/)).toBeVisible()
    await ivy.page.getByRole('button', { name: 'START ROUND' }).click()
    const option = ivy.page.getByRole('button').filter({ hasText: /(EASY|MEDIUM|HARD) ·/ }).first()
    await expect(option).toBeVisible()
    // Test data only: start at the last cycle, so the match is two drawings.
    expect((await rest(`${gameId}/round`, { method: 'PATCH', body: JSON.stringify({ cycle: 3 }) })).ok).toBe(true)
    await expect(ivy.page.getByText('CYCLE 3/3')).toBeVisible()
    const draws = [[ivy, gus], [gus, ivy]]
    for (let i = 0; i < draws.length; i++) {
      const [artist, guesser] = draws[i]
      if (i > 0) await artist.page.getByRole('button').filter({ hasText: /(EASY|MEDIUM|HARD) ·/ }).first().click({ timeout: 20_000 })
      else await option.click()
      await expect(stage(artist.page, 'drawing')).toBeVisible()
      const w = (await artist.page.getByTestId('sketch-word').innerText()).trim()
      const box = await artist.page.getByTestId('sketch-canvas').boundingBox()
      await artist.page.mouse.move(box.x + box.width * (0.2 + i * 0.2), box.y + box.height * 0.2)
      await artist.page.mouse.down()
      await artist.page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.8, { steps: 10 })
      await artist.page.mouse.up()
      await expect(guesser.page.locator('[data-testid="sketch-canvas"] polyline').first()).toBeVisible()
      await guesser.page.getByRole('textbox', { name: 'Your guess' }).fill(w)
      await guesser.page.getByRole('button', { name: 'GO', exact: true }).click()
      await expect(stage(guesser.page, 'reveal')).toBeVisible()
    }
    for (const p of [ivy, gus]) await expect(p.page.getByTestId('sketch-gallery-card')).toHaveCount(2, { timeout: 20_000 })
  })

  await test.step('PICTURES: one collage image in the share sheet', async () => {
    await gus.page.getByRole('button', { name: 'SHARE ALL 2' }).click()
    const sheet = gus.page.getByTestId('sketch-share-all')
    await expect(sheet).toContainText('2 DRAWINGS ON THIS PHONE')
    await expect(sheet).toContainText('ALL 2 DRAWINGS ON ONE IMAGE')
    await sheet.getByRole('button', { name: /^SHARE( NOW)?$/ }).click()
    // A slow make asks for one more tap so the browser still allows the sheet.
    const now = sheet.getByRole('button', { name: 'SHARE NOW' })
    if (await now.isVisible().catch(() => false)) await now.click()
    await expect.poll(() => gus.page.evaluate(() => window.__shared.length)).toBe(1)
    const [shared] = await gus.page.evaluate(() => window.__shared)
    expect(shared.files.map(f => f.type)).toEqual(['image/png'])
    expect(shared.text).toContain('2 DRAWINGS FROM OUR SKETCH MATCH ON GAME NIGHT')
    await sheet.getByRole('button', { name: 'CLOSE' }).click()
  })

  await test.step('PDF without file sharing: a real PDF downloads, with WhatsApp offered', async () => {
    await ivy.page.getByRole('button', { name: 'SHARE ALL 2' }).click()
    const sheet = ivy.page.getByTestId('sketch-share-all')
    await sheet.getByRole('button', { name: /^PDF/ }).click()
    const download = ivy.page.waitForEvent('download')
    await sheet.getByRole('button', { name: /^SHARE( NOW)?$/ }).click()
    const now = sheet.getByRole('button', { name: 'SHARE NOW' })
    if (await now.isVisible().catch(() => false)) await now.click()
    const file = await download
    expect(file.suggestedFilename()).toBe('sketch-drawings.pdf')
    const { readFile } = await import('node:fs/promises')
    const bytes = await readFile(await file.path())
    expect(bytes.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4')
    expect(bytes.subarray(-6).toString('latin1')).toBe('%%EOF\n')
    expect(bytes.toString('latin1').match(/\/Type \/Page /g)).toHaveLength(3) // cover + 2 drawings
    await expect(sheet.getByTestId('sketch-share-saved')).toBeVisible()
  })

  expectNoPageErrors(ivy, gus)
  for (const p of [ivy, gus]) await p.context.close()
})
