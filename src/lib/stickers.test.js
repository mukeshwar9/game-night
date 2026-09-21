import { describe, it, expect } from 'vitest'
import {
  isImageFile,
  isStickerDataUrl,
  imageFilesFromClipboard,
  normalizeRecentStickers,
  addRecentSticker,
  STICKER_MAX_DATA_URL_LENGTH,
  STICKER_RECENT_MAX,
} from './stickers'

const tiny = (len = 100) => `data:image/webp;base64,${'A'.repeat(len)}`

describe('isImageFile', () => {
  it('accepts image MIME types only', () => {
    expect(isImageFile({ type: 'image/png' })).toBe(true)
    expect(isImageFile({ type: 'image/webp' })).toBe(true)
    expect(isImageFile({ type: 'text/plain' })).toBe(false)
    expect(isImageFile(null)).toBe(false)
    expect(isImageFile({})).toBe(false)
  })
})

describe('isStickerDataUrl', () => {
  it('accepts small image data URLs', () => {
    expect(isStickerDataUrl(tiny())).toBe(true)
  })

  it('rejects non-images, non-base64, and oversize payloads', () => {
    expect(isStickerDataUrl('https://example.com/a.png')).toBe(false)
    expect(isStickerDataUrl('data:text/plain;base64,AAA')).toBe(false)
    expect(isStickerDataUrl('data:image/png,AAA')).toBe(false)
    expect(isStickerDataUrl(tiny(STICKER_MAX_DATA_URL_LENGTH))).toBe(false)
    expect(isStickerDataUrl(null)).toBe(false)
  })
})

describe('imageFilesFromClipboard', () => {
  it('pulls image files out of paste items', () => {
    const img = { type: 'image/png' }
    const dt = {
      items: [
        { kind: 'string', type: 'text/plain', getAsFile: () => null },
        { kind: 'file', type: 'image/png', getAsFile: () => img },
        { kind: 'file', type: 'text/plain', getAsFile: () => null },
      ],
    }
    expect(imageFilesFromClipboard(dt)).toEqual([img])
  })

  it('returns [] without clipboard items', () => {
    expect(imageFilesFromClipboard(null)).toEqual([])
    expect(imageFilesFromClipboard({})).toEqual([])
  })
})

describe('recent stickers', () => {
  it('normalizes junk and caps length', () => {
    expect(normalizeRecentStickers(null)).toEqual([])
    expect(normalizeRecentStickers([tiny(), 'junk', tiny()])).toEqual([tiny(), tiny()])
    expect(normalizeRecentStickers(Array(9).fill(tiny()))).toHaveLength(STICKER_RECENT_MAX)
  })

  it('prepends, de-duplicates, and caps', () => {
    const a = tiny(10)
    const b = tiny(20)
    expect(addRecentSticker([a], b)).toEqual([b, a])
    expect(addRecentSticker([a], a)).toEqual([a])
    expect(addRecentSticker('junk', b)).toEqual([b])
    expect(addRecentSticker([a], 'junk')).toEqual([a])
  })
})
