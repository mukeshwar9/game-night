// One list of every premium item, gathered from the registries that own them.
// A registry marks an entry `premium: true` + `pack` (premiumCatalog.js) and
// this file only collects them for the shop and the paywall; it adds no rules.
import { THEMES } from './theme'
import { EMOTES_PREMIUM } from './emotes'
import { PREMIUM_AVATAR_ITEMS } from './avatars'

export const PREMIUM_THEME_ITEMS = THEMES.filter(t => t.premium).map(t => ({ kind: 'theme', ...t }))

const BY_KIND = {
  theme: PREMIUM_THEME_ITEMS,
  avatar: PREMIUM_AVATAR_ITEMS,
  emote: EMOTES_PREMIUM,
}

/** @param {'theme' | 'avatar' | 'emote'} kind */
export function premiumItems(kind) {
  return BY_KIND[kind] ?? []
}

export function allPremiumItems() {
  return Object.values(BY_KIND).flat()
}
