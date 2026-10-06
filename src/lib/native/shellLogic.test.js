import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { chooseBackAction, hexForColor, parseColor, relativeLuminance, settleWithin, systemBarStyleForBackground } from './shellLogic'
import { THEMES } from '../theme'

describe('chooseBackAction', () => {
  it('lets an overlay with a history marker close through popstate', () => {
    expect(chooseBackAction({ hasModalMarker: true, hasOpenDialog: true, canGoBack: true, pathname: '/game/x' })).toBe('history')
    expect(chooseBackAction({ hasModalMarker: true })).toBe('history')
  })
  it('closes a dialog without a marker with Escape', () => {
    expect(chooseBackAction({ hasOpenDialog: true, canGoBack: true, pathname: '/games' })).toBe('escape')
    expect(chooseBackAction({ hasOpenDialog: true, pathname: '/' })).toBe('escape')
  })
  it('goes back in history when there is some', () => {
    expect(chooseBackAction({ canGoBack: true, pathname: '/games' })).toBe('history')
    expect(chooseBackAction({ canGoBack: true, pathname: '/' })).toBe('history')
  })
  it('goes home from a page with no history, e.g. a notification deep link', () => {
    expect(chooseBackAction({ canGoBack: false, pathname: '/game/abc' })).toBe('home')
  })
  it('leaves the app from the home page', () => {
    expect(chooseBackAction({ canGoBack: false, pathname: '/' })).toBe('exit')
    expect(chooseBackAction({})).toBe('exit')
  })
})

describe('parseColor', () => {
  it('reads theme channel triplets in any separator', () => {
    expect(parseColor('238 240 226')).toEqual([238, 240, 226])
    expect(parseColor(' 238, 240, 226 ')).toEqual([238, 240, 226])
    expect(parseColor('rgb(238 240 226)')).toEqual([238, 240, 226])
  })
  it('reads hex', () => {
    expect(parseColor('#eef0e2')).toEqual([238, 240, 226])
    expect(parseColor('#fff')).toEqual([255, 255, 255])
  })
  it('rejects the unreadable', () => {
    expect(parseColor('')).toBe(null)
    expect(parseColor('red')).toBe(null)
    expect(parseColor('1 2')).toBe(null)
    expect(parseColor('300 0 0')).toBe(null)
    expect(parseColor(undefined)).toBe(null)
  })
})

describe('relativeLuminance', () => {
  it('spans black to white', () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0)
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 5)
  })
})

describe('systemBarStyleForBackground', () => {
  it('gives dark icons on light grounds and light icons on dark ones', () => {
    expect(systemBarStyleForBackground('238 240 226')).toBe('LIGHT')
    expect(systemBarStyleForBackground('8 8 16')).toBe('DARK')
  })
  it('falls back to the default (light) theme', () => {
    expect(systemBarStyleForBackground('')).toBe('LIGHT')
    expect(systemBarStyleForBackground(null)).toBe('LIGHT')
  })

  // Every theme in index.css resolves to a style; the light ones are the
  // paper and pastel grounds (Sakura is a dark theme).
  const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')
  const bgOf = (id) => {
    const at = css.search(new RegExp(`\\[data-theme="${id}"\\]`))
    const m = /--c-bg:\s*([^;]+);/.exec(css.slice(at))
    return m ? m[1].trim() : null
  }
  const LIGHT = ['paper', 'matcha', 'matcha-strawberry', 'matcha-blueberry', 'cotton-candy', 'arctic-frost', 'cartridge', 'notebook', 'riso', 'shoreline']
  it.each(THEMES.map(t => t.id))('%s has a background and a style', (id) => {
    const bg = bgOf(id)
    expect(parseColor(bg)).not.toBe(null)
    expect(systemBarStyleForBackground(bg)).toBe(LIGHT.includes(id) ? 'LIGHT' : 'DARK')
  })
})

describe('settleWithin', () => {
  const never = new Promise(() => {})
  const instant = () => Promise.resolve()

  it('waits for every pending write to settle, failures included', async () => {
    await expect(settleWithin([Promise.resolve(1), Promise.reject(new Error('denied'))], 1000, () => never)).resolves.toBe('settled')
  })

  it('gives up after the deadline so a write that never acknowledges cannot keep the socket open', async () => {
    await expect(settleWithin([never], 1500, instant)).resolves.toBe('timeout')
  })

  it('resolves at once when nobody asked to wait', async () => {
    await expect(settleWithin([], 1500, () => never)).resolves.toBe('settled')
  })
})

describe('hexForColor', () => {
  it('turns theme channels into the hex the native splash reads', () => {
    expect(hexForColor('238 240 226')).toBe('#eef0e2')
    expect(hexForColor(' 8 8 16')).toBe('#080810')
    expect(hexForColor('#fff')).toBe('#ffffff')
    expect(hexForColor('nope')).toBe(null)
  })
})
