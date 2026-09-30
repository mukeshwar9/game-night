import { afterEach, describe, expect, it, vi } from 'vitest'

let constructions = 0

class FakeAudioContext {
  constructor() {
    constructions += 1
    this.state = 'suspended'
    this.resume = vi.fn(() => {
      this.state = 'running'
      return Promise.resolve()
    })
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  constructions = 0
})

describe('audio context user-gesture handling', () => {
  it('waits for a user gesture before creating or resuming the context', async () => {
    const handlers = new Map()
    vi.stubGlobal('window', {
      AudioContext: FakeAudioContext,
      addEventListener: vi.fn((type, handler) => handlers.set(type, handler)),
    })
    vi.resetModules()

    const { getAudioContext, resumeAudio } = await import('./audioContext')

    expect(resumeAudio()).toBeNull()
    expect(getAudioContext()).toBeNull()
    expect(constructions).toBe(0)

    handlers.get('pointerup')()

    const context = getAudioContext()
    expect(context).toBeInstanceOf(FakeAudioContext)
    expect(context.resume).toHaveBeenCalledOnce()
    expect(constructions).toBe(1)
  })
})
