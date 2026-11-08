import { describe, it, expect } from 'vitest'
import { A4, buildPdf, fitImage, pdfNumber, pdfTextString } from './pdfLogic'

// The bytes as latin1 text: one char per byte, so string offsets are byte offsets.
const text = bytes => Array.from(bytes, b => String.fromCharCode(b)).join('')
const jpeg = (n, fill = 0xab) => {
  // A fake JPEG body framed by the real SOI/EOI markers; the writer never decodes it.
  const b = new Uint8Array(n).fill(fill)
  b.set([0xff, 0xd8], 0)
  b.set([0xff, 0xd9], n - 2)
  return b
}

describe('pdfTextString', () => {
  it('writes printable ASCII as a literal string, escaping \\ ( )', () => {
    expect(pdfTextString('Game Night')).toBe('(Game Night)')
    expect(pdfTextString('a(b)c\\d')).toBe('(a\\(b\\)c\\\\d)')
    expect(pdfTextString('')).toBe('()')
    expect(pdfTextString(null)).toBe('()')
  })

  it('writes anything else as UTF-16BE hex with a byte-order mark', () => {
    expect(pdfTextString('A·B')).toBe('<FEFF004100B70042>')
    expect(pdfTextString('♥')).toBe('<FEFF2665>')
    // Outside the BMP: a surrogate pair, as UTF-16 wants.
    expect(pdfTextString('😀')).toBe('<FEFFD83DDE00>')
  })
})

describe('pdfNumber', () => {
  it('rounds to two decimals and never uses an exponent', () => {
    expect(pdfNumber(595.2756)).toBe('595.28')
    expect(pdfNumber(12)).toBe('12')
    expect(pdfNumber(0.004)).toBe('0')
  })
})

describe('fitImage', () => {
  it('scales an A4-shaped canvas to fill the page exactly', () => {
    const f = fitImage(1240, 1754, A4.w, A4.h)
    expect(f.x).toBeCloseTo(0, 0)
    expect(f.y).toBeCloseTo(0, 0)
    expect(f.w).toBeCloseTo(A4.w, 0)
    expect(f.h).toBeCloseTo(A4.h, 0)
  })

  it('letterboxes a square image, centred', () => {
    const f = fitImage(100, 100, 200, 400)
    expect(f).toEqual({ x: 0, y: 100, w: 200, h: 200 })
  })
})

describe('buildPdf', () => {
  const pages = [
    { jpeg: jpeg(40), width: 1240, height: 1754 },
    { jpeg: jpeg(64, 0x0a), width: 1240, height: 1754 }, // 0x0a bytes inside a stream must not confuse lengths
    { jpeg: jpeg(25), width: 600, height: 800 },
  ]
  const bytes = buildPdf(pages, { title: 'SKETCH · 8 NOV 2026' })
  const s = text(bytes)

  it('starts with the header and a binary-marker comment, and ends with %%EOF', () => {
    expect(s.startsWith('%PDF-1.4\n%')).toBe(true)
    expect([...bytes.slice(10, 14)].every(b => b >= 0x80)).toBe(true)
    expect(s.endsWith('%%EOF\n')).toBe(true)
  })

  it('points startxref at the xref table', () => {
    const m = /startxref\n(\d+)\n%%EOF\n$/.exec(s)
    expect(m).not.toBeNull()
    expect(s.slice(Number(m[1]), Number(m[1]) + 5)).toBe('xref\n')
  })

  it('has one 20-byte xref entry per object, each at its "n 0 obj" line', () => {
    const at = Number(/startxref\n(\d+)/.exec(s)[1])
    const head = /^xref\n0 (\d+)\n/.exec(s.slice(at))
    const size = Number(head[1])
    expect(size).toBe(4 + 3 * pages.length)
    const table = s.slice(at + head[0].length, at + head[0].length + size * 20)
    expect(table.slice(0, 20)).toBe('0000000000 65535 f \n')
    for (let id = 1; id < size; id++) {
      const entry = table.slice(id * 20, id * 20 + 20)
      expect(entry).toMatch(/^\d{10} 00000 n \n$/)
      const offset = Number(entry.slice(0, 10))
      expect(s.slice(offset, offset + `${id} 0 obj\n`.length)).toBe(`${id} 0 obj\n`)
    }
    expect(s).toContain(`trailer\n<< /Size ${size} /Root 1 0 R /Info 3 0 R >>`)
  })

  it('lists every page in the page tree', () => {
    expect(s).toContain('<< /Type /Pages /Kids [4 0 R 7 0 R 10 0 R] /Count 3 >>')
    expect(s.match(/\/Type \/Page /g)).toHaveLength(3)
  })

  it('embeds each JPEG untouched, with its exact /Length and size', () => {
    pages.forEach((p, i) => {
      const id = 5 + 3 * i
      const head = `${id} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`
      const start = s.indexOf(head)
      expect(start).toBeGreaterThan(0)
      const dataAt = start + head.length
      expect([...bytes.slice(dataAt, dataAt + p.jpeg.length)]).toEqual([...p.jpeg])
      expect(s.slice(dataAt + p.jpeg.length, dataAt + p.jpeg.length + 18)).toBe('\nendstream\nendobj\n')
    })
  })

  it('draws each picture fitted to an A4 page', () => {
    expect(s.match(/\/MediaBox \[0 0 595\.28 841\.89\]/g)).toHaveLength(3)
    // 1240 × 1754 is A4 to within a tenth of a point; 600 × 800 is letterboxed, centred.
    expect(s).toContain('q 595.18 0 0 841.89 0.05 0 cm /Im0 Do Q')
    const f = fitImage(600, 800, A4.w, A4.h)
    const content = `q ${pdfNumber(f.w)} 0 0 ${pdfNumber(f.h)} ${pdfNumber(f.x)} ${pdfNumber(f.y)} cm /Im0 Do Q`
    expect(content).toBe('q 595.28 0 0 793.71 0 24.09 cm /Im0 Do Q')
    expect(s).toContain(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
  })

  it('records the title in the document info, as UTF-16 when it is not ASCII', () => {
    expect(s).toContain(`/Title ${pdfTextString('SKETCH · 8 NOV 2026')} /Producer (Game Night)`)
  })

  it('refuses an empty document and a broken page', () => {
    expect(() => buildPdf([])).toThrow(/no pages/)
    expect(() => buildPdf([{ jpeg: null, width: 1, height: 1 }])).toThrow(/bad page 0/)
    expect(() => buildPdf([{ jpeg: jpeg(8), width: 0, height: 1 }])).toThrow(/bad page 0/)
  })
})
