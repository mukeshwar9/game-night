// Game-night mode (report 4.3): a room's `night` scoreboard adds up matches
// across game switches, a party room can drop into a 2P game with winner-stays
// seating, and the host can kick and lock. Three players finish a Herd Mind
// match (the finish is forced through the emulator's admin REST API — a real
// match is ten rounds), switch the room to Tic Tac Toe, finish that match, and
// every client's NIGHT scoreboard shows both results. Then the loser rotates
// out for the waiting player, and the host kicks and locks.
import { test, expect } from '@playwright/test'
import { completeOnboarding, createRoom, expectNoPageErrors, newPlayer, onboard } from './helpers.js'

// Same emulator + namespace as .env.emulator. `Bearer owner` is the RTDB
// emulator's admin token (bypasses rules) — used only to fast-forward matches.
const DB_URL = 'http://127.0.0.1:9000'
const NS = 'demo-game-night-default-rtdb'
const admin = { Authorization: 'Bearer owner' }

async function readRoom(request, gameId) {
  const res = await request.get(`${DB_URL}/games/${gameId}.json?ns=${NS}`, { headers: admin })
  expect(res.ok()).toBe(true)
  return res.json()
}

async function patchRoom(request, gameId, data) {
  const res = await request.patch(`${DB_URL}/games/${gameId}.json?ns=${NS}`, { headers: admin, data })
  expect(res.ok()).toBe(true)
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
    await completeOnboarding(page, name, 'JOIN GAME')
  }
  await expect(lobby).toBeVisible()
}

const cell = (page, row, col) => page.getByRole('button', { name: new RegExp(`^Row ${row}, column ${col}, `) })
const night = (page) => page.getByRole('region', { name: "Tonight's scoreboard" })

test('game night: party match, switch to a 2P game with winner stays, host kick + lock', async ({ browser, request }) => {
  test.setTimeout(240_000)
  const hana = await newPlayer(browser)
  const gus = await newPlayer(browser)
  const gia = await newPlayer(browser)
  const everyone = [hana, gus, gia]
  let roomUrl, gameId
  const uid = {}

  await test.step('three players fill a Herd Mind room and the host starts', async () => {
    await onboard(hana.page, 'Hana')
    roomUrl = await createRoom(hana.page, 'HERD MIND')
    gameId = roomUrl.split('/').pop()
    await joinNamed(gus.page, roomUrl, 'Gus')
    await joinNamed(gia.page, roomUrl, 'Gia')
    await expect(hana.page.getByText(/^PLAYERS \(3\)/)).toBeVisible()
    // Everyone sees the lobby timer setting; only the host can change it.
    await expect(hana.page.getByTestId('timer-scale').getByRole('radio', { name: 'RELAXED ×2' })).toBeEnabled()
    await expect(gus.page.getByTestId('timer-scale').getByRole('radio', { name: 'RELAXED ×2' })).toBeDisabled()
    await hana.page.getByTestId('timer-scale').getByRole('radio', { name: 'RELAXED ×2' }).click()
    await expect(gia.page.getByTestId('timer-scale')).toContainText('TIMERS · RELAXED ×2')
    await hana.page.getByRole('button', { name: 'START ROUND' }).click()
    for (const { page } of everyone) await expect(page.getByPlaceholder('YOUR ANSWER')).toBeVisible()
    const room = await readRoom(request, gameId)
    expect(room.timerScale).toBe(2)
    for (const p of Object.values(room.players)) uid[p.name] = p.playerId
  })

  await test.step('the party match finishes and lands on the night scoreboard', async () => {
    // Chat lines from two different players first: a transaction over the
    // whole room would re-validate every message (each must be `by` the
    // writer) and fail for everyone, so recording must not use one.
    await patchRoom(request, gameId, {
      chatLog: {
        m1: { by: uid.Gus, name: 'Gus', text: 'gg', ts: Date.now() },
        m2: { by: uid.Gia, name: 'Gia', text: 'rematch', ts: Date.now() },
      },
    })
    await patchRoom(request, gameId, {
      status: 'finished',
      winner: uid.Hana,
      scores: { [uid.Hana]: 5, [uid.Gus]: 3, [uid.Gia]: 1 },
    })
    for (const { page } of everyone) {
      await expect(night(page)).toContainText('1 GAME PLAYED')
      await expect(night(page).getByRole('listitem').first()).toContainText('Hana')
      await expect(night(page).getByRole('listitem').first()).toContainText('3 PTS')
    }
    const room = await readRoom(request, gameId)
    expect(Object.keys(room.night.history)).toHaveLength(1)
    expect(room.night.standings[uid.Gus].points).toBe(2)
  })

  await test.step('the host switches the party room to Tic Tac Toe: top two sit, the third queues', async () => {
    await hana.page.getByRole('button', { name: 'Switch game', exact: true }).click()
    const sheet = hana.page.getByRole('dialog', { name: 'Play another game' })
    await sheet.getByRole('button', { name: /^BOARD\b/ }).click()
    await sheet.getByRole('button', { name: /^TIC TAC TOE\b/ }).first().click()
    await expect(hana.page.getByText('YOUR TURN')).toBeVisible()
    await expect(gus.page.getByText("HANA'S TURN")).toBeVisible()
    for (const { page } of everyone) await expect(page.getByTestId('night-queue')).toContainText('Gia')
    const room = await readRoom(request, gameId)
    expect(room.players.X.playerId).toBe(uid.Hana)
    expect(room.players.O.playerId).toBe(uid.Gus)
    expect(Object.keys(room.queue)).toEqual([uid.Gia])
    // The night survived the switch.
    expect(Object.keys(room.night.history)).toHaveLength(1)
  })

  await test.step('X takes the match (one round from match point) and both results show', async () => {
    await patchRoom(request, gameId, { scores: { X: 2, O: 0 } })
    const moves = [[hana, 2, 2], [gus, 1, 1], [hana, 1, 2], [gus, 1, 3], [hana, 3, 2]]
    for (const [mover, row, col] of moves) {
      await expect(mover.page.getByText('YOUR TURN')).toBeVisible()
      await cell(mover.page, row, col).click()
    }
    for (const { page } of everyone) {
      await expect(night(page)).toContainText('2 GAMES PLAYED')
      await expect(night(page)).toContainText('HERD MIND')
      await expect(night(page)).toContainText('TIC TAC TOE')
      await expect(night(page).getByRole('listitem').first()).toContainText('6 PTS')
    }
    const room = await readRoom(request, gameId)
    expect(room.night.standings[uid.Hana]).toMatchObject({ points: 6, wins: 2, played: 2 })
    expect(room.night.standings[uid.Gus]).toMatchObject({ points: 2, wins: 0, played: 2 })
  })

  await test.step('NEW MATCH: winner stays, the loser swaps out for the queue', async () => {
    await hana.page.getByRole('button', { name: 'NEW MATCH' }).click()
    await gus.page.getByRole('button', { name: 'ACCEPT' }).click()
    await expect(gia.page.getByText('YOUR TURN')).toBeVisible()
    await expect(hana.page.getByText("GIA'S TURN")).toBeVisible()
    for (const { page } of everyone) await expect(page.getByTestId('night-queue')).toContainText('Gus')
    const room = await readRoom(request, gameId)
    expect(room.players.X.playerId).toBe(uid.Hana)
    expect(room.players.O.playerId).toBe(uid.Gia)
    expect(Object.keys(room.queue)).toEqual([uid.Gus])
    expect(room.scores).toEqual({ X: 0, O: 0 })
  })

  await test.step('the host kicks the queued player and locks the room', async () => {
    await hana.page.getByRole('button', { name: /^HOST CONTROLS/ }).click()
    const controls = hana.page.getByTestId('host-controls')
    await controls.getByRole('button', { name: 'Remove Gus' }).click()
    await hana.page.getByRole('dialog', { name: 'REMOVE GUS?' }).getByRole('button', { name: 'REMOVE' }).click()
    await expect(gus.page.getByText("YOU'RE SPECTATING THIS MATCH.")).toBeVisible()
    await expect(gus.page.getByRole('button', { name: 'JOIN THE LINE' })).toHaveCount(0)
    await expect(gia.page.getByTestId('night-queue')).toContainText('NOBODY WAITING')

    await controls.getByRole('button', { name: 'LOCK ROOM' }).click()
    await hana.page.getByRole('dialog', { name: 'LOCK ROOM?' }).getByRole('button', { name: 'LOCK' }).click()
    for (const { page } of everyone) await expect(page.getByText('ROOM LOCKED · NO NEW SEATS')).toBeVisible()
    const room = await readRoom(request, gameId)
    expect(room.locked).toBe(true)
    expect(room.kicked[uid.Gus]).toBe(true)
    expect(room.queue ?? null).toBeNull()
  })

  await test.step('a newcomer to the locked room can watch but not queue', async () => {
    const dee = await newPlayer(browser)
    await onboard(dee.page, 'Dee')
    await dee.page.goto(roomUrl)
    const invited = dee.page.getByRole('heading', { name: /YOU.RE INVITED/ })
    await expect(invited.or(dee.page.getByTestId('night-queue'))).toBeVisible()
    if (await invited.isVisible()) {
      await completeOnboarding(dee.page, 'Dee', 'JOIN GAME')
    }
    await expect(dee.page.getByTestId('night-queue')).toBeVisible()
    await expect(dee.page.getByText('ROOM LOCKED · NO NEW SEATS')).toBeVisible()
    await expect(dee.page.getByRole('button', { name: 'JOIN THE LINE' })).toHaveCount(0)
    const room = await readRoom(request, gameId)
    expect(Object.values(room.players).map(p => p.playerId)).not.toContain(undefined)
    expect(room.queue ?? null).toBeNull()
    expectNoPageErrors(dee)
    await dee.context.close()
  })

  expectNoPageErrors(...everyone)
  for (const { context } of everyone) await context.close()
})
