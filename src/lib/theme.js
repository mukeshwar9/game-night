import { isReducedMotion } from '../hooks/useMotionPref'
import { motionPlatform } from './motion'

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
 * Centre and radius of the circle that reveals a new theme from the control
 * the player tapped: from the middle of `rect`, large enough to cover the
 * farthest corner of a `width` × `height` viewport.
 * @param {{ left: number, top: number, width: number, height: number }} rect
 * @param {number} width
 * @param {number} height
 */
export function themeReveal(rect, width, height) {
  const x = Math.round(rect.left + rect.width / 2)
  const y = Math.round(rect.top + rect.height / 2)
  const r = Math.ceil(Math.hypot(Math.max(x, width - x), Math.max(y, height - y)))
  return { x, y, r }
}

// The latest theme switch owns data-theme-vt (see MotionRouter's vtSeq).
let themeSeq = 0

/**
 * applyTheme for a player's pick, as one change instead of a few elements
 * tweening their colours while the rest snap (MO-08). With View Transitions
 * the whole screen changes together: iOS crossfades, elsewhere the new theme
 * spreads in a circle from `from` (the tapped control). Element transitions
 * are suspended for the switch (.theme-switching). `alsoApply` runs inside
 * the same change (a theme's paired font). Without View Transitions, or with
 * reduced motion, the switch is instant.
 * @param {string} id
 * @param {{ from?: Element | null, alsoApply?: () => void }} [opts]
 */
export function switchTheme(id, { from = null, alsoApply } = {}) {
  const root = document.documentElement
  const apply = () => { applyTheme(id); alsoApply?.() }
  root.classList.add('theme-switching')
  const settle = () => root.classList.remove('theme-switching')
  if (typeof document.startViewTransition !== 'function' || isReducedMotion() || root.dataset.theme === id) {
    apply()
    // Two frames: the new colours paint before transitions come back.
    requestAnimationFrame(() => requestAnimationFrame(settle))
    return
  }
  const reveal = from && motionPlatform() !== 'ios'
  if (reveal) {
    const { x, y, r } = themeReveal(from.getBoundingClientRect(), window.innerWidth, window.innerHeight)
    root.style.setProperty('--vt-x', `${x}px`)
    root.style.setProperty('--vt-y', `${y}px`)
    root.style.setProperty('--vt-r', `${r}px`)
  }
  const seq = ++themeSeq
  root.dataset.themeVt = reveal ? 'reveal' : 'fade'
  const vt = document.startViewTransition(apply)
  vt.ready.catch(() => {})
  const done = () => { if (seq === themeSeq) { delete root.dataset.themeVt; settle() } }
  vt.finished.then(done, done)
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
