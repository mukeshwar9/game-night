// Headless smoke test: run the board's three scripts against a stub DOM and canvas, switch
// every theme, step the game, and report any exception or malformed colour.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8')
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])
const bad = []
const colour = v => { if (typeof v === 'string' && /^rgba?\(/.test(v) && !/^rgba\(\d+,\d+,\d+,(\d*\.?\d+(e-?\d+)?)\)$/.test(v) && !/^rgb\(\d+,\s*\d+,\s*\d+\)$/.test(v)) bad.push(v) }
const grad = { addColorStop: (o, c) => colour(c) }
const ctx = new Proxy({}, { get: (t, k) => k === 'createLinearGradient' || k === 'createRadialGradient' ? () => grad : k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : k === 'canvas' ? {} : (t[k] !== undefined ? t[k] : () => {}), set: (t, k, v) => { if (k === 'fillStyle' || k === 'strokeStyle') colour(v); t[k] = v; return true } })
const mkEl = (id) => ({ id, style: { setProperty() {} }, dataset: {}, innerHTML: '', value: '', width: 360, height: 640, addEventListener() {}, setAttribute() {}, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 640 }), querySelector: () => null, querySelectorAll: () => [], focus() {}, scrollIntoView() {}, closest: () => null })
const els = {}
const document = { documentElement: mkEl('html'), getElementById: id => (els[id] ||= mkEl(id)), querySelectorAll: () => [], querySelector: () => null, createElement: () => mkEl('c') }
let raf = null
const window = { addEventListener() {}, devicePixelRatio: 2, AudioContext: undefined }
const sandbox = { window, document, navigator: {}, performance: { now: () => 0 }, requestAnimationFrame: f => { raf = f }, console, Math, FormData: class {}, setTimeout }
window.window = window; Object.assign(window, { document })
vm.createContext(sandbox)
sandbox.window = new Proxy(window, { set: (t, k, v) => { t[k] = v; sandbox[k] = v; return true } })
for (const s of scripts) vm.runInContext(s, sandbox)
const { BZT, __bz } = window
let now = 0, frames = 0
for (const th of BZT.THEMES) {
  BZT.apply(th.id)
  for (const tw of [{}, { coins: true, shove: true, grab: true, haunt: true }]) {
    Object.assign(__bz.opts, { coins: false, shove: false, grab: false, haunt: false, players: 4 }, tw)
    __bz.start(); __bz.G.claimed = [false, false, false, false]
    for (let i = 0; i < 240; i++) { now += 1000 / 30; raf(now); frames++ }
  }
}
console.log('themes', BZT.THEMES.length, 'frames', frames, 'bad colours', bad.length, bad.slice(0, 3))
const m = BZT.THEMES.find(t => t.id === 'midnight'); BZT.apply('midnight')
console.log('midnight pole', BZT.KA(150, 176, 76), 'sand', BZT.KA(230, 220, 190), 'matcha check:', (BZT.apply('matcha'), BZT.KA(150, 176, 76)))
