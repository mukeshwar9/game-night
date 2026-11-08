import { describe, it, expect } from 'vitest'
import { A4, buildPdf, fitImage, pdfString } from './pdfLogic'

// A stand-in JPEG: the bytes only need to land in the file verbatim.
const jpeg = (n) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, n, 0x00, 0x29, 0x5c, 0xff, 0xd9])
const latin1 = bytes => Array.from(bytes, b => String.fromCharCode(b)).join('')

function parse(bytes) {
  const text = latin1(bytes)
  const startxref = Number(text.match(/startxref\n(\d+)\n%%EOF\n$/)[1])
  const table = text.slice(startxref)
  const [, first, count] = table.match(/^xref\n(\d+) (\d+)\n/)
  const rows = table.split('\n').slice(2, 2 + Number(count))
  return { text, startxref, first: Number(first), count: Number(count), rows }
}

describe('buildPdf', () => {
  const pages = [{ jpeg: jpeg(1), width: 1240, height: 1754 }, { jpeg: jpeg(2), width: 800, height: 600 }]
  const bytes = buildPdf(pages, { title: 'Sketch (8 Nov)' })
  const pdf = parse(bytes)

  it('starts with a PDF header and a binary marker, and ends with %%EOF', () => {
    expect(pdf.text.startsWith('%PDF-1.4\n%')).toBe(true)
    expect(bytes[10]).toBeGreaterThan(127)
    expect(pdf.text.endsWith('%%EOF\n')).toBe(true)
  })

  it('points startxref at the xref table', () => {
    expect(pdf.text.slice(pdf.startxref, pdf.startxref + 5)).toBe('xref\n')
  })

  it('has a correct offset for every object, each row exactly 20 bytes', () => {
    expect(pdf.first).toBe(0)
    expect(pdf.count).toBe(4 + 3 * pages.length)
    expect(pdf.rows[0]).toBe('0000000000 65535 f ')
    for (let id = 1; id < pdf.count; id++) {
      const row = pdf.rows[id]
      expect(row).toMatch(/^\d{10} 00000 n $/)
      expect((row + '\n').length).toBe(20)
      const at = Number(row.slice(0, 10))
      expect(pdf.text.slice(at, at + `${id} 0 obj`.length)).toBe(`${id} 0 obj`)
    }
  })

  it('lists one page per picture, in order, on A4', () => {
    expect(pdf.text).toContain('/Kids [4 0 R 7 0 R] /Count 2')
    expect(pdf.text.match(/\/Type \/Page /g)).toHaveLength(2)
    expect(pdf.text).toContain('/MediaBox [0 0 595.28 841.89]')
  })

  it('embeds each JPEG verbatim with its size and the right stream length', () => {
    expect(pdf.text).toContain('/Width 1240 /Height 1754 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length 10 >>\nstream\n')
    for (const p of pages) expect(pdf.text).toContain(`stream\n${latin1(p.jpeg)}\nendstream`)
    // every stream's /Length matches the bytes between stream and endstream
    for (const m of pdf.text.matchAll(/\/Length (\d+) >>\nstream\n/g)) {
      const start = m.index + m[0].length
      expect(pdf.text.slice(start + Number(m[1]), start + Number(m[1]) + 10)).toBe('\nendstream')
    }
  })

  it('draws each picture scaled to fit the page, centred', () => {
    const f = fitImage(1240, 1754, A4.w, A4.h)
    const r = n => Math.round(n * 100) / 100
    expect(pdf.text).toContain(`q ${r(f.w)} 0 0 ${r(f.h)} ${r(f.x)} ${r(f.y)} cm /Im0 Do Q`)
    expect(pdf.text).toContain('q 595.28 0 0 446.46 0 197.72 cm /Im0 Do Q')
  })

  it('carries the title in the info dictionary, escaped', () => {
    expect(pdf.text).toContain('/Title (Sketch \\(8 Nov\\))')
    expect(pdf.text).toContain('/Info 3 0 R')
  })

  it('refuses an empty document', () => {
    expect(() => buildPdf([])).toThrow()
  })
})

describe('fitImage', () => {
  it('keeps the picture\'s shape and centres it', () => {
    expect(fitImage(100, 100, 200, 400)).toEqual({ x: 0, y: 100, w: 200, h: 200 })
    expect(fitImage(400, 100, 200, 400)).toEqual({ x: 0, y: 175, w: 200, h: 50 })
    const a4 = fitImage(1240, 1754, A4.w, A4.h)
    expect(a4.w).toBeCloseTo(A4.w, 0)
    expect(a4.h).toBeCloseTo(A4.h, 0)
  })
})

describe('pdfString', () => {
  it('escapes brackets and backslashes and keeps to ASCII', () => {
    expect(pdfString('a(b)c\\')).toBe('(a\\(b\\)c\\\\)')
    expect(pdfString('café')).toBe('(caf?)')
    expect(pdfString(null)).toBe('()')
  })
})
