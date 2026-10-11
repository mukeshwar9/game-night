// CUT PAPER game art (scripts/cut-paper-art/, `npm run art:cutpaper`): every
// ART_TYPES game has a scene, a committed WebP still and loop strip of the
// size the app expects, and the committed files match the sources that drew
// them (a scene edit without a regenerate fails here).
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CUT_PAPER, cutPaperLoopUrl, cutPaperStillUrl } from './gameArtLogic'
import { GLYPHS } from './artGlyphs'
import { OUT, sourceHash } from '../../scripts/cut-paper-art/build.mjs'

const gameArtSrc = readFileSync(new URL('../components/GameArt.jsx', import.meta.url), 'utf8')
const types = [...gameArtSrc.match(/const ART_TYPES = new Set\(\[([\s\S]*?)\]\)/)[1].matchAll(/'([a-z0-9]+)'/g)].map(m => m[1])
const scenesDir = new URL('../../scripts/cut-paper-art/scenes/', import.meta.url).pathname
const sceneSrc = readdirSync(scenesDir).filter(f => f.endsWith('.js')).map(f => readFileSync(join(scenesDir, f), 'utf8')).join('\n')

// width × height from a WebP's first chunk (lossy VP8, lossless VP8L or extended VP8X).
function webpSize(buf) {
  expect(buf.toString('ascii', 0, 4)).toBe('RIFF')
  expect(buf.toString('ascii', 8, 12)).toBe('WEBP')
  const kind = buf.toString('ascii', 12, 16)
  if (kind === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff]
  if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1] }
  if (kind === 'VP8X') return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1]
  throw new Error(`unknown WebP chunk ${kind}`)
}

describe('cut paper art', () => {
  it('draws a scene for every ART_TYPES game, with no strays', () => {
    const drawn = [...sceneSrc.matchAll(/^SCENES\.([a-z0-9]+) = /gm)].map(m => m[1])
    expect(drawn.sort()).toEqual([...types].sort())
  })

  it.each(types)('%s: committed still and loop strip are the size the app expects', (type) => {
    const still = join(OUT, `${type}.webp`)
    const loop = join(OUT, `${type}-loop.webp`)
    expect(existsSync(still), `${still} missing — run npm run art:cutpaper`).toBe(true)
    expect(existsSync(loop), `${loop} missing — run npm run art:cutpaper`).toBe(true)
    const a = readFileSync(still)
    const b = readFileSync(loop)
    expect(webpSize(a)).toEqual([CUT_PAPER.still, CUT_PAPER.still])
    expect(webpSize(b)).toEqual([CUT_PAPER.loopPx * CUT_PAPER.loopFrames, CUT_PAPER.loopPx])
    expect(a.length, `${type}.webp is heavy`).toBeLessThan(40 * 1024)
    expect(b.length, `${type}-loop.webp is heavy`).toBeLessThan(60 * 1024)
  })

  it('has no stray files in public/game-art/cutpaper', () => {
    const expected = new Set(['sources.json', ...types.flatMap(t => [`${t}.webp`, `${t}-loop.webp`])])
    expect(readdirSync(OUT).filter(f => !expected.has(f))).toEqual([])
  })

  it('committed art matches the scene sources (regenerate with npm run art:cutpaper)', () => {
    const { hash } = JSON.parse(readFileSync(join(OUT, 'sources.json'), 'utf8'))
    expect(hash).toBe(sourceHash())
  })

  it('serves the stills and strips from public/game-art/cutpaper', () => {
    expect(cutPaperStillUrl('sos')).toBe('/game-art/cutpaper/sos.webp')
    expect(cutPaperLoopUrl('sos')).toBe('/game-art/cutpaper/sos-loop.webp')
  })

  it('vendors only the pinned MIT kit files, with their licence', () => {
    const vendor = new URL('../../scripts/cut-paper-art/vendor/', import.meta.url).pathname
    expect(readdirSync(vendor).sort()).toEqual(['LICENSE', 'README.md', 'core.js', 'cut-paper-kit.js'])
    expect(readFileSync(join(vendor, 'LICENSE'), 'utf8')).toMatch(/MIT License/)
    expect(readFileSync(join(vendor, 'README.md'), 'utf8')).toMatch(/7e5eb56feb2dd573f890e1b7b34748af43d58263/)
  })
})

describe('stroke letters', () => {
  it('every glyph is a list of polylines inside the unit box', () => {
    for (const [ch, lines] of Object.entries(GLYPHS)) {
      expect(lines.length, ch).toBeGreaterThan(0)
      for (const line of lines) for (const [x, y] of line) {
        expect(x >= 0 && x <= 1 && y >= 0 && y <= 1, `${ch} (${x}, ${y})`).toBe(true)
      }
    }
  })
})
