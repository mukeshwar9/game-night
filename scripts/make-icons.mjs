#!/usr/bin/env node
// Renders the icons derived from public/pwa-512x512.png:
//   public/pwa-maskable-512x512.png  full-bleed background with the mark kept
//                                    inside the 80% safe zone, so Android's
//                                    adaptive-icon masks never crop it
//   public/favicon.ico               32x32 PNG wrapped in an ICO container, for
//                                    crawlers and browsers that ask for /favicon.ico
//
//   node scripts/make-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))
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
