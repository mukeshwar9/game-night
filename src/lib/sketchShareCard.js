// SKETCH sharing (S4): paints one finished drawing as a card, a page of the
// all-drawings collage, or a PDF of every drawing, and hands the files to the
// share sheet (src/lib/share.js), falling back to downloads on the web.
// Loaded lazily (src/components/SketchShare.jsx warms it when the gallery
// shows), so none of this is in the entry bundle. Layout numbers and copy:
// src/lib/sketchShareLogic.js; the PDF bytes: src/lib/pdfLogic.js.
//
// The card and collage frames take the live theme tokens, as result cards do
// (shareCard.js). The drawings themselves, and the printable PDF, use the
// fixed drawing palette (sketchPalette.js, the sanctioned exception), so a
// picture looks the same in every theme and prints on white paper.
import { getFont, getStoredFont } from './font'
import { isNative } from './platform'
import { shareFiles } from './share'
import { themeColor, loadImage, roundRect, downloadBlob } from './shareCard'
import { PALETTE, BRUSH_WIDTHS, SCALE } from './sketchPalette'
import { buildPdf } from './pdfLogic'
import {
  CARD_W, CARD_H, PDF_PAGE, collagePages, collageLayout, coverLines, pdfPages, shareTitle,
  sketchFilename, byLine,
} from './sketchShareLogic'

const PAPER = PALETTE[1]
const INK = PALETTE[0]

function fontFn() {
  const family = getFont(getStoredFont()).family
  return px => `${px}px "${family}", monospace`
}

async function fontsReady() {
  try { await document.fonts?.ready } catch { /* the fallback font is fine */ }
}

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  return [canvas, canvas.getContext('2d')]
}

// Frees a canvas's pixels now rather than at garbage collection: a phone
// making 25 PDF pages should hold one page at a time.
function release(canvas) {
  canvas.width = 0
  canvas.height = 0
}

function toBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))), type, quality)
  })
}

function cardColors() {
  return {
    bg: themeColor('--c-bg', 'rgb(8,8,16)'),
    text: themeColor('--c-text', 'rgb(224,224,255)'),
    dim: themeColor('--c-dim', 'rgb(90,90,138)'),
    border: themeColor('--c-border', 'rgb(30,30,58)'),
    accent: themeColor('--c-cta', 'rgb(255,230,0)'),
    heart: themeColor('--c-p3', 'rgb(171,102,255)'),
  }
}

function backdrop(ctx, c) {
  ctx.fillStyle = c.bg
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  ctx.strokeStyle = c.border
  ctx.lineWidth = 10
  ctx.strokeRect(36, 36, CARD_W - 72, CARD_H - 72)
}

// One line of text that fits `maxW`: shrinks to `minPx`, then ends in "…".
function fitLine(ctx, str, x, y, maxW, font, px, minPx = 12) {
  let size = px
  ctx.font = font(size)
  while (size > minPx && ctx.measureText(str).width > maxW) {
    size -= 1
    ctx.font = font(size)
  }
  let s = str
  if (ctx.measureText(s).width > maxW) {
    while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1)
    s = `${s.trimEnd()}…`
  }
  ctx.fillText(s, x, y)
}

/**
 * Paints a drawing (strokes on the 256 grid, fills as 4 × 4 cells, the stored
 * gallery's arrays) into a white square at (x, y), fills first and strokes on
 * top, as the thumbnails layer them (SketchDrawing.jsx).
 */
export function paintDrawing(ctx, { strokes, fills }, x, y, size, frame = null) {
  const k = size / 256
  ctx.save()
  ctx.fillStyle = PAPER
  ctx.fillRect(x, y, size, size)
  ctx.beginPath()
  ctx.rect(x, y, size, size)
  ctx.clip()
  for (const f of fills || []) {
    ctx.fillStyle = PALETTE[f.c] ?? PALETTE[0]
    const p = f.p || []
    const cell = SCALE * k
    // A hair of overlap, so neighbouring cells show no seams once scaled.
    for (let i = 0; i + 1 < p.length; i += 2) ctx.fillRect(x + p[i] * cell, y + p[i + 1] * cell, cell + 0.5, cell + 0.5)
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const s of strokes || []) {
    const p = s.p || []
    if (p.length < 2) continue
    ctx.strokeStyle = PALETTE[s.c] ?? PALETTE[0]
    ctx.lineWidth = (BRUSH_WIDTHS[s.w] ?? BRUSH_WIDTHS[2]) * k
    ctx.beginPath()
    ctx.moveTo(x + p[0] * k, y + p[1] * k)
    // A single point still gets its round cap, as on screen.
    if (p.length === 2) ctx.lineTo(x + p[0] * k + 0.01, y + p[1] * k)
    for (let i = 2; i + 1 < p.length; i += 2) ctx.lineTo(x + p[i] * k, y + p[i + 1] * k)
    ctx.stroke()
  }
  ctx.restore()
  if (frame) {
    ctx.strokeStyle = frame
    ctx.lineWidth = Math.max(2, Math.round(size / 160))
    ctx.strokeRect(x, y, size, size)
  }
}

// The QR code image for a link, made once per link (a collage or a PDF draws
// it on every page). qrcode (~23 KB) loads only when something is shared.
const qrImages = new Map()
function qrImage(url) {
  if (!qrImages.has(url)) {
    const made = import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: INK, light: PAPER } }))
      .then(loadImage)
    made.catch(() => qrImages.delete(url))
    qrImages.set(url, made)
  }
  return qrImages.get(url)
}

// A QR code to SKETCH in the app on a white backing. Optional: without a url,
// or if the QR library fails, the caller's text stands alone.
async function drawQr(ctx, { url, x, y, size }) {
  if (!url) return false
  try {
    const img = await qrImage(url)
    ctx.fillStyle = PAPER
    roundRect(ctx, x - 8, y - 8, size + 16, size + 16, 8)
    ctx.fill()
    ctx.drawImage(img, x, y, size, size)
    return true
  } catch {
    return false
  }
}

/** Starts loading what the first share needs (the QR library, the fonts), so the tap opens the sheet in time. */
export function warm() {
  import('qrcode').catch(() => {})
  fontsReady()
}

/**
 * One drawing as a 1080 × 1350 card: GAME NIGHT · SKETCH, the drawing, the
 * word, DRAWN BY <NAME> · ♥ 4 (the name only when `showName`), and a QR code
 * with SCAN TO PLAY. Resolves to the canvas.
 */
export async function drawSketchCard({ strokes, fills, word, artistName, hearts = 0, showName = true, url }) {
  await fontsReady()
  const [canvas, ctx] = makeCanvas(CARD_W, CARD_H)
  const c = cardColors()
  const font = fontFn()
  backdrop(ctx, c)

  ctx.textAlign = 'center'
  ctx.fillStyle = c.dim
  ctx.font = font(28)
  ctx.fillText('GAME NIGHT · SKETCH', CARD_W / 2, 112)

  const size = 820
  const left = (CARD_W - size) / 2
  paintDrawing(ctx, { strokes, fills }, left, 150, size, c.border)

  const qrSize = 150
  const qrX = left + size - qrSize
  const textW = qrX - left - 40
  ctx.textAlign = 'left'
  ctx.fillStyle = c.accent
  fitLine(ctx, String(word || '').toUpperCase(), left, 1072, textW, font, 52, 20)
  const line = byLine({ name: artistName, showName, hearts })
  if (line) {
    ctx.fillStyle = showName ? c.text : c.heart
    fitLine(ctx, line, left, 1132, textW, font, 26, 14)
  }
  const qr = await drawQr(ctx, { url, x: qrX, y: 1012, size: qrSize })
  ctx.fillStyle = c.dim
  if (qr) {
    ctx.textAlign = 'center'
    ctx.font = font(18)
    ctx.fillText('SCAN TO PLAY', qrX + qrSize / 2, 1012 + qrSize + 44)
  } else {
    ctx.font = font(22)
    ctx.fillText('PLAY AT GAME NIGHT', left, 1240)
  }
  return canvas
}

/**
 * Page `page` (0-based) of the all-drawings collage: up to 3 × 3 drawings on a
 * 1080 × 1350 image, the word and by-line under each, SKETCH · <date> on top
 * and the QR footer. `hearts` maps a gallery entry id to its heart count.
 * Resolves to the canvas.
 */
export async function drawSketchCollage(entries, page = 0, { showName = true, hearts = {}, url, date = new Date() } = {}) {
  await fontsReady()
  const pages = collagePages(entries)
  const list = pages[page] || []
  const [canvas, ctx] = makeCanvas(CARD_W, CARD_H)
  const c = cardColors()
  const font = fontFn()
  backdrop(ctx, c)

  ctx.textAlign = 'center'
  ctx.fillStyle = c.accent
  fitLine(ctx, shareTitle(date), CARD_W / 2, 104, CARD_W - 160, font, 36, 20)

  const { cells, size } = collageLayout(list.length)
  const big = size > 300
  list.forEach((entry, i) => {
    const cell = cells[i]
    paintDrawing(ctx, entry, cell.x, cell.y, size, c.border)
    ctx.textAlign = 'center'
    ctx.fillStyle = c.text
    fitLine(ctx, String(entry.word || '').toUpperCase(), cell.x + size / 2, cell.labelY + 30, size, font, big ? 24 : 18, 10)
    const line = byLine({ name: entry.artistName, showName, hearts: hearts[entry.id] || 0 })
    if (line) {
      ctx.fillStyle = showName ? c.dim : c.heart
      fitLine(ctx, line, cell.x + size / 2, cell.labelY + 56, size, font, big ? 18 : 14, 9)
    }
  })

  // Footer: GAME NIGHT (and 1/2 when the set takes more than one image) on
  // the left; SCAN TO PLAY and the QR code on the right.
  const qrSize = 100
  const qrX = CARD_W - 70 - qrSize
  const qrY = CARD_H - 154
  ctx.textAlign = 'left'
  ctx.fillStyle = c.dim
  ctx.font = font(22)
  ctx.fillText(`GAME NIGHT${pages.length > 1 ? ` · ${page + 1}/${pages.length}` : ''}`, 70, qrY + 62)
  if (await drawQr(ctx, { url, x: qrX, y: qrY, size: qrSize })) {
    ctx.fillStyle = c.dim
    ctx.textAlign = 'right'
    ctx.font = font(18)
    ctx.fillText('SCAN TO PLAY', qrX - 24, qrY + 60)
  }
  return canvas
}

// One A4 page as a JPEG for the PDF: white paper and drawing-palette ink, so
// it prints well whatever the theme.
async function pdfPageJpeg(paint) {
  const [canvas, ctx] = makeCanvas(PDF_PAGE.w, PDF_PAGE.h)
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, PDF_PAGE.w, PDF_PAGE.h)
  ctx.fillStyle = INK
  ctx.strokeStyle = INK
  ctx.textAlign = 'center'
  await paint(ctx)
  const blob = await toBlob(canvas, 'image/jpeg', 0.85)
  release(canvas)
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), width: PDF_PAGE.w, height: PDF_PAGE.h }
}

/**
 * Every drawing on its own A4 page (the drawing large, the word and by-line
 * under it), after a cover with the title, the podium and the CROWD
 * FAVOURITE. Pages are painted one at a time. Resolves to a PDF Blob.
 *   podium: [{ rank, name, score }]
 *   favourite: { hearts, items: [{ word, name }] } | null
 */
export async function drawSketchPdf({ entries, showName = true, hearts = {}, podium = [], favourite = null, url, date = new Date() }) {
  await fontsReady()
  const font = fontFn()
  const W = PDF_PAGE.w
  const H = PDF_PAGE.h
  const title = shareTitle(date)
  const total = entries.length
  const pages = []
  for (const p of pdfPages(entries)) {
    pages.push(await pdfPageJpeg(async ctx => {
      if (p.kind === 'cover') {
        fitLine(ctx, title, W / 2, 260, W - 240, font, 64, 24)
        ctx.font = font(28)
        ctx.fillText(`${total} DRAWING${total === 1 ? '' : 'S'} · GAME NIGHT`, W / 2, 330)
        const { rows, fave } = coverLines({ podium, favourite, showNames: showName })
        let y = 480
        for (const r of rows) {
          const px = r.rank === 1 ? 40 : 32
          fitLine(ctx, r.text, W / 2, y, W - 240, font, px, 16)
          y += r.rank === 1 ? 80 : 64
        }
        if (fave) {
          let fy = y + 60
          ctx.fillStyle = PALETTE[2]
          fitLine(ctx, fave.title, W / 2, fy, W - 200, font, 32, 16)
          ctx.fillStyle = INK
          for (const line of fave.lines) {
            fy += 56
            fitLine(ctx, line, W / 2, fy, W - 200, font, 28, 14)
          }
        }
        const qrSize = 220
        if (await drawQr(ctx, { url, x: (W - qrSize) / 2, y: H - 420, size: qrSize })) {
          ctx.fillStyle = INK
          ctx.font = font(22)
          ctx.fillText('SCAN TO PLAY', W / 2, H - 420 + qrSize + 60)
        }
        return
      }
      const e = p.entry
      ctx.font = font(22)
      ctx.fillText(title, W / 2, 130)
      const size = 1040
      paintDrawing(ctx, e, (W - size) / 2, 200, size, INK)
      ctx.fillStyle = INK
      fitLine(ctx, String(e.word || '').toUpperCase(), W / 2, 1360, W - 200, font, 56, 20)
      const line = byLine({ name: e.artistName, showName, hearts: hearts[e.id] || 0 })
      if (line) fitLine(ctx, line, W / 2, 1440, W - 200, font, 30, 14)
      ctx.font = font(22)
      ctx.fillText(`${p.n} / ${total}`, W / 2, H - 120)
    }))
  }
  const bytes = buildPdf(pages, { title })
  return new Blob([bytes], { type: 'application/pdf' })
}

/** One drawing as a PNG file, ready to share. */
export async function sketchCardFile({ entry, showName = true, hearts = 0, url }) {
  const canvas = await drawSketchCard({ ...entry, hearts, showName, url })
  const blob = await toBlob(canvas)
  release(canvas)
  return { blob, filename: sketchFilename(entry.word) }
}

/** All drawings as collage PNG files (one per 9), drawn and released one at a time. */
export async function sketchCollageFiles({ entries, showName = true, hearts = {}, url, date = new Date() }) {
  const count = collagePages(entries).length
  const files = []
  for (let page = 0; page < count; page++) {
    const canvas = await drawSketchCollage(entries, page, { showName, hearts, url, date })
    const blob = await toBlob(canvas)
    release(canvas)
    files.push({ blob, filename: sketchFilename('drawings', 'png', count > 1 ? String(page + 1) : '') })
  }
  return files
}

/** All drawings as one PDF file. */
export async function sketchPdfFile(opts) {
  return { blob: await drawSketchPdf(opts), filename: sketchFilename('drawings', 'pdf') }
}

/**
 * Hands files to the system share sheet; on the web without file sharing,
 * downloads them instead. Never rejects.
 * @returns {Promise<'shared' | 'cancelled' | 'saved' | 'failed'>}
 */
export async function shareSketchFiles({ files, text, title = 'Sketch · Game Night' }) {
  try {
    const outcome = await shareFiles({ files, text, title })
    if (outcome === 'shared' || outcome === 'cancelled') return outcome
    // The shell has no downloads: a blob link goes nowhere there.
    if (isNative) return 'failed'
    for (const f of files) downloadBlob(f.blob, f.filename)
    return 'saved'
  } catch (err) {
    console.error('shareSketchFiles failed:', err)
    return 'failed'
  }
}
