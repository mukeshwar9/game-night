import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { THEMES, pairedFont, themeBackdrop } from './theme'
import { themeReveal } from './themeSwitch'
import { FONTS } from './font'
import { AMBIENT_TRACKS, THEME_LOBBY_TRACK } from './musicLogic'
import { AMBIENCES } from './musicAmbience'
import TRACKS from './musicTracks'

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

describe('THEMES registry', () => {
  // MIDNIGHT's tokens are the :root fallback; every other theme has a block.
  it('has unique ids, each with a token block in index.css', () => {
    expect(new Set(THEMES.map(t => t.id)).size).toBe(THEMES.length)
    for (const { id } of THEMES.filter(t => t.id !== 'midnight')) expect(css, id).toMatch(new RegExp(`\\[data-theme="${id}"\\]\\s*\\{`))
  })

  it('registers SHORELINE as a free theme with Fredoka and the beach backdrop', () => {
    const shoreline = THEMES.find(t => t.id === 'shoreline')
    expect(shoreline).toMatchObject({ label: 'SHORELINE', font: 'fredoka', backdrop: 'beach' })
    expect(shoreline.premium).toBeUndefined()
    expect(pairedFont('shoreline')).toBe('fredoka')
    expect(themeBackdrop('shoreline')).toBe('beach')
  })

  it('pairs only with fonts that exist and are free', () => {
    for (const t of THEMES.filter(t => t.font)) {
      const font = FONTS.find(f => f.id === t.font)
      expect(font, `${t.id} -> ${t.font}`).toBeDefined()
      expect(font.premium, `${t.id} -> ${t.font}`).toBeUndefined()
    }
  })

  it('themes without a pairing or backdrop keep the player font and plain ground', () => {
    expect(pairedFont('matcha')).toBeNull()
    expect(themeBackdrop('matcha')).toBeNull()
    expect(pairedFont('no-such-theme')).toBeNull()
  })

  it('every backdrop has its CSS and SHORELINE defines the beach tokens', () => {
    for (const t of THEMES.filter(t => t.backdrop)) expect(css).toContain(`.${t.backdrop}-backdrop {`)
    const block = css.slice(css.indexOf('[data-theme="shoreline"] {'))
    const body = block.slice(0, block.indexOf('}'))
    for (const token of ['sea', 'shallow', 'foam', 'wet']) expect(body).toMatch(new RegExp(`--c-${token}:\\s*\\d+ \\d+ \\d+;`))
  })

  it('the beach waves stop under reduced motion', () => {
    expect(css).toMatch(/\[data-motion='reduced'\] \.beach-backdrop \*[^{]*\{ animation: none !important; \}/)
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*:root:not\(\[data-motion='full'\]\) \.beach-backdrop \* \{ animation: none !important; \}/)
  })
})

describe('theme lobby tracks', () => {
  it('every theme lobby track is a loop or an ambience the engine can play', () => {
    for (const [theme, id] of Object.entries(THEME_LOBBY_TRACK)) {
      expect(THEMES.some(t => t.id === theme), theme).toBe(true)
      expect(id in TRACKS || id in AMBIENCES, id).toBe(true)
    }
  })

  it('AMBIENT_TRACKS lists exactly the engine ambiences, none clashing with a loop', () => {
    expect(Object.keys(AMBIENCES).sort()).toEqual([...AMBIENT_TRACKS].sort())
    for (const id of AMBIENT_TRACKS) expect(TRACKS[id]).toBeUndefined()
  })
})

describe('themeReveal', () => {
  it('starts at the tapped control and covers the farthest corner', () => {
    const { x, y, r } = themeReveal({ left: 340, top: 10, width: 40, height: 30 }, 390, 844)
    expect([x, y]).toEqual([360, 25])
    expect(r).toBe(Math.ceil(Math.hypot(360, 819)))
  })

  it('covers the whole screen from the middle too', () => {
    const { r } = themeReveal({ left: 195, top: 422, width: 0, height: 0 }, 390, 844)
    expect(r).toBeGreaterThanOrEqual(Math.hypot(195, 422))
  })
})
