// SKETCH sharing (S4): paints a finished drawing, a collage of drawings, or a
// PDF of all of them, and hands the files to the share sheet
// (src/lib/share.js), falling back to downloads on the web. Loaded lazily, on
// the first SHARE tap. Layout numbers and copy: src/lib/sketchShareLogic.js.
//
// Card colours come from the live theme tokens (as result cards do); the
// drawing itself and the printable PDF use the fixed drawing palette
// (sketchPalette.js), the sanctioned exception, so a picture looks the same
// in every theme.
import { getFont, getStoredFont } from './font'
import { isNative } from './platform'
import { shareFiles } from './share'
import { themeColor, loadImage, roundRect, fitText, downloadBlob } from './shareCard'
import { PALETTE, BRUSH_WIDTHS, SCALE } from './sketchPalette'
import { buildPdf } from './pdfLogic'
import {
  CARD_W, CARD_H, PDF_PAGE, collagePages, collageLayout, shareTitle, sketchFilename, byLine, pdfPages,
} from './sketchShareLogic'

const PAPER = PALETTE[1]
const INK = PALETTE[0]

function fontFn() {
  const family = getFont(getStoredFont()).family
  return px => `${px}px "${family}", monospace`
}

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  return [canvas, canvas.getContext('2d')]
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

/**
 * Paints a drawing (gallery entry: strokes and fills on the 256 grid) into a
 * square at (x, y). Fills first, strokes on top: the still picture's layering.
 */
export function paintDrawing(ctx, entry, x, y, size, frame = null) {
  const k = size / 256
  ctx.save()
  ctx.fillStyle = PAPER
  ctx.fillRect(x, y, size, size)
  ctx.beginPath()
  ctx.rect(x, y, size, size)
  ctx.clip()
  for (const f of entry?.fills || []) {
    ctx.fillStyle = PALETTE[f.c] ?? PALETTE[0]
    const p = f.p || []
    // +0.5 px overlap so neighbouring cells don't show hairline seams
    for (let i = 0; i + 1 < p.length; i += 2) ctx.fillRect(x + p[i] * SCALE * k, y + p[i + 1] * SCALE * k, SCALE * k + 0.5, SCALE * k + 0.5)
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const s of entry?.strokes || []) {
    const p = s.p || []
    if (p.length < 2) continue
    ctx.strokeStyle = PALETTE[s.c] ?? PALETTE[0]
    ctx.fillStyle = ctx.strokeStyle
    const width = (BRUSH_WIDTHS[s.w] ?? BRUSH_WIDTHS[2]) * k
    if (p.length === 2) {
      ctx.beginPath()
      ctx.arc(x + p[0] * k, y + p[1] * k, width / 2, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(x + p[0] * k, y + p[1] * k)
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

// A QR code to the app's Sketch page with SCAN TO PLAY under it. Optional:
// without a url, or if the QR library fails, the caller's text footer stands.
async function drawQr(ctx, { url, x, y, size, color, font }) {
  if (!url) return false
  try {
    const { default: QRCode } = await import('qrcode')
    const data = await QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: INK, light: PAPER } })
    const img = await loadImage(data)
    ctx.fillStyle = PAPER
    roundRect(ctx, x - 10, y - 10, size + 20, size + 20, 10)
    ctx.fill()
    ctx.drawImage(img, x, y, size, size)
    ctx.fillStyle = color
    ctx.font = font(18)
    ctx.textAlign = 'center'
    ctx.fillText('SCAN TO PLAY', x + size / 2, y + size + 40)
    return true
  } catch {
    return false
  }
}

function backdrop(ctx, w, h, c) {
  ctx.fillStyle = c.bg
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = c.border
  ctx.lineWidth = 10
  ctx.strokeRect(36, 36, w - 72, h - 72)
}

const toBlob = (canvas, type = 'image/png', quality) => new Promise((res, rej) => {
  canvas.toBlob(b => (b ? res(b) : rej(new Error('canvas.toBlob returned null'))), type, quality)
})

/** One drawing as a 1080 × 1350 PNG: GAME NIGHT · SKETCH, the drawing, word, by-line, QR. */
export async function sketchCardBlob({ entry, showName = true, hearts = 0, url }) {
  try { await document.fonts?.ready } catch { /* fallback font is fine */ }
  const [canvas, ctx] = makeCanvas(CARD_W, CARD_H)
  const c = cardColors()
  const font = fontFn()
  backdrop(ctx, CARD_W, CARD_H, c)
  ctx.textAlign = 'center'
  ctx.fillStyle = c.dim
  ctx.font = font(28)
  ctx.fillText('GAME NIGHT · SKETCH', CARD_W / 2, 112)
  const size = 820
  paintDrawing(ctx, entry, (CARD_W - size) / 2, 150, size, c.border)
  ctx.textAlign = 'left'
  ctx.fillStyle = c.accent
  fitText(ctx, String(entry.word || '').toUpperCase(), 100, 1068, 700, font, 52)
  const line = byLine({ name: entry.artistName, showName, hearts })
  if (line) {
    ctx.fillStyle = hearts > 0 && !showName ? c.heart : c.text
    fitText(ctx, line, 100, 1130, 700, font, 26)
  }
  const qr = await drawQr(ctx, { url, x: CARD_W - 100 - 150, y: 1020, size: 150, color: c.dim, font })
  if (!qr) {
    ctx.textAlign = 'left'
    ctx.fillStyle = c.dim
    ctx.font = font(22)
    ctx.fillText('PLAY AT GAME NIGHT', 100, 1240)
  }
  return toBlob(canvas)
}

/** All drawings as 1080 × 1350 collage PNGs, up to 3 × 3 each, drawn one at a time. */
export async function sketchCollageBlobs({ entries, showName = true, hearts = {}, url, date = new Date() }) {
  try { await document.fonts?.ready } catch { /* fallback font is fine */ }
  const pages = collagePages(entries)
  const out = []
  for (let pi = 0; pi < pages.length; pi++) {
    const page = pages[pi]
    const [canvas, ctx] = makeCanvas(CARD_W, CARD_H)
    const c = cardColors()
    const font = fontFn()
    backdrop(ctx, CARD_W, CARD_H, c)
    ctx.textAlign = 'center'
    ctx.fillStyle = c.accent
    ctx.font = font(36)
    ctx.fillText(shareTitle(date), CARD_W / 2, 112)
    const { cells, size } = collageLayout(page.length)
    page.forEach((entry, i) => {
      const cell = cells[i]
      paintDrawing(ctx, entry, cell.x, cell.y, size, c.border)
      ctx.textAlign = 'center'
      ctx.fillStyle = c.text
      fitText(ctx, String(entry.word || '').toUpperCase(), cell.x + size / 2, cell.labelY + 30, size, font, size > 300 ? 24 : 18)
      const line = byLine({ name: entry.artistName, showName, hearts: hearts[entry.id] || 0 })
      if (line) {
        ctx.fillStyle = c.dim
        fitText(ctx, line, cell.x + size / 2, cell.labelY + 56, size, font, size > 300 ? 18 : 14)
      }
    })
    ctx.textAlign = 'left'
    ctx.fillStyle = c.dim
    ctx.font = font(22)
    ctx.fillText(`GAME NIGHT${pages.length > 1 ? ` · ${pi + 1}/${pages.length}` : ''}`, 80, CARD_H - 90)
    await drawQr(ctx, { url, x: CARD_W - 130 - 110, y: CARD_H - 80 - 110 - 30, size: 110, color: c.dim, font })
    out.push({ blob: await toBlob(canvas), filename: sketchFilename('collage', 'png', pages.length > 1 ? String(pi + 1) : '') })
  }
  return out
}

// One A4 page as a JPEG for the PDF: white paper and drawing-palette ink, so
// it prints well whatever the theme.
async function pdfPageJpeg(paint) {
  const [canvas, ctx] = makeCanvas(PDF_PAGE.w, PDF_PAGE.h)
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, PDF_PAGE.w, PDF_PAGE.h)
  ctx.fillStyle = INK
  ctx.strokeStyle = INK
  await paint(ctx)
  const blob = await toBlob(canvas, 'image/jpeg', 0.88)
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), width: PDF_PAGE.w, height: PDF_PAGE.h }
}

/**
 * Every drawing on its own A4 page (drawing large, word and artist under it),
 * after a cover with the podium and the CROWD FAVOURITE.
 *   podiumRows: [{ rank, name, score }]
 *   favourite: { title: '♥ CROWD FAVOURITE · ♥ 4', lines: ['TREASURE MAP BY IVY'] } | null
 */
export async function sketchPdfBlob({ entries, showName = true, hearts = {}, podiumRows = [], favourite = null, url, date = new Date() }) {
  try { await document.fonts?.ready } catch { /* fallback font is fine */ }
  const font = fontFn()
  const W = PDF_PAGE.w
  const pages = []
  const plan = pdfPages(entries)
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i]
    pages.push(await pdfPageJpeg(async ctx => {
      ctx.textAlign = 'center'
      if (p.kind === 'cover') {
        fitText(ctx, shareTitle(date), W / 2, 260, W - 240, font, 64)
        ctx.font = font(28)
        ctx.fillText(`${entries.length} DRAWING${entries.length === 1 ? '' : 'S'} · GAME NIGHT`, W / 2, 330)
        let y = 480
        if (showName) {
          for (const r of podiumRows.slice(0, 8)) {
            ctx.font = font(r.rank === 1 ? 40 : 32)
            fitText(ctx, `${r.rank}. ${String(r.name).toUpperCase()} · ${r.score}`, W / 2, y, W - 240, font, r.rank === 1 ? 40 : 32)
            y += r.rank === 1 ? 80 : 64
          }
        }
        if (favourite?.lines?.length) {
          let fy = Math.max(y + 60, 1000)
          fitText(ctx, favourite.title, W / 2, fy, W - 200, font, 32)
          for (const line of favourite.lines) {
            fy += 52
            fitText(ctx, line, W / 2, fy, W - 200, font, 28)
          }
        }
        await drawQr(ctx, { url, x: W / 2 - 110, y: PDF_PAGE.h - 420, size: 220, color: INK, font })
        return
      }
      const e = p.entry
      const size = 1040
      paintDrawing(ctx, e, (W - size) / 2, 200, size, INK)
      ctx.fillStyle = INK
      fitText(ctx, String(e.word || '').toUpperCase(), W / 2, 1360, W - 200, font, 56)
      const line = byLine({ name: e.artistName, showName, hearts: hearts[e.id] || 0 })
      if (line) fitText(ctx, line, W / 2, 1440, W - 200, font, 30)
      ctx.font = font(22)
      ctx.fillText(`${i} / ${entries.length}`, W / 2, PDF_PAGE.h - 120)
    }))
  }
  const bytes = buildPdf(pages, { title: shareTitle(date) })
  return new Blob([bytes], { type: 'application/pdf' })
}

/**
 * Shares files through the system sheet; on the web without file sharing,
 * downloads them instead. Never rejects.
 * @returns {Promise<'shared' | 'cancelled' | 'saved' | 'failed'>}
 */
export async function shareSketchFiles({ files, text, title = 'Sketch · Game Night' }) {
  try {
    const outcome = await shareFiles({ files, text, title })
    if (outcome === 'shared' || outcome === 'cancelled') return outcome
    if (isNative) return 'failed'
    for (const f of files) downloadBlob(f.blob, f.filename)
    return 'saved'
  } catch (err) {
    console.error('shareSketchFiles failed:', err)
    return 'failed'
  }
}
