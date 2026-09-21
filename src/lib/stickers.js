// Keyboard/file stickers as reactions. No Firebase, no React — the async
// resizer needs DOM (canvas) but every validator below is pure and unit-tested
// in stickers.test.js.
//
// Transport: a sticker travels inside the existing `emote` node
// ({ by, glyph, img, ts }) and inside chat messages as an optional `img`
// field — always a downscaled data: URL so no Storage bucket, no new infra,
// and no new permissions are needed. Paste and <input type=file> both only
// fire on an explicit user gesture, which browsers already allow.

// Longest edge of the downscaled sticker, px.
export const STICKER_MAX_DIM = 160
// Canvas export quality for the webp/jpg encode.
export const STICKER_QUALITY = 0.7
// Raw uploads above this are rejected before decode (5 MB).
export const STICKER_SOURCE_MAX_BYTES = 5 * 1024 * 1024
// Data URLs above this are rejected (~45 KB — keeps the room node small).
export const STICKER_MAX_DATA_URL_LENGTH = 60_000
// Recent-sticker tray size (localStorage only, never synced).
export const STICKER_RECENT_MAX = 6
export const STICKER_RECENT_KEY = 'stickerRecent'

export function isImageFile(file) {
  return !!file && typeof file.type === 'string' && file.type.startsWith('image/')
}

export function isStickerDataUrl(s) {
  return typeof s === 'string'
    && s.startsWith('data:image/')
    && s.includes(';base64,')
    && s.length <= STICKER_MAX_DATA_URL_LENGTH
}

// Downscale an image File/Blob to a small data: URL. Rejects on non-images,
// oversize sources, and decode/encode failures — callers toast on rejection.
export function fileToStickerDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!isImageFile(file)) {
      reject(new Error('not an image'))
      return
    }
    if (file.size > STICKER_SOURCE_MAX_BYTES) {
      reject(new Error('image too large'))
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      try {
        const scale = Math.min(1, STICKER_MAX_DIM / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        // webp where supported (Chrome/Edge/Firefox/Safari 14+); the canvas
        // falls back to png automatically where it is not.
        const dataUrl = canvas.toDataURL('image/webp', STICKER_QUALITY)
        if (!isStickerDataUrl(dataUrl)) {
          reject(new Error('sticker too large'))
          return
        }
        resolve(dataUrl)
      } catch {
        reject(new Error('could not read image'))
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('could not read image'))
    }
    img.src = url
  })
}

// Pull image Files out of a paste clipboard (desktop paste, Gboard stickers
// where the OS exposes them, file drops). Plain-text pastes yield [].
export function imageFilesFromClipboard(clipboardData) {
  if (!clipboardData?.items) return []
  const out = []
  for (const item of clipboardData.items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) out.push(file)
    }
  }
  return out
}

export function normalizeRecentStickers(raw) {
  if (!Array.isArray(raw)) return []
  return raw.filter(isStickerDataUrl).slice(0, STICKER_RECENT_MAX)
}

export function readRecentStickers() {
  try {
    return normalizeRecentStickers(JSON.parse(localStorage.getItem(STICKER_RECENT_KEY) || '[]'))
  } catch {
    return []
  }
}

// Most-recent-first, de-duplicated, capped. Returns the list to persist.
export function addRecentSticker(previous, dataUrl) {
  if (!isStickerDataUrl(dataUrl)) return normalizeRecentStickers(previous)
  return [dataUrl, ...normalizeRecentStickers(previous).filter((s) => s !== dataUrl)]
    .slice(0, STICKER_RECENT_MAX)
}
