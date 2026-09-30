// Pixel-art thumbnails: `npm run art:pixel` writes
// public/game-art/pixel/<style>/<type>.png for every game in three styles
// (object 32×32, cast 32×32, scene 64×64), as 8-bit indexed PNGs at native
// size. The app upscales them with `image-rendering: pixelated`.
// `node scripts/pixel-art/build.mjs --sheet out.png` also writes a contact
// sheet (every sprite at 4×/2×) for eyeballing.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { png, sheet } from './px.mjs'
import { SPRITES, STYLES } from './sprites.mjs'

export const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'game-art', 'pixel')

// { [style]: { [type]: { cv, buf } } }, deterministic: no clocks, no Math.random.
export function renderAll() {
  const out = {}
  for (const style of Object.keys(STYLES)) {
    out[style] = {}
    for (const [type, def] of Object.entries(SPRITES)) {
      const cv = def[style]()
      if (cv.w !== STYLES[style] || cv.h !== STYLES[style]) throw new Error(`${style}/${type} is ${cv.w}×${cv.h}`)
      out[style][type] = { cv, buf: png(cv) }
    }
  }
  return out
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const all = renderAll()
  let n = 0, bytes = 0
  for (const [style, byType] of Object.entries(all)) {
    mkdirSync(join(OUT, style), { recursive: true })
    for (const [type, { buf }] of Object.entries(byType)) {
      writeFileSync(join(OUT, style, `${type}.png`), buf)
      n++; bytes += buf.length
    }
  }
  const i = process.argv.indexOf('--sheet')
  if (i > 0) {
    const types = Object.keys(SPRITES)
    const rows = types.map(t => Object.keys(STYLES).map(s => all[s][t].cv))
    writeFileSync(process.argv[i + 1], png(sheet(rows, 128, 6)))
  }
  console.log(`wrote ${n} sprites (${(bytes / 1024).toFixed(1)} KB) to public/game-art/pixel/`)
}
