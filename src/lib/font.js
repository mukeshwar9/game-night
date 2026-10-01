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
  { id: 'tiny5', label: 'TINY5', family: 'Tiny5', description: '5px pixel caps' },
  { id: 'micro5', label: 'MICRO 5', family: 'Micro 5', description: 'Micro pixel' },
  { id: 'handjet', label: 'HANDJET', family: 'Handjet', description: 'LED element grid' },
  { id: 'dotgothic', label: 'DOTGOTHIC16', family: 'DotGothic16', description: 'Japanese dot gothic' },
  { id: 'sixtyfour', label: 'SIXTYFOUR', family: 'Sixtyfour', description: 'C64 scanline' },
  { id: 'sixtyfour-c', label: 'SIXTYFOUR CONVERGENCE', family: 'Sixtyfour Convergence', description: 'RGB misconvergence' },
  { id: 'workbench', label: 'WORKBENCH', family: 'Workbench', description: 'Amiga workbench' },
  { id: 'jersey15', label: 'JERSEY 15', family: 'Jersey 15', description: 'Taller scoreboard pixel' },
  { id: 'bytesized', label: 'BYTESIZED', family: 'Bytesized', description: '4px micro pixel' },
  { id: 'doto', label: 'DOTO', family: 'Doto', description: 'Dot matrix' },
  { id: 'nabla', label: 'NABLA', family: 'Nabla', description: 'Isometric colour font' },
  { id: 'bungee', label: 'BUNGEE', family: 'Bungee', description: 'Signage caps' },
  { id: 'bungee-spice', label: 'BUNGEE SPICE', family: 'Bungee Spice', description: 'Gradient colour font' },
  { id: 'bungee-shade', label: 'BUNGEE SHADE', family: 'Bungee Shade', description: '3D shade caps' },
  { id: 'monoton', label: 'MONOTON', family: 'Monoton', description: 'Neon multiline' },
  { id: 'tilt-warp', label: 'TILT WARP', family: 'Tilt Warp', description: 'Tilting warp', tier: 'premium', premium: true },
  { id: 'tilt-neon-v', label: 'TILT NEON VF', family: 'Tilt Neon VF', description: 'Tilting neon tube' },
  { id: 'bitcount', label: 'BITCOUNT PROP DOUBLE', family: 'Bitcount Prop Double', description: 'Morphing pixel' },
  { id: 'jacquard12', label: 'JACQUARD 12', family: 'Jacquard 12', description: 'Pixel blackletter' },
  { id: 'coral-pixels', label: 'CORAL PIXELS', family: 'Coral Pixels', description: 'Pixel serif' },
  { id: 'big-shoulders', label: 'BIG SHOULDERS DISPLAY', family: 'Big Shoulders Display', description: 'Stadium condensed' },
  { id: 'chakra-petch', label: 'CHAKRA PETCH', family: 'Chakra Petch', description: 'Cut-corner tech' },
  { id: 'orbitron', label: 'ORBITRON', family: 'Orbitron', description: 'Space-age geometric' },
  { id: 'pixelify-v', label: 'PIXELIFY SANS VF', family: 'Pixelify Sans VF', description: 'Friendly pixel, variable' },
  { id: 'departure', label: 'DEPARTURE MONO', family: 'Departure Mono', description: 'Pixel monospace' },
  { id: 'atkinson-mono', label: 'ATKINSON MONO', family: 'Atkinson Hyperlegible Mono', description: 'Low-vision friendly mono' },
  { id: 'atkinson-next', label: 'ATKINSON NEXT', family: 'Atkinson Hyperlegible Next', description: 'Low-vision friendly sans' },
  { id: 'jetbrains', label: 'JETBRAINS MONO', family: 'JetBrains Mono', description: 'Coder mono' },
  { id: 'plex-mono', label: 'IBM PLEX MONO', family: 'IBM Plex Mono', description: 'Engineered mono' },
  { id: 'space-mono', label: 'SPACE MONO', family: 'Space Mono', description: 'Retro-futurist mono' },
  { id: 'geist-mono', label: 'GEIST MONO', family: 'Geist Mono', description: 'Clean mono' },
  { id: 'martian', label: 'MARTIAN MONO', family: 'Martian Mono', description: 'Wide mono' },
  { id: 'kode', label: 'KODE MONO', family: 'Kode Mono', description: 'Playful mono' },
  { id: 'lexend', label: 'LEXEND', family: 'Lexend', description: 'Easy-read sans' },
  { id: 'sometype', label: 'SOMETYPE MONO', family: 'Sometype Mono', description: 'Soft mono' },
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
