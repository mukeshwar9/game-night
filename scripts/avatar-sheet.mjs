// Render avatar-kit looks to a PNG sheet (no browser needed):
//   node scripts/avatar-sheet.mjs out.png [--view=bust|hero] [--scale=4] [--random=48] [--seed=1] [--catalog=hair]
// Used to eyeball art and to export sheets; the app itself draws the same pixels
// onto a canvas (src/components/Avatar.jsx).
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { renderPixels, DEFAULTS, randomLook, optionsFor, W } from '../src/lib/avatarKit/index.js'

const args = Object.fromEntries(process.argv.slice(3).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true] }))
const out = process.argv[2] || 'avatar-sheet.png'
const view = args.view || 'bust'
const scale = Number(args.scale || 4)
const premium = Boolean(args.premium)
let seed = Number(args.seed || 1)
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }

const looks = args.catalog
  ? optionsFor(args.catalog).map((id) => ({ ...DEFAULTS, [args.catalog]: id }))
  : Array.from({ length: Number(args.random || 48) }, () => randomLook(rand, { premium }))
const cols = Math.min(looks.length, Number(args.cols || 8))
const rows = Math.ceil(looks.length / cols)
const cell = (W + 2) * scale
const width = cols * cell, height = rows * cell
const img = Buffer.alloc(width * height * 4)
for (let i = 0; i < width * height; i++) { img[i * 4] = 40; img[i * 4 + 1] = 40; img[i * 4 + 2] = 48; img[i * 4 + 3] = 255 }
looks.forEach((look, n) => {
  const px = renderPixels(look, view, { t: 0.35, tile: !args.notile })
  const ox = (n % cols) * cell + scale, oy = Math.floor(n / cols) * cell + scale
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const c = px[y * W + x]; if (!c) continue
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const o = ((oy + y * scale + dy) * width + ox + x * scale + dx) * 4
      img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]
    }
  }
})
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c })
const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0 }
const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cr]) }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6
const raw = Buffer.alloc((width * 4 + 1) * height)
for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; img.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4) }
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
console.log(`wrote ${out} (${looks.length} looks, ${view})`)
