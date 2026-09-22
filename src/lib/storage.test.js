import { describe, expect, test } from 'vitest'
import { namespacedKey } from './devTestingLogic'

// makeStore is inline in storage.js (module singleton over real backing
// storage); recreate it here against a Map-backed stub to test the
// namespacing behavior without touching real browser storage.
function makeStore(backing, slot) {
  return {
    getItem: (key) => backing.getItem(namespacedKey(slot, key)),
    setItem: (key, value) => backing.setItem(namespacedKey(slot, key), value),
    removeItem: (key) => backing.removeItem(namespacedKey(slot, key)),
  }
}

function mapBacking() {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()],
  }
}

describe('namespaced store (F-51)', () => {
  test('slot tabs read/write only their own namespace', () => {
    const backing = mapBacking()
    const p1 = makeStore(backing, 'p1')
    const p2 = makeStore(backing, 'p2')
    p1.setItem('gn-stats', '{"games":3}')
    expect(p1.getItem('gn-stats')).toBe('{"games":3}')
    expect(p2.getItem('gn-stats')).toBe(null)
    p2.setItem('gn-stats', '{"games":9}')
    expect(p1.getItem('gn-stats')).toBe('{"games":3}')
    expect(backing.keys()).toEqual(['gn-dev-p1:gn-stats', 'gn-dev-p2:gn-stats'])
  })

  test('removeItem only clears the slot namespace', () => {
    const backing = mapBacking()
    const p1 = makeStore(backing, 'p1')
    const p2 = makeStore(backing, 'p2')
    p1.setItem('playerName', 'ANA')
    p2.setItem('playerName', 'DEV')
    p1.removeItem('playerName')
    expect(p1.getItem('playerName')).toBe(null)
    expect(p2.getItem('playerName')).toBe('DEV')
  })

  test('no slot = transparent pass-through (normal keys, shared)', () => {
    const backing = mapBacking()
    const plain = makeStore(backing, null)
    plain.setItem('gn-favs', '["tictactoe"]')
    expect(backing.keys()).toEqual(['gn-favs'])
    expect(plain.getItem('gn-favs')).toBe('["tictactoe"]')
  })

  test('values are stored as strings like real storage', () => {
    const backing = mapBacking()
    const p1 = makeStore(backing, 'p1')
    p1.setItem('onboarded', 1)
    expect(p1.getItem('onboarded')).toBe('1')
  })
})
