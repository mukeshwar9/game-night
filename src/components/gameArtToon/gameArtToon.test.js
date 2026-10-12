// TOON game art: every ART_TYPES game has a builder, every loop a builder asks
// for has a keyframe, nothing hardcodes a hex colour, and each builder renders.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import GameArtToon from './GameArtToon'
import { Anim } from './toonKit'
import { SAMPLE_SCENES } from './builders/sampleScenes'
import { BUILDERS } from './builders'

const dir = new URL('.', import.meta.url).pathname
const gameArtSrc = readFileSync(new URL('../GameArt.jsx', import.meta.url), 'utf8')
const types = [...gameArtSrc.match(/const ART_TYPES = new Set\(\[([\s\S]*?)\]\)/)[1].matchAll(/'([a-z0-9]+)'/g)].map(m => m[1])
const css = readFileSync(join(dir, 'toon.css'), 'utf8')
const samplesCss = readFileSync(join(dir, 'toonSamples.css'), 'utf8')
const sources = [
  ...readdirSync(join(dir, 'builders')).filter(f => f.endsWith('.jsx')).map(f => join(dir, 'builders', f)),
  join(dir, 'toonKit.jsx'), join(dir, 'toonPalette.js'), join(dir, 'GameArtToon.jsx'),
]

describe('toon game art', () => {
  it('has a builder for every ART_TYPES game and no strays', () => {
    expect(types.length).toBeGreaterThan(80)
    expect(Object.keys(BUILDERS).sort()).toEqual([...types].sort())
  })

  it.each(types)('%s: renders a themed tile with something drawn on it', (type) => {
    const html = renderToStaticMarkup(createElement(GameArtToon, { type, className: 'x' }))
    expect(html).toContain('viewBox="0 0 64 64"')
    expect(html).toContain('var(--c-surface)')
    expect(html.length).toBeGreaterThan(900)
  })

  it('renders nothing for an unknown game', () => {
    expect(renderToStaticMarkup(createElement(GameArtToon, { type: 'nope' }))).toBe('')
  })

  it('every loop a builder asks for (<Anim k=…>) has a keyframe', () => {
    const used = new Set()
    for (const file of sources) for (const m of readFileSync(file, 'utf8').matchAll(/<Anim k="([a-z]+)"/g)) used.add(m[1])
    expect(used.size).toBeGreaterThan(8)
    for (const k of used) expect(css, `@keyframes tn-${k}`).toMatch(new RegExp(`@keyframes tn-${k}\\b`))
  })

  it('keeps hex colours out of src/ (RGB triplets only)', () => {
    for (const file of sources) expect(readFileSync(file, 'utf8'), file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('freezes under reduced motion (setting and OS query) and pauses off screen', () => {
    expect(css).toMatch(/\[data-motion="reduced"\] \.toon-art \* \{ animation: none; \}/)
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*:root:not\(\[data-motion="full"\]\) \.toon-art \* \{ animation: none; \}/)
    expect(css).toMatch(/\.toon-art\[data-live="0"\] \* \{ animation-play-state: paused; \}/)
  })

  it('runs every loop on the shared clock (only spin and blink keep their own length)', () => {
    const style = (k, t) => renderToStaticMarkup(createElement(Anim, { k, t, d: 2 }, createElement('g')))
    expect(style('hop', 1.2)).not.toContain('--t')
    expect(style('twinkle', 1.7)).not.toContain('--t')
    expect(style('spin', 6)).toContain('--t:6s')
    expect(style('hop', 1.2)).toContain('--d:0.5s')
  })

  it('draws the eight approved sample tiles with a keyframe rule for every class they animate', () => {
    const samples = ['puckrush', 'yacht', 'stickyfingers', 'fenderbender', 'firstcut', 'quiver', 'sidekick', 'tictactoe']
    expect(Object.keys(SAMPLE_SCENES).sort()).toEqual([...samples].sort())
    for (const type of samples) {
      const html = SAMPLE_SCENES[type]()
      const classes = [...html.matchAll(/class="(t[a-z]-[a-z0-9]+)"/g)].map(m => m[1])
      expect(classes.length, type).toBeGreaterThan(1)
      for (const c of classes) expect(samplesCss, `${type}: .${c}`).toMatch(new RegExp(`\\.${c}( path)?\\{[^}]*animation:`))
    }
  })
})
