// Code Words: four players split into two teams, the ALPHA spymaster gives a
// clue from the secret key only spymasters can see, and the ALPHA guesser
// uncovers all nine agents for the win. Also checks the key never sits in
// the room node in plaintext while the board is live.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

// Reads the room straight from the Database emulator ("owner" bypasses rules).
async function readRoom(roomUrl) {
  const id = roomUrl.split('/').pop()
  const res = await fetch(`http://127.0.0.1:9000/games/${id}.json?ns=demo-game-night-default-rtdb`, {
    headers: { Authorization: 'Bearer owner' },
  })
  return res.json()
}

const card = (page, i) => page.getByTestId(`cw-card-${i}`)

test('four players play a Code Words board to a win', async ({ browser }) => {
  const hana = await newPlayer(browser) // host → ALPHA spymaster (seat 1)
  const gus = await newPlayer(browser)  // BRAVO spymaster (seat 2)
  const gia = await newPlayer(browser)  // ALPHA guesser (seat 3)
  const gil = await newPlayer(browser)  // BRAVO guesser (seat 4)
  const everyone = [hana, gus, gia, gil]

  await test.step('host creates the room and three friends join', async () => {
    await onboard(hana.page, 'Hana')
    await createRoom(hana.page, 'CODE WORDS')
    await expect(hana.page.getByText(/NEED 3 MORE PLAYERS/)).toBeVisible()
    await joinViaInvite(gus.page, hana.page.url(), 'Gus')
    await joinViaInvite(gia.page, hana.page.url(), 'Gia')
    await joinViaInvite(gil.page, hana.page.url(), 'Gil')
  })

  await test.step('teams are balanced and only the host can start', async () => {
    for (const { page } of everyone) {
      await expect(page.getByText('▲ ALPHA').first()).toBeVisible()
      await expect(page.getByText('● BRAVO').first()).toBeVisible()
      for (const name of ['Hana', 'Gus', 'Gia', 'Gil']) {
        await expect(page.getByText(new RegExp(`${name}( \\(YOU\\))?$`)).first()).toBeVisible()
      }
    }
    for (const { page } of [gus, gia, gil]) {
      await expect(page.getByRole('button', { name: 'START GAME' })).toHaveCount(0)
    }
    // Seat 1 of each team is its spymaster (★) once their sealing keys are in.
    await expect(hana.page.getByText(/★ Hana/).first()).toBeVisible()
    await expect(hana.page.getByText(/★ Gus/).first()).toBeVisible()
    await hana.page.getByRole('button', { name: 'START GAME' }).click()
  })

  let alphaCards = []
  await test.step('spymasters receive the key; guessers see plain words', async () => {
    await expect(hana.page.getByRole('textbox', { name: 'Your one-word clue' })).toBeVisible()
    await expect(gia.page.getByText(/YOU: ▲ ALPHA · GUESSER/)).toBeVisible()
    await expect(gus.page.getByText(/YOU: ● BRAVO · SPYMASTER/)).toBeVisible()
    // Hana (ALPHA spymaster) sees every card's identity; ALPHA starts with 9.
    await expect(card(hana.page, 0)).not.toHaveAttribute('data-identity', '')
    const identities = []
    for (let i = 0; i < 25; i++) identities.push(await card(hana.page, i).getAttribute('data-identity'))
    alphaCards = identities.flatMap((t, i) => (t === 'A' ? [i] : []))
    expect(alphaCards).toHaveLength(9)
    expect(identities.filter(t => t === 'X')).toHaveLength(1)
    // Gus (BRAVO spymaster) holds the same key.
    await expect(card(gus.page, alphaCards[0])).toHaveAttribute('data-identity', 'A')
    // Guessers see no identities at all.
    for (const { page } of [gia, gil]) {
      for (let i = 0; i < 25; i++) await expect(card(page, i)).toHaveAttribute('data-identity', '')
    }
  })

  await test.step('the room node holds commitments and sealed boxes, never the key', async () => {
    const room = await readRoom(hana.page.url())
    const round = room.round
    expect(round.phase).toBe('clue')
    expect(Object.keys(round.commits)).toHaveLength(25)
    expect(round.seed).toBeUndefined()
    expect(Object.keys(round.sealed).sort()).toEqual(Object.keys(room.players).filter(uid =>
      uid === round.spymasters.A || uid === round.spymasters.B).sort())
    expect(JSON.stringify(round)).not.toMatch(/"(identities|salts|key)"/)
  })

  await test.step('a clue that is on the board is rejected', async () => {
    const boardWord = await card(hana.page, 0).getAttribute('data-word')
    await hana.page.getByRole('textbox', { name: 'Your one-word clue' }).fill(boardWord)
    await hana.page.getByRole('radio', { name: '2 cards' }).click()
    await hana.page.getByRole('button', { name: 'GIVE CLUE' }).click()
    await expect(hana.page.getByText("THAT'S ON THE BOARD")).toBeVisible()
  })

  await test.step('ALPHA spymaster gives a clue for all nine agents', async () => {
    await hana.page.getByRole('textbox', { name: 'Your one-word clue' }).fill('Zyzzyva')
    await hana.page.getByRole('radio', { name: '9 cards' }).click()
    await hana.page.getByRole('button', { name: 'GIVE CLUE' }).click()
    for (const { page } of everyone) await expect(page.getByTestId('cw-clue')).toHaveText('ZYZZYVA · 9')
    await expect(gil.page.getByText(/▲ ALPHA IS GUESSING/)).toBeVisible()
  })

  await test.step('the ALPHA guesser points, locks in and uncovers every agent', async () => {
    for (const i of alphaCards) {
      await card(gia.page, i).click()
      await gia.page.getByRole('button', { name: /^GUESS / }).click()
      await expect(card(gia.page, i)).toHaveAttribute('data-revealed', 'A')
      await expect(card(gil.page, i)).toHaveAttribute('data-revealed', 'A')
    }
  })

  await test.step('ALPHA wins and everyone sees the verified key', async () => {
    for (const { page } of everyone) await expect(page.getByText('▲ ALPHA WINS!')).toBeVisible()
    await expect(hana.page.getByText('YOUR TEAM WINS!')).toBeVisible()
    await expect(gia.page.getByText('YOUR TEAM WINS!')).toBeVisible()
    await expect(gus.page.getByText('YOUR TEAM LOSES')).toBeVisible()
    await expect(gil.page.getByText(/KEY VERIFIED ✓/)).toBeVisible()
    // The guesser can now see the full key.
    await expect(card(gil.page, alphaCards[0])).toHaveAttribute('data-identity', 'A')
    const room = await readRoom(hana.page.url())
    expect(room.status).toBe('finished')
    expect(room.round.winner).toBe('A')
    expect(room.scores[room.round.spymasters.A]).toBe(1)
    expect(room.scores[room.round.spymasters.B]).toBe(0)
    expect(room.round.wins[room.round.spymasters.A]).toBe(1)
  })

  expectNoPageErrors(...everyone)
  for (const { context } of everyone) await context.close()
})
