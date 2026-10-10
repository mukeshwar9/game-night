import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Drives the real music.js + audioContext.js against a fake window/document,
// an AudioContext that can refuse a resume outside a gesture (iOS), and a fake
// engine, so the lifecycle rules are tested without a browser.
function setup({ ls = {}, importFails = 0, resumeNeedsGesture = false, theme = 'matcha' } = {}) {
  const winHandlers = {}
  const docHandlers = {}
  const store = { ...ls }
  const log = []
  let inGesture = false
  const ctxs = []
  class FakeCtx {
    constructor() { this.state = 'suspended'; ctxs.push(this) }
    setState(state) { this.state = state; this.onstatechange?.() }
    resume() {
      log.push(`resume(gesture=${inGesture})`)
      if (resumeNeedsGesture && !inGesture) return Promise.reject(new Error('NotAllowed'))
      this.setState('running')
      return Promise.resolve()
    }
    suspend() { log.push('suspend'); this.setState('suspended'); return Promise.resolve() }
  }
  const doc = { visibilityState: 'visible', addEventListener: (t, h) => { docHandlers[t] = h } }
  const win = { AudioContext: FakeCtx, addEventListener: (t, h) => { (winHandlers[t] ||= []).push(h) } }
  vi.stubGlobal('window', win)
  vi.stubGlobal('document', doc)
  vi.stubGlobal('localStorage', { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v) } })
  const engine = { imports: 0, created: 0, plays: [], failuresLeft: importFails }
  vi.doMock('./musicEngine', () => {
    engine.imports++
    if (engine.failuresLeft > 0) { engine.failuresLeft--; throw new Error('Failed to fetch dynamically imported module') }
    return {
      createMusicEngine: () => {
        engine.created++
        let cur = null
        return {
          get current() { return cur }, seconds: () => 10, setVolume() {}, duck() {},
          play(id) { engine.plays.push(id); cur = id },
        }
      },
    }
  })
  vi.doMock('./games', () => ({ getGameConfig: () => ({ category: 'board' }) }))
  vi.doMock('./theme', () => ({ getStoredTheme: () => theme }))
  const fire = (types) => {
    for (const t of types) for (const h of winHandlers[t] || []) h({ type: t })
  }
  const tap = async (types = ['pointerup', 'click']) => {
    inGesture = true
    fire(types)
    inGesture = false
    await vi.advanceTimersByTimeAsync(400)
  }
  const setVisibility = async (v, ms = 20) => {
    doc.visibilityState = v
    docHandlers.visibilitychange()
    await vi.advanceTimersByTimeAsync(ms)
  }
  const lastPlay = () => engine.plays[engine.plays.length - 1]
  return { store, log, ctxs, engine, tap, fire, setVisibility, lastPlay, win }
}

beforeEach(() => { vi.resetModules(); vi.useFakeTimers() })
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.doUnmock('./musicEngine')
  vi.doUnmock('./games')
  vi.doUnmock('./theme')
})

describe('music preference and unlock', () => {
  it('first tap starts the lobby loop', async () => {
    const h = setup()
    const m = await import('./music')
    expect(m.getMusicState().status).toBe('needs-tap')
    await h.tap()
    expect(h.lastPlay()).toBe('coin')
    expect(m.getMusicState().status).toBe('playing')
  })

  it('the game-sounds mute no longer silences music', async () => {
    const h = setup({ ls: { sfx: 'off' } })
    const m = await import('./music')
    expect(m.getMusicState().on).toBe(true)
    await h.tap()
    expect(h.lastPlay()).toBe('coin')
  })

  it('a first tap while music is off still unlocks audio, so turning it on plays without another tap', async () => {
    const h = setup({ ls: { music: 'off' } })
    const m = await import('./music')
    await h.tap()
    expect(h.engine.plays).toEqual([])
    m.setMusicOn(true)
    await vi.advanceTimersByTimeAsync(20)
    expect(h.lastPlay()).toBe('coin')
  })

  it('turning music on before any gesture stays armed and plays on the first tap', async () => {
    const h = setup({ ls: { music: 'off' } })
    const m = await import('./music')
    m.setMusicOn(true)
    expect(h.engine.plays).toEqual([])
    expect(m.getMusicState().status).toBe('needs-tap')
    await h.tap()
    expect(h.lastPlay()).toBe('coin')
  })

  it('the tap that starts the music on the toggle does not also switch it off', async () => {
    const h = setup()
    const m = await import('./music')
    await h.fire(['pointerup'])
    m.toggleMusic()
    expect(m.getMusicState().on).toBe(true)
    await vi.advanceTimersByTimeAsync(600)
    expect(h.lastPlay()).toBe('coin')
    // a deliberate later tap does switch it off
    m.toggleMusic()
    expect(m.getMusicState().on).toBe(false)
  })
})

describe('engine chunk loading', () => {
  it('retries a failed import with backoff and then plays', async () => {
    const h = setup({ importFails: 2 })
    const m = await import('./music')
    await h.tap()
    expect(h.engine.created).toBe(0)
    await vi.advanceTimersByTimeAsync(10000)
    expect(h.engine.imports).toBe(3)
    expect(h.engine.created).toBe(1)
    expect(h.lastPlay()).toBe('coin')
    expect(m.getMusicState().status).toBe('playing')
  })

  it('surfaces a load that never succeeds, and the next tap retries it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const h = setup({ importFails: 99 })
    const m = await import('./music')
    await h.tap()
    await vi.advanceTimersByTimeAsync(20000)
    expect(m.getMusicState().status).toBe('failed')
    expect(warn).toHaveBeenCalled()
    const attempts = h.engine.imports
    h.engine.failuresLeft = 0
    await h.tap()
    expect(h.engine.imports).toBeGreaterThan(attempts)
    expect(m.getMusicState().status).toBe('playing')
    warn.mockRestore()
  })
})

describe('lifecycle recovery', () => {
  it('does not start a loop on a suspended context, and the next tap brings it back', async () => {
    const h = setup({ resumeNeedsGesture: true })
    const m = await import('./music')
    await h.tap()
    expect(m.getMusicState().status).toBe('playing')
    h.engine.plays.length = 0
    await h.setVisibility('hidden', 1600)
    expect(h.ctxs[0].state).toBe('suspended')
    await h.setVisibility('visible')
    expect(h.ctxs[0].state).toBe('suspended')
    expect(h.engine.plays.filter(Boolean)).toEqual([])
    expect(m.getMusicState().status).toBe('needs-tap')
    await h.tap(['click'])
    expect(h.ctxs[0].state).toBe('running')
    expect(h.lastPlay()).toBe('coin')
  })

  it('resumes on return when the browser allows it', async () => {
    const h = setup()
    await import('./music')
    await h.tap()
    h.engine.plays.length = 0
    await h.setVisibility('hidden', 1600)
    await h.setVisibility('visible')
    expect(h.ctxs[0].state).toBe('running')
    expect(h.lastPlay()).toBe('coin')
  })

  it('notices an interrupted context (call, Siri) without any visibility event', async () => {
    const h = setup({ resumeNeedsGesture: true })
    const m = await import('./music')
    await h.tap()
    h.ctxs[0].setState('interrupted')
    expect(m.getMusicState().status).toBe('needs-tap')
    expect(h.lastPlay()).toBeNull()
    // the OS gives the audio back: statechange alone restarts the loop
    h.ctxs[0].setState('running')
    expect(h.lastPlay()).toBe('coin')
    expect(m.getMusicState().status).toBe('playing')
  })

  it.each(['pageshow', 'focus', 'native-resume'])('%s re-arms a suspended context', async (type) => {
    const h = setup()
    await import('./music')
    await h.tap()
    h.ctxs[0].setState('suspended')
    h.engine.plays.length = 0
    h.fire([type])
    await vi.advanceTimersByTimeAsync(400)
    expect(h.ctxs[0].state).toBe('running')
    expect(h.lastPlay()).toBe('coin')
  })

  it('does not fight its own suspend while the tab is hidden', async () => {
    const h = setup()
    await import('./music')
    await h.tap()
    h.log.length = 0
    await h.setVisibility('hidden', 1600)
    expect(h.log).toEqual(['suspend'])
  })
})

describe('blockers', () => {
  it('reports why music is held back and releases it when cleared', async () => {
    const h = setup()
    const m = await import('./music')
    await h.tap()
    m.setMusicBlock('voice', true)
    expect(m.getMusicState()).toMatchObject({ on: true, status: 'blocked', blocked: ['voice'] })
    expect(h.lastPlay()).toBeNull()
    m.setMusicBlock('videoCall', true)
    expect(m.getMusicState().blocked).toEqual(['voice', 'videoCall'])
    m.setMusicBlock('voice', false)
    m.setMusicBlock('videoCall', false)
    expect(m.getMusicState().status).toBe('playing')
    expect(h.lastPlay()).toBe('coin')
  })

  it('keeps the snapshot reference stable when nothing changed', async () => {
    const h = setup()
    const m = await import('./music')
    await h.tap()
    const before = m.getMusicState()
    m.syncMusic()
    m.setMusicBlock('voice', false)
    expect(m.getMusicState()).toBe(before)
  })
})

// SHORELINE's surf and gulls are its menus' lobby track, so the music switch,
// the hidden tab and the blockers silence them like any loop.
describe('beach ambience gating', () => {
  it('plays the shore ambience in SHORELINE menus once a tap unlocks audio', async () => {
    const h = setup({ theme: 'shoreline' })
    await import('./music')
    expect(h.engine.plays).toEqual([])
    await h.tap()
    expect(h.lastPlay()).toBe('shore')
  })

  it('stays silent while music is off, and starts when it is switched on', async () => {
    const h = setup({ theme: 'shoreline', ls: { music: 'off' } })
    const m = await import('./music')
    await h.tap()
    expect(h.engine.plays).toEqual([])
    m.setMusicOn(true)
    await vi.advanceTimersByTimeAsync(20)
    expect(h.lastPlay()).toBe('shore')
    m.setMusicOn(false)
    expect(h.lastPlay()).toBeNull()
  })

  it('stops in a hidden tab and for a blocker, like the music', async () => {
    const h = setup({ theme: 'shoreline' })
    const m = await import('./music')
    await h.tap()
    await h.setVisibility('hidden', 20)
    expect(h.lastPlay()).toBeNull()
    await h.setVisibility('visible')
    expect(h.lastPlay()).toBe('shore')
    m.setMusicBlock('videoCall', true)
    expect(h.lastPlay()).toBeNull()
  })
})
