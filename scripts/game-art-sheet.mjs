// Contact sheet for the TOON and CUT PAPER game art: every game of a batch in
// both styles at 128 / 56 / 28 px (28 is the smallest size a catalogue shows),
// on a real theme's tokens. Used for review after each batch of art.
//   node scripts/game-art-sheet.mjs --batch=board-a --out=sheet.png
//   options: --only=a,b  --theme=matcha (or midnight, mono, …)  --t=0.4 (seek the toon loops to that
//   fraction of their cycle)  --cols=2 (games per row)
// Needs the cut-paper stills (npm run art:cutpaper) and Chromium (Playwright).
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { pickTypes } from './game-art-batches.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (name, dflt) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? dflt
const out = arg('out', 'game-art-sheet.png')
const theme = arg('theme', 'matcha')
const seek = arg('t', null)
const cols = Number(arg('cols', 2))
const types = pickTypes(process.argv)

// The theme's token block (plus MIDNIGHT's :root fallback), straight from index.css.
const css = readFileSync(join(ROOT, 'src/index.css'), 'utf8')
const block = (sel) => {
  const i = css.indexOf(`${sel} {`)
  return i < 0 ? '' : css.slice(i, css.indexOf('\n}', i) + 2)
}
// MIDNIGHT's tokens are the cascade fallback: the :root block that holds --c-surface.
const rootBlocks = [...css.matchAll(/^:root \{[\s\S]*?\n\}/gm)].map(m => m[0])
const tokens = rootBlocks.find(b => b.includes('--c-surface')) ?? ''
const themeCss = block(`[data-theme="${theme}"]`)
if (!themeCss && theme !== 'midnight') throw new Error(`theme ${theme} not found in src/index.css`)
const toonCss = readFileSync(join(ROOT, 'src/components/gameArtToon/toon.css'), 'utf8')

const vite = await createServer({
  root: ROOT, configFile: false, plugins: [react()], logLevel: 'silent',
  server: { middlewareMode: true }, appType: 'custom',
})
let toon
try {
  const mod = await vite.ssrLoadModule('/src/components/gameArtToon/GameArtToon.jsx')
  const { BUILDERS } = await vite.ssrLoadModule('/src/components/gameArtToon/builders/index.js')
  toon = (type) => (BUILDERS[type] ? renderToStaticMarkup(createElement(mod.default, { type, className: 'art' })) : '<div class="missing">no toon</div>')
} finally {
  await vite.close()
}

const cp = (type) => {
  const file = join(ROOT, 'public/game-art/cutpaper', `${type}.webp`)
  return existsSync(file) ? `<img class="art" src="${pathToFileURL(file)}">` : '<div class="missing">no paper</div>'
}
const cell = (html, px) => `<div class="cell" style="width:${px}px;height:${px}px">${html}</div>`
const rows = types.map(type => `<section><h3>${type}</h3>
  <div class="row">${[128, 56, 28].map(px => cell(toon(type), px)).join('')}</div>
  <div class="row">${[128, 56, 28].map(px => cell(cp(type), px)).join('')}</div></section>`).join('\n')

const html = `<!doctype html><meta charset="utf-8"><style>
${tokens}
${themeCss}
${toonCss}
body { margin: 0; padding: 12px; background: rgb(var(--c-bg)); font: 11px/1.2 monospace; color: rgb(var(--c-text)); }
.grid { display: grid; grid-template-columns: repeat(${cols}, max-content); gap: 10px 22px; }
section h3 { margin: 0 0 3px; font-size: 11px; }
.row { display: flex; align-items: flex-end; gap: 8px; margin-bottom: 4px; }
.cell { position: relative; border-radius: 8px; overflow: hidden; background: rgb(var(--c-surface)); flex: none; }
.art { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.missing { padding: 4px; color: rgb(var(--c-danger)); }
</style><body data-theme="${theme}"><div class="grid">${rows}</div>`

const tmp = mkdtempSync(join(tmpdir(), 'game-art-sheet-'))
const page_ = join(tmp, 'sheet.html')
writeFileSync(page_, html)
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 2 })
  await page.goto(pathToFileURL(page_).href)
  await page.evaluate(async (frac) => {
    await Promise.all([...document.images].map(i => i.decode().catch(() => {})))
    for (const a of document.getAnimations()) {
      a.pause()
      if (frac != null) {
        const t = a.effect.getComputedTiming()
        a.currentTime = (t.delay || 0) + Number(frac) * t.duration
      } else a.currentTime = 0
    }
  }, seek)
  mkdirSync(dirname(resolve(out)), { recursive: true })
  await page.screenshot({ path: resolve(out), fullPage: true })
  console.log(`sheet: ${resolve(out)} (${types.length} games)`)
} finally {
  await browser.close()
}
