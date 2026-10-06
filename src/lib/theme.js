// `tier` marks cosmetics sold as 'premium' or time-limited ('seasonal'). Those
// entries also carry `premium: true` and the `pack` that unlocks them (see
// premiumCatalog.js); the pickers lock them through isUnlocked(). Everything
// without the flag is free for good.
// `font` pairs a theme with a FONTS id that picking the theme also applies
// (the player can still change the font afterwards). `backdrop` names the
// animated scene ThemeBackdrop draws behind the menus.
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
  { id: 'shoreline',  label: 'SHORELINE', font: 'fredoka', backdrop: 'beach' },
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
  { id: 'pumpkin',    label: 'PUMPKIN NIGHT', tier: 'seasonal', premium: true, pack: 'themes-seasonal' },
  { id: 'campfire',   label: 'CAMPFIRE', tier: 'premium', premium: true, pack: 'themes-seasonal' },
]

const STORAGE_KEY = 'retro-theme'

/** The font picking `id` also applies, or null when the theme has none. */
export function pairedFont(id) {
  return THEMES.find(t => t.id === id)?.font ?? null
}

/** The animated backdrop `id` draws behind the menus, or null. */
export function themeBackdrop(id) {
  return THEMES.find(t => t.id === id)?.backdrop ?? null
}

// Retired ids fall back to the default (index.html does the same before first paint).
export function getStoredTheme() {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && THEMES.some(t => t.id === stored)) return stored
  return 'matcha'
}

/**
 * A player's theme pick: switchTheme() from themeSwitch.js, loaded on demand
 * so the entry bundle does not carry the transition code. If the chunk cannot
 * load (offline, mid-deploy) the theme still applies, without the transition.
 * @param {string} id
 * @param {{ from?: { left: number, top: number, width: number, height: number } | null, alsoApply?: () => void }} [opts]
 */
export function pickTheme(id, opts = {}) {
  import('./themeSwitch')
    .then(m => m.switchTheme(id, opts))
    .catch(() => { applyTheme(id); opts.alsoApply?.() })
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
