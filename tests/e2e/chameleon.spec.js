// Chameleon: four players; exactly one is dealt the Chameleon, the other
// three share the secret word, and neither is readable in the room node.
// Everyone clues in turn, the group votes the Chameleon out, the Chameleon
// guesses wrong, and the reveal names the Chameleon and the word for all.
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'

const DB = 'http://127.0.0.1:9000'
const NS = 'demo-game-night-default-rtdb'
const roomIdOf = (url) => url.split('/game/')[1]
async function readRoom(id) {
  const res = await fetch(`${DB}/games/${id}.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' } })
  return res.json()
}

test('one Chameleon, a sealed secret, a vote and a reveal', async ({ browser }) => {
  const names = ['Hana', 'Gus', 'Gia', 'Max']
  const players = []
  for (let i = 0; i < 4; i++) players.push({ ...(await newPlayer(browser)), name: names[i] })
  const [host, ...guests] = players
  let roomId

  await test.step('four players fill the lobby and connect', async () => {
    await onboard(host.page, host.name)
    await createRoom(host.page, 'CHAMELEON')
    roomId = roomIdOf(host.page.url())
    for (const g of guests) await joinViaInvite(g.page, host.page.url(), g.name)
    for (const { page } of players) await expect(page.getByText(/^PLAYERS \(4\)/)).toBeVisible()
    // Every seat has published its sealing key.
    await expect(host.page.getByText('READY', { exact: true })).toHaveCount(4)
  })

  await test.step('host deals; exactly one player is the Chameleon', async () => {
    await host.page.getByRole('button', { name: 'START ROUND' }).click()
    for (const { page } of players) {
      await expect(page.getByTestId('chameleon-role')).toContainText(/YOU ARE THE CHAMELEON|THE SECRET WORD IS/)
    }
  })

  let chameleon
  let secret
  await test.step('the three others share one secret word, sealed in the room node', async () => {
    const roles = []
    for (const p of players) roles.push((await p.page.getByTestId('chameleon-role').innerText()).trim())
    const chamIdx = roles.map((r, i) => (r.includes('YOU ARE THE CHAMELEON') ? i : -1)).filter(i => i >= 0)
    expect(chamIdx).toHaveLength(1)
    chameleon = players[chamIdx[0]]
    const words = roles.filter((_, i) => i !== chamIdx[0]).map(r => r.replace('THE SECRET WORD IS', '').trim())
    expect(new Set(words).size).toBe(1)
    secret = words[0]
    expect(secret.length).toBeGreaterThan(0)
    await expect(chameleon.page.getByText('THE SECRET WORD IS')).toHaveCount(0)

    const round = (await readRoom(roomId)).round
    const json = JSON.stringify(round)
    expect(json).not.toContain('WORD:')
    expect(json).not.toContain('CHAMELEON')
    expect(Object.keys(round.sealed)).toHaveLength(4)
  })

  await test.step('everyone gives a clue in turn', async () => {
    for (let i = 0; i < 4; i++) {
      // Whoever's turn it is sees the clue box; everyone else waits.
      let giver = null
      await expect.poll(async () => {
        for (const p of players) if (await p.page.getByLabel('Your clue').isVisible()) { giver = p; return p.name }
        return null
      }).not.toBeNull()
      await giver.page.getByLabel('Your clue').fill(`hint ${'abcd'[i]}`)
      await giver.page.getByRole('button', { name: 'Send clue' }).click()
      await expect(giver.page.getByLabel('Your clue')).toHaveCount(0)
    }
    for (const { page } of players) await expect(page.getByText('WHO IS THE CHAMELEON?')).toBeVisible()
  })

  await test.step('the group votes the Chameleon out', async () => {
    for (const p of players) {
      const target = p === chameleon ? players.find(q => q !== chameleon) : chameleon
      await p.page.getByRole('button', { name: new RegExp(`^${target.name}`) }).click()
    }
    await expect(chameleon.page.getByText('CAUGHT! ONE LAST CHANCE')).toBeVisible()
    for (const p of players.filter(q => q !== chameleon)) {
      await expect(p.page.getByText(`${chameleon.name} WAS THE CHAMELEON — GUESSING THE WORD…`)).toBeVisible()
    }
  })

  await test.step('a wrong guess: caught, and the reveal names both', async () => {
    const grid = chameleon.page.getByRole('group', { name: 'Guess the secret word' })
    const wrong = grid.getByRole('button').filter({ hasNotText: new RegExp(`^${secret}$`) }).first()
    await wrong.click()
    for (const { page } of players) {
      await expect(page.getByText('CHAMELEON CAUGHT!')).toBeVisible()
      await expect(page.getByText(`The secret word was ${secret}`)).toBeVisible()
      await expect(page.getByText(new RegExp(`The Chameleon was ${chameleon.name}`))).toBeVisible()
    }
    const room = await readRoom(roomId)
    const chamUid = Object.values(room.players).find(p => p.name === chameleon.name).playerId
    expect(room.round.result.chameleon).toBe(chamUid)
    for (const p of Object.values(room.players)) {
      expect(room.scores?.[p.playerId] || 0).toBe(p.playerId === chamUid ? 0 : 2)
    }
  })

  expectNoPageErrors(...players)
  for (const { context } of players) await context.close()
})
