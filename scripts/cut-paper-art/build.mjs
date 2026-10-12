// CUT PAPER game art: draws every scene in scenes/ with the vendored animate cut-paper kit
// (vendor/) in headless Chromium and writes, per game,
//   public/game-art/cutpaper/<type>.webp       the still (CUT_PAPER.still px)
//   public/game-art/cutpaper/<type>-loop.webp  CUT_PAPER.loopFrames drawings side by side
// plus sources.json (a hash of everything that draws them, checked by cutPaperArt.test.js).
//   npm run art:cutpaper                       all games
//   npm run art:cutpaper -- --batch=board-a    one review batch (or --only=a,b)
// Deterministic: seeded RNG only, no clocks, no handwriting text. Needs Chromium (Playwright).
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { CUT_PAPER, CUT_PAPER_STILL_AT } from '../../src/lib/gameArtLogic.js'
import { GLYPHS, GLYPH_ASPECT } from '../../src/lib/artGlyphs.js'
import { pickTypes } from '../game-art-batches.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const OUT = join(HERE, '..', '..', 'public', 'game-art', 'cutpaper')
const read = (...p) => readFileSync(join(HERE, ...p), 'utf8')
const sceneFiles = () => readdirSync(join(HERE, 'scenes')).filter(f => f.endsWith('.js')).sort()

// The page script, in animate's own order: head, core kit, style kit, scenes, driver.
export function pageScript() {
  const glyphs = `const ART_GLYPHS = ${JSON.stringify(GLYPHS)}, ART_GLYPH_ASPECT = ${GLYPH_ASPECT}, STILL_PHASE = ${JSON.stringify(CUT_PAPER_STILL_AT)};`
  return [read('head.js'), glyphs, read('vendor', 'core.js'), read('vendor', 'cut-paper-kit.js'), read('scenes', '_common.js'),
    ...sceneFiles().filter(f => f !== '_common.js').map(f => read('scenes', f)), read('driver.js')].join('\n')
}

// Hash of every file that decides what the art looks like.
export function sourceHash() {
  const h = createHash('sha256')
  h.update(JSON.stringify(CUT_PAPER))
  h.update(JSON.stringify(CUT_PAPER_STILL_AT))
  h.update(pageScript())
  h.update(readFileSync(fileURLToPath(import.meta.url), 'utf8'))
  return h.digest('hex').slice(0, 16)
}

export async function render(types) {
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.setContent('<!doctype html><canvas id="c" width="540" height="540"></canvas>')
    await page.addScriptTag({ content: pageScript() })
    if (errors.length) throw new Error(`scene script failed: ${errors[0]}`)
    const have = await page.evaluate(() => window.sceneTypes())
    const missing = types.filter(t => !have.includes(t))
    if (missing.length) throw new Error(`no cut-paper scene for: ${missing.join(', ')}`)
    const out = {}
    for (const type of types) {
      const still = await page.evaluate(([t, n, px]) => window.renderStill(t, n, px, 0.82), [type, CUT_PAPER.loopFrames, CUT_PAPER.still])
      const loop = await page.evaluate(([t, n, px]) => window.renderStrip(t, n, px, 0.6), [type, CUT_PAPER.loopFrames, CUT_PAPER.loopPx])
      if (errors.length) throw new Error(`${type}: ${errors[0]}`)
      out[type] = { still: Buffer.from(still, 'base64'), loop: Buffer.from(loop, 'base64') }
    }
    return out
  } finally {
    await browser.close()
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const all = process.argv.every(a => !/^--(batch|only)=/.test(a))
  const types = pickTypes(process.argv)
  const out = await render(types)
  mkdirSync(OUT, { recursive: true })
  let bytes = 0
  for (const [type, { still, loop }] of Object.entries(out)) {
    writeFileSync(join(OUT, `${type}.webp`), still)
    writeFileSync(join(OUT, `${type}-loop.webp`), loop)
    bytes += still.length + loop.length
  }
  writeFileSync(join(OUT, 'sources.json'), JSON.stringify({ hash: sourceHash() }, null, 2) + '\n')
  console.log(`wrote ${types.length} games (${(bytes / 1024).toFixed(0)} KB)${all ? '' : ' — partial run, sources.json describes the scene files as they are now'} to public/game-art/cutpaper/`)
}
