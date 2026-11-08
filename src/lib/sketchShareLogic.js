// @ts-check
// SKETCH sharing (S4): the numbers and words behind sharing one drawing or all
// of them — collage pages and grids, the PDF's page list, captions, file
// names and the WhatsApp fallback link. Pure: no DOM; unit-tested in
// sketchShareLogic.test.js. The canvas painting is src/lib/sketchShareCard.js.

/** Every shared image is a 4:5 portrait, the shape WhatsApp and feeds show whole. */
export const CARD_W = 1080
export const CARD_H = 1350
/** At most 3 × 3 drawings per collage image, so each stays readable after WhatsApp's compression. */
export const COLLAGE_MAX = 9
/** A4 portrait page canvas for the PDF (150 dpi). */
export const PDF_PAGE = { w: 1240, h: 1754 }

/**
 * The drawings split into collage images: as few images as the cap allows,
 * balanced (10 drawings → 5 + 5, not 9 + 1).
 * @template T
 * @param {T[]} entries
 * @returns {T[][]}
 */
export function collagePages(entries, max = COLLAGE_MAX) {
  const list = entries || []
  if (list.length === 0) return []
  const pages = Math.ceil(list.length / max)
  const out = []
  let at = 0
  for (let i = 0; i < pages; i++) {
    const take = Math.ceil((list.length - at) / (pages - i))
    out.push(list.slice(at, at + take))
    at += take
  }
  return out
}

/** Columns and rows for a collage of `count` drawings. */
export function collageGrid(count) {
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : 3
  return { cols, rows: Math.max(1, Math.ceil(count / cols)) }
}

/**
 * Where each drawing of a collage goes: a square `size` at (x, y), with its
 * labels starting at `labelY`. Cells fill the band between the title and the
 * footer; a short last row is centred.
 * @param {number} count
 * @param {{ w?: number, h?: number, top?: number, bottom?: number, side?: number, gap?: number, label?: number }} [box]
 */
export function collageLayout(count, { w = CARD_W, h = CARD_H, top = 150, bottom = 190, side = 70, gap = 28, label = 64 } = {}) {
  const { cols, rows } = collageGrid(count)
  const cellW = (w - 2 * side - (cols - 1) * gap) / cols
  const cellH = (h - top - bottom - (rows - 1) * gap) / rows
  const size = Math.floor(Math.min(cellW, cellH - label))
  const usedH = rows * (size + label) + (rows - 1) * gap
  const y0 = top + Math.max(0, (h - top - bottom - usedH) / 2)
  const cells = []
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols)
    const inRow = row === rows - 1 ? count - row * cols : cols
    const rowW = inRow * size + (inRow - 1) * gap
    const x0 = (w - rowW) / 2
    const col = i % cols
    const x = Math.round(x0 + col * (size + gap))
    const y = Math.round(y0 + row * (size + label + gap))
    cells.push({ x, y, size, labelY: y + size })
  }
  return { cols, rows, size, cells }
}

/** "SKETCH · 8 NOV 2026" for a collage or PDF title. */
export function shareTitle(date = new Date()) {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date()
  return `SKETCH · ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

/**
 * The text that travels with one shared drawing:
 * "TREASURE MAP" BY IVY — DRAWN IN SKETCH ON GAME NIGHT. PLAY: <link>
 */
export function drawingCaption({ word, name, showName = true, link }) {
  const by = showName && name ? ` BY ${String(name).toUpperCase()}` : ''
  return `"${String(word || '').toUpperCase()}"${by} — DRAWN IN SKETCH ON GAME NIGHT.${link ? ` PLAY: ${link}` : ''}`
}

/** The text that travels with all of a match's drawings. */
export function allCaption({ count, link }) {
  return `${count} DRAWING${count === 1 ? '' : 'S'} FROM OUR SKETCH MATCH ON GAME NIGHT.${link ? ` PLAY: ${link}` : ''}`
}

/** WhatsApp click-to-chat with the text filled in (a link cannot carry the picture). */
export function whatsAppLink(text) {
  return `https://wa.me/?text=${encodeURIComponent(String(text || ''))}`
}

/** "sketch-treasure-map.png": a safe, readable file name. */
export function sketchFilename(word, ext = 'png', suffix = '') {
  const slug = String(word || 'drawing').toLowerCase().normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'drawing'
  return `sketch-${slug}${suffix ? `-${suffix}` : ''}.${ext}`
}

/** The line under a drawing on a shared image: DRAWN BY IVY · ♥ 4. */
export function byLine({ name, showName = true, hearts = 0 }) {
  const parts = []
  if (showName && name) parts.push(`DRAWN BY ${String(name).toUpperCase()}`)
  if (hearts > 0) parts.push(`♥ ${hearts}`)
  return parts.join(' · ')
}

/**
 * The PDF's pages: a cover (title, podium, crowd favourite), then one page
 * per drawing.
 * @template T
 * @param {T[]} entries
 */
export function pdfPages(entries) {
  return [{ kind: 'cover' }, ...(entries || []).map(entry => ({ kind: 'drawing', entry }))]
}

/** "6 DRAWINGS ON THIS PHONE" for the share-all sheet. */
export function onThisPhone(count) {
  return `${count} DRAWING${count === 1 ? '' : 'S'} ON THIS PHONE`
}
