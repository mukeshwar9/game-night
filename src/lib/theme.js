// `tier` marks cosmetics planned as paid ('premium') or time-limited
// ('seasonal'). It is data only: nothing is gated yet, every theme is selectable.
export const THEMES = [
  { id: 'midnight',  label: 'MIDNIGHT ARCADE' },
  { id: 'phosphor',  label: 'PHOSPHOR' },
  { id: 'amber',     label: 'AMBER CRT' },
  { id: 'synthwave', label: 'SYNTHWAVE' },
  { id: 'grid',      label: 'THE GRID' },
  { id: 'mono',      label: '1-BIT MONO' },
  { id: 'virtualboy', label: 'VIRTUAL BOY' },
  { id: 'c64',        label: 'COMMODORE 64' },
  { id: 'blueprint',  label: 'BLUEPRINT' },
  { id: 'sakura',     label: 'SAKURA' },
  { id: 'matcha',     label: 'MATCHA' },
  { id: 'matcha-strawberry', label: 'MATCHA STRAWBERRY' },
  { id: 'matcha-blueberry',  label: 'MATCHA BLUEBERRY' },
  { id: 'cotton-candy',      label: 'COTTON CANDY' },
  { id: 'arctic-frost',      label: 'ARCTIC FROST' },
  { id: 'cartridge',  label: 'CARTRIDGE' },
  { id: 'notebook',   label: 'NOTEBOOK' },
  { id: 'hicontrast', label: 'HIGH CONTRAST' },
  { id: 'fantasy',    label: 'FANTASY CONSOLE' },
  { id: 'sweetie',    label: 'SWEETIE 16' },
  { id: 'cga',        label: 'CGA' },
  { id: 'riso',       label: 'RISO PRINT' },
  { id: 'gold',       label: '24K' },
  { id: 'holo',       label: 'HOLOFOIL' },
  { id: 'carpet',     label: 'COSMIC CARPET' },
  { id: 'radar',      label: 'P7 RADAR' },
  { id: 'pumpkin',    label: 'PUMPKIN NIGHT', tier: 'seasonal' },
  { id: 'campfire',   label: 'CAMPFIRE', tier: 'premium' },
]

const STORAGE_KEY = 'retro-theme'

// Retired ids fall back to the default (index.html does the same before first paint).
export function getStoredTheme() {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && THEMES.some(t => t.id === stored)) return stored
  return 'matcha'
}

export function applyTheme(id) {
  document.documentElement.dataset.theme = id
  localStorage.setItem(STORAGE_KEY, id)

  const channels = getComputedStyle(document.documentElement)
    .getPropertyValue('--c-cta')
  const color = `rgb(${channels.trim().split(/\s+/).join(' ')})`

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', color)
}
