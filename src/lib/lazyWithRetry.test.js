import { describe, it, expect, vi } from 'vitest'
import { isChunkLoadError, importWithRetry, lazyWithRetry, RELOAD_WINDOW_MS } from './lazyWithRetry'

function fakeEnv({ stored = null, now = 1_000_000 } = {}) {
  const env = {
    value: stored,
    now: () => now,
    read: () => env.value,
    write: vi.fn((v) => { env.value = v }),
    reload: vi.fn(),
  }
  return env
}

const pending = (promise) => Promise.race([
  promise.then(() => 'settled', () => 'settled'),
  new Promise(resolve => setTimeout(() => resolve('pending'), 20)),
])

describe('isChunkLoadError', () => {
  it('matches the browser messages for a missing dynamic import', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Game-abc.js'))).toBe(true)
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: https://x/a.js'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/a.css'))).toBe(true)
  })

  it('matches a ChunkLoadError by name', () => {
    const err = new Error('whatever')
    err.name = 'ChunkLoadError'
    expect(isChunkLoadError(err)).toBe(true)
  })

  it('ignores ordinary errors and empty values', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
  })
})

describe('importWithRetry', () => {
  it('resolves with the module when the import succeeds', async () => {
    const env = fakeEnv()
    const mod = { default: 'Page' }
    await expect(importWithRetry(() => Promise.resolve(mod), env)).resolves.toBe(mod)
    expect(env.reload).not.toHaveBeenCalled()
  })

  it('reloads once on a chunk error and never settles', async () => {
    const env = fakeEnv()
    const result = importWithRetry(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /a.js')), env)
    expect(await pending(result)).toBe('pending')
    expect(env.reload).toHaveBeenCalledTimes(1)
    expect(env.write).toHaveBeenCalledWith(String(1_000_000))
  })

  it('rethrows a chunk error when a reload already happened inside the window', async () => {
    const env = fakeEnv({ stored: String(1_000_000 - RELOAD_WINDOW_MS + 1) })
    const err = new TypeError('Failed to fetch dynamically imported module: /a.js')
    await expect(importWithRetry(() => Promise.reject(err), env)).rejects.toBe(err)
    expect(env.reload).not.toHaveBeenCalled()
  })

  it('reloads again once the window has passed', async () => {
    const env = fakeEnv({ stored: String(1_000_000 - RELOAD_WINDOW_MS) })
    const result = importWithRetry(() => Promise.reject(new TypeError('Importing a module script failed.')), env)
    expect(await pending(result)).toBe('pending')
    expect(env.reload).toHaveBeenCalledTimes(1)
  })

  it('rethrows non-chunk errors without reloading', async () => {
    const env = fakeEnv()
    const err = new SyntaxError('Unexpected token')
    await expect(importWithRetry(() => Promise.reject(err), env)).rejects.toBe(err)
    expect(env.reload).not.toHaveBeenCalled()
  })
})

describe('lazyWithRetry', () => {
  it('returns a React lazy component without calling the importer', () => {
    const importer = vi.fn(() => Promise.resolve({ default: () => null }))
    const Lazy = lazyWithRetry(importer)
    expect(Lazy.$$typeof).toBe(Symbol.for('react.lazy'))
    expect(importer).not.toHaveBeenCalled()
  })
})
