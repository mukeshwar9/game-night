import { describe, it, expect } from 'vitest'
import {
  startReveal, pressDown, pressUp, confirmSeen, progressLabel, tintFor, REVEAL_TINTS, REVEAL_MIN_PLAYERS,
  isHoldKey, holdKeyAction,
} from './secretRevealLogic'

describe('secretRevealLogic', () => {
  it('starts on the first seat with the secret hidden', () => {
    expect(startReveal(4)).toEqual({ total: 4, index: 0, phase: 'pass', viewed: false, done: false })
  })

  it('never seats fewer than the minimum, and survives junk counts', () => {
    expect(startReveal(0).total).toBe(REVEAL_MIN_PLAYERS)
    expect(startReveal(undefined).total).toBe(REVEAL_MIN_PLAYERS)
    expect(startReveal(3.9).total).toBe(3)
  })

  it('shows the secret only while pressed', () => {
    let s = startReveal(3)
    s = pressDown(s)
    expect(s.phase).toBe('hold')
    s = pressUp(s)
    expect(s.phase).toBe('seen')
  })

  it('refuses GOT IT before the player has looked', () => {
    const s = startReveal(3)
    expect(confirmSeen(s)).toBe(s)
  })

  it('refuses GOT IT while the finger is still down', () => {
    const s = pressDown(startReveal(3))
    expect(confirmSeen(s)).toBe(s)
  })

  it('lets a player look again after releasing before GOT IT', () => {
    let s = pressUp(pressDown(startReveal(3)))
    s = pressDown(s)
    expect(s.phase).toBe('hold')
    s = pressUp(s)
    expect(confirmSeen(s).index).toBe(1)
  })

  it('hides the secret again on the next seat', () => {
    const s = confirmSeen(pressUp(pressDown(startReveal(3))))
    expect(s).toMatchObject({ index: 1, phase: 'pass', viewed: false, done: false })
  })

  it('finishes after the last seat confirms', () => {
    let s = startReveal(2)
    for (let i = 0; i < 2; i++) s = confirmSeen(pressUp(pressDown(s)))
    expect(s.done).toBe(true)
    expect(s.viewed).toBe(false)
    // finished state is inert
    expect(pressDown(s)).toBe(s)
    expect(pressUp(s)).toBe(s)
    expect(confirmSeen(s)).toBe(s)
  })

  it('ignores a stray release when nothing is held', () => {
    const s = startReveal(3)
    expect(pressUp(s)).toBe(s)
  })

  it('labels progress and clamps past the end', () => {
    expect(progressLabel(startReveal(5))).toBe('PLAYER 1 OF 5')
    let s = startReveal(2)
    s = confirmSeen(pressUp(pressDown(s)))
    expect(progressLabel(s)).toBe('PLAYER 2 OF 2')
    s = confirmSeen(pressUp(pressDown(s)))
    expect(progressLabel(s)).toBe('PLAYER 2 OF 2')
  })

  it('cycles tints by seat and gives neighbours different colours', () => {
    for (let i = 0; i < 8; i++) expect(tintFor(i)).not.toBe(tintFor(i + 1))
    expect(tintFor(0)).toBe(REVEAL_TINTS[0])
    expect(tintFor(REVEAL_TINTS.length)).toBe(REVEAL_TINTS[0])
    expect(tintFor(-1)).toBe(REVEAL_TINTS[REVEAL_TINTS.length - 1])
  })

  it('treats Space and Enter as the hold key, nothing else', () => {
    expect(isHoldKey(' ')).toBe(true)
    expect(isHoldKey('Enter')).toBe(true)
    expect(isHoldKey('g')).toBe(false)
  })

  it('lets Space/Enter on a focused GOT IT reach its native click', () => {
    expect(holdKeyAction({ key: 'Enter', repeat: false, onOtherButton: true })).toBe('pass')
    expect(holdKeyAction({ key: ' ', repeat: false, onOtherButton: true })).toBe('pass')
  })

  it('starts a reveal on Space/Enter elsewhere and swallows auto-repeat', () => {
    expect(holdKeyAction({ key: ' ', repeat: false, onOtherButton: false })).toBe('down')
    expect(holdKeyAction({ key: 'Enter', repeat: true, onOtherButton: false })).toBe('repeat')
    expect(holdKeyAction({ key: 'a', repeat: false, onOtherButton: false })).toBe('pass')
  })
})
