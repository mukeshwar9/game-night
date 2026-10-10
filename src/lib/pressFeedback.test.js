import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installPressFeedback } from './pressFeedback'

// A stand-in document: records listeners and dispatches by type.
function fakeDoc() {
  const listeners = {}
  return {
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn) },
    fire: (type, event = {}) => (listeners[type] || []).forEach(fn => fn(event)),
  }
}

function fakeEl({ press = true, disabled = false } = {}) {
  const attrs = new Set()
  const el = {
    attrs,
    closest: (sel) => (press && sel.includes('.press') ? el : null),
    matches: (sel) => sel === ':disabled' && disabled,
    setAttribute: (name) => attrs.add(name),
    removeAttribute: (name) => attrs.delete(name),
  }
  return el
}

describe('installPressFeedback', () => {
  let doc
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    doc = fakeDoc()
    installPressFeedback(doc)
  })
  afterEach(() => vi.useRealTimers())

  it('marks the pressed control and holds a quick tap for the minimum dip', () => {
    const el = fakeEl()
    doc.fire('pointerdown', { button: 0, target: el })
    expect(el.attrs.has('data-pressed')).toBe(true)
    vi.advanceTimersByTime(10)
    doc.fire('pointerup')
    expect(el.attrs.has('data-pressed')).toBe(true)
    vi.advanceTimersByTime(60)
    expect(el.attrs.has('data-pressed')).toBe(false)
  })

  it('releases a long press immediately', () => {
    const el = fakeEl()
    doc.fire('pointerdown', { button: 0, target: el })
    vi.advanceTimersByTime(300)
    doc.fire('pointerup')
    expect(el.attrs.has('data-pressed')).toBe(false)
  })

  it('a scroll under the finger cancels the press', () => {
    const el = fakeEl()
    doc.fire('pointerdown', { button: 0, target: el })
    doc.fire('scroll')
    expect(el.attrs.has('data-pressed')).toBe(false)
  })

  it('ignores disabled controls, other buttons and plain elements', () => {
    const disabled = fakeEl({ disabled: true })
    const plain = fakeEl({ press: false })
    const right = fakeEl()
    doc.fire('pointerdown', { button: 0, target: disabled })
    doc.fire('pointerdown', { button: 0, target: plain })
    doc.fire('pointerdown', { button: 2, target: right })
    expect([disabled, plain, right].some(e => e.attrs.size)).toBe(false)
  })
})
