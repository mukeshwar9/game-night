// Face Off across two clients: each player hides a face and the room holds
// only its commitment, a question is answered by the other player's client
// from the hidden face's real trait, and naming the face reveals both secrets
// and decides the round (src/lib/faceoffLogic.js, src/pages/FaceOffGame.jsx).
import { test, expect } from '@playwright/test'
import { createRoom, expectNoPageErrors, joinViaInvite, newPlayer, onboard } from './helpers.js'
import { DB_ORIGIN } from './emulator.js'
import { dealFaces, normalizeRound, remainingFor } from '../../src/lib/faceoffLogic.js'

const NS = 'demo-game-night-default-rtdb'
const readRoom = async (url) => {
  const id = url.split('/').pop()
  const res = await fetch(`${DB_ORIGIN}/games/${id}.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' } })
  return res.json()
}

test('Face Off: hidden picks, a true answer, and a named face', async ({ browser }) => {
  test.setTimeout(120_000)
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)
  let faces
  const ALICE = 3   // the face Alice hides
  const BOB = 17    // the face Bob hides

  await test.step('two players open a room and get the same 24 faces', async () => {
    await onboard(alice.page, 'Alice')
    await createRoom(alice.page, 'FACE OFF')
    await joinViaInvite(bob.page, alice.page.url(), 'Bob')
    await expect(alice.page.getByText('TAP THE FACE YOU WANT TO HIDE')).toBeVisible()
    await expect(bob.page.getByText('TAP THE FACE YOU WANT TO HIDE')).toBeVisible()
    faces = dealFaces((await readRoom(alice.page.url())).round.fSeed)
    for (const p of [alice, bob]) await expect(p.page.getByRole('button', { name: faces[0].name, exact: true })).toBeVisible()
  })

  await test.step('each hides a face; the room holds commitments, not the picks', async () => {
    await alice.page.getByRole('button', { name: faces[ALICE].name, exact: true }).click()
    await alice.page.getByRole('button', { name: new RegExp(`^HIDE ${faces[ALICE].name}`) }).click()
    await bob.page.getByRole('button', { name: faces[BOB].name, exact: true }).click()
    await bob.page.getByRole('button', { name: new RegExp(`^HIDE ${faces[BOB].name}`) }).click()
    await expect(alice.page.getByText(/YOUR TURN/)).toBeVisible()
    const room = await readRoom(alice.page.url())
    expect(room.round.fCommit.X).toMatch(/^[0-9a-f]{64}$/)
    expect(room.round.fCommit.O).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(room.round)).not.toContain('"salt"')
    expect(room.round.fReveal).toBeUndefined()
  })

  await test.step('Alice asks HAT?: Bob\'s client answers from his hidden face', async () => {
    await alice.page.getByRole('button', { name: 'HAT?', exact: true }).click()
    await expect(alice.page.getByText(/KEEPS \d+ · /)).toBeVisible()
    await alice.page.getByRole('button', { name: /^ASK/ }).click()
    await expect.poll(async () => normalizeRound((await readRoom(alice.page.url())).round).asks[0]?.a).toBe(faces[BOB].traits.hat)
    const round = (await readRoom(alice.page.url())).round
    const left = remainingFor(faces, round, 'X')
    expect(left).toContain(BOB)
    await expect(alice.page.getByLabel(`${left.length} of 24 faces left`)).toBeVisible()
    await expect(bob.page.getByLabel(`${left.length} of 24 faces left`)).toBeVisible()
    // The turn has passed to Bob.
    await expect(bob.page.getByText(/YOUR TURN/)).toBeVisible()
  })

  await test.step('Bob names the right face: both secrets are revealed and he wins the round', async () => {
    await bob.page.getByRole('button', { name: /^NAME THE FACE/ }).click()
    await bob.page.getByRole('button', { name: faces[ALICE].name, exact: true }).click()
    await bob.page.getByRole('button', { name: `IT'S ${faces[ALICE].name}!` }).click()
    await expect.poll(async () => (await readRoom(alice.page.url())).status).toBe('finished')
    const room = await readRoom(alice.page.url())
    expect(room.winner).toBe('O')
    expect(room.round.fReveal.X.i).toBe(ALICE)
    expect(room.round.fReveal.O.i).toBe(BOB)
    expect(room.round.fResult.reason).toBe('named')
    for (const p of [alice, bob]) await expect(p.page.getByText('THE NAMED FACE WAS RIGHT')).toBeVisible()
  })

  expectNoPageErrors(alice, bob)
  await alice.context.close()
  await bob.context.close()
})
