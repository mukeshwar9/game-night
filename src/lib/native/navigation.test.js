import { describe, it, expect, vi } from 'vitest'
import { requestNavigate, onNavigateRequest } from './navigation'

describe('native navigation hand-off', () => {
  it('keeps a request until a navigator subscribes', () => {
    requestNavigate('/game/early')
    const fn = vi.fn()
    const off = onNavigateRequest(fn)
    expect(fn).toHaveBeenCalledWith('/game/early')
    requestNavigate('/daily')
    expect(fn).toHaveBeenLastCalledWith('/daily')
    off()
  })
  it('ignores anything that is not an in-app path', () => {
    const fn = vi.fn()
    const off = onNavigateRequest(fn)
    requestNavigate('https://evil.example/x')
    requestNavigate('//evil.example')
    requestNavigate(42)
    expect(fn).not.toHaveBeenCalled()
    off()
  })
})
