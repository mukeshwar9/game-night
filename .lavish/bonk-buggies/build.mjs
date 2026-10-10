// Inlines the font and scripts into one self-contained index.html.
import { readFileSync, writeFileSync } from 'node:fs'
const r = (f) => readFileSync(new URL('./src/' + f, import.meta.url), 'utf8')
const safe = (js) => js.replace(/<\/script/gi, '<\\/script')
let html = r('page.html')
// Theme tokens come straight from the app's stylesheet, so the board cannot drift from it.
const css = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8')
const NEED = ['bg', 'surface', 'card', 'border', 'text', 'dim', 'p1', 'p2', 'p3', 'p4', 'cta', 'win', 'danger', 'tint-p1', 'tint-p2', 'tint-p3', 'tint-p4', 'tint-cta', 'structure', 'deep']
const blocks = (sel) => [...css.matchAll(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g'))].map((m) => m[1])
const themeCss = (id, sel) => {
  const body = blocks(sel).find((b) => /--c-bg:/.test(b)); if (!body) throw new Error('no tokens for ' + id)
  const vars = NEED.map((k) => { const m = body.match(new RegExp('--c-' + k + ':\\s*([\\d ]+);')); if (!m) throw new Error(id + ' lacks ' + k); return [k, m[1].trim()] })
  const [r_, g_, b_] = vars[0][1].split(' ').map(Number), dark = (0.299 * r_ + 0.587 * g_ + 0.114 * b_) / 255 < 0.45
  return `[data-theme="${id}"] { color-scheme: ${dark ? 'dark' : 'light'}; ` + vars.map(([k, v]) => `--c-${k}: ${v};`).join(' ') + ' }'
}
const THEMES = [['matcha', '[data-theme="matcha"]'], ['midnight', ':root'], ['synthwave', '[data-theme="synthwave"]'], ['cartridge', '[data-theme="cartridge"]'], ['c64', '[data-theme="c64"]'], ['mono', '[data-theme="mono"]']]
html = html.split('/*THEMES*/').join(THEMES.map(([id, sel]) => themeCss(id, sel)).join('\n'))
const put = (mark, text) => { if (!html.includes(mark)) throw new Error('missing ' + mark); html = html.split(mark).join(text) }
put('/*FONT*/', readFileSync(new URL('./src/press-start-2p-latin.woff2', import.meta.url)).toString('base64'))
put('/*DET*/', () => 0)
html = html.replace('() => 0', safe(r('det.js')))
for (const [m, f] of [['/*PLANCK*/', 'planck-det.min.js'], ['/*SIM*/', 'sim.js'], ['/*RENDER*/', 'render.js'], ['/*UI*/', 'ui.js']]) {
  const i = html.indexOf(m); if (i < 0) throw new Error('missing ' + m)
  html = html.slice(0, i) + safe(r(f)) + html.slice(i + m.length)
}
writeFileSync(new URL('./index.html', import.meta.url), html)
console.log('index.html', (html.length / 1024).toFixed(0) + ' KB')
