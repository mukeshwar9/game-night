// @ts-check
import { GAME_TYPES } from './games'

// End-of-game cross-sell for GameStatus. Priority: variant relatives of the
// current game (its variants, or its base + sibling variants if current is
// itself a variant) → same-category picks → any other category, all in
// registry order for determinism. Party (nPlayer) games are never suggested
// — GameStatus only renders for 2P rooms — except the N-player races
// (`race: true`), which a 2P room can switch into and play 1v1.
export function suggestGames(currentType, { count = 3 } = {}) {
  const current = GAME_TYPES.find(t => t.type === currentType)
  const baseType = current?.variantOf || currentType

  const picked = []
  const seen = new Set([currentType])

  const take = (list) => {
    for (const t of list) {
      if (picked.length >= count) return
      if (seen.has(t.type) || (t.nPlayer && !t.race)) continue
      seen.add(t.type)
      picked.push(t)
    }
  }

  take(GAME_TYPES.filter(t => t.type === baseType || t.variantOf === baseType))

  if (picked.length < count && current) {
    take(GAME_TYPES.filter(t => t.category === current.category && !t.variantOf))
  }

  if (picked.length < count) {
    take(GAME_TYPES.filter(t => !t.variantOf))
  }

  return picked
}
