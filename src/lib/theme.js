export const THEMES = [
  { id: 'midnight',  label: 'MIDNIGHT ARCADE' },
  { id: 'phosphor',  label: 'PHOSPHOR' },
  { id: 'amber',     label: 'AMBER CRT' },
  { id: 'synthwave', label: 'SYNTHWAVE' },
  { id: 'grid',      label: 'THE GRID' },
  { id: 'mono',      label: '1-BIT MONO' },
  { id: 'virtualboy', label: 'VIRTUAL BOY' },
  { id: 'paper',      label: 'PAPERWHITE' },
  { id: 'c64',        label: 'COMMODORE 64' },
  { id: 'blueprint',  label: 'BLUEPRINT' },
  { id: 'sakura',     label: 'SAKURA' },
  { id: 'matcha',     label: 'MATCHA' },
  { id: 'matcha-strawberry', label: 'MATCHA STRAWBERRY' },
  { id: 'matcha-blueberry',  label: 'MATCHA BLUEBERRY' },
]

const STORAGE_KEY = 'retro-theme'

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
