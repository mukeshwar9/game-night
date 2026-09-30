// WIRE CROSSED (`games/{id}/wire`): the per-bomb node both seats write
// through whole-room transactions, plus the quick-phrase ping.
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, dbAs, gameNode, seed, rulesEnvFor } from './helpers.js'

const T = rulesEnvFor({ beforeAll, afterEach, afterAll })
const as = (uid) => dbAs(T.env, uid)
const bomb = (over = {}) => ({ seed: '12345', level: 1, bombNo: 1, tech: 'X', phase: 'armed', strikes: 0, ...over })
const room = (wire = bomb()) => gameNode({
  x: 'alice', o: 'bob', status: 'playing',
  extra: { gameType: 'wirecrossed', board: null, currentTurn: null, wire },
})
const put = (value) => seed(T.env, 'games/g1', value)

describe('WIRE CROSSED', () => {
  it('lets either seat write the bomb node; never a stranger', async () => {
    await put(room())
    await assertSucceeds(as('alice').ref('games/g1/wire').set(bomb({ strikes: 1, mods: { 0: { cut: { 2: true } } } })))
    await assertSucceeds(as('bob').ref('games/g1/wire/solved/1').set(true))
    await assertFails(as('mallory').ref('games/g1/wire/strikes').set(2))
  })

  it('keeps tech, phase and strikes in range', async () => {
    await put(room())
    await assertFails(as('alice').ref('games/g1/wire/tech').set('Z'))
    await assertFails(as('alice').ref('games/g1/wire/phase').set('exploded'))
    await assertFails(as('alice').ref('games/g1/wire/strikes').set(4))
    await assertSucceeds(as('alice').ref('games/g1/wire/strikes').set(3))
    await assertSucceeds(as('alice').ref('games/g1/wire/phase').set('over'))
  })

  it('accepts a quick-phrase ping and rejects free text', async () => {
    await put(room())
    await assertSucceeds(as('bob').ref('games/g1/wire/ping').set({ by: 'O', p: 3, at: 10 }))
    await assertFails(as('bob').ref('games/g1/wire/ping').set({ by: 'O', p: 3, at: 10, text: 'hi' }))
    await assertFails(as('bob').ref('games/g1/wire/ping').set({ by: 'O', p: 42, at: 10 }))
  })

  it('accepts only the three modes', async () => {
    await put(room())
    for (const mode of ['easy', 'medium', 'hard']) {
      await assertSucceeds(as('alice').ref('games/g1/wire/mode').set(mode))
    }
    await assertFails(as('alice').ref('games/g1/wire/mode').set('endless'))
    await assertFails(as('alice').ref('games/g1/wire/mode').set(1))
    await assertFails(as('mallory').ref('games/g1/wire/mode').set('easy'))
  })

  it('validates a mode proposal and rejects extra keys', async () => {
    await put(room())
    const proposal = { by: 'X', mode: 'hard', at: 100 }
    await assertSucceeds(as('alice').ref('games/g1/wire/modeProposal').set(proposal))
    await assertSucceeds(as('bob').ref('games/g1/wire/modeProposal').set({ ...proposal, by: 'O', mode: 'easy' }))
    await assertSucceeds(as('bob').ref('games/g1/wire/modeProposal').remove())
    await assertFails(as('alice').ref('games/g1/wire/modeProposal').set({ ...proposal, by: 'Z' }))
    await assertFails(as('alice').ref('games/g1/wire/modeProposal').set({ ...proposal, mode: 'endless' }))
    await assertFails(as('alice').ref('games/g1/wire/modeProposal').set({ ...proposal, at: 'now' }))
    await assertFails(as('alice').ref('games/g1/wire/modeProposal').set({ by: 'X', mode: 'hard' }))
    await assertFails(as('alice').ref('games/g1/wire/modeProposal').set({ ...proposal, note: 'hi' }))
    await assertFails(as('mallory').ref('games/g1/wire/modeProposal').set(proposal))
  })

  it('keeps level an integer from 1 to 3, but lets an in-flight legacy level stand', async () => {
    await put(room())
    for (const level of [1, 2, 3]) await assertSucceeds(as('alice').ref('games/g1/wire/level').set(level))
    await assertFails(as('alice').ref('games/g1/wire/level').set(0))
    await assertFails(as('alice').ref('games/g1/wire/level').set(4))
    await assertFails(as('alice').ref('games/g1/wire/level').set(1.5))
    await assertFails(as('alice').ref('games/g1/wire/level').set('2'))
    // A bomb dealt before modes can sit at level 5; rewriting the room must not fail on it.
    const legacy = room(bomb({ level: 5 }))
    await put(legacy)
    await assertSucceeds(as('bob').ref('games/g1').set({ ...legacy, lastActivityAt: 9 }))
    await assertSucceeds(as('bob').ref('games/g1/wire/level').set(5))
    await assertFails(as('bob').ref('games/g1/wire/level').set(6))
  })

  it('validates swapAt as a number', async () => {
    await put(room())
    await assertSucceeds(as('alice').ref('games/g1/wire/swapAt').set(123456))
    await assertFails(as('alice').ref('games/g1/wire/swapAt').set('soon'))
    await assertFails(as('mallory').ref('games/g1/wire/swapAt').set(1))
  })

  it('validates the gauge and rejects extra keys', async () => {
    await put(room())
    const gauge = { base: 10, at: 500, vents: 0 }
    await assertSucceeds(as('alice').ref('games/g1/wire/gauge').set(gauge))
    await assertSucceeds(as('bob').ref('games/g1/wire/gauge').set({ base: 40, at: 900, vents: 2 }))
    await assertFails(as('alice').ref('games/g1/wire/gauge').set({ ...gauge, base: 'high' }))
    await assertFails(as('alice').ref('games/g1/wire/gauge').set({ base: 10, at: 500 }))
    await assertFails(as('alice').ref('games/g1/wire/gauge').set({ ...gauge, extra: 1 }))
    // fillMs is written by arm (scaled by the room's timer scale): a positive number
    await assertSucceeds(as('alice').ref('games/g1/wire/gauge').set({ ...gauge, fillMs: 45000 }))
    await assertSucceeds(as('bob').ref('games/g1/wire/gauge').set({ base: 40, at: 900, vents: 2, fillMs: 90000 }))
    await assertFails(as('alice').ref('games/g1/wire/gauge').set({ ...gauge, fillMs: 'slow' }))
    await assertFails(as('alice').ref('games/g1/wire/gauge').set({ ...gauge, fillMs: 0 }))
    await assertFails(as('alice').ref('games/g1/wire/gauge').set({ ...gauge, fillMs: -5 }))
    await assertFails(as('mallory').ref('games/g1/wire/gauge').set(gauge))
  })

  it('lets a whole-room transaction rewrite the room with an unchanged bomb', async () => {
    const r = room(bomb({
      ping: { by: 'X', p: 1, at: 5 },
      mode: 'hard', modeProposal: { by: 'O', mode: 'easy', at: 4 }, swapAt: 77, gauge: { base: 10, at: 3, vents: 1, fillMs: 45000 },
    }))
    await put(r)
    await assertSucceeds(as('bob').ref('games/g1').set({ ...r, chatLog: null, lastActivityAt: 9, scores: { X: 1, O: 1 } }))
  })

  it('lets a mode accept rewrite the whole wire node in one transaction shape', async () => {
    const r = room(bomb({ phase: 'ready', modeProposal: { by: 'X', mode: 'medium', at: 4 } }))
    await put(r)
    const accepted = {
      seed: '999', level: 1, bombNo: 1, tech: 'X', phase: 'ready', strikes: 0,
      mode: 'medium', run: { booms: 0, ms: 0 },
    }
    await assertSucceeds(as('bob').ref('games/g1').set({ ...r, wire: accepted, lastActivityAt: 9 }))
  })
})
