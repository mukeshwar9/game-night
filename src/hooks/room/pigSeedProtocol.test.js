import { describe, it, expect, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: vi.fn() }))

const { pigSeedStep, runPigSeedProtocol, seedCommitter } = await import('./pigSeedProtocol')

const seated = { X: { playerId: 'x' }, O: { playerId: 'o' } }
const base = { status: 'playing', players: seated }

describe('pigSeedStep', () => {
  it('waits for the second seat', () => {
    expect(pigSeedStep({ status: 'playing', players: { X: {} } }, 'X')).toBe(null)
  })

  it('walks commit → contribute → reveal → derive with X committing by default', () => {
    expect(seedCommitter(base)).toBe('X')
    expect(pigSeedStep(base, 'X')).toBe('commit')
    expect(pigSeedStep(base, 'O')).toBe(null)
    const committed = { ...base, diceSeedCommitX: 'h' }
    expect(pigSeedStep(committed, 'O')).toBe('contribute')
    expect(pigSeedStep(committed, 'X', { seedMatchesCommit: true })).toBe(null)
    const contributed = { ...committed, diceSeedB: 'b' }
    expect(pigSeedStep(contributed, 'X', { seedMatchesCommit: true })).toBe('reveal')
    expect(pigSeedStep(contributed, 'O')).toBe(null)
    const revealed = { ...contributed, diceSeedRevealX: 'a' }
    expect(pigSeedStep(revealed, 'X')).toBe('derive')
    expect(pigSeedStep(revealed, 'O')).toBe('derive')
    expect(pigSeedStep({ ...revealed, diceSeed: 's' }, 'X')).toBe(null)
  })

  it('restarts when the committer lost the seed behind its commit', () => {
    expect(pigSeedStep({ ...base, diceSeedCommitX: 'h' }, 'X', { seedMatchesCommit: false })).toBe('reset')
    expect(pigSeedStep({ ...base, diceSeedCommitX: 'h', diceSeedB: 'b' }, 'X', { seedMatchesCommit: false })).toBe('reset')
  })

  it('follows a swapped committer', () => {
    const swapped = { ...base, diceSeedCommitter: 'O' }
    expect(seedCommitter(swapped)).toBe('O')
    expect(pigSeedStep(swapped, 'O')).toBe('commit')
    expect(pigSeedStep(swapped, 'X')).toBe(null)
    expect(pigSeedStep({ ...swapped, diceSeedCommitX: 'h' }, 'X')).toBe('contribute')
  })

  it('is idle outside a live round', () => {
    expect(pigSeedStep({ ...base, status: 'finished' }, 'X')).toBe(null)
  })
})

// Two clients sharing one room node; each write patches it and every client
// sees the new snapshot, as onValue would deliver it.
function simulateRoom(initial) {
  const state = { ...initial }
  const clients = {}
  const flush = () => new Promise(r => setTimeout(r, 0))
  const write = async (patch) => {
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete state[k]
      else state[k] = v
    }
    await flush()
    for (const c of Object.values(clients)) c.run()
  }
  const addClient = (sym) => {
    const memo = {}
    clients[sym] = { memo, run: () => runPigSeedProtocol({ game: { ...state }, gameId: 'G', mySymbol: sym, memo, write }) }
    return clients[sym]
  }
  const settle = async () => {
    for (let i = 0; i < 40 && !state.diceSeed; i++) {
      for (const c of Object.values(clients)) c.run()
      await new Promise(r => setTimeout(r, 5))
    }
  }
  return { state, clients, addClient, settle }
}

describe('runPigSeedProtocol', () => {
  it('establishes a shared seed between two clients', async () => {
    const room = simulateRoom(base)
    room.addClient('X')
    room.addClient('O')
    await room.settle()
    expect(room.state.diceSeed).toMatch(/^[0-9a-f]+$/)
    expect(room.state.diceSeedResets).toBeUndefined()
  })

  it('recovers when X reopens the room without its seed (no roll blocked forever)', async () => {
    const room = simulateRoom(base)
    // X commits, then its tab goes away before revealing.
    const x = room.addClient('X')
    x.run()
    await new Promise(r => setTimeout(r, 20))
    expect(room.state.diceSeedCommitX).toBeTruthy()
    delete room.clients.X
    room.addClient('O')
    const newTab = room.addClient('X') // fresh memo, empty sessionStorage
    expect(newTab.memo).toEqual({})
    await room.settle()
    expect(room.state.diceSeed).toMatch(/^[0-9a-f]+$/)
    expect(room.state.diceSeedResets).toBe(1)
    // The seat that threw its seed away no longer commits.
    expect(room.state.diceSeedCommitter).toBe('O')
  })
})
