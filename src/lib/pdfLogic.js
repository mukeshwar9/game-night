// @ts-check
// A minimal PDF writer: one JPEG picture per page, nothing else. Pure: bytes
// in, bytes out, no DOM; tested byte by byte in pdfLogic.test.js.
//
// Used by SKETCH's SHARE ALL → PDF (a cover, then every drawing on its own
// page). Each page is painted on a canvas and handed over as a JPEG; PDF
// readers decode JPEG natively (the DCTDecode filter), so no compression code
// and no dependency is needed here.
//
// File layout (PDF 1.4):
//   %PDF-1.4 and a binary-marker comment
//   1 0 obj catalog · 2 0 obj page tree · 3 0 obj document info
//   per page i: page (4+3i), image XObject (5+3i), content stream (6+3i)
//   xref table · trailer · startxref · %%EOF

/** A4 portrait in PDF points (1/72 inch). */
export const A4 = { w: 595.28, h: 841.89 }

const enc = new TextEncoder()
const ascii = (/** @type {string} */ s) => enc.encode(s)
/** A number as PDF writes it: at most two decimals, no exponent. */
export const pdfNumber = (/** @type {number} */ n) => (Math.round(n * 100) / 100).toString()

/**
 * A PDF text string. Printable ASCII is a literal string with \ ( ) escaped;
 * anything else ("SKETCH · 8 NOV") is UTF-16BE with a byte-order mark, in hex.
 * @param {unknown} value
 */
export function pdfTextString(value) {
  const s = String(value ?? '')
  if (/^[\x20-\x7e]*$/.test(s)) return `(${s.replace(/[\\()]/g, m => `\\${m}`)})`
  let hex = 'FEFF'
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase()
  return `<${hex}>`
}

/**
 * Where an image of w × h px sits on a page of pageW × pageH points: scaled to
 * fit, centred. PDF's origin is the bottom-left corner.
 */
export function fitImage(w, h, pageW, pageH) {
  const scale = Math.min(pageW / w, pageH / h)
  const dw = w * scale
  const dh = h * scale
  return { x: (pageW - dw) / 2, y: (pageH - dh) / 2, w: dw, h: dh }
}

/**
 * Builds the PDF.
 * @param {{ jpeg: Uint8Array, width: number, height: number }[]} pages one baseline RGB JPEG per page
 * @param {{ title?: string, pageW?: number, pageH?: number }} [opts]
 * @returns {Uint8Array}
 */
export function buildPdf(pages, { title = '', pageW = A4.w, pageH = A4.h } = {}) {
  if (!pages?.length) throw new Error('buildPdf: no pages')
  /** @type {Uint8Array[]} */
  const chunks = []
  let length = 0
  /** @type {number[]} */
  const offsets = [] // offsets[id] = byte offset of "id 0 obj"
  const put = (/** @type {Uint8Array} */ bytes) => { chunks.push(bytes); length += bytes.length }
  const putStr = (/** @type {string} */ s) => put(ascii(s))
  const obj = (/** @type {number} */ id, /** @type {string} */ body) => {
    offsets[id] = length
    putStr(`${id} 0 obj\n${body}\nendobj\n`)
  }
  const streamObj = (/** @type {number} */ id, /** @type {string} */ dict, /** @type {Uint8Array} */ data) => {
    offsets[id] = length
    putStr(`${id} 0 obj\n<< ${dict}${dict ? ' ' : ''}/Length ${data.length} >>\nstream\n`)
    put(data)
    putStr('\nendstream\nendobj\n')
  }

  // Header; the comment's high bytes tell transfer tools the file is binary.
  putStr('%PDF-1.4\n')
  put(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))

  const pageId = (/** @type {number} */ i) => 4 + 3 * i
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] /Count ${pages.length} >>`)
  obj(3, `<< /Title ${pdfTextString(title)} /Producer ${pdfTextString('Game Night')} >>`)

  pages.forEach((p, i) => {
    if (!(p?.jpeg instanceof Uint8Array) || !(p.width > 0) || !(p.height > 0)) throw new Error(`buildPdf: bad page ${i}`)
    const id = pageId(i)
    const fit = fitImage(p.width, p.height, pageW, pageH)
    obj(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfNumber(pageW)} ${pdfNumber(pageH)}] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`)
    streamObj(id + 1, `/Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, p.jpeg)
    streamObj(id + 2, '', ascii(`q ${pdfNumber(fit.w)} 0 0 ${pdfNumber(fit.h)} ${pdfNumber(fit.x)} ${pdfNumber(fit.y)} cm /Im0 Do Q`))
  })

  // Cross-reference table: every entry is exactly 20 bytes.
  const size = 4 + 3 * pages.length
  const xrefAt = length
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`
  for (let id = 1; id < size; id++) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  putStr(xref)
  putStr(`trailer\n<< /Size ${size} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`)

  const out = new Uint8Array(length)
  let at = 0
  for (const c of chunks) { out.set(c, at); at += c.length }
  return out
}
