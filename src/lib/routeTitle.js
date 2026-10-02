// Browser-tab / search-result title per route. The app is one page, so without
// this every URL shares the title in index.html. Room and profile pages keep
// the plain brand (their content is private or per-visitor).
import { getGameConfig } from './games'

const BRAND = 'Game Night'

const STATIC = {
  '/': `${BRAND} — quick games with friends, no account needed`,
  '/games': `All games — ${BRAND}`,
  '/online': `Find an opponent — ${BRAND}`,
  '/daily': `Daily puzzle — ${BRAND}`,
  '/daily/memory': `Daily memory — ${BRAND}`,
  '/demo': `Play solo — ${BRAND}`,
  '/friends': `Friends — ${BRAND}`,
  '/profile': `Settings — ${BRAND}`,
  '/shop': `Shop — ${BRAND}`,
  '/pass': `Game Night Pass — ${BRAND}`,
  '/notes': `Feedback — ${BRAND}`,
}

export function titleForPath(pathname) {
  const path = String(pathname || '/').replace(/\/+$/, '') || '/'
  if (STATIC[path]) return STATIC[path]
  const m = /^\/(solo|local|play)\/([\w-]+)$/.exec(path)
  if (m) {
    const cfg = getGameConfig(m[2])
    if (cfg && cfg.type === m[2]) {
      const label = cfg.label.charAt(0) + cfg.label.slice(1).toLowerCase()
      const mode = m[1] === 'local' ? ' — pass and play' : cfg.soloRun ? ' — solo run' : ' vs the CPU'
      return `${label}${mode} — ${BRAND}`
    }
  }
  return BRAND
}
