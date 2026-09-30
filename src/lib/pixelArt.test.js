// Pixel-art thumbnails (scripts/pixel-art/, `npm run art:pixel`): every game
// in every pixel style has a committed PNG at its native size, drawn only from
// the house palette, and the committed file is exactly what the generator
// produces today (so a sprite edit without a regenerate fails here).
import { Buffer } from 'node:buffer'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import { ART_STYLES, DEFAULT_ART_STYLE, PIXEL_ART_SIZES, getGameArtStyle } from './gameArtStyle'
import { renderAll, OUT } from '../../scripts/pixel-art/build.mjs'
import { SPRITES, STYLES } from '../../scripts/pixel-art/sprites.mjs'
import { HOUSE_COLORS } from '../../scripts/pixel-art/palette.mjs'

function readPng(buf) {
  expect([...buf.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  const chunks = {}
  for (let o = 8; o < buf.length;) {
    const len = buf.readUInt32BE(o)
    const type = buf.toString('ascii', o + 4, o + 8)
    chunks[type] = (chunks[type] || []).concat([buf.subarray(o + 8, o + 8 + len)])
    o += 12 + len
  }
  const ihdr = chunks.IHDR[0]
  const plte = chunks.PLTE?.[0] ?? Buffer.alloc(0)
  const trns = chunks.tRNS?.[0]
  const colors = []
  for (let i = 0; i < plte.length; i += 3) {
    if (trns && trns[i / 3] === 0) continue
    colors.push('#' + [plte[i], plte[i + 1], plte[i + 2]].map(v => v.toString(16).padStart(2, '0')).join(''))
  }
  return {
    width: ihdr.readUInt32BE(0), height: ihdr.readUInt32BE(4), depth: ihdr[8], colorType: ihdr[9],
    colors, pixels: inflateSync(Buffer.concat(chunks.IDAT)),
  }
}

// GameArt.jsx's ART_TYPES (a component module can't export it: fast refresh).
const gameArtSrc = readFileSync(new URL('../components/GameArt.jsx', import.meta.url), 'utf8')
const types = [...gameArtSrc.match(/const ART_TYPES = new Set\(\[([\s\S]*?)\]\)/)[1].matchAll(/'([a-z0-9]+)'/g)].map(m => m[1])
const rendered = renderAll()

describe('pixel art styles', () => {
  it('registers every pixel style in the art-style picker, at the size the generator draws', () => {
    expect(PIXEL_ART_SIZES).toEqual(STYLES)
    for (const id of Object.keys(PIXEL_ART_SIZES)) expect(ART_STYLES.some(s => s.id === id)).toBe(true)
  })

  it('defaults to PIXEL SCENE', () => {
    expect(DEFAULT_ART_STYLE).toBe('scene')
    expect(getGameArtStyle()).toBe('scene')
  })

  it('offers the three pixel styles and ICONS only', () => {
    expect(ART_STYLES.map(s => s.id)).toEqual(['scene', 'object', 'cast', 'icons'])
  })

  it('falls back to PIXEL SCENE for a saved retired style (BOLD png, SOFT svg)', () => {
    const store = new Map()
    vi.stubGlobal('localStorage', { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) })
    try {
      for (const retired of ['png', 'svg']) {
        store.set('retro-gameart', retired)
        expect(getGameArtStyle()).toBe('scene')
      }
      store.set('retro-gameart', 'icons')
      expect(getGameArtStyle()).toBe('icons')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('has a sprite for exactly the ART_TYPES games', () => {
    expect(Object.keys(SPRITES).sort()).toEqual([...types].sort())
  })
})

describe.each(Object.entries(STYLES))('pixel style %s (%ipx)', (style, size) => {
  it.each(types)('%s: committed PNG is native-size, indexed, house palette and up to date', (type) => {
    const file = join(OUT, style, `${type}.png`)
    expect(existsSync(file), `${file} missing — run npm run art:pixel`).toBe(true)
    const buf = readFileSync(file)
    const png = readPng(buf)
    expect([png.width, png.height]).toEqual([size, size])
    expect([png.depth, png.colorType]).toEqual([8, 3])
    expect(png.pixels.length).toBe((size + 1) * size)
    for (const c of png.colors) expect(HOUSE_COLORS.has(c), `${style}/${type} uses ${c}`).toBe(true)
    expect(buf.equals(rendered[style][type].buf), `${style}/${type}.png is stale — run npm run art:pixel`).toBe(true)
  })
})
