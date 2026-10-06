import { describe, it, expect } from 'vitest'
import { backDestination, showBackControl } from './backNavLogic'

const tabRoutes = ['/', '/games', '/friends', '/profile']

describe('showBackControl', () => {
  it('shows on screens off the tab bar only', () => {
    expect(showBackControl('/solo/connectfour', { tabRoutes })).toBe(true)
    expect(showBackControl('/shop', { tabRoutes })).toBe(true)
    expect(showBackControl('/', { tabRoutes })).toBe(false)
    expect(showBackControl('/games', { tabRoutes })).toBe(false)
  })
})

describe('backDestination', () => {
  it('steps back through in-app history, or goes home from a directly opened screen', () => {
    expect(backDestination({ key: 'ab12cd' })).toBe('history')
    expect(backDestination({ key: 'default' })).toBe('home')
    expect(backDestination({})).toBe('home')
  })
})
