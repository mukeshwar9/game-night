export const FONTS = [
  { id: 'press-start', label: 'PRESS START 2P', family: 'Press Start 2P', description: 'Pure 8-bit' },
  { id: 'silkscreen', label: 'SILKSCREEN', family: 'Silkscreen', description: 'Clean pixel' },
  { id: 'pixelify', label: 'PIXELIFY SANS', family: 'Pixelify Sans', description: 'Friendly pixel' },
  { id: 'vt323', label: 'VT323', family: 'VT323', description: 'CRT terminal' },
  { id: 'share-tech', label: 'SHARE TECH MONO', family: 'Share Tech Mono', description: 'Sci-fi cabinet' },
  { id: 'oxanium', label: 'OXANIUM', family: 'Oxanium', description: 'Modern arcade' },
  { id: 'audiowide', label: 'AUDIOWIDE', family: 'Audiowide', description: '80s display' },
  { id: 'fredoka', label: 'FREDOKA', family: 'Fredoka', description: 'Party rounded' },
  { id: 'russo', label: 'RUSSO ONE', family: 'Russo One', description: 'Sports bold' },
  { id: 'patrick-hand', label: 'PATRICK HAND', family: 'Patrick Hand', description: 'Pen and paper' },
  { id: 'jersey', label: 'JERSEY 10', family: 'Jersey 10', description: 'Scoreboard pixel' },
  { id: 'tilt-neon', label: 'TILT NEON', family: 'Tilt Neon', description: 'Neon sign' },
]

const STORAGE_KEY = 'retro-font'

export function getStoredFont() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return FONTS.some(font => font.id === stored) ? stored : 'press-start'
  } catch {
    return 'press-start'
  }
}

export function getFont(id) {
  return FONTS.find(font => font.id === id) || FONTS[0]
}

export function applyFont(id) {
  const font = getFont(id)
  document.documentElement.dataset.font = font.id
  document.documentElement.style.setProperty('--font-pixel', `'${font.family}'`)
  try { localStorage.setItem(STORAGE_KEY, font.id) } catch { /* storage unavailable */ }
}

export function applyStoredFont() {
  applyFont(getStoredFont())
}
