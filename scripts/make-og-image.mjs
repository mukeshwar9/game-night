#!/usr/bin/env node
// Renders public/og-image.png — the 1200×630 link-preview card that WhatsApp,
// iMessage, Slack, X etc. show for shared invite links (index.html's og:image /
// twitter:image). Run after changing the card copy or palette:
//
//   node scripts/make-og-image.mjs
//
// Colours come straight from the Matcha theme block in src/index.css (the app's
// default theme), so the card never drifts from the real palette. The game
// count comes from the GAME_TYPES registry (entries without `variantOf`),
// rounded down to a "N+" figure; the script warns when index.html's copy
// quotes a different figure.

import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))
const OUT = `${root}public/og-image.png`
const WIDTH = 1200
const HEIGHT = 630
const MAX_BYTES = 200 * 1024

// ── palette: parse the [data-theme="matcha"] block's --c-* RGB triplets ──
function readMatchaTokens() {
  const css = readFileSync(`${root}src/index.css`, 'utf8')
  const block = css.match(/\[data-theme="matcha"\]\s*\{([^}]*)\}/)
  if (!block) throw new Error('Matcha theme block not found in src/index.css')
  const tokens = {}
  for (const [, name, rgb] of block[1].matchAll(/--c-([\w-]+):\s*(\d+\s+\d+\s+\d+)\s*;/g)) {
    tokens[name] = `rgb(${rgb.trim().split(/\s+/).join(', ')})`
  }
  for (const need of ['bg', 'surface', 'card', 'border', 'text', 'dim', 'p1', 'p2', 'cta', 'win', 'structure', 'tint-p1', 'tint-p2', 'tint-cta']) {
    if (!tokens[need]) throw new Error(`Matcha token --c-${need} missing`)
  }
  return tokens
}

// ── copy: game count from the registry (source text; games.js imports JSX) ──
function countGames() {
  const src = readFileSync(`${root}src/lib/games.js`, 'utf8')
  const entries = (src.match(/^ {4}type: '/gm) || []).length
  const variants = (src.match(/^\s*variantOf:/gm) || []).length
  const visible = entries - variants
  if (visible < 10) throw new Error(`Suspicious game count ${visible} — registry format changed?`)
  return { visible, rounded: Math.floor(visible / 10) * 10 }
}

const c = readMatchaTokens()
const { visible, rounded } = countGames()
const fontUrl = `data:font/woff2;base64,${readFileSync(`${root}public/fonts/press-start-2p-latin.woff2`).toString('base64')}`

const indexHtml = readFileSync(`${root}index.html`, 'utf8')
const quoted = indexHtml.match(/(\d+)\+ quick games/)
if (!quoted || Number(quoted[1]) !== rounded) {
  console.warn(`! index.html quotes "${quoted?.[0] ?? 'no N+ figure'}" but the registry has ${visible} games (${rounded}+). Update the og/twitter copy.`)
}

// Tiny pixel-art boards: a won Tic Tac Toe and a Connect Four stack.
const ttt = ['X', 'O', 'X', '', 'X', 'O', 'O', '', 'X']
const tttCells = ttt.map((m, i) => {
  const win = [0, 4, 8].includes(i)
  const colour = m === 'X' ? c.p1 : c.p2
  return `<div class="cell${win ? ' win' : ''}">${m ? `<span style="color:${colour}">${m}</span>` : ''}</div>`
}).join('')
const c4 = [
  '.......',
  '.......',
  '...O...',
  '..XO...',
  '.XOXO..',
  'XOXXOO.',
]
const c4Cells = c4.join('').split('').map(ch => {
  const fill = ch === 'X' ? c.p1 : ch === 'O' ? c.p2 : c.bg
  return `<div class="disc" style="background:${fill}"></div>`
}).join('')

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Press Start 2P'; src: url(${fontUrl}) format('woff2'); }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${WIDTH}px; height: ${HEIGHT}px; }
body {
  background: ${c.bg};
  font-family: 'Press Start 2P', monospace;
  color: ${c.text};
  position: relative;
  overflow: hidden;
}
.frame {
  position: absolute; inset: 28px;
  border: 6px solid ${c.structure};
  background: ${c.surface};
  box-shadow: 10px 10px 0 ${c.border};
  display: flex; align-items: center;
  padding: 0 64px;
  gap: 56px;
}
.copy { flex: 1; }
.kicker { font-size: 18px; color: ${c.dim}; letter-spacing: 4px; margin-bottom: 30px; }
h1 {
  font-size: 76px; line-height: 1.1; color: ${c.cta};
  text-shadow: 6px 6px 0 ${c['tint-cta']};
  margin-bottom: 38px;
}
.tag { font-size: 26px; line-height: 1.6; color: ${c.text}; margin-bottom: 22px; }
.tag b { color: ${c.p1}; font-weight: 400; }
.tag i { color: ${c.p2}; font-style: normal; }
.sub { font-size: 16px; line-height: 1.8; color: ${c.dim}; }
.boards { display: flex; flex-direction: column; gap: 28px; align-items: center; }
.ttt {
  display: grid; grid-template-columns: repeat(3, 72px); gap: 6px;
  background: ${c.structure}; padding: 6px;
}
.cell {
  width: 72px; height: 72px; background: ${c.card};
  display: flex; align-items: center; justify-content: center; font-size: 34px;
}
.cell.win { background: ${c['tint-p1']}; }
.c4 {
  display: grid; grid-template-columns: repeat(7, 26px); gap: 6px;
  background: ${c.structure}; padding: 10px; border: 4px solid ${c.text};
}
.disc { width: 26px; height: 26px; border-radius: 50%; box-shadow: inset 0 -3px 0 rgba(0,0,0,.18); }
</style></head><body>
<div class="frame">
  <div class="copy">
    <div class="kicker">PLAY WITH FRIENDS</div>
    <h1>GAME<br>NIGHT</h1>
    <p class="tag"><b>${rounded}+ quick games</b><br>for <i>2–8 friends</i></p>
    <p class="sub">Share a link. Play instantly.<br>No account needed.</p>
  </div>
  <div class="boards">
    <div class="ttt">${tttCells}</div>
    <div class="c4">${c4Cells}</div>
  </div>
</div>
</body></html>`

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 })
  await page.setContent(html, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  const fontOk = await page.evaluate(() => document.fonts.check("76px 'Press Start 2P'"))
  if (!fontOk) throw new Error('Press Start 2P failed to load — card would render in a fallback font')
  await page.screenshot({ path: OUT, type: 'png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } })
} finally {
  await browser.close()
}

const bytes = statSync(OUT).size
console.log(`wrote ${OUT} (${WIDTH}×${HEIGHT}, ${(bytes / 1024).toFixed(1)} KB, ${visible} games → "${rounded}+")`)
if (bytes > MAX_BYTES) {
  console.error(`og-image.png is ${bytes} bytes, over the ${MAX_BYTES}-byte budget`)
  process.exit(1)
}
