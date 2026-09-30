#!/usr/bin/env node
// Renders the icons derived from public/pwa-512x512.png:
//   public/pwa-maskable-512x512.png  full-bleed background with the mark kept
//                                    inside the 80% safe zone, so Android's
//                                    adaptive-icon masks never crop it
//   public/favicon.ico               32x32 PNG wrapped in an ICO container, for
//                                    crawlers and browsers that ask for /favicon.ico
//
//   node scripts/make-icons.mjs            the web icons above
//   node scripts/make-icons.mjs --native   the Capacitor app icons and splash
//                                          screens instead (public/ untouched):
//                                          ios/App/App/Assets.xcassets and
//                                          android/app/src/main/res
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync, deflateSync } from 'node:zlib'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))

if (process.argv.includes('--native')) {
  await makeNative()
  process.exit(0)
}

const source = `data:image/png;base64,${readFileSync(`${root}public/pwa-512x512.png`).toString('base64')}`

const browser = await chromium.launch()
const page = await browser.newPage()
const { maskable, small } = await page.evaluate(async (src) => {
  const img = new Image()
  img.src = src
  await img.decode()
  const draw = (size, scale) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    // The mark's own background colour, sampled from the middle of the top edge
    // (inside the rounded corners).
    const probe = document.createElement('canvas')
    probe.width = probe.height = 512
    const pctx = probe.getContext('2d')
    pctx.drawImage(img, 0, 0)
    const [r, g, b] = pctx.getImageData(256, 24, 1, 1).data
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillRect(0, 0, size, size)
    const inner = size * scale
    ctx.drawImage(img, (size - inner) / 2, (size - inner) / 2, inner, inner)
    return canvas.toDataURL('image/png')
  }
  const small = document.createElement('canvas')
  small.width = small.height = 32
  const sctx = small.getContext('2d')
  sctx.imageSmoothingQuality = 'high'
  sctx.drawImage(img, 0, 0, 32, 32)
  return { maskable: draw(512, 0.7), small: small.toDataURL('image/png') }
}, source)
await browser.close()

const png = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64')
writeFileSync(`${root}public/pwa-maskable-512x512.png`, png(maskable))

// ICO: 6-byte header + one 16-byte directory entry + the PNG payload.
const payload = png(small)
const header = Buffer.alloc(22)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(1, 4) // one image
header.writeUInt8(32, 6) // width
header.writeUInt8(32, 7) // height
header.writeUInt16LE(1, 10) // colour planes
header.writeUInt16LE(32, 12) // bits per pixel
header.writeUInt32LE(payload.length, 14)
header.writeUInt32LE(22, 18) // payload offset
writeFileSync(`${root}public/favicon.ico`, Buffer.concat([header, payload]))
console.log('wrote public/pwa-maskable-512x512.png and public/favicon.ico')

// ---------------------------------------------------------------------------
// Native app icons and splash screens (--native)
//
// The logo (public/pwa-512x512.png, public/favicon.svg) is flat vector art: an
// indigo rounded tile with a white tic-tac-toe grid. Every size here redraws
// that geometry on a canvas at the target size (sharp at 1024 px, nothing
// upscaled), sampling the tile colour from the PNG. Splash screens put the tile
// small and centred on the default theme's ground (MATCHA --c-bg in
// src/index.css), so the native launch screen is the colour the app paints
// first and there is no flash.
// ---------------------------------------------------------------------------

// Re-encode an 8-bit RGBA PNG as RGB. App Store Connect rejects an app icon
// with any alpha channel, even a fully opaque one, and canvas exports always
// carry one. Only unfilters filter types 0-4 on 8-bit RGBA, all Chromium emits.
function stripAlpha(png) {
  let pos = 8
  let width = 0
  let height = 0
  const idat = []
  while (pos < png.length) {
    const len = png.readUInt32BE(pos)
    const type = png.toString('ascii', pos + 4, pos + 8)
    const data = png.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      if (data[8] !== 8 || data[9] !== 6) throw new Error('stripAlpha expects 8-bit RGBA')
    } else if (type === 'IDAT') idat.push(data)
    pos += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * 4
  const rgba = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const out = rgba.subarray(y * stride, (y + 1) * stride)
    const prev = y ? rgba.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? out[i - 4] : 0
      const b = prev[i]
      const c = i >= 4 ? prev[i - 4] : 0
      let add = 0
      if (filter === 1) add = a
      else if (filter === 2) add = b
      else if (filter === 3) add = (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      out[i] = (line[i] + add) & 255
    }
  }
  const rgb = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1)
    rgb[row] = 0
    for (let x = 0; x < width; x++) {
      rgb[row + 1 + x * 3] = rgba[y * stride + x * 4]
      rgb[row + 2 + x * 3] = rgba[y * stride + x * 4 + 1]
      rgb[row + 3 + x * 3] = rgba[y * stride + x * 4 + 2]
    }
  }
  const chunk = (type, data) => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(data.length, 0)
    head.write(type, 4, 'ascii')
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
    return Buffer.concat([head, data, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2 // RGB
  return Buffer.concat([
    png.subarray(0, 8),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rgb, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function crc32(buf) {
  let c
  let crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 255
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}

// The default theme's page ground, from the MATCHA block in src/index.css.
function matchaBackground() {
  const css = readFileSync(`${root}src/index.css`, 'utf8')
  const at = css.search(/\[data-theme="matcha"\]/)
  const m = /--c-bg:\s*(\d+)\s+(\d+)\s+(\d+)\s*;/.exec(css.slice(at))
  if (at < 0 || !m) throw new Error('matcha --c-bg not found in src/index.css')
  return [m[1], m[2], m[3]].map(Number)
}

function hex([r, g, b]) {
  return `#${[r, g, b].map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

async function makeNative() {
  const source = `data:image/png;base64,${readFileSync(`${root}public/pwa-512x512.png`).toString('base64')}`
  const ground = matchaBackground()

  // Outputs: { path, kind, size | w/h, ... } rendered in the page.
  const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
  const ios = 'ios/App/App/Assets.xcassets'
  const res = 'android/app/src/main/res'
  const jobs = [{ path: `${ios}/AppIcon.appiconset/AppIcon-512@2x.png`, kind: 'icon', size: 1024, opaque: true }]
  // iOS picks the 1x/2x/3x file by device scale; all three are the same image.
  for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    jobs.push({ path: `${ios}/Splash.imageset/${name}`, kind: 'splash', w: 2732, h: 2732, mark: 480, opaque: true })
  }
  for (const [bucket, d] of Object.entries(DENSITY)) {
    jobs.push({ path: `${res}/mipmap-${bucket}/ic_launcher.png`, kind: 'legacy', size: Math.round(48 * d) })
    jobs.push({ path: `${res}/mipmap-${bucket}/ic_launcher_round.png`, kind: 'round', size: Math.round(48 * d) })
    jobs.push({ path: `${res}/mipmap-${bucket}/ic_launcher_foreground.png`, kind: 'foreground', size: Math.round(108 * d) })
  }
  // Android legacy splash (the plugin's ImageView on API < 31): the mark is
  // 96 dp in every bucket, the rest is the ground colour, so it is seamless
  // when capacitor.config.ts centres it (androidScaleType CENTER).
  const land = { mdpi: [480, 320], hdpi: [800, 480], xhdpi: [1280, 720], xxhdpi: [1600, 960], xxxhdpi: [1920, 1280] }
  for (const [bucket, [w, h]] of Object.entries(land)) {
    jobs.push({ path: `${res}/drawable-land-${bucket}/splash.png`, kind: 'splash', w, h, mark: Math.round(96 * DENSITY[bucket]), opaque: true })
    jobs.push({ path: `${res}/drawable-port-${bucket}/splash.png`, kind: 'splash', w: h, h: w, mark: Math.round(96 * DENSITY[bucket]), opaque: true })
  }
  jobs.push({ path: `${res}/drawable/splash.png`, kind: 'splash', w: 480, h: 320, mark: 96, opaque: true })
  // Android 12+ system splash icon (windowSplashScreenAnimatedIcon): a 288 dp
  // transparent canvas at 3x; only the central 192 dp circle shows.
  jobs.push({ path: `${res}/drawable-nodpi/splash_icon.png`, kind: 'splashicon', size: 864, mark: 336 })

  const browser = await chromium.launch()
  const page = await browser.newPage()
  const out = await page.evaluate(async ({ src, jobs, ground }) => {
    const img = new Image()
    img.src = src
    await img.decode()
    const probe = document.createElement('canvas')
    probe.width = probe.height = 512
    const pctx = probe.getContext('2d')
    pctx.drawImage(img, 0, 0)
    // The tile colour, sampled mid top edge (inside the rounded corners).
    const [r, g, b] = pctx.getImageData(256, 24, 1, 1).data
    const tile = `rgb(${r},${g},${b})`

    // The grid of public/favicon.svg: a 100-unit box, 7-unit round-capped
    // strokes at 36 and 64 running from 14 to 86.
    const grid = (ctx, cx, cy, unit, color) => {
      ctx.strokeStyle = color
      ctx.lineWidth = 7 * unit
      ctx.lineCap = 'round'
      const p = (v) => (v - 50) * unit
      ctx.beginPath()
      for (const v of [36, 64]) {
        ctx.moveTo(cx + p(v), cy + p(14)); ctx.lineTo(cx + p(v), cy + p(86))
        ctx.moveTo(cx + p(14), cy + p(v)); ctx.lineTo(cx + p(86), cy + p(v))
      }
      ctx.stroke()
    }
    const roundedTile = (ctx, x, y, side) => {
      ctx.fillStyle = tile
      ctx.beginPath()
      ctx.roundRect(x, y, side, side, side * 0.22)
      ctx.fill()
      grid(ctx, x + side / 2, y + side / 2, side / 100, 'white')
    }

    const results = []
    for (const job of jobs) {
      const w = job.w || job.size
      const h = job.h || job.size
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (job.kind === 'icon') {
        // Full bleed: iOS rounds the corners itself.
        ctx.fillStyle = tile
        ctx.fillRect(0, 0, w, h)
        grid(ctx, w / 2, h / 2, w / 100, 'white')
      } else if (job.kind === 'legacy') {
        roundedTile(ctx, 0, 0, w)
      } else if (job.kind === 'round') {
        ctx.fillStyle = tile
        ctx.beginPath()
        ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2)
        ctx.fill()
        grid(ctx, w / 2, h / 2, (w / 100) * 0.88, 'white')
      } else if (job.kind === 'foreground') {
        // Adaptive icon layer: 108 dp canvas, content inside the 66 dp safe
        // circle. The grid's farthest points are 42.1 units from its centre.
        grid(ctx, w / 2, h / 2, ((33 / 108) * w) / 42.1, 'white')
      } else if (job.kind === 'splash') {
        ctx.fillStyle = `rgb(${ground.join(',')})`
        ctx.fillRect(0, 0, w, h)
        roundedTile(ctx, (w - job.mark) / 2, (h - job.mark) / 2, job.mark)
      } else if (job.kind === 'splashicon') {
        roundedTile(ctx, (w - job.mark) / 2, (h - job.mark) / 2, job.mark)
      }
      results.push({ path: job.path, opaque: !!job.opaque, data: canvas.toDataURL('image/png') })
    }
    return { results, tile: [r, g, b] }
  }, { src: source, jobs, ground })
  await browser.close()

  for (const { path, opaque, data } of out.results) {
    let png = Buffer.from(data.split(',')[1], 'base64')
    if (opaque) png = stripAlpha(png)
    mkdirSync(dirname(`${root}${path}`), { recursive: true })
    writeFileSync(`${root}${path}`, png)
  }

  // Android colours: the adaptive icon background is the tile colour; the
  // launch theme (styles.xml) paints the default theme's ground.
  const xml = (name, value) => `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="${name}">${value}</color>\n</resources>\n`
  writeFileSync(`${root}${res}/values/ic_launcher_background.xml`, xml('ic_launcher_background', hex(out.tile)))
  writeFileSync(`${root}${res}/values/colors.xml`, xml('app_background', hex(ground)))
  console.log(`wrote ${out.results.length} native icon and splash images, ic_launcher_background ${hex(out.tile)}, app_background ${hex(ground)}`)
}
