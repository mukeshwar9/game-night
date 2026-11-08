// @ts-check
// SKETCH sharing (S4): the numbers and words behind sharing one drawing or all
// of a match's drawings — collage pages and their grid, the PDF's page list,
// captions, file names, the WhatsApp fallback link and the second-tap rule.
// Pure: no DOM, Firebase or React. The canvas painting is
// src/lib/sketchShareCard.js; the screens are src/components/SketchShare.jsx.

/** Every shared image is a 4:5 portrait, the shape WhatsApp and feeds show whole. */
export const CARD_W = 1080
export const CARD_H = 1350
/** At most 3 × 3 drawings per collage image, so each stays readable after WhatsApp's compression. */
export const COLLAGE_MAX = 9
/** One PDF page as a canvas: A4 portrait at 150 dpi. */
export const PDF_PAGE = { w: 1240, h: 1754 }
/** Where shared links and the QR code go: the game picker with SKETCH open (rooms expire after a day). */
export const PLAY_PATH = '/games?game=sketch'
/**
 * A browser lets a page open the share sheet only shortly after a tap (Safari
 * allows less time than Chrome). When making the files took longer than this,
 * the sheet asks for one more tap (SHARE NOW) instead of failing silently.
 */
export const ACTIVATION_MS = 1000

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/**
 * The drawings split into collage images: as few images as the cap allows,
 * balanced so no image is nearly empty (10 drawings → 5 + 5, not 9 + 1).
 * @template T
 * @param {T[] | null | undefined} entries
 * @param {number} [max]
 * @returns {T[][]}
 */
export function collagePages(entries, max = COLLAGE_MAX) {
  const list = entries || []
  if (list.length === 0) return []
  const pages = Math.ceil(list.length / max)
  /** @type {T[][]} */
  const out = []
  let at = 0
  for (let i = 0; i < pages; i++) {
    const take = Math.ceil((list.length - at) / (pages - i))
    out.push(list.slice(at, at + take))
    at += take
  }
  return out
}

/** How many collage images `count` drawings make. */
export function collageImageCount(count, max = COLLAGE_MAX) {
  return count > 0 ? Math.ceil(count / max) : 0
}

/** A collage's title band and footer band (the QR code and SCAN TO PLAY), in px. */
export const COLLAGE_TOP = 140
export const COLLAGE_BOTTOM = 170

/** Columns and rows for a collage of `count` drawings (up to 3 × 3). */
export function collageGrid(count) {
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : 3
  return { cols, rows: Math.max(1, Math.ceil(count / cols)) }
}

/**
 * Where each drawing of a collage goes: a square `size` at (x, y), its labels
 * under it from `labelY`. The cells fill the band between the title and the
 * footer, centred; a short last row is centred too.
 * @param {number} count
 * @param {{ w?: number, h?: number, top?: number, bottom?: number, side?: number, gap?: number, label?: number }} [box]
 */
export function collageLayout(count, { w = CARD_W, h = CARD_H, top = COLLAGE_TOP, bottom = COLLAGE_BOTTOM, side = 70, gap = 24, label = 64 } = {}) {
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
    const col = i - row * cols
    const x = Math.round(x0 + col * (size + gap))
    const y = Math.round(y0 + row * (size + label + gap))
    cells.push({ x, y, size, labelY: y + size })
  }
  return { cols, rows, size, cells }
}

/** "SKETCH · 8 NOV 2026": the title of a collage or the PDF. */
export function shareTitle(date = new Date()) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date()
  return `SKETCH · ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/**
 * The line under a drawing on a shared image: "DRAWN BY IVY · ♥ 4". Without
 * the name it is just the hearts, or nothing.
 * @param {{ name?: string, showName?: boolean, hearts?: number }} p
 */
export function byLine({ name, showName = true, hearts = 0 }) {
  const parts = []
  if (showName && name) parts.push(`DRAWN BY ${String(name).toUpperCase()}`)
  if (hearts > 0) parts.push(`♥ ${hearts}`)
  return parts.join(' · ')
}

/**
 * The text that travels with one drawing:
 * "TREASURE MAP" BY IVY — DRAWN IN SKETCH ON GAME NIGHT. PLAY: <link>
 * @param {{ word?: string, name?: string, showName?: boolean, link?: string }} p
 */
export function drawingCaption({ word, name, showName = true, link }) {
  const by = showName && name ? ` BY ${String(name).toUpperCase()}` : ''
  return `"${String(word || '').toUpperCase()}"${by} — DRAWN IN SKETCH ON GAME NIGHT.${link ? ` PLAY: ${link}` : ''}`
}

/**
 * The text that travels with all of a match's drawings.
 * @param {{ count: number, link?: string }} p
 */
export function allCaption({ count, link }) {
  return `${count} DRAWING${count === 1 ? '' : 'S'} FROM OUR SKETCH MATCH ON GAME NIGHT.${link ? ` PLAY: ${link}` : ''}`
}

/** WhatsApp click-to-chat with the text filled in. A link cannot carry the picture: the player attaches it. */
export function whatsAppLink(text) {
  return `https://wa.me/?text=${encodeURIComponent(String(text || ''))}`
}

/**
 * A safe, readable file name: sketchFilename('Treasure Map') → "sketch-treasure-map.png".
 * @param {string} word
 * @param {string} [ext]
 * @param {string} [suffix]
 */
export function sketchFilename(word, ext = 'png', suffix = '') {
  const slug = String(word || '').toLowerCase().normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'drawing'
  return `sketch-${slug}${suffix ? `-${suffix}` : ''}.${ext}`
}

/**
 * The PDF's pages: a cover (title, podium, crowd favourite), then one page per
 * drawing, numbered from 1.
 * @template T
 * @param {T[] | null | undefined} entries
 * @returns {({ kind: 'cover' } | { kind: 'drawing', entry: T, n: number })[]}
 */
export function pdfPages(entries) {
  return [
    { kind: 'cover' },
    ...(entries || []).map((entry, i) => ({ kind: /** @type {'drawing'} */ ('drawing'), entry, n: i + 1 })),
  ]
}

/** "6 DRAWINGS ON THIS PHONE": the share-all sheet says the set is this phone's. */
export function onThisPhone(count) {
  return `${count} DRAWING${count === 1 ? '' : 'S'} ON THIS PHONE`
}

/** The PICTURES option's line: "ALL 6 DRAWINGS ON ONE IMAGE" or "14 DRAWINGS ON 2 IMAGES". */
export function picturesLine(count, max = COLLAGE_MAX) {
  const images = collageImageCount(count, max)
  return images <= 1 ? `ALL ${count} DRAWINGS ON ONE IMAGE` : `${count} DRAWINGS ON ${images} IMAGES`
}

/** Share-all appears only when there is more than one drawing to share. */
export function canShareAll(count) {
  return count > 1
}

/**
 * True when the files took long enough to make that the browser's tap
 * permission for the share sheet may have run out, so the screen should ask
 * for one more tap. The native shell's sheet needs no tap permission.
 * @param {number} elapsedMs
 * @param {{ native?: boolean }} [env]
 */
export function needsSecondTap(elapsedMs, { native = false } = {}) {
  return !native && elapsedMs > ACTIVATION_MS
}

/**
 * The cover page's lines, top to bottom: the podium (names only when names are
 * on) and the CROWD FAVOURITE.
 * @param {{
 *   podium?: { rank: number, name: string, score: number }[],
 *   favourite?: { hearts: number, items: { word?: string, name?: string }[] } | null,
 *   showNames?: boolean,
 * }} p
 */
export function coverLines({ podium = [], favourite = null, showNames = true }) {
  const rows = showNames
    ? podium.slice(0, 8).map(r => ({ rank: r.rank, text: `${r.rank}. ${String(r.name || '???').toUpperCase()} · ${r.score}` }))
    : []
  let fave = null
  if (favourite && favourite.items?.length) {
    const tied = favourite.items.length > 1
    fave = {
      title: tied ? `♥ CROWD FAVOURITES · TIED AT ♥ ${favourite.hearts}` : `♥ CROWD FAVOURITE · ♥ ${favourite.hearts}`,
      lines: favourite.items.map(it => {
        const word = it.word ? String(it.word).toUpperCase() : ''
        const by = showNames && it.name ? `BY ${String(it.name).toUpperCase()}` : ''
        return [word, by].filter(Boolean).join(' ')
      }).filter(Boolean),
    }
  }
  return { rows, fave }
}

/**
 * The podium for the PDF cover: podium() rows with each player's name.
 * @param {{ id: string, rank: number, score: number }[]} rows
 * @param {Record<string, { name?: string }> | null | undefined} players
 */
export function sharePodium(rows, players) {
  return (rows || []).map(r => ({ rank: r.rank, score: r.score, name: players?.[r.id]?.name || '???' }))
}

/**
 * The CROWD FAVOURITE for the PDF cover: crowdFavourite()'s award with each
 * drawing's word (when this phone has the drawing) and artist name.
 * @param {{ hearts: number, keys: string[] } | null | undefined} award
 * @param {{ id: string, word?: string, artistName?: string }[]} entries
 * @param {Record<string, { name?: string }> | null | undefined} players
 */
export function shareFavourite(award, entries, players) {
  if (!award || !award.keys?.length) return null
  const byId = new Map((entries || []).map(e => [e.id, e]))
  return {
    hearts: award.hearts,
    items: award.keys.map(key => {
      const entry = byId.get(key)
      const artist = String(key).slice(String(key).indexOf(':') + 1)
      return { word: entry?.word, name: players?.[artist]?.name || entry?.artistName || '???' }
    }),
  }
}
