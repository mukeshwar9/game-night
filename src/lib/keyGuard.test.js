import { describe, it, expect } from 'vitest'
import { isTextEntryTarget, shouldIgnoreGameKey } from './keyGuard'

describe('isTextEntryTarget', () => {
  it('treats text inputs, textareas, selects and contenteditable as text entry', () => {
    expect(isTextEntryTarget({ tagName: 'INPUT', type: 'text' })).toBe(true)
    expect(isTextEntryTarget({ tagName: 'input', type: 'search' })).toBe(true)
    expect(isTextEntryTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isTextEntryTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isTextEntryTarget({ tagName: 'SELECT' })).toBe(true)
    expect(isTextEntryTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  it('does not treat buttons, checkboxes or the page body as text entry', () => {
    expect(isTextEntryTarget({ tagName: 'BUTTON' })).toBe(false)
    expect(isTextEntryTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe(false)
    expect(isTextEntryTarget({ tagName: 'BODY' })).toBe(false)
    expect(isTextEntryTarget(null)).toBe(false)
  })
})

describe('shouldIgnoreGameKey', () => {
  const body = { tagName: 'BODY' }

  it('passes plain letter keys on the page through to the game', () => {
    expect(shouldIgnoreGameKey({ key: 'a', target: body })).toBe(false)
  })

  it('ignores keys typed into the chat input (regression: chat typing fired Hangwoman guesses)', () => {
    expect(shouldIgnoreGameKey({ key: 'h', target: { tagName: 'INPUT', type: 'text' } })).toBe(true)
    expect(shouldIgnoreGameKey({ key: 'Enter', target: { tagName: 'INPUT', type: 'text' } })).toBe(true)
  })

  it('ignores browser shortcuts such as Cmd+R and Ctrl+C', () => {
    expect(shouldIgnoreGameKey({ key: 'r', metaKey: true, target: body })).toBe(true)
    expect(shouldIgnoreGameKey({ key: 'c', ctrlKey: true, target: body })).toBe(true)
    expect(shouldIgnoreGameKey({ key: 'x', altKey: true, target: body })).toBe(true)
  })

  it('ignores IME composition keystrokes', () => {
    expect(shouldIgnoreGameKey({ key: 'a', isComposing: true, target: body })).toBe(true)
  })
})
